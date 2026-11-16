/**
 * blend.ts - the best of both (Lavender, 16 Nov): the live camera as ASCII letters (asciiavatar.ts), the
 * face found in it by the tracker's points, and the avatar's own brows, eyes, nose and mouth (rigface.ts)
 * laid over the face, at any of the three sizes. The picture gives the person (hair, head, the room's
 * light); the features give a face that reads clearly in so few cells.
 *
 * The picture is cropped to a square round the face, sized so the face comes out as wide as the avatar:
 * its eyes on the avatar's eye row, its nose on the avatar's middle column. Under the features the picture
 * is dimmed in an oval, so they stand out; outside it the picture is as the camera sees it.
 * The head's turn, tip and lean are in the picture already, so the features are drawn square on.
 *
 * Pure functions, tested in tests/avatarrig.test.ts; testpage.ts draws them.
 */
import { drawRig } from './rig.ts';
import type { Detail, Rig } from './rig.ts';
import { DETAIL_SIZE } from './rig.ts';

/** A point, 0..1 across and down the camera's picture (unmirrored). */
export interface Pt { x: number; y: number; }
/** A square of the camera's picture, in its pixels. */
export interface Box { x: number; y: number; s: number; }

/** Where the face is: the eyes' outer corners, the nose's tip (unmirrored, 0..1). */
export interface FacePoints { eyeOuterA: Pt; eyeOuterB: Pt; nose: Pt; }

/** How much wider than the avatar the picture is: the face fills about 1/BLEND_MARGIN of it. */
export const BLEND_MARGIN = 1.7;
/** A face is about this many times as wide as its eyes' outer corners are apart. */
const FACE_PER_EYES = 1.75;

/** The avatar's eye row and middle column at each size (rigface.ts's layout). */
export const ANCHOR: Record<1 | 2 | 3, { eyeRow: number; midCol: number }> = { 1: { eyeRow: 0, midCol: 2 }, 2: { eyeRow: 1, midCol: 4 }, 3: { eyeRow: 3, midCol: 7 } };

/** The picture's size in cells for an avatar size: wide enough that the face comes out the avatar's width. */
export function blendSize(d: 1 | 2 | 3): { cols: number; rows: number } {
	const cols = Math.round(DETAIL_SIZE[d].w * BLEND_MARGIN);
	return { cols, rows: Math.max(2, Math.round(cols / 2)) };
}

/**
 * The square of the picture (pixels, sw x sh) to draw for an avatar of size d: centred on the face, a little
 * below the eyes (the face's middle), its side BLEND_MARGIN face-widths.
 */
export function blendCrop(p: FacePoints, sw: number, sh: number): Box {
	const ax = p.eyeOuterA.x * sw, ay = p.eyeOuterA.y * sh, bx = p.eyeOuterB.x * sw, by = p.eyeOuterB.y * sh;
	const eyes = Math.hypot(bx - ax, by - ay);
	const s = Math.max(8, eyes * FACE_PER_EYES * BLEND_MARGIN);
	const cx = (ax + bx) / 2, cy = (ay + by) / 2 + eyes * 0.35;
	return { x: cx - s / 2, y: cy - s / 2, s };
}

/** Where a point of the picture falls in a w x h frame of the crop `c` (mirrored, as the picture is shown). */
export function cellOfPoint(p: Pt, c: Box, sw: number, sh: number, w: number, h: number, mirror = true): { x: number; y: number } {
	let u = (p.x * sw - c.x) / c.s;
	const v = (p.y * sh - c.y) / c.s;
	if (mirror) u = 1 - u;
	return { x: Math.floor(u * w), y: Math.floor(v * h) };
}

/** One cell of the blend: its glyph, and either a picture level (0..15) or a feature's ink. */
export interface BlendCell { ch: string; level: number; feature: boolean; }

/**
 * The picture (its glyph rows and ink levels, cols x rows) with the avatar of size d laid over the face:
 * its eye row on the eyes' row, its middle on the nose. The picture under the features' box is dimmed (an
 * oval), its letters kept faint so the hair and head still show round the features.
 */
export function blendCells(lines: string[], inks: ArrayLike<number>, cols: number, rows: number, rig: Rig, d: 1 | 2 | 3, eyes: { x: number; y: number }, nose: { x: number; y: number }): BlendCell[][] {
	const { w, h } = DETAIL_SIZE[d as Detail];
	// Square on: the picture shows the turn, tip and lean already.
	const face = drawRig({ ...rig, yaw: 8, pitch: 8, roll: 8 }, w, h);
	const a = ANCHOR[d];
	const x0 = nose.x - a.midCol, y0 = eyes.y - a.eyeRow;
	const out: BlendCell[][] = [];
	for (let y = 0; y < rows; y++) {
		const row: BlendCell[] = [];
		for (let x = 0; x < cols; x++) row.push({ ch: lines[y]?.[x] ?? ' ', level: inks[x + y * cols] ?? 0, feature: false });
		out.push(row);
	}
	// Dim the picture in an oval round the features (half again their size), so they read.
	const cx = x0 + (w - 1) / 2, cy = y0 + (h - 1) / 2, rx = w / 2 + 0.5, ry = h / 2 + 0.5;
	for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
		const k = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
		if (k <= 1) out[y][x].level = Math.min(out[y][x].level, Math.round(out[y][x].level * 0.35));
	}
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const c = face[y][x];
		const X = x0 + x, Y = y0 + y;
		if (c.ch === ' ' || X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
		out[Y][X] = { ch: c.ch, level: 15, feature: true };
	}
	return out;
}
