import { directedLines, type ContentDirection, type DirectedLine } from "@/src/core";

/**
 * PLAIN TEXT IN DOM THAT NO COMPONENT RENDERS: the twin of `BidiText` for an
 * element built by hand (a drag preview). The same lines give the same markup:
 * `dir` on the element and each left-to-right run of a right-to-left line in a
 * `<span dir="ltr">`; with `multiline`, one `block` span per line, each with its
 * own direction. It replaces the element's children and adds no characters, so
 * `textContent` is the text as `BidiText` shows it.
 */
export function showText(element: HTMLElement, text: string, options: { multiline?: boolean } = {}): void {
	const multiline = options.multiline ?? false;
	const lines = directedLines(text, { multiline });
	if (!multiline || !text.includes("\n")) {
		fill(element, lines[0]!);
		return;
	}
	element.removeAttribute("dir");
	element.replaceChildren(...lines.map((line) => {
		const block = element.ownerDocument.createElement("span");
		block.className = "block";
		fill(block, line);
		return block;
	}));
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
