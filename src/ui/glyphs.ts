/**
 * glyphs.ts - which figures this device can draw. Fonts differ from phone to phone, and a letter can
 * pass alone yet come out as an empty box with a mark on it, so a figure is tested whole, against the
 * box this device draws for a character it does not have.
 */
const FONT = 'ui-monospace,"Cascadia Mono",Consolas,Menlo,"DejaVu Sans Mono","Liberation Mono",monospace';
const NOT_THERE = ['\u{10FFFE}', '\uFFFF', '\u0378', '\uE000'];
let cx: CanvasRenderingContext2D | null = null;
function pixels(s: string): string {
	if (!cx) {
		const cv = document.createElement('canvas');
		cv.width = cv.height = 24;
		cx = cv.getContext('2d', { willReadFrequently: true });
	}
	if (!cx) return '';
	cx.clearRect(0, 0, 24, 24);
	cx.font = '20px ' + FONT;
	cx.fillStyle = '#000';
	cx.textBaseline = 'top';
	cx.fillText(s, 1, 1);
	return cx.getImageData(0, 0, 24, 24).data.join(',');
}
const seen = new Map<string, boolean>();
/** The figure, split into its letter and its mark (if any), can be drawn here. No canvas: assume so. */
export function canDraw(glyph: string): boolean {
	let ok = seen.get(glyph);
	if (ok === undefined) {
		const [ch, ...rest] = [...glyph];
		const mark = rest.join('');
		const p = pixels(glyph);
		ok = !p || (!NOT_THERE.some((c) => pixels(c + mark) === p) && /[1-9]/.test(p.replace(/(?:^|,)0(?=,|$)/g, '')) && (!mark || canDraw(ch)));
		seen.set(glyph, ok);
	}
	return ok;
}
