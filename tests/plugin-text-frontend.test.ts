import assert from "node:assert/strict";
import { it } from "node:test";
import { parseHTML } from "linkedom";
import { PluginFrontendManager } from "../components/plugin-manager.ts";
import type { PluginFrontendContext, PluginInfo } from "../src/core/plugins.ts";

// ctx.text lends plugins the host's own rule; the rule itself is pinned in
// tests/bidi.test.ts and tests/text-search.test.ts. These tests pin the wiring.
const info: PluginInfo = { id: "text-fixture", origin: "community", enabled: true, status: "active", revision: "1", manifest: {
	apiVersion: 1, id: "text-fixture", name: "Text", version: "1.0.0", minAppVersion: "0.4.1", main: "main.js",
} };
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

async function fixture() {
	const contexts: PluginFrontendContext[] = [];
	const manager = new PluginFrontendManager({ fetch: async () => { throw new Error("ctx.text must not fetch"); },
		importModule: async () => ({ activate(ctx) { contexts.push(ctx); } }), pathname: () => "/", navigate() {},
	});
	manager.reconcile([info]); await tick();
	assert.equal(contexts.length, 1);
	return { manager, text: contexts[0]!.text };
}

it("ctx.text.direction is the host's content rule, plain by default and Markdown on request", async t => {
	const f = await fixture();
	t.after(() => f.manager.dispose());
	assert.equal(f.text.direction("Newton ينص على"), "rtl", "any right-to-left letter, not the first strong one");
	assert.equal(f.text.direction("Learn C++"), "ltr");
	assert.equal(f.text.direction("42 + 7"), undefined);
	assert.equal(f.text.direction("https://ar.wikipedia.org/wiki/فيزياء"), "ltr", "a URL reads left-to-right");
	assert.equal(f.text.direction("x `عربي`"), "rtl", "plain text is literal");
	assert.equal(f.text.direction("x `عربي`", { format: "markdown" }), "ltr", "Markdown skips code");
	assert.equal(f.text.direction("$عربي$", { format: "plain" }), "rtl");
	assert.equal(f.text.direction("$عربي$", { format: "markdown" }), undefined);
});

it("ctx.text.show directs a plugin's element and adds no characters", async t => {
	const f = await fixture();
	t.after(() => f.manager.dispose());
	const { document } = parseHTML("<html><body></body></html>");
	const label = document.createElement("button") as unknown as HTMLElement;
	f.text.show(label, "تعلم C++");
	assert.equal(label.getAttribute("dir"), "rtl");
	assert.equal(label.textContent, "تعلم C++");
	assert.equal(label.querySelector('span[dir="ltr"]')?.textContent, "C++", "the left-to-right run is isolated");
	f.text.show(label, "Learn C++");
	assert.equal(label.getAttribute("dir"), "ltr");
	assert.equal(label.innerHTML, "Learn C++");
	f.text.show(label, "42");
	assert.equal(label.hasAttribute("dir"), false, "letterless text inherits");
	const note = document.createElement("p") as unknown as HTMLElement;
	f.text.show(note, "سطر\nEnglish line", { multiline: true });
	assert.deepEqual([...note.children].map(line => line.getAttribute("dir")), ["rtl", "ltr"]);
	assert.equal(note.textContent, "سطر\nEnglish line");
});

it("ctx.text.fold folds both sides the way host search does", async t => {
	const f = await fixture();
	t.after(() => f.manager.dispose());
	assert.equal(f.text.fold("كَتَبَ"), f.text.fold("كتب"));
	assert.ok(f.text.fold("أَحْمَدُ كَتَبَ الدرس").includes(f.text.fold("احمد كتب")));
	assert.equal(f.text.fold("Café"), "cafe");
});
