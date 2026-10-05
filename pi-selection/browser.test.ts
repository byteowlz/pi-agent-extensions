import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBrowserReviewForTest } from "./browser.js";
import { SelectionStore } from "./store.js";

// A fresh headless browser, fresh context, disposable loopback server, no user profile.
const python = String.raw`
import sys
from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=sys.argv[2])
    try:
        page = browser.new_page()
        page.on('dialog', lambda dialog: dialog.accept())
        page.goto(sys.argv[1])
        page.wait_for_load_state('networkidle')
        expect(page.locator('#title')).to_have_text('Browser regression')
        assert page.evaluate('location.hash') == ''
        page.reload()
        page.wait_for_load_state('networkidle')
        expect(page.locator('#title')).to_have_text('Browser regression')
        field = page.locator('article input')
        field.fill('old')
        # Hold the request in the browser while editing the still-enabled draft.
        page.evaluate('''() => {
            const original = window.fetch;
            window.fetch = (url, options) => url === '/api/save'
                ? new Promise(resolve => { window.releaseSave = () => resolve(original(url, options)); })
                : original(url, options);
        }''')
        page.locator('#save').click()
        expect(field).to_be_enabled()
        field.fill('newer')
        page.evaluate('window.releaseSave()')
        expect(page.locator('#status')).to_have_text('Draft saved; newer changes remain unsaved')
        expect(page.locator('article input')).to_have_value('newer')
        page.evaluate('''() => {
            const original = window.fetch;
            window.fetch = (url, options) => url === '/api/cancel'
                ? new Promise(resolve => { window.releaseCancel = () => resolve(original(url, options)); })
                : original(url, options);
        }''')
        page.locator('#cancel').click()
        expect(page.locator('article input')).to_be_disabled()
        page.evaluate('window.releaseCancel()')
        expect(page.locator('#status')).to_have_text('cancelled')
        expect(page.locator('article input')).to_have_value('newer')
        expect(page.locator('article input')).to_be_disabled()
        page.reload()
        page.wait_for_load_state('networkidle')
        expect(page.locator('article input')).to_have_value('newer')
        expect(page.locator('article input')).to_be_disabled()
        expect(page.locator('#save')).to_be_disabled()
        # A second disposable record proves submit freezes too.
        page.goto(sys.argv[3])
        page.wait_for_load_state('networkidle')
        page.locator('article input').fill('submitted')
        page.evaluate('''() => {
            const original = window.fetch;
            window.fetch = (url, options) => url === '/api/submit'
                ? new Promise(resolve => { window.releaseSubmit = () => resolve(original(url, options)); })
                : original(url, options);
        }''')
        page.locator('#submit').click()
        expect(page.locator('article input')).to_be_disabled()
        page.evaluate('window.releaseSubmit()')
        expect(page.locator('#status')).to_have_text('submitted')
        expect(page.locator('article input')).to_be_disabled()
    finally:
        browser.close()
`;
test("real Chromium reload auth, newer draft edits, cancel and submit freeze, terminal read-only", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-browser-"));
	const store = new SelectionStore(root);
	const spec = {
		version: 1,
		mode: "questions",
		title: "Browser regression",
		questions: [{ id: "t", title: "Text", kind: "text", required: true }],
	};
	const server = await startBrowserReviewForTest(store, await store.create("s", spec));
	const second = await startBrowserReviewForTest(store, await store.create("s", spec));
	try {
		const child = spawn(
			"python",
			[
				"-c",
				python,
				server.url,
				process.env.PI_SELECTION_TEST_CHROMIUM ??
					join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome"),
				second.url,
			],
			{ stdio: ["ignore", "pipe", "pipe"], timeout: 25000 }
		);
		let diagnostic = "";
		child.stderr.on("data", (chunk) => {
			diagnostic += chunk.toString();
		});
		const code = await new Promise<number | null>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", resolve);
		});
		expect({ code, diagnostic }).toEqual({ code: 0, diagnostic: "" });
	} finally {
		await server.close();
		await second.close();
		await rm(root, { recursive: true, force: true });
	}
}, 30000);
