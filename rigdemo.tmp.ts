import { drawRig, rigText, NEUTRAL } from './src/avatar/rig.ts';
const cases: [string, any][] = [['neutral', {}], ['blink', { eyeL: 0, eyeR: 0 }], ['smile', { smile: 15 }], ['talk', { mouth: 7 }], ['shout', { mouth: 15 }], ['frown', { smile: 0, browL: 0, browR: 0 }], ['surprise', { browL: 15, browR: 15, mouth: 12, eyeL: 14, eyeR: 14 }], ['yaw R', { yaw: 15 }], ['yaw R4', { yaw: 12 }], ['yaw L', { yaw: 0 }], ['pitch up', { pitch: 15 }], ['roll R', { roll: 15 }], ['roll L', { roll: 1 }], ['gaze R', { gazeX: 15 }]];
for (const [w, h] of [[16, 8], [10, 5], [5, 2]]) {
  const cols = cases.map(([n, c]) => [n.padEnd(w), ...rigText(drawRig({ ...NEUTRAL, ...c }, w, h)).split('\n')]);
  for (let k = 0; k < cases.length; k += 7) { const part = cols.slice(k, k + 7); for (let r = 0; r <= h; r++) console.log(part.map((c) => (c[r] ?? '').padEnd(w)).join(' | ')); console.log(); }
}
