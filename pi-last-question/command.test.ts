import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * End to end through a fake pi:
 *
 *  1. a session with a long question renders a 2-line strip above the editor
 *  2. submitting a new prompt replaces it, and a shorter question needs no marker
 *  3. the expand shortcut opens a full view and ⏎ inserts the whole text
 *  4. the jump shortcut inserts the whole question into the prompt box
 *  5. no question hides the widget; non-TUI surfaces get a notification instead
 */
test("last question strip: renders, expands and inserts", () => {
	const extensionPath = path.resolve(import.meta.dir, "index.ts");
	const home = fs.mkdtempSync("/tmp/pi-lastq-");
	const script = `
import extension from ${JSON.stringify(extensionPath)};
import assert from 'node:assert/strict';

const events = new Map();
const commands = new Map();
const shortcuts = new Map();
const widgets = [];
const notes = [];
let editor = '';
let overlayResult;
let overlayOptions;
let customCalls = 0;

let entries = [];
let hasUI = true;
let mode = 'tui';

function ctx() {
  return {
    cwd: '/work/alpha',
    mode,
    hasUI,
    ui: {
      setWidget: (key, content, options) => widgets.push({ key, content, options }),
      notify: (message, level) => notes.push({ message, level }),
      getEditorText: () => editor,
      setEditorText: (text) => { editor = text; },
      custom: async (factory, options) => {
        customCalls += 1;
        overlayOptions = options;
        // Drive the component enough to prove it renders and maps keys.
        const component = await factory(
          { terminal: { rows: 40 }, requestRender: () => {} },
          { fg: (_c, s) => s },
          {},
          (result) => { overlayResult = result; }
        );
        const lines = component.render(80);
        assert.ok(lines.some((line) => line.includes('Your last question')), 'overlay titles the question');
        assert.ok(lines.some((line) => line.includes('enter inserts')), 'overlay advertises the actions');
        component.handleInput('y'); // copy → closes with "copy"
        return overlayResult;
      },
      select: async () => undefined,
    },
    sessionManager: { getSessionId: () => 'sess-1', getBranch: () => entries, getEntries: () => entries },
  };
}

extension({
  on: (event, handler) => events.set(event, handler),
  registerCommand: (name, value) => commands.set(name, value.handler),
  registerShortcut: (shortcut, value) => shortcuts.set(String(shortcut), value.handler),
  registerTool: () => {},
  registerFlag: () => {},
  appendEntry: () => {},
  sendUserMessage: () => {},
  events: { on: () => () => {}, emit: () => {} },
});

const userEntry = (text) => ({ type: 'message', id: 'u' + Math.random(), message: { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() } });
const longQuestion = 'how do I rotate the deploy key without breaking the build for the running pods while the old one is cached in the sidecar container and the gateway still pins the previous certificate fingerprint in its config';
entries = [userEntry(longQuestion)];

await events.get('session_start')({ reason: 'startup' }, ctx());
const first = widgets.at(-1);
assert.equal(first.key, 'last-question');
assert.equal(first.options.placement, 'aboveEditor');
assert.ok(first.content.length <= 2, 'at most two lines');
assert.ok(first.content[0].includes('how do I rotate the deploy key'), 'shows the question');
assert.ok(first.content.at(-1).includes('⌥Q'), 'truncated strip advertises the expand shortcut');

// --- 2. a new prompt replaces the strip; a short one needs no marker ------
entries = [...entries, userEntry('what is the cache TTL?')];
await events.get('input')({ source: 'interactive', text: 'what is the cache TTL?' }, ctx());
const second = widgets.at(-1);
assert.equal(second.content.length, 1, 'short question fits on one line');
assert.ok(second.content[0].includes('what is the cache TTL?'));
assert.ok(!second.content.join('').includes('…'), 'no truncation marker when it fits');

// --- 3. expand shortcut → overlay → insert into the editor ----------------
entries = [userEntry(longQuestion)];
await events.get('session_start')({ reason: 'reload' }, ctx());
const shortcutHandlers = [...shortcuts.values()];
assert.equal(shortcutHandlers.length, 2, 'two shortcuts registered');
editor = '';
overlayResult = undefined;
await shortcutHandlers[0](ctx());          // ctrl+alt+q
assert.equal(customCalls, 1, 'overlay opened');
assert.deepEqual(overlayOptions, { overlay: true, overlayOptions: { anchor: 'center', width: '80%', maxHeight: '80%' } });
assert.equal(editor, longQuestion, 'copy action put the full question in the editor');

// --- 4. jump shortcut inserts, appending to typed text --------------------
editor = 'draft: ';
await shortcutHandlers[1](ctx());          // ctrl+alt+j
assert.ok(editor.startsWith(longQuestion), 'full question inserted');
assert.ok(editor.includes('draft: '), 'existing draft preserved');
assert.match(notes.at(-1).message, /inserted into the prompt box/);

// --- 5. empty branch hides the widget; non-TUI notifies -------------------
entries = [];
await events.get('session_start')({ reason: 'new' }, ctx());
assert.equal(widgets.at(-1).content, undefined, 'widget cleared with no question');

entries = [userEntry('non tui question')];
hasUI = false;
mode = 'rpc';
const beforeWidgets = widgets.length;
await commands.get('last-question')('', ctx());
assert.equal(widgets.length, beforeWidgets, 'no widget without a UI');
assert.match(notes.at(-1).message, /non tui question/);
hasUI = true;
mode = 'tui';

// shutdown clears the widget
await events.get('session_shutdown')({}, ctx());
assert.equal(widgets.at(-1).content, undefined, 'widget removed on shutdown');

console.log('last question verified');
`;
	fs.writeFileSync(`${home}/fixture.ts`, script);
	try {
		const result = spawnSync(process.execPath, [`${home}/fixture.ts`], {
			env: { ...process.env, HOME: home },
			encoding: "utf8",
			timeout: 20000,
		});
		expect({ status: result.status, error: result.stderr, output: result.stdout }).toEqual({
			status: 0,
			error: "",
			output: "last question verified\n",
		});
	} finally {
		fs.rmSync(home, { recursive: true, force: true });
	}
}, 20000);
