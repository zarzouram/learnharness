import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GraphNode } from "../src/core/contracts/graph.ts";
import {
	CANDIDATE_PAGE_SIZE,
	createPropositionCandidateSearch,
	propositionCandidateBatch,
	type CandidateProposition,
} from "../src/core/proposition-candidates.ts";

function node(id: string, name: string, statement: string, aliases: string[] = []): GraphNode {
	return { id, name, statement, aliases, createdAt: "2026-01-01T00:00:00Z", provenance: [{ chatId: "source", messageId: "" }] };
}
function proposition(id: string, statement: string, name = ""): CandidateProposition {
	return { id, name, statement, aliases: [] };
}

describe("proposition candidate retrieval", () => {
	it("ranks word overlap regardless of phrase order, with no glob or regex syntax", () => {
		const search = createPropositionCandidateSearch([
			node("specific", "Metric", "Distances obey the triangle inequality."),
			node("generic", "Triangle", "A triangle has three corners."),
		]);
		assert.deepEqual(search(proposition("p", "inequality * triangle [metric]")).map((hit) => hit.node.id), ["specific", "generic"]);
	});

	it("matches full words rather than noisy substrings", () => {
		const search = createPropositionCandidateSearch([
			node("yes", "Form", "A form consumes vectors."),
			node("no", "Information", "Transformation preserves information."),
		]);
		assert.deepEqual(search(proposition("p", "form")).map((hit) => hit.node.id), ["yes"]);
	});

	it("normalizes Unicode and case while retaining non-Latin words", () => {
		const search = createPropositionCandidateSearch([node("n", "ＡＬＰＨＡ", "Σχήμα αβγ")]);
		assert.equal(search(proposition("p", "alpha ΑΒΓ"))[0]!.node.id, "n");
	});

	it("folds Arabic marks and letter forms, and a marked word stays one word", () => {
		const search = createPropositionCandidateSearch([
			node("ar", "أَحْمَد", "كَتَبَ الدَّرْسَ عَلَى السَّبُّورَةِ"),
			// The letters of كتب as separate words: a split marked word would match them.
			node("letters", "Letters", "ك ت ب"),
		]);
		for (const query of ["احمد", "كتب", "كَتَبَ", "الدرس", "علي", "السبورة"]) {
			assert.deepEqual(search(proposition("p", query)).map((hit) => hit.node.id), ["ar"], query);
		}
	});

	it("keeps a mark that belongs to its letter inside the word", () => {
		// पानी is प, the vowel sign ा, न and the vowel sign ी. Split at the signs,
		// it would leave the letters प and न and match the node that lists them.
		const search = createPropositionCandidateSearch([
			node("water", "पानी", "Water"),
			node("letters", "प न", "Letters"),
			node("other", "पन", "Suffix"),
		]);
		assert.deepEqual(search(proposition("p", "पानी")).map((hit) => hit.node.id), ["water"]);
	});

	it("folds accents, niqqud and compatibility forms on both sides", () => {
		const search = createPropositionCandidateSearch([
			node("folded", "Café", "שָׁלוֹם", ["ﬃ"]),
			node("other", "Other", "Plain"),
		]);
		for (const query of ["cafe", "CAFÉ", "שלום", "שָׁלוֹם", "ffi", "ﬃ"]) {
			assert.deepEqual(search(proposition("p", query)).map((hit) => hit.node.id), ["folded"], query);
		}
	});

	it("finds nothing for a query that folds to nothing", () => {
		const search = createPropositionCandidateSearch([node("n", "مشتقة", "Rate of change")]);
		for (const query of ["ّ", "ـ", "​"]) assert.deepEqual(search(proposition("p", query)), [], JSON.stringify(query));
	});

	it("shows a relevant alias with the complete canonical statement", () => {
		const nodes = [node("n", "Legacy label", "The original assertion remains canonical.", ["An amber canoe travels upstream."])];
		const proposed = [proposition("p", "An amber canoe travels upstream.")];
		const out = propositionCandidateBatch(createPropositionCandidateSearch(nodes), proposed, [{ id: "p" }]);
		assert.equal(out.candidates[0]!.statement, nodes[0]!.statement);
		assert.deepEqual(out.candidates[0]!.matchedAliases, nodes[0]!.aliases);
		assert.deepEqual(out.candidates[0]!.sessions, ["source"]);
	});

	it("hints add vocabulary without replacing the proposition", () => {
		const search = createPropositionCandidateSearch([
			node("base", "Amber", "Canoe"), node("hint", "Violet", "Kayak"),
		]);
		assert.deepEqual(new Set(search(proposition("p", "amber"), ["violet"]).map((hit) => hit.node.id)), new Set(["base", "hint"]));
	});

	it("searches the finding's aliases automatically", () => {
		const proposed = { ...proposition("p", "Other words"), aliases: ["amber canoe"] };
		const hits = createPropositionCandidateSearch([node("n", "Amber", "Canoe")])(proposed);
		assert.equal(hits[0]!.node.id, "n");
	});

	it("deduplicates candidate bodies within a batch while preserving per-finding references", () => {
		const nodes = [node("n", "Legacy", "Original wording.", ["Amber canoe", "Violet kayak"])];
		const out = propositionCandidateBatch(createPropositionCandidateSearch(nodes), [proposition("p1", "amber canoe"), proposition("p2", "violet kayak")], [{ id: "p1" }, { id: "p2" }]);
		assert.deepEqual(out.matches.map((match) => match.candidateIds), [["n"], ["n"]]);
		assert.equal(out.candidates.length, 1);
		assert.deepEqual(out.candidates[0]!.matchedAliases, ["Amber canoe", "Violet kayak"]);
	});

	it("returns five initially and exposes deterministic, non-overlapping additional pages", () => {
		const nodes = Array.from({ length: 12 }, (_, i) => node(`n${String(i).padStart(2, "0")}`, "Amber", "Canoe"));
		const search = createPropositionCandidateSearch(nodes);
		const proposed = [proposition("p", "amber")];
		const first = propositionCandidateBatch(search, proposed, [{ id: "p" }]);
		assert.equal(CANDIDATE_PAGE_SIZE, 5);
		assert.deepEqual(first.matches[0], { propositionId: "p", candidateIds: ["n00", "n01", "n02", "n03", "n04"], offset: 0, totalCandidates: 12, hasMore: true, nextOffset: 5 });
		const second = propositionCandidateBatch(search, proposed, [{ id: "p", offset: first.matches[0]!.nextOffset! }]);
		assert.deepEqual(second.matches[0]!.candidateIds, ["n05", "n06", "n07", "n08", "n09"]);
		const third = propositionCandidateBatch(search, proposed, [{ id: "p", offset: second.matches[0]!.nextOffset! }]);
		assert.deepEqual(third.matches[0]!.candidateIds, ["n10", "n11"]);
		assert.equal(third.matches[0]!.hasMore, false);
		assert.equal(third.matches[0]!.nextOffset, null);
	});

	it("repeating a request never silently suppresses previously shown candidates", () => {
		const search = createPropositionCandidateSearch([node("n", "Amber", "Canoe")]);
		const proposed = [proposition("p", "amber")];
		assert.deepEqual(propositionCandidateBatch(search, proposed, [{ id: "p" }]), propositionCandidateBatch(search, proposed, [{ id: "p" }]));
	});

	it("distinguishes no lexical matches from an exhausted page", () => {
		const search = createPropositionCandidateSearch([node("n", "Amber", "Canoe")]);
		const proposed = [proposition("p", "violet")];
		assert.equal(propositionCandidateBatch(search, proposed, [{ id: "p" }]).matches[0]!.totalCandidates, 0);
		const beyond = propositionCandidateBatch(search, proposed, [{ id: "p", hints: ["amber"], offset: 10 }]);
		assert.equal(beyond.matches[0]!.totalCandidates, 1);
		assert.equal(beyond.matches[0]!.hasMore, false);
		assert.deepEqual(beyond.candidates, []);
	});

	it("handles an empty graph and function-word-only queries honestly", () => {
		assert.deepEqual(createPropositionCandidateSearch([])(proposition("p", "amber")), []);
		assert.deepEqual(createPropositionCandidateSearch([node("n", "Amber", "Canoe")])(proposition("p", "the and of")), []);
	});

	it("conflicting duplicate ids in FINDINGS search the FIRST occurrence, as the merger does", () => {
		const search = createPropositionCandidateSearch([
			node("canoe", "Amber", "Canoe"), node("kayak", "Violet", "Kayak"),
		]);
		const proposed = [proposition("p1", "Amber canoe"), proposition("p1", "Violet kayak")];
		const out = propositionCandidateBatch(search, proposed, [{ id: "p1" }]);
		assert.deepEqual(out.matches[0]!.candidateIds, ["canoe"]);
		assert.deepEqual(out.candidates.map((candidate) => candidate.id), ["canoe"]);
	});

	it("rejects unknown ids, repeated ids, and unsafe offsets before returning a batch", () => {
		const search = createPropositionCandidateSearch([]);
		const proposed = [proposition("p", "amber")];
		assert.throws(() => propositionCandidateBatch(search, proposed, [{ id: "invented" }]), /Unknown proposition id/);
		assert.throws(() => propositionCandidateBatch(search, proposed, [{ id: "p" }, { id: "p" }]), /Repeated proposition id/);
		for (const offset of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => propositionCandidateBatch(search, proposed, [{ id: "p", offset }]), /nonnegative safe integer/);
		}
	});

	it("does not mutate inputs or inflate scores with duplicate aliases", () => {
		const nodes = [node("n", "Legacy", "Canonical", ["Amber canoe", "Amber canoe"])];
		const proposed = proposition("p", "amber canoe");
		const before = JSON.stringify({ nodes, proposed });
		const repeated = createPropositionCandidateSearch(nodes)(proposed);
		const single = createPropositionCandidateSearch([{ ...nodes[0]!, aliases: ["Amber canoe"] }])(proposed);
		assert.equal(repeated[0]!.score, single[0]!.score);
		assert.equal(JSON.stringify({ nodes, proposed }), before);
	});
});
