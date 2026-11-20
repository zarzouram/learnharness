/**
 * The direction audit: one call checks every piece of learner or model text on
 * a mounted surface, so a surface that forgot `BidiText`, Markdown or a field
 * `dir` fails without a hand-written assertion per site. Mount the surface
 * with Arabic in every content field, then audit its root.
 *
 * Three checks, read from the markup alone:
 * - text: a text node with a right-to-left letter resolves to `rtl` through
 *   its nearest `dir`.
 * - field: an input, textarea or contenteditable whose value holds a
 *   right-to-left letter states `dir="rtl"`.
 * - run: a text node that resolves to `rtl` holds no left-to-right run of its
 *   own; each run sits in an isolate.
 *
 * Exempt: code that states `dir="ltr"`, keys, preformatted text, math and
 * file-path chips, which have no direction of their own; and left-to-right
 * text the rule itself calls left-to-right (an isolated run, a URL whose path
 * holds Arabic). A name set in `<code>` without `dir` is not exempt.
 */
import assert from "node:assert/strict";
import { contentDirection, hasRtlLetter, ltrRuns } from "../../src/core/bidi.ts";

export interface DirectionFinding {
	check: "text" | "field" | "run";
	/** The element that holds the text, as a short tag description. */
	at: string;
	text: string;
}

const EXEMPT = 'code[dir="ltr"], kbd, pre, .katex, [role="img"]';
const SKIPPED = "script, style, template, textarea";
const TEXT_INPUTS = new Set(["", "text", "search"]);

const describeElement = (element: Element): string => {
	const id = element.getAttribute("data-testid");
	return `<${element.localName}${id ? ` data-testid="${id}"` : ""}${element.className ? ` class="${element.className}"` : ""}>`;
};

/** Every finding under `root`, in document order. */
export function auditDirection(root: ParentNode): DirectionFinding[] {
	const findings: DirectionFinding[] = [];
	const visit = (node: Node): void => {
		if (node.nodeType === node.TEXT_NODE) return checkText(node, findings);
		if (node.nodeType !== node.ELEMENT_NODE && node.nodeType !== node.DOCUMENT_NODE && node.nodeType !== node.DOCUMENT_FRAGMENT_NODE) return;
		if (node.nodeType === node.ELEMENT_NODE) {
			const element = node as Element;
			checkField(element, findings);
			if (element.matches(SKIPPED)) return;
		}
		for (const child of node.childNodes) visit(child);
	};
	visit(root as unknown as Node);
	return findings;
}

/** Fails with every finding listed, so one run names each forgotten surface. */
export function assertDirected(root: ParentNode, message = "direction audit"): void {
	const findings = auditDirection(root);
	assert.deepEqual(findings.map(({ check, at, text }) => `${check} ${at} ${JSON.stringify(text)}`), [], message);
}

function checkText(node: Node, findings: DirectionFinding[]): void {
	const text = node.textContent ?? "";
	const parent = node.parentElement;
	if (!parent || !text.trim() || parent.closest(EXEMPT)) return;
	const directed = parent.closest("[dir]");
	const dir = directed?.getAttribute("dir");
	if (hasRtlLetter(text) && dir !== "rtl" && !(dir === "ltr" && contentDirection(directed!.textContent ?? "") === "ltr")) {
		findings.push({ check: "text", at: describeElement(parent), text });
	}
	if (dir === "rtl" && ltrRuns(text).some((run) => run.ltr)) findings.push({ check: "run", at: describeElement(parent), text });
}

function checkField(element: Element, findings: DirectionFinding[]): void {
	const tag = element.localName;
	const editable = element.getAttribute("contenteditable");
	const isField = tag === "textarea" || (tag === "input" && TEXT_INPUTS.has(element.getAttribute("type") ?? "")) || (editable !== null && editable !== "false");
	if (!isField) return;
	const value = tag === "input" || tag === "textarea" ? ((element as HTMLInputElement).value ?? element.getAttribute("value") ?? element.textContent ?? "") : (element.textContent ?? "");
	if (!hasRtlLetter(value)) return;
	const dir = element.getAttribute("dir");
	if (dir !== "rtl" && !(dir === "ltr" && contentDirection(value) === "ltr")) findings.push({ check: "field", at: describeElement(element), text: value });
}
