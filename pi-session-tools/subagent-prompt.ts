/**
 * One short identity notice prepended to a delegated task, so the child knows it
 * is a subagent (and what its parent expects) before it reads the task itself.
 * Kept to two lines: it is permanent child-session context, not a briefing.
 */
export function subagentTaskPrompt(task: string, options: { label?: string; name?: string } = {}): string {
	const identity = options.label ?? options.name;
	const who = identity ? ` (${identity})` : "";
	const notice = `Subagent notice: you are a subagent${who}, spawned by a parent pi session that reads your final message and is notified when you go idle. Work only this delegated task and report the outcome.`;
	return `${notice}\n\n${task}`;
}
