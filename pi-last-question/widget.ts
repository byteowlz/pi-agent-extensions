/**
 * The widget component: a pi-styled card above the prompt box.
 *
 * Visual language is pi's own, not invented here:
 *  - `Box(1, 0, theme.bg("customMessageBg"))` gives the padded background
 *    rectangle pi uses for extension-provided blocks (Box pads every row to the
 *    widget width, so the block is a true rectangle).
 *  - a left rule per row (`▌`) plus `customMessageLabel`/`customMessageText`
 *    colours, so it reads as a message block rather than stray text.
 *  - the hint sits right-aligned in `dim`, the timestamp in `muted` — the same
 *    hierarchy pi uses in its message headers.
 */

import { Box } from "@earendil-works/pi-tui";

import { type CardPlan, RULE, planCard } from "./last-question.js";

/** The subset of pi's Theme this widget touches. */
export interface WidgetTheme {
	fg(color: string, text: string): string;
	bg(color: string, text: string): string;
}

export interface CardComponent {
	render(width: number): string[];
	invalidate(): void;
}

/**
 * Build the card for one question.
 *
 * `width` handling: the component renders to the width Box hands it (already
 * minus padding), so every row lands inside the rectangle.
 */
export function createLastQuestionCard(options: {
	theme: WidgetTheme;
	text: string;
	stamp?: string;
	hint?: string;
	glyph?: string;
}): { box: Box; component: CardComponent; plan: (width: number) => CardPlan } {
	const { theme } = options;
	let cache: { width: number; lines: string[]; plan: CardPlan } | undefined;

	const plan = (width: number): CardPlan =>
		planCard(options.text, width, { stamp: options.stamp, hint: options.hint, glyph: options.glyph });

	const component: CardComponent = {
		render(width: number): string[] {
			if (cache && cache.width === width) return cache.lines;
			const current = plan(width);
			const lines: string[] = [];

			// Header: rule + timestamp on the left, shortcut hint on the right.
			const headerLeft = theme.fg("customMessageLabel", current.header.left);
			const headerRight = current.header.right ? theme.fg("dim", current.header.right) : "";
			const headerWidth = Math.max(0, width - 2);
			// Colours are applied after padding so the row stays aligned.
			const pad = Math.max(0, headerWidth - current.header.left.length - current.header.right.length);
			lines.push(`${theme.fg("accent", RULE)} ${headerLeft}${" ".repeat(pad)}${headerRight}`.slice(0, Math.max(width, 1)));

			// Body: the question itself, dim rule, message text.
			for (const row of current.body) {
				const text = theme.fg("customMessageText", row);
				lines.push(`${theme.fg("accent", RULE)} ${text}`);
			}
			cache = { width, lines, plan: current };
			return lines;
		},
		invalidate(): void {
			cache = undefined;
		},
	};

	const box = new Box(1, 0, (text: string) => theme.bg("customMessageBg", text));
	box.addChild(component);
	return { box, component, plan };
}
