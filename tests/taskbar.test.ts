import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TASKBAR_SLOTS, taskbar, btn, segWidth } from '../src/ui/ascii.ts';

const noop = () => {};
const full = () => ({
	slots: { menu: btn('Menu', noop), voice: btn('Talk', noop, { style: 'primary' as const }), action: btn('Nominate', noop, { style: 'primary' as const }), people: btn('People', noop) },
	rest: [btn('My figure and face', noop), btn('Faces', noop)],
	more: btn('More', noop),
});
const labels = (bs: { label: string }[]) => bs.map((b) => b.label);
const width = (bs: Parameters<typeof segWidth>[0][]) => bs.reduce((k, b) => k + segWidth(b), 0);

test('the taskbar slots are fixed: Menu, voice, action, People, More', () => {
	assert.deepEqual([...TASKBAR_SLOTS], ['menu', 'voice', 'action', 'people', 'more']);
	const { slots, rest, more } = full();
	assert.deepEqual(labels(taskbar(slots, rest, 200, more).bar), ['Menu', 'Talk', 'Nominate', 'People', 'More']);
	// A slot with nothing to offer is left out; the others keep their order.
	const { action: _a, ...noAction } = slots;
	assert.deepEqual(labels(taskbar(noAction, rest, 200, more).bar), ['Menu', 'Talk', 'People', 'More']);
});

test('Menu is first on the bottom row at phone width, never behind More', () => {
	for (const cols of [36, 40, 44, 52, 64]) {
		const { slots, rest, more } = full();
		const { bar, more: held } = taskbar(slots, rest, cols, more);
		assert.equal(bar[0].label, 'Menu', `Menu first at ${cols} columns`);
		assert.ok(!held.some((b) => b.label === 'Menu'), 'Menu is not under More');
		assert.equal(bar[bar.length - 1].label, 'More');
		assert.ok(width(bar) <= cols, `the bar fits ${cols} columns`);
		// What does not fit keeps its order behind More.
		const order = ['Menu', 'Talk', 'Nominate', 'People'];
		assert.deepEqual(labels(bar.slice(0, -1)), order.filter((l) => labels(bar).includes(l)));
	}
	// The narrowest phone: People then the action give way, in that order.
	const { slots, rest, more } = full();
	assert.deepEqual(labels(taskbar(slots, rest, 36, more).bar), ['Menu', 'Talk', 'Nominate', 'More']);
	assert.deepEqual(labels(taskbar(slots, rest, 36, more).more).slice(0, 1), ['People']);
	assert.deepEqual(labels(taskbar(slots, rest, 28, more).bar), ['Menu', 'Talk', 'More']);
});

test('the taskbar styles Menu the same everywhere, and omits More when it would hold nothing', () => {
	const { slots, more } = full();
	const a = taskbar(slots, [], 200, more);
	assert.deepEqual(labels(a.bar), ['Menu', 'Talk', 'Nominate', 'People']);
	assert.equal(a.bar[0].style, 'primary');
	assert.equal(taskbar({ ...slots, menu: btn('Menu', noop, { style: 'on' }) }, [], 200, more).bar[0].style, 'on');
});
