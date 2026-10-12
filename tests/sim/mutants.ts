/**
 * Test the tests: plant one rule bug at a time in the engine and check the
 * simulator catches it. Each bug is put back afterwards, whatever happens.
 *
 *   node tests/sim/mutants.ts [games per bug]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const games = process.argv[2] ?? '1000';
/** Only the planted bugs whose names match this (optional). */
const only = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const files = {
	engine: new URL('../../src/core/engine.ts', import.meta.url),
	rules: new URL('../../src/core/rules.ts', import.meta.url),
	night: new URL('../../src/core/night.ts', import.meta.url),
	state: new URL('../../src/core/state.ts', import.meta.url),
	tb: new URL('../../src/core/scripts/trouble-brewing.ts', import.meta.url),
	order: new URL('../../src/core/scripts/night-order.ts', import.meta.url),
	bmr: new URL('../../src/core/scripts/bad-moon-rising.ts', import.meta.url)
};
/** One planted bug: a name, a file, and one or more [from, to] replacements in it. */
type Mutant = [name: string, file: keyof typeof files, from: string, to: string, ...more: string[]];
const MUTANTS: Mutant[] = [
	['Scarlet Woman catches with 4 alive', 'engine', 'if (aliveBefore < 5) return null;', 'if (aliveBefore < 4) return null;'],
	['Monk protection ignored', 'engine', "if (d.cause === 'demon' && safeFromDemon(s, t)) return prevent('protected by the Monk');", ''],
	['Soldier not safe', 'engine', "if (d.cause === 'demon' && hasWorkingAbility(s, t, 'soldier')) return prevent('the Soldier');", ''],
	['Butler slips go unnoted', 'engine', 'for (const v of butlerSlips) {', 'for (const v of butlerSlips.slice(1)) {'],
	['Monk-protected Imp starpasses', 'engine', 'if (safeFromDemon(tx.state, by)) return emit(', 'if (false) return emit('],
	['Chef counts a Recluse one way only', 'rules', 'if (may(a) && may(b)) hi++;', 'if (must(a) && must(b)) hi++;'],
	['Ties keep the block', 'engine', "else if (votes >= needed && votes === day.highest) outcome = 'tied';", ''],
	['Half rounds down', 'engine', 'const needed = Math.ceil(living(s).length / 2);', 'const needed = Math.floor(living(s).length / 2);'],
	['Dead may nominate', 'engine', "if (!seat(s, nominator).alive) refuse('Dead players cannot nominate.');", ''],
	['Nominate twice a day', 'engine', 'if (day.nominations.some((n) => n.nominator === nominator)) refuse(', 'if (false) refuse('],
	['Virgin works poisoned', 'engine', 'if (!isDroisoned(s, nominee)) {', 'if (true) {'],
	['Saint loses when poisoned', 'engine', "if (hasWorkingAbility(st, id, 'saint')) {", "if (seat(st, id).character === 'saint') {"],
	['Two alive does not end it', 'engine', 'if (alive <= 2) {', 'if (alive <= 1) {'],
	['Mayor win forgotten', 'engine', 'if (mayor && living(s).filter((x) => !x.traveller).length === 3) {', 'if (false) {'],
	['Poisoned players act', 'rules', 'return isDrunk(state, id) || isPoisoned(state, id);', 'return isDrunk(state, id);'],
	['Recluse cannot read as evil', 'rules', "alignments.push('evil');", ''],
	['Empath counts dead neighbours', 'rules', 'if (state.seats[other].alive) {', 'if (true) {'],
	['Ravenkeeper wakes alive', 'night', "case 'ravenkeeper': applies = night.deaths.includes(s.id); break;", "case 'ravenkeeper': break;"],
	['Poison lasts past dusk', 'state', "s.effects = s.effects.filter((x) => x.until !== 'dusk' && ", "s.effects = s.effects.filter((x) => "],
	['Ghost votes never spent', 'state', 'for (const g of e.ghostsSpent) s.seats[g].ghostVote = false;', ''],
	['Empath wakes before the Imp kills', 'order', '"ravenkeeper","empath","fortune-teller"', '"ravenkeeper","fortune-teller"', '"legion","imp"', '"legion","empath","imp"'],
	['Monk wakes after the Imp', 'order', '"snake-charmer","monk","organ-grinder"', '"snake-charmer","organ-grinder"', '"legion","imp","zombuul"', '"legion","imp","monk","zombuul"'],
	['Imp kills on the first night', 'tb', "id: 'imp', name: 'Imp', team: 'demon', firstNight: null,", "id: 'imp', name: 'Imp', team: 'demon', firstNight: 30,"],
	['Spy registers while poisoned', 'rules', "if (working && s.character === 'spy') {", "if (s.character === 'spy') {"],
	['Fortune Teller ignores the red herring', 'rules', "canRegisterAsTeam(state, p, 'demon') || state.redHerring === p);", "canRegisterAsTeam(state, p, 'demon'));"],
	['Starpass to a dead Minion', 'engine', 'const minions = living(s).filter(', 'const minions = s.seats.filter('],
	// Bad Moon Rising
	['Tea Lady ignored', 'engine', "if (teaLadyProtects(s, t)) return prevent('the Tea Lady');", ''],
	['Sober Sailor dies', 'engine', "if (abilityWorks(s, t, 'sailor')) return prevent('the Sailor');", ''],
	['Innkeeper ignored', 'engine', "if (night && s.effects.some((e) => e.kind === 'safe-tonight' && e.target === t)) return prevent('the Innkeeper');", ''],
	['Fool saved every time', 'engine', "if (abilityWorks(s, t, 'fool') && !s.spent.includes(`${t}:fool`)) {", "if (abilityWorks(s, t, 'fool')) {"],
	['Zombuul dies at once', 'engine', "if (abilityWorks(s, t, 'zombuul') && !v.undead) {", 'if (false) {'],
	['Goon never catches', 'engine', "if (!abilityWorks(s, target, 'goon') || target === by) return false;", 'return false;'],
	['Minstrel silent', 'engine', "for (const m of tx.state.seats.filter((x) => abilityWorks(tx.state, x.id, 'minstrel'))) {", 'for (const m of tx.state.seats.filter((x) => x.id < 0)) {'],
	['Mastermind forgotten', 'engine', "if (ctx.demonExecuted && s.day && s.seats.some((x) => abilityWorks(s, x.id, 'mastermind'))) {", 'if (false) {'],
	['Assassin stopped by protection', 'engine', "attemptDeath(tx, t, { cause: 'assassin', ignoreProtection: true });", "attemptDeath(tx, t, { cause: 'assassin', ignoreProtection: false });"],
	['Grandmother outlives the grandchild', 'engine', ".filter((e) => e.kind === 'grandchild' && e.target === t)", ".filter((e) => e.kind === 'grandchild' && e.target === -1)"],
	['Po charge forgotten', 'engine', "effectOn('po-charged') ? { count: 3 }", 'false ? { count: 3 }'],
	['Exorcist ignored', 'engine', "if (ok && teamOf(s, s.seats[t].character) === 'demon' && reallyAlive(s, t)) {", 'if (false) {'],
	['Gambler survives a wrong guess', 'engine', "if (ok && s.seats[t].character !== cmd.character) attemptDeath(tx, by, { cause: 'gambler' });", ''],
	['Godfather kills any night', 'night', "applies = applies && night.dayDeaths.some((d) => charDef(script, state.seats[d].character).team === 'outsider');", 'applies = applies;'],
	['Zombuul wakes after a death by day', 'night', "case 'zombuul': applies = alive && night.dayDeaths.length === 0", "case 'zombuul': applies = alive"],
	['Exorcist wakes after the Demon', 'order', '"exorcist",', '', '"pukka","shabaloth"', '"pukka","exorcist","shabaloth"'],
	// Found by the simulator, fixed: they must stay caught.
	['Professor choosing no one crashes', 'engine', 'if (t === undefined) return;', ''],
	['A dead Demon keeps killing', 'engine', "if (tx.state.phase.kind === 'over') return; // the Demon killed itself: nothing more happens", ''],
	['Revived players lose tonight\u2019s wake', 'night', 'if (night.revived.includes(s.id) && order < revivedAt) order = revivedAt;', ''],
	['Moonchild chooses twice', 'engine', ' || s.spent.includes(`${cmd.by}:moonchild`)', ''],
	// Sects & Violets
	['Witch curse ignored', 'engine', "if (s.effects.some((e) => e.kind === 'cursed' && e.target === nominator && inForce(s, e)) && living(s).length > 3) attemptDeath(tx, nominator, { cause: 'witch' });", ''],
	['Vortox lets the truth through', 'engine', 'const fits = vortox ? !v.truthful : v.truthful;', 'const fits = v.truthful;'],
	['Vortox day forgotten', 'engine', "tx.state.day?.executed === null && vortoxWorks(tx.state)) {", 'false) {'],
	['Evil Twin never wins', 'engine', "if (twin && twin.by !== null && abilityWorks(s, twin.by, 'evil-twin')) {", 'if (false) {'],
	['Twins do not hold', 'engine', "if (!twinsHold(s)) return emit(tx, { type: 'game-over', winner: 'good'", "if (true) return emit(tx, { type: 'game-over', winner: 'good'"],
	['Klutz harmless', 'engine', "if (!isDroisoned(s, cmd.by) && s.seats[cmd.target].alignment === 'evil') {", 'if (false) {'],
	['No Dashii poisons no one', 'rules', 'if (depth >= 4 || !isTownsfolk(state, id)) return false;', 'return false;'],
	['Fang Gu never jumps', 'engine', "!s.spent.some((x) => x.endsWith(':fang-gu'))", 'false'],
	['Fang Gu jumps every time', 'engine', "!s.spent.some((x) => x.endsWith(':fang-gu'))", 'true'],
	['Snake Charmer never swaps', 'engine', "if (works(tx, by, kind) && s.seats[by].alive && teamOf(s, s.seats[t].character) === 'demon') snakeCharm(tx, by, t);", ''],
	['Vigormortis Minions lose their ability', 'night', "&& !night.deaths.includes(s.id));", "&& false);"],
	['Pit-Hag picks a character in play', 'engine', "if (s.seats.some((x) => x.character === cmd.character)) refuse('The Pit-Hag chooses a character not in play.');", ''],
	['Dead Sage sleeps', 'night', "case 'sage': applies = (night.demonKills ?? []).includes(s.id); break;", "case 'sage': applies = false; break;"],
	['Seamstress twice', 'night', "case 'philosopher': applies = applies && !spent(s.id, def.id); break;", "case 'philosopher': applies = applies && (def.id === 'seamstress' || !spent(s.id, def.id)); break;"],
	// Travellers
	['Travellers count for two left', 'engine', 'const alive = s.seats.filter((x) => (x.alive || x.undead) && !x.traveller).length;', 'const alive = s.seats.filter((x) => x.alive || x.undead).length;'],
	['Travellers may be nominated', 'engine', "if (seat(s, nominee).traveller) refuse('Travellers are exiled, not executed: call for an exile instead.');", ''],
	['Exile needs more than half', 'engine', 'const passed = cmd.supporters.length >= needed;', 'const passed = cmd.supporters.length > needed;'],
	['Bureaucrat ignored', 'engine', "(s.effects.some((e) => e.kind === 'vote-x3' && e.target === v && inForce(s, e)) ? 3 : 1)", '1'],
	['Voudon needs a majority', 'engine', 'const needed = voudon ? 1 : Math.ceil(living(s).length / 2);', 'const needed = Math.ceil(living(s).length / 2);'],
	['Exile stopped by protection', 'engine', "emit(tx, { type: 'died', seat: cmd.traveller, cause: 'exile' });", "attemptDeath(tx, cmd.traveller, { cause: 'exile' });"],
	['Professor revives anyone', 'engine', "if (ok && teamOf(s, s.seats[t].character) === 'townsfolk') emit(tx, { type: 'revived'", "if (ok) emit(tx, { type: 'revived'"]
];

let caught = 0;
for (const [name, file, ...pairs] of MUTANTS) {
	if (only && !only.test(name)) continue;
	const url = files[file];
	const original = readFileSync(url, 'utf8');
	let planted = original;
	let missing = false;
	for (let i = 0; i < pairs.length; i += 2) {
		if (!planted.includes(pairs[i])) missing = true;
		planted = planted.replace(pairs[i], () => pairs[i + 1]);
	}
	if (missing) { console.log(`?? ${name}: the line to change was not found`); continue; }
	writeFileSync(url, planted);
	let out = '';
	try {
		out = execFileSync(process.execPath, [fileURLToPath(new URL('./run.ts', import.meta.url)), games, '1'], { encoding: 'utf8' });
	} catch (e) {
		out = (e as { stdout?: string }).stdout ?? String(e);
	} finally {
		writeFileSync(url, original);
	}
	const hit = out.split('\n').filter((l) => l.startsWith('BROKEN')).map((l) => l.replace(/^BROKEN (\S+).*/, '$1'));
	if (hit.length) caught++;
	console.log(`${hit.length ? 'caught ' : 'MISSED '} ${name}${hit.length ? `: ${hit.join(', ')}` : ''}`);
}
console.log(`\n${caught} of ${only ? MUTANTS.filter(([n]) => only.test(n)).length : MUTANTS.length} planted bugs caught.`);
