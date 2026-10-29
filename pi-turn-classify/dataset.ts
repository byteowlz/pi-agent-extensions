/**
 * Background dataset: the corpus that builds itself.
 *
 * Calibration needs labelled examples of *real* traffic. Asking a human to
 * reconstruct that later from session history is work that mostly does not
 * happen, so when a dataset path is configured every finished turn is appended
 * here: the digest that was classified, the model's answers with their
 * confidences, and the error text when there was one.
 *
 * Two consequences that matter:
 *   - the file is immediately usable as a bench corpus (unlabeled rows still
 *     carry the model's prediction, so they measure agreement and drift), and
 *   - the labeler can read it, pre-fill the model's guess and let a human correct
 *     it, which is roughly twice as fast as labelling blind.
 *
 * Deliberately boring: append-only JSONL, size-based rotation, never throws into
 * the turn path, and `~` expansion because config files use it.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { TurnDigest } from "./digest.js";
import type { AnswerMap, QuestionSpec, TurnCard } from "./schema.js";

export const DATASET_VERSION = 1;

export interface DatasetRecord {
	version: typeof DATASET_VERSION;
	/** Stable id so a later human label can be joined onto the record. */
	id: string;
	at: string;
	session: { id: string; file?: string; name?: string };
	cwd: string;
	turn: number;
	/** The digest exactly as it was sent to the model (the corpus lives here). */
	state: TurnDigest;
	/** The model's answers, including raw probabilities, or null when it failed. */
	classification: {
		api: string;
		model: string;
		endpoint: string;
		ms: number;
		answers: AnswerMap;
	} | null;
	/** Human labels, filled by the labeler when it shares this file. */
	labels?: Record<string, string>;
	/** Why classification produced nothing, if it failed. */
	error?: string;
}

export interface DatasetWriterOptions {
	path: string;
	maxBytes?: number;
	errorsOnly?: boolean;
}

export function expandHome(path: string): string {
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

/** A dataset id stable across runs: session + turn. */
export function datasetId(sessionId: string, turn: number): string {
	return `${sessionId || "session"}:${turn}`;
}

/**
 * Append one record, rotating when the file is too large.
 *
 * Returns false (never throws) when writing was impossible: a corpus write is
 * never worth breaking a turn over.
 */
export function appendRecord(options: DatasetWriterOptions, record: DatasetRecord): boolean {
	try {
		const path = expandHome(options.path);
		mkdirSync(dirname(path), { recursive: true });
		const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
		if (existsSync(path) && statSync(path).size >= maxBytes) {
			// One generation of history is enough; older data belongs in an archive
			// the owner chooses to keep.
			renameSync(path, `${path}.1`);
		}
		appendFileSync(path, `${JSON.stringify(record)}\n`);
		return true;
	} catch {
		return false;
	}
}

/** Should this turn be recorded? `errorsOnly` keeps the corpus error-focused. */
export function shouldRecord(options: DatasetWriterOptions, digest: TurnDigest): boolean {
	if (!options.errorsOnly) return true;
	return Boolean(digest.error) || Boolean(digest.errored);
}

/** Build the record for one classified turn. */
export function buildRecord(input: {
	digest: TurnDigest;
	card?: TurnCard;
	answers?: AnswerMap;
	session: { id: string; file?: string; name?: string };
	turn: number;
	classificationError?: string;
}): DatasetRecord {
	const { digest, card, answers, session, turn } = input;
	const at = card?.at ?? new Date().toISOString();
	return {
		version: DATASET_VERSION,
		id: datasetId(session.id, turn),
		at,
		session,
		cwd: digest.cwd,
		turn,
		state: digest,
		classification: card
			? {
					api: card.source.api,
					model: card.source.model,
					endpoint: card.source.endpoint,
					ms: card.source.ms,
					answers: answers ?? card.answers,
				}
			: null,
		...(input.classificationError ? { error: input.classificationError } : {}),
	};
}

/**
 * Convert dataset records into bench samples.
 *
 * Only records with human labels become scoring samples; model predictions alone
 * are what you compare against, never ground truth (labelling the gate with the
 * gate is the oldest trap in this design).
 */
export function datasetToSamples(
	records: DatasetRecord[]
): Array<{ id: string; state: TurnDigest; expect: Record<string, string> }> {
	return records
		.filter((record) => record.labels && Object.keys(record.labels).length > 0)
		.map((record) => ({ id: record.id, state: record.state, expect: record.labels as Record<string, string> }));
}

/** Questions actually asked for a record (error questions only on failed turns). */
export function askedQuestions(questions: QuestionSpec[], answers: AnswerMap): string[] {
	return questions.map((question) => question.id).filter((id) => answers[id] !== undefined);
}
