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
      setWidget: (key, content, options) => {
        if (typeof content === 'function') {
          const component = content({ requestRender: () => {} }, {
            fg: (_color, text) => text,
            bg: (_color, text) => text,
          });
          widgets.push({ key, content: component.render(80), options, component });
          return;
        }
        widgets.push({ key, content, options });
      },
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
const rows = first.content.filter((line) => line.trim().length > 0);
assert.ok(rows.length <= 3, 'header plus at most two question lines');
assert.ok(rows[1].includes('how do I rotate the deploy key'), 'shows the question');
assert.ok(rows[0].includes('⌥Q expand'), 'header advertises the expand shortcut');
assert.ok(rows[0].includes('/'), 'header carries the timestamp');
assert.equal(new Set(rows.map((line) => line.length)).size, 1, 'card is a rectangle');

// --- 2. the card follows a new prompt immediately ------------------------
// The reported bug: pi emits the input event BEFORE the user message is on the
// branch, so reading the branch showed the previous question and the card stayed
// one prompt behind. The submitted text is used until the branch catches up.
const beforeInput = widgets.length;
await events.get('input')({ source: 'interactive', text: 'what is the cache TTL?' }, ctx());
assert.ok(widgets.length > beforeInput, 'submitting renders immediately');
assert.ok(
  widgets.at(-1).content.join('').includes('what is the cache TTL?'),
  'shows the submitted question, not the stale branch'
);

// the branch then catches up and the committed text still wins
entries = [...entries, userEntry('what is the cache TTL?')];
await events.get('turn_end')({ turnIndex: 1 }, ctx());
const second = widgets.at(-1);
const shortRows = second.content.filter((line) => line.trim().length > 0);
assert.equal(shortRows.length, 2, 'header plus one question line');
assert.ok(shortRows[1].includes('what is the cache TTL?'), 'still correct after commit');
assert.ok(!second.content.join('').includes('…'), 'no truncation marker when it fits');

// a later submission wins over the older branch, and an assistant reply keeps it
entries = [...entries, userEntry('and what about the second one?')];
await events.get('input')({ source: 'interactive', text: 'and what about the second one?' }, ctx());
assert.ok(widgets.at(-1).content.join('').includes('and what about the second one?'), 'newest submission wins');
await events.get('message_end')({ message: { role: 'assistant' } }, ctx());
assert.ok(widgets.at(-1).content.join('').includes('and what about the second one?'), 'assistant reply keeps it');

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
