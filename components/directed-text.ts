import { directedLines, type ContentDirection, type DirectedLine } from "@/src/core";

/** What `showText` last wrote into an element: the call, and the `dir`,
 *  children and text it left there. Weak, so the element stays its owner's. */
interface Shown {
	text: string;
	multiline: boolean;
	dir: string | null;
	children: ChildNode[];
	content: string;
}
const shown = new WeakMap<HTMLElement, Shown>();

/**
 * PLAIN TEXT IN DOM THAT NO COMPONENT RENDERS: the twin of `BidiText` for an
 * element built by hand (a drag preview, a plugin label through `ctx.text.show`).
 * The same lines give the same markup: `dir` on the element and each
 * left-to-right run of a right-to-left line in a `<span dir="ltr">`; with
 * `multiline`, one `block` span per line, each with its own direction. It
 * replaces the element's children and adds no characters, so `textContent` is
 * the text as `BidiText` shows it. A call that would write what the element
 * still shows returns at once, so a list that refreshes every row on each
 * render repaints only the rows whose text changed.
 */
export function showText(element: HTMLElement, text: string, options: { multiline?: boolean } = {}): void {
	const multiline = options.multiline ?? false;
	if (stillShows(element, text, multiline)) return;
	const lines = directedLines(text, { multiline });
	if (!multiline || !text.includes("\n")) fill(element, lines[0]!);
	else {
		element.removeAttribute("dir");
		element.replaceChildren(...lines.map((line) => {
			const block = element.ownerDocument.createElement("span");
			block.className = "block";
			fill(block, line);
			return block;
		}));
	}
	shown.set(element, { text, multiline, dir: element.getAttribute("dir"), children: [...element.childNodes], content: element.textContent ?? "" });
}

/** The element holds exactly what the same call wrote last time: nothing has
 *  changed its `dir`, replaced its children or edited their text since. */
function stillShows(element: HTMLElement, text: string, multiline: boolean): boolean {
	const last = shown.get(element);
	if (!last || last.text !== text || last.multiline !== multiline) return false;
	if (last.dir !== element.getAttribute("dir") || last.content !== element.textContent) return false;
	const children = element.childNodes;
	return children.length === last.children.length && last.children.every((child, index) => children[index] === child);
}

function fill(element: HTMLElement, line: DirectedLine): void {
	setDir(element, line.dir);
	element.replaceChildren(...line.runs.map(({ text, ltr }) => {
		if (!ltr) return text;
		const run = element.ownerDocument.createElement("span");
		run.setAttribute("dir", "ltr");
		run.textContent = text;
		return run;
	}));
}

function setDir(element: HTMLElement, dir: ContentDirection | undefined): void {
	if (dir) element.setAttribute("dir", dir);
	else element.removeAttribute("dir");
}
