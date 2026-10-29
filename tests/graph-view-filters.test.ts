/**
 * Legend/filters predicate tests — the pure half of the graph-view filters
 * panel (isNodeVisible); the sigma reducers just consume its verdict.
 * Unicode folding matches hamza, tashkeel and niqqud on both sides.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayCostTotals, graphVisibleIds, isNodeVisible } from "../components/graph-view.tsx";
import { graphFolderVisibleIds, type GraphNode, type SourceOrganization } from "../src/core/index.ts";
import { deriveView } from "../src/core/graph.ts";

const node = {
	name: "Money multiplier",
	statement: "The maximum ratio of broad money a bank can create from each unit of base money.",
};

describe("isNodeVisible (search predicate)", () => {
	it("matches hamza and tashkeel in names and statements on both sides", () => {
		const marked = { name: "أَحْمَدُ", statement: "إِنَّ الْمُشْتَقَّةَ مُهِمَّةٌ" };
		assert.equal(isNodeVisible(marked, "احمد"), true);
		assert.equal(isNodeVisible(marked, "أحْمَد"), true);
		assert.equal(isNodeVisible(marked, "ان المشتقة"), true);
		assert.equal(isNodeVisible({ name: "احمد", statement: "ان المشتقة مهمة" }, "إِنَّ الْمُشْتَقَّةَ"), true);
		assert.equal(isNodeVisible(marked, "تكامل"), false);
	});

	it("folds Hebrew niqqud without a language-specific filter path", () => {
		assert.equal(isNodeVisible({ name: "שָׁלוֹם", statement: "" }, "שלום"), true);
	});

	it("is visible with an empty query", () => {
		assert.equal(isNodeVisible(node, ""), true);
	});

	it("search matches the statement case-insensitively", () => {
		assert.equal(isNodeVisible(node, "MONEY multiplier"), true);
	});

	it("search matches the statement when the name does not", () => {
		assert.equal(isNodeVisible(node, "MAXIMUM ratio"), true);
		assert.equal(isNodeVisible(node, " velocity"), false);
	});

	it("search matches the name when the statement does not", () => {
		assert.equal(isNodeVisible(node, "money MULTIPLIER"), true);
		assert.equal(isNodeVisible(node, " banking"), false);
	});

	it("whitespace-only query is no filter", () => {
		assert.equal(isNodeVisible(node, "   "), true);
	});

	it("keeps voiced kana apart and finds a math letter by its plain letter", () => {
		assert.equal(isNodeVisible({ name: "バス", statement: "" }, "ハス"), false);
		assert.equal(isNodeVisible({ name: "バス", statement: "" }, "ﾊﾞｽ"), true);
		assert.equal(isNodeVisible({ name: "x ∈ ℝ", statement: "" }, "r"), true);
	});


});

it("combined search and folder scope hide every segment if a premise or conclusion is hidden", () => {
	const prop = (id: string, name: string): GraphNode => ({
		id, name, statement: name, aliases: [], createdAt: "now", provenance: [],
	});
	const propositions = [prop("p1", "Physics premise"), prop("p2", "Physics evidence"), prop("c", "Physics outcome")];
	// Only the first premise matches 'premise'; only the conclusion matches 'outcome'.
	const view = deriveView({ nodes: propositions, chains: [{ id: "arg_test", premises: ["p1", "p2"], conclusion: "c", createdAt: "now", provenance: [] }] });
	const organization: SourceOrganization = {
		version: 1, folders: [{ id: "f", name: "Folder", parentId: null, createdAt: "now" }], placements: { chat: { folderId: "f" } },
	};
	const folder = graphFolderVisibleIds({ organization, selected: new Set(["f"]), listed: new Set(["f"]),
		propositionIds: ["p1", "p2", "c"], nodeSources: { p1: ["chat"], p2: ["chat"], c: ["chat"] }, impLinks: view.impLinks });
	const edges = (ids: Set<string>) => view.edges.filter(({ from, to }) => ids.has(from) && ids.has(to));
	for (const [query, visible] of [["premise", "p1"], ["outcome", "c"]] as const) {
		assert.ok(graphVisibleIds(view, query, null).has("arg_test"), "search alone retains its behavior");
		const result = graphVisibleIds(view, query, folder);
		assert.deepEqual([...result], [visible]);
		assert.deepEqual(edges(result), []);
	}
	assert.deepEqual(edges(graphVisibleIds(view, "Physics", folder)), view.edges);
});

describe("displayCostTotals (naming-free cost fold)", () => {
	const stage = (dollars: number, unpricedRuns = 0) => ({
		runs: dollars > 0 ? 1 : 0,
		dollars,
		unpricedRuns,
		tokens: {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			reasoningTokens: 0,
		},
	});
	const costs = {
		stages: {
			extraction: stage(1.25, 1),
			audit: stage(0.75),
			naming: stage(9.99, 2), // dead channel — must never reach the display
		},
	} as const;

	it("sums the live stages only — the dead namer's spend is invisible", () => {
		assert.equal(displayCostTotals(costs).totalDollars, 2);
	});

	it("unpriced counts fold the same two stages", () => {
		assert.equal(displayCostTotals(costs).unpricedRuns, 1);
	});
});
