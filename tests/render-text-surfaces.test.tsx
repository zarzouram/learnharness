/** Text surfaces added since the first right-to-left pass: each shows learner
 * or model text in its own direction, as `BidiText` does, and each field
 * takes the direction of its value, read by the rule its display uses. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { ImagePresentation } from "../components/artifacts/image-card.tsx";
import { ChainTableBody } from "../components/chain-table.tsx";
import { CitationChip, CitationQuoteCard } from "../components/citation-chip.tsx";
import { CitationCommentEditor } from "../components/citation-comment-editor.tsx";
import { DeleteSourceBody } from "../components/delete-source-dialog.tsx";
import { PluginProblemSubmittedContent } from "../components/plugin-problem-submitted.tsx";
import { PluginQuestionAnswered } from "../components/plugin-question-slots.tsx";
import { SideThreadBody } from "../components/side-thread.tsx";
import { EditableSourceName } from "../components/source-folder-tree.tsx";
import type { TutorCitation } from "../src/core/citations.ts";
import type { PluginProblemSnapshot, PluginProblemSubmission, SourceDirectory } from "../src/core/index.ts";
import type { PluginQuestionAnswer, PluginQuestionSnapshot } from "../src/core/plugin-questions.ts";
import type { SideThreadState } from "../components/use-side-thread.ts";

const documentOf = (node: React.ReactElement) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
const dirOf = (element: Element | null | undefined) => element?.getAttribute("dir") ?? undefined;
/** The direction of each line block inside a multi-line element. */
const lineDirs = (element: Element) => [...element.children].map((line) => (assert.ok(line.classList.contains("block")), dirOf(line)));
const isolates = (element: Element) => [...element.querySelectorAll('span[dir="ltr"]')].map((run) => run.textContent);

describe("side conversation", () => {
	const side = (over: Partial<SideThreadState>, draft?: string) => documentOf(
		<SideThreadBody
			state={{ threadId: "side", segmentId: "lesson", messages: [], answering: false, streamText: "", mode: "popover", anchor: { kind: "composer" }, ...over }}
			draft={draft} onAsk={async () => true} onStop={() => {}} onExpand={() => {}} onFloat={() => {}} onClose={() => {}}
		/>,
	);

	it("the learner's question reads line by line in its own direction, under a quoted passage in its own", () => {
		const doc = side({ messages: [{ id: "q", role: "user", text: "لماذا يصح قانون Newton؟\nWhy?", quotes: ["ينص قانون Newton على أن القوة تساوي الكتلة في التسارع"], at: "2026-11-20T00:00:00Z" }] });
		const message = doc.querySelector('[data-testid="side-learner-message"]')!;
		const question = message.querySelector("p")!;
		assert.equal(dirOf(question), undefined);
		assert.deepEqual(lineDirs(question), ["rtl", "ltr"]);
		assert.equal(question.textContent, "لماذا يصح قانون Newton؟\nWhy?");
		const passage = message.querySelector("blockquote")!;
		assert.equal(dirOf(passage), "rtl", "the clamped quote is the element that cuts, so it states the direction");
		assert.deepEqual(isolates(passage), ["Newton"]);
		assert.ok(passage.classList.contains("line-clamp-3") && passage.classList.contains("border-s-2"), passage.className);
	});

	it("the side question field takes its draft's direction", () => {
		const field = (draft: string) => side({}, draft).querySelector('[data-testid="side-thread-input"]');
		assert.equal(dirOf(field("لماذا؟")), "rtl");
		assert.equal(dirOf(field("Why?")), "ltr");
		assert.equal(dirOf(field("")), undefined);
	});
});

describe("tutor citations", () => {
	const citation: TutorCitation = { version: 1, chatId: "c", messageId: "m", text: "ينص قانون Newton على أن القوة تساوي الكتلة في التسارع", start: 0, end: 52, prefix: "", suffix: "" };

	it("a chip keeps its quote icon on the left: the frame is left-to-right, the label it truncates reads in its own direction", () => {
		for (const variant of ["composer", "transcript"] as const) {
			const chip = documentOf(<CitationChip citation={citation} variant={variant} />).querySelector('[data-testid="citation-chip"]')!;
			assert.equal(dirOf(chip), "ltr", variant);
			const label = chip.querySelector(".truncate")!;
			assert.equal(dirOf(label), "rtl", variant);
			assert.deepEqual(isolates(label), ["Newton"], variant);
		}
	});

	it("the quote card shows the quote line by line and the comment in its own direction", () => {
		const card = documentOf(<CitationQuoteCard citation={{ ...citation, text: "ينص قانون Newton\nF = ma", comment: "لماذا؟" }} onOpenSource={() => {}} />);
		const quote = card.querySelector("blockquote")!;
		assert.deepEqual(lineDirs(quote), ["rtl", "ltr"]);
		assert.equal(quote.textContent, "ينص قانون Newton\nF = ma");
		assert.equal(dirOf(card.querySelector("p")), "rtl");
	});

	it("the comment field takes its draft's direction", () => {
		const field = (initial: string | undefined) => documentOf(<CitationCommentEditor initial={initial} onDraftChange={() => {}} onSave={() => {}} onCancel={() => {}} />).querySelector("textarea");
		assert.equal(dirOf(field("لا أفهم هذا")), "rtl");
		assert.equal(dirOf(field(undefined)), undefined);
	});
});

describe("plugin answers shown without their plugin", () => {
	it("a saved text answer to a plugin question reads line by line in its own direction", () => {
		const snapshot: PluginQuestionSnapshot = {
			protocolVersion: 1, pluginId: "fixture", typeId: "text", label: "Text", variant: "teach", questionId: "q1", contractVersion: 1,
			occurrence: { messageId: "assistant", contentIndex: 0, toolCallId: "call", toolName: "text" },
			input: { question: "Explain it.", payload: null }, questionSchema: { type: "object" }, answerSchema: { type: "string" }, showThinking: false, requiresAnswerRefinement: false,
		};
		const answer: PluginQuestionAnswer = { kind: "plugin-question", questionId: "q1", pluginId: "fixture", typeId: "text", contractVersion: 1, answer: "القوة تساوي الكتلة\nF = ma", answeredAt: "2026-11-20T00:00:00Z" };
		const doc = documentOf(<PluginQuestionAnswered snapshot={snapshot} answer={answer} chatId="chat" />);
		const shown = [...doc.querySelectorAll("div.whitespace-pre-wrap")].find((element) => element.textContent === "القوة تساوي الكتلة\nF = ma")!;
		assert.deepEqual(lineDirs(shown), ["rtl", "ltr"]);
	});

	it("a saved text submission to a plugin problem reads in its own direction", () => {
		const snapshot: PluginProblemSnapshot = { protocolVersion: 1, problemId: "p1", pluginId: "fixture", typeId: "text", label: "Problem", contractVersion: 1,
			input: { statement: "Show it.", mode: "composition", modelSolution: "", payload: null }, problemSchema: { type: "object" }, submissionSchema: { type: "string" }, requiresSubmissionRefinement: false, requiresProcessing: false };
		const data: PluginProblemSubmission = { kind: "plugin-problem-submission", problemId: "p1", pluginId: "fixture", typeId: "text", contractVersion: 1, submission: "الحل هو F = ma", thinking: "", submittedAt: "now" };
		const doc = documentOf(<PluginProblemSubmittedContent data={data} snapshot={snapshot} chatId="chat" />);
		const shown = [...doc.querySelectorAll("div")].find((element) => element.textContent === "الحل هو F = ma" && element.hasAttribute("dir"))!;
		assert.equal(dirOf(shown), "rtl");
		assert.deepEqual(isolates(shown), ["F = ma"]);
	});
});

describe("source and folder names", () => {
	const directory: SourceDirectory = {
		organization: { version: 1, folders: [{ id: "f1", name: "ملاحظات الفيزياء", parentId: null, createdAt: "2026-11-20" }], placements: { a: { folderId: "f1" } } },
		sources: [{ id: "a", kind: "notes", label: "كتاب Newton", createdAt: "2026-11-20" }],
	};
	const body = (editable: boolean) => documentOf(
		<ChainTableBody
			directory={directory} onOrganizationChange={editable ? async () => {} : undefined}
			nodes={[{ id: "n1", name: "قانون", statement: "نص", aliases: [], provenance: [{ chatId: "a", messageId: "m1" }], createdAt: "2026-11-20" }]}
			chains={[]} sessions={{}} fileSources={{}} query="" onQuery={() => {}} sort={{ col: "name", dir: 1 }} onSort={() => {}} selection={new Set()}
			expandedClusters={new Set(["f1"])} expandedChains={new Set()} onToggleCluster={() => {}} onToggleChain={() => {}}
			onToggleNodes={() => {}} onClear={() => {}} onDelete={() => {}} onClose={() => {}}
		/>,
	);

	it("an editable name is the truncating button, in its own direction and aligned to its start", () => {
		const names = [...body(true).querySelectorAll('button[title="Rename"]')];
		assert.deepEqual(names.map((name) => [name.textContent, dirOf(name)]), [["ملاحظات الفيزياء", "rtl"], ["كتاب Newton", "rtl"]]);
		for (const name of names) assert.ok(name.classList.contains("truncate") && name.classList.contains("text-start"), name.className);
	});

	it("a read-only folder name truncates in its own direction", () => {
		const folder = body(false).querySelector('[data-testid="folder-row-f1"] .truncate')!;
		assert.equal(folder.textContent, "ملاحظات الفيزياء");
		assert.equal(dirOf(folder), "rtl");
	});

	it("the rename field takes its draft's direction", () => {
		const field = (name: string) => documentOf(<EditableSourceName name={name} onSave={async () => {}} initiallyEditing />).querySelector('[data-testid="source-name-input"]');
		assert.equal(dirOf(field("مجلد")), "rtl");
		assert.equal(dirOf(field("Folder")), "ltr");
		assert.equal(dirOf(field("")), undefined);
	});

	it("the delete dialog directs each name on its own, the commas between them staying in the sentence", () => {
		const names = documentOf(
			<DeleteSourceBody
				sources={[{ id: "a", kind: "notes", label: "كتاب Newton", createdAt: null }, { id: "b", kind: "notes", label: "Notes", createdAt: null }]}
				folders={[{ id: "f1", name: "مجلد", parentId: null, createdAt: "2026-11-20" }]}
				deleteSessions={false} onDeleteSessions={() => {}} busy={false} failure="" onClose={() => {}} onRun={() => {}}
			/>,
		).querySelector('[data-testid="source-deletion-names"]')!;
		assert.equal(names.textContent, "كتاب Newton, Notes, مجلد");
		assert.deepEqual([...names.children].map(dirOf), ["rtl", "ltr", "rtl"]);
	});
});

describe("image caption", () => {
	it("the teacher's caption reads in its own direction", () => {
		const caption = documentOf(
			<ImagePresentation image={{ path: "/tmp/board.png", caption: "لوحة Arduino على الطاولة", mimeType: "image/png", data: "AAAA", width: 40, height: 30 }} />,
		).querySelector('[data-testid="image-caption"]')!;
		assert.equal(dirOf(caption), "rtl");
		assert.deepEqual(isolates(caption), ["Arduino"]);
	});
});
