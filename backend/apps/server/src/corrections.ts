/**
 * Where corrections are kept — §11.6.
 *
 * Append-only JSONL on the local disk, and every part of that is deliberate.
 *
 * **Local**, because `ProjectInfo.md`'s offline-first promise is about privacy:
 * the input may be personal, copyrighted, religious, political, or private. A
 * correction carries a sentence of it. Sending that anywhere would quietly
 * convert a local tool into one that phones home, which is precisely the thing
 * the architecture exists to avoid — so corrections stay on the machine that
 * made them and are exported by hand when their author decides to.
 *
 * **Append-only**, because a correction is a record of what someone said at a
 * point in time. Rewriting the file to "fix" an entry would destroy the only
 * evidence of what the parser did on the day it was reported.
 *
 * **JSONL**, because a corrupt line costs one report rather than the file, and
 * because appending needs no read of what is already there.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { Correction } from '@langchunk/corrections';

/** Override with `LANGCHUNK_CORRECTIONS=/path/to/corrections.jsonl`. */
export function correctionsFile(): string {
	const declared = process.env['LANGCHUNK_CORRECTIONS'];
	if (declared !== undefined && declared.length > 0) return declared;
	return join(homedir(), '.langchunk', 'corrections.jsonl');
}

export async function appendCorrection(correction: Correction): Promise<void> {
	const file = correctionsFile();
	await mkdir(dirname(file), { recursive: true });
	await appendFile(file, `${JSON.stringify(correction)}\n`, 'utf8');
}

/**
 * Every correction on file.
 *
 * A malformed line is skipped rather than fatal. The file is append-only and
 * may have been truncated by a crash mid-write; losing the report that was
 * being written is acceptable, losing the several hundred before it is not.
 */
export async function readCorrections(): Promise<Correction[]> {
	let raw: string;
	try {
		raw = await readFile(correctionsFile(), 'utf8');
	} catch {
		return [];
	}

	const out: Correction[] = [];
	for (const line of raw.split('\n')) {
		if (line.trim().length === 0) continue;
		try {
			out.push(JSON.parse(line) as Correction);
		} catch {
			// A partial write at the tail of the file. Skip it.
		}
	}
	return out;
}
