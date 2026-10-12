/**
 * regressions.test.ts - every game the simulator ever cut down to a failure,
 * replayed against today's engine and checked again by the independent
 * checker (tests/sim). Some came from real engine bugs (fixed since), some
 * from bugs planted on purpose (tests/sim/mutants.ts); either way the real
 * engine must now play each one without breaking a rule.
 *
 * New ones: copy a file from tests/sim/failures/ into tests/regressions/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { check } from './sim/sim.ts';
import type { Command } from '../src/core/index.ts';

const dir = new URL('./regressions/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

test(`${files.length} saved games replay without breaking a rule`, () => {
	assert.ok(files.length > 0);
	for (const f of files) {
		const { commands } = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { commands: Command[] };
		const v = check(commands);
		assert.deepEqual(v, [], `${f}: ${v[0]?.rule}: ${v[0]?.detail}`);
	}
});
