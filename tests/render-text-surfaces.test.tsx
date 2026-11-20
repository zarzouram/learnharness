/** Text surfaces added since the first right-to-left pass, and the ones it
 * missed: each shows learner or model text in its own direction, as `BidiText`
 * does, and each field takes the direction of its value, read by the rule its
 * display uses. Every surface also passes the direction audit with Arabic in
 * its content, which catches a site that forgot its direction. */
import React, { act } from "react";
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
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { DeleteNodeBody } from "../components/delete-node-dialog.tsx";
import { DeleteSessionBody, folderDeleteCopy } from "../components/delete-session-dialog.tsx";
import { GraphFolderFilterControl } from "../components/graph-folder-filter.tsx";
import { SidebarFolderRow } from "../components/sidebar-folders.tsx";
import { isolateName } from "../src/core/bidi.ts";
import { GraphContextCard } from "../components/graph-context-card.tsx";
import { GraphView } from "../components/graph-view.tsx";
import { InteractionLayersProvider } from "../components/interaction-layers.tsx";
import { ConcludeCard } from "../components/practice-cards.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { PromptText } from "../components/settings/prompt-text.tsx";
import type { TutorCitation } from "../src/core/citations.ts";
import { graphCostSummary } from "../src/core/cost-summary.ts";
import type { ArtifactPartProps, GraphSnapshot, PluginProblemSnapshot, PluginProblemSubmission, SourceDirectory } from "../src/core/index.ts";
import { callCost } from "../src/server/pricing.ts";
import { mountClient } from "./helpers/client-mount.ts";
import { assertDirected, auditDirection } from "./helpers/direction-audit.ts";
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
		assertDirected(doc.body);
	});

	it("the side question field takes its draft's direction", () => {
		const field = (draft: string) => side({}, draft).querySelector('[data-testid="side-thread-input"]');
		assert.equal(dirOf(field("لماذا؟")), "rtl");
		assert.equal(dirOf(field("Why?")), "ltr");
		assert.equal(dirOf(field("")), undefined);
		assertDirected(side({}, "لماذا؟").body);
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
			assertDirected(chip, variant);
		}
	});

	it("the quote card shows the quote line by line and the comment in its own direction", () => {
		const card = documentOf(<CitationQuoteCard citation={{ ...citation, text: "ينص قانون Newton\nF = ma", comment: "لماذا؟" }} onOpenSource={() => {}} />);
		const quote = card.querySelector("blockquote")!;
		assert.deepEqual(lineDirs(quote), ["rtl", "ltr"]);
		assert.equal(quote.textContent, "ينص قانون Newton\nF = ma");
		assert.equal(dirOf(card.querySelector("p")), "rtl");
		assertDirected(card.body);
	});

	it("the comment field takes its draft's direction", () => {
		const field = (initial: string | undefined) => documentOf(<CitationCommentEditor initial={initial} onDraftChange={() => {}} onSave={() => {}} onCancel={() => {}} />).querySelector("textarea");
		assert.equal(dirOf(field("لا أفهم هذا")), "rtl");
		assert.equal(dirOf(field(undefined)), undefined);
		assertDirected(field("لا أفهم هذا")!.ownerDocument.body);
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
		assertDirected(doc.body);
	});

	it("a saved text submission to a plugin problem reads in its own direction", () => {
		const snapshot: PluginProblemSnapshot = { protocolVersion: 1, problemId: "p1", pluginId: "fixture", typeId: "text", label: "Problem", contractVersion: 1,
			input: { statement: "Show it.", mode: "composition", modelSolution: "", payload: null }, problemSchema: { type: "object" }, submissionSchema: { type: "string" }, requiresSubmissionRefinement: false, requiresProcessing: false };
		const data: PluginProblemSubmission = { kind: "plugin-problem-submission", problemId: "p1", pluginId: "fixture", typeId: "text", contractVersion: 1, submission: "الحل هو F = ma", thinking: "", submittedAt: "now" };
		const doc = documentOf(<PluginProblemSubmittedContent data={data} snapshot={snapshot} chatId="chat" />);
		const shown = [...doc.querySelectorAll("div")].find((element) => element.textContent === "الحل هو F = ma" && element.hasAttribute("dir"))!;
		assert.equal(dirOf(shown), "rtl");
		assert.deepEqual(isolates(shown), ["F = ma"]);
		assertDirected(doc.body);
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
		assertDirected(body(true).body);
	});

	it("a read-only folder name truncates in its own direction", () => {
		const folder = body(false).querySelector('[data-testid="folder-row-f1"] .truncate')!;
		assert.equal(folder.textContent, "ملاحظات الفيزياء");
		assert.equal(dirOf(folder), "rtl");
		assertDirected(body(false).body);
	});

	it("the rename field takes its draft's direction", () => {
		const field = (name: string) => documentOf(<EditableSourceName name={name} onSave={async () => {}} initiallyEditing />).querySelector('[data-testid="source-name-input"]');
		assert.equal(dirOf(field("مجلد")), "rtl");
		assert.equal(dirOf(field("Folder")), "ltr");
		assert.equal(dirOf(field("")), undefined);
		assertDirected(field("مجلد")!.ownerDocument.body);
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
		assertDirected(names.ownerDocument.body);
	});
});

describe("image caption", () => {
	it("the teacher's caption reads in its own direction", () => {
		const caption = documentOf(
			<ImagePresentation image={{ path: "/tmp/board.png", caption: "لوحة Arduino على الطاولة", mimeType: "image/png", data: "AAAA", width: 40, height: 30 }} />,
		).querySelector('[data-testid="image-caption"]')!;
		assert.equal(dirOf(caption), "rtl");
		assert.deepEqual(isolates(caption), ["Arduino"]);
		assertDirected(caption.ownerDocument.body);
	});
});

describe("surfaces the first pass missed", () => {
	/** The app router `useRouter` reads outside Next: every navigation is a no-op. */
	const noopRouter: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "_b_0_" };
	const silentEvents = () => ({ close() {}, onOpen() {}, onEvent() {} });
	const click = async (element: Element) => act(async () => { (element as HTMLElement).click(); });

	it("a session title reads in its own direction in the graph's cost panel and its import row", async () => {
		const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
		const run = { startedAt: 1, at: "fixture", durationMs: 1, stages: { extractor: { model: "anthropic:claude-haiku-4-5", steps: [usage] }, auditor: { model: "anthropic:claude-haiku-4-5", steps: [usage] } } };
		const costs = graphCostSummary({ chats: [{ title: "درس المشتقات", extractions: [run] }], sources: [] }, callCost);
		const snapshot: GraphSnapshot = { nodes: [], propositions: [], edges: [], logicalEdges: [], impLinks: [], chains: [], clusters: [], sessions: {}, fileSources: {}, nodeSessions: {}, positions: {} };
		const answers: Record<string, unknown> = {
			"/api/graph": snapshot,
			"/api/graph/costs": costs,
			"/api/graph/status": { runs: [{ id: "r1", chatId: "c1", title: "درس التكامل", phase: "extracting", startedAt: Date.now() }] },
		};
		const graphFetch: typeof fetch = async (input) => (String(input) in answers ? Response.json(answers[String(input)]) : new Promise<Response>(() => {}));
		const view = await mountClient(
			<InteractionLayersProvider>
				<AppRouterContext.Provider value={noopRouter}>
					<ServerEventsProvider connect={silentEvents}><GraphView /></ServerEventsProvider>
				</AppRouterContext.Provider>
			</InteractionLayersProvider>,
			{ fetch: graphFetch },
		);
		try {
			await act(async () => new Promise((resolve) => setImmediate(resolve)));
			const row = [...view.host.querySelectorAll(".truncate")].find((element) => element.textContent === "درس التكامل")!;
			assert.equal(dirOf(row), "rtl", "the import row truncates the title itself");
			await click([...view.host.querySelectorAll("button[aria-expanded]")].find((button) => button.textContent?.includes("$"))!);
			const title = [...view.host.querySelectorAll("span[dir]")].find((element) => element.textContent === "درس المشتقات")!;
			assert.equal(dirOf(title), "rtl", "the cost panel isolates the title inside its English row");
			assertDirected(view.host);
		} finally {
			await view.unmount();
		}
	});

	it("the graph context card shows each proposition row and chain line in its own direction", async () => {
		const data = { propositions: [{ id: "p1", name: "قانون نيوتن", statement: "القوة تساوي الكتلة في التسارع (F = ma)." }], chains: ["قانون نيوتن → التسارع"] };
		const view = await mountClient(<GraphContextCard data={data} />);
		try {
			await click(view.host.querySelector('[data-testid="graph-context-toggle"]')!);
			const row = view.host.querySelector('[data-testid="graph-context-prop-p1"]')!;
			assert.equal(dirOf(row), "rtl");
			assert.deepEqual(isolates(row), ["(F = ma)"]);
			assertDirected(view.host);
		} finally {
			await view.unmount();
		}
	});

	it("the practice metadata names its targets in their own direction", async () => {
		const graph: typeof fetch = async (input) => (input === "/api/graph" ? Response.json({ nodes: [{ id: "n_1", name: "قانون نيوتن" }, { id: "n_2", name: "Newton's law" }] }) : new Promise<Response>(() => {}));
		const part = { type: "tool-conclude", state: "output-available", toolCallId: "c1", input: { outcome: "solved", verdict: "جيد." }, problemInput: { mode: "discrimination", target: ["n_1", "n_2"] }, reveal: "الحل." } as unknown as ArtifactPartProps["part"];
		const view = await mountClient(<InteractionLayersProvider><ConcludeCard part={part} /></InteractionLayersProvider>, { fetch: graph });
		try {
			const toggle = view.host.querySelector('[data-testid="metadata-toggle"]')!;
			Object.defineProperty(toggle, "getBoundingClientRect", { value: () => ({ left: 0, bottom: 0 }) });
			await click(toggle);
			await act(async () => new Promise((resolve) => setImmediate(resolve)));
			const box = document.querySelector('[data-testid="metadata-box"]')!;
			const targets = [...box.querySelectorAll("dd span[dir]")];
			assert.deepEqual(targets.map((target) => [target.textContent, dirOf(target)]), [["قانون نيوتن", "rtl"], ["Newton's law", "ltr"]]);
			assertDirected(box);
		} finally {
			await view.unmount();
		}
	});

	it("the delete dialogs keep a title or node name in its code font and give it its own direction", () => {
		const session = documentOf(<DeleteSessionBody chat={{ id: "c1", title: "درس المشتقات" }} traces={false} busy={false} failure={null} onTraces={() => {}} onClose={() => {}} onRun={() => {}} />);
		const title = session.querySelector('[data-testid="session-name-code"]')!;
		assert.equal(title.localName, "code");
		assert.equal(dirOf(title), "rtl");
		assertDirected(session.body);
		const one = documentOf(<DeleteNodeBody nodes={[{ id: "n1", name: "قانون نيوتن" }]} busy={false} failure={null} onClose={() => {}} onRun={() => {}} />);
		assert.equal(dirOf(one.querySelector('code[data-testid="node-name-code"]')), "rtl");
		assertDirected(one.body);
		const many = documentOf(
			<DeleteNodeBody nodes={[{ id: "n1", name: "قانون نيوتن" }, { id: "n2", name: "Newton" }]} folders={[{ id: "f1", name: "مجلد فارغ" }]} busy={false} failure={null} onClose={() => {}} onRun={() => {}} />,
		);
		const names = many.querySelector('[data-testid="node-names-code"]')!;
		assert.equal(names.textContent, "قانون نيوتن, Newton");
		assert.deepEqual([...names.children].map(dirOf), ["rtl", "ltr"]);
		assert.equal(many.querySelector('[data-testid="folder-removal-names"]')!.textContent, "Empty folders: مجلد فارغ");
		assertDirected(many.body);
	});

	it("a prompt override and its source text take their own direction", async () => {
		const view = await mountClient(
			<>
				<PromptText text="Teach clearly." preview={false} fieldRef={{ current: null }} />
				<PromptText text="علّم بالعربية الفصحى." preview={false} fieldRef={{ current: null }} onChange={() => {}} />
			</>,
		);
		try {
			assert.equal(dirOf(view.host.querySelector('textarea[aria-label="Default Markdown"]')), "ltr");
			assert.equal(dirOf(view.host.querySelector('textarea[aria-label="Override Markdown"]')), "rtl");
			assertDirected(view.host);
		} finally {
			await view.unmount();
		}
	});
	it("a sidebar folder row shows its name in its own direction", () => {
		const doc = documentOf(
			<SidebarFolderRow folder={{ id: "f1", name: "مجلد C++", parentId: null, createdAt: "2026-11-21" }} depth={0} open={false} dropActive={false} renaming={false} draggable
				onToggle={() => {}} onContextMenu={() => {}} onRename={async () => {}} onRenameDone={() => {}} />,
		);
		const name = [...doc.querySelectorAll("span[dir]")].find((span) => span.textContent === "مجلد C++");
		assert.equal(dirOf(name), "rtl");
		assert.deepEqual(isolates(name!), ["C++"]);
		assertDirected(doc.body);
	});

	it("the graph's folder filter shows each folder name, and a lone choice on its button, in its own direction", async () => {
		const folder = (id: string, name: string) => ({ id, name, parentId: null, createdAt: "2026-11-21" });
		const view = await mountClient(
			<InteractionLayersProvider>
				<GraphFolderFilterControl organization={{ version: 1, folders: [folder("a", "الجبر C++"), folder("b", "Physics")], placements: {} }}
					listed={new Set(["a", "b"])} selected={new Set(["a"])} onChange={() => {}} />
			</InteractionLayersProvider>,
		);
		try {
			assert.equal(dirOf(view.host.querySelector('[data-testid="graph-folder-filter-name"]')), "rtl");
			await click(view.host.querySelector('[data-testid="graph-folder-filter"]')!);
			const option = (id: string) => view.host.ownerDocument.querySelector(`[data-testid="graph-folder-option-${id}"] span[dir]`);
			assert.equal(dirOf(option("a")), "rtl");
			assert.equal(dirOf(option("b")), "ltr");
			assertDirected(view.host.ownerDocument.body);
		} finally {
			await view.unmount();
		}
	});

	it("a right-to-left parent folder named inside the folder Delete's sentence keeps its own isolate", () => {
		assert.equal(isolateName("تعلم C++"), "\u2067تعلم \u2066C++\u2069\u2069");
		assert.equal(isolateName("Top"), "Top");
		assert.equal(isolateName("2024"), "2024");
		const copy = folderDeleteCopy({ sessions: 1, subfolders: 0, notes: 1, parentName: "تعلم C++" });
		assert.ok(copy.body.includes("1 imported notes file inside moves to “\u2067تعلم \u2066C++\u2069\u2069”."), copy.body);
	});

});

describe("the direction audit itself", () => {
	const findings = (markup: string) => auditDirection(parseHTML(`<html><body>${markup}</body></html>`).document.body).map(({ check, text }) => `${check}: ${text}`);

	it("flags right-to-left text that does not resolve to rtl, a code-font name without dir included", () => {
		assert.deepEqual(findings("<p>مرحبا</p>"), ["text: مرحبا"]);
		assert.deepEqual(findings('<p dir="ltr">مرحبا</p>'), ["text: مرحبا"]);
		assert.deepEqual(findings('<p dir="auto">مرحبا</p>'), ["text: مرحبا"]);
		assert.deepEqual(findings("<code>درس</code>"), ["text: درس"]);
	});

	it("flags a field holding right-to-left text without dir=rtl", () => {
		assert.deepEqual(findings('<input value="مرحبا">'), ["field: مرحبا"]);
		assert.deepEqual(findings('<input type="search" value="مرحبا" dir="ltr">'), ["field: مرحبا"]);
		assert.deepEqual(findings("<textarea>مرحبا</textarea>"), ["field: مرحبا"]);
		assert.ok(findings('<div contenteditable="true">مرحبا</div>').includes("field: مرحبا"));
	});

	it("flags a left-to-right run left inside right-to-left text", () => {
		assert.deepEqual(findings('<p dir="rtl">ينص قانون Newton على</p>'), ["run: ينص قانون Newton على"]);
	});

	it("passes directed text and fields, and what has no direction of its own", () => {
		assert.deepEqual(findings([
			'<p dir="rtl">ينص قانون <span dir="ltr">Newton</span> على</p>',
			'<code dir="rtl">درس المشتقات</code>',
			'<code dir="ltr">عربي</code>',
			'<span class="katex">س</span>',
			'<span role="img" dir="ltr">/home/ملاحظات.md</span>',
			'<span dir="ltr">See https://ar.wikipedia.org/wiki/فيزياء for details.</span>',
			'<span dir="rtl">رابط <span dir="ltr">https://ar.wikipedia.org/wiki/فيزياء</span></span>',
			'<input dir="rtl" value="مرحبا">',
			'<input type="checkbox" value="مرحبا">',
			"<p>English text, untouched.</p>",
		].join("")), []);
	});
});
