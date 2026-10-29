/**
 * The widget component: a pi-styled card above the prompt box.
 *
 * Visual language is pi's own, not invented here. The card describes *your*
 * message, so it borrows the user-message family (blue) rather than the
 * extension-block family (violet):
 *  - `Box(1, 0, theme.bg("userMessageBg"))` gives the blue background rectangle
 *    pi uses for user messages (Box pads every row to the widget width, so the
 *    block is a true rectangle).
 *  - the left rule (`▌`) is `border` — also blue, one step quieter — and the
 *    timestamp is `mdLink`, the text `userMessageText`.
 *  - the shortcut hint is right-aligned in `dim` for hierarchy.
 */

import { Box, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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
			//
			// Padding is computed from the PLAIN plan strings, never from the styled
			// ones: theme.fg() adds ANSI bytes, so measuring a styled string with
			// .length collapses the gap and a byte-wise slice then eats the hint
			// (invisible with an identity theme, obvious in a real terminal).
			const headerWidth = Math.max(0, width - 2);
			// Width in terminal cells, not code points: `⌥` is double-width, so a
			// .length-based gap loses a cell and truncation eats the hint's last glyph.
			const gap = Math.max(0, headerWidth - visibleWidth(current.header.left) - visibleWidth(current.header.right));
			const headerLeft = theme.fg("mdLink", current.header.left);
			const headerRight = current.header.right ? theme.fg("dim", current.header.right) : "";
			const headerRow = `${theme.fg("border", RULE)} ${headerLeft}${" ".repeat(gap)}${headerRight}`;
			lines.push(truncateToWidth(headerRow, width, ""));

			// Body: the question itself, dim rule, message text.
			for (const row of current.body) {
				const text = theme.fg("userMessageText", row);
				lines.push(truncateToWidth(`${theme.fg("border", RULE)} ${text}`, width, ""));
			}
			cache = { width, lines, plan: current };
			return lines;
		},
		invalidate(): void {
			cache = undefined;
		},
	};

	const box = new Box(1, 0, (text: string) => theme.bg("userMessageBg", text));
	box.addChild(component);
	return { box, component, plan };
}
