import { drawRig, rigText, rigInks, NEUTRAL } from './src/avatar/rig.ts';
for (const y of [15, 8, 4]) { const c = drawRig({ ...NEUTRAL, yaw: y }, 16, 8); const t = rigText(c).split('\n'), k = rigInks(c).split('\n'); t.forEach((r, i) => console.log(r + ' | ' + k[i])); console.log(); }
