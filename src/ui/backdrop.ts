/**
 * backdrop.ts - the page the grimoire is written on, painted once per size
 * and used as the background of the page and of the cards over it.
 *
 *  - By day, a leaf of vellum (after the bestiary leaf on jsonsummers.github.io/links):
 *    calfskin with its cockle and mottle, hair-follicle dots, worn and yellowed
 *    edges where hands turned it, a water stain's tide line, foxing, a worm
 *    hole or two, and the pricking and ruling the scribe laid out either side
 *    of the text.
 *  - At night, the same leaf by candlelight: dark, warm where the flame is.
 *  - For Laissez un Faire (data-theme="occult"), a Victorian book of the
 *    occult: marbled endpapers in drowned greens, oxblood and a vein of brass
 *    at the margins, a damp, gaslit page in the middle with mildew blooming
 *    on it, a brass double rule round the text with tentacles curling at its
 *    corners, and a sigil pressed faintly into the paper.
 *
 * The painting is a blob URL in --paper on <html>; style.css lays it under
 * the body and the cards. Nothing moves.
 */

function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const TABLE = (() => { const r = rng(11), a = new Float32Array(1024); for (let i = 0; i < 1024; i++) a[i] = r(); return a; })();
const h2 = (x: number, y: number) => TABLE[((x * 73856093) ^ (y * 19349663)) & 1023];
function vnoise(x: number, y: number) {
	const X = Math.floor(x), Y = Math.floor(y), u = x - X, v = y - Y, fu = u * u * (3 - 2 * u), fv = v * v * (3 - 2 * v);
	return (h2(X, Y) * (1 - fu) + h2(X + 1, Y) * fu) * (1 - fv) + (h2(X, Y + 1) * (1 - fu) + h2(X + 1, Y + 1) * fu) * fv;
}
const fbm = (x: number, y: number, o: number) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Where the text block is: the column of #app (or the middle, before it exists). */
function column(W: number) {
	const app = document.getElementById('app');
	const r = app?.getBoundingClientRect();
	const w = r && r.width > 40 ? r.width : Math.min(W - 32, 520);
	const l = r && r.width > 40 ? r.left : (W - w) / 2;
	return { l: Math.max(6, l - 14), r: Math.min(W - 6, l + w + 14) };
}

/** The slow fields at a quarter of the size, scaled up smoothly onto `x`. */
function field(x: CanvasRenderingContext2D, W: number, H: number, px: (X: number, Y: number) => [number, number, number]) {
	const q = 4, w = Math.ceil(W / q), h = Math.ceil(H / q);
	const lo = document.createElement('canvas');
	lo.width = w; lo.height = h;
	const lx = lo.getContext('2d')!, im = lx.createImageData(w, h), d = im.data;
	for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
		const [r, g, b] = px(i * q, j * q), k = (j * w + i) * 4;
		d[k] = clamp(r); d[k + 1] = clamp(g); d[k + 2] = clamp(b); d[k + 3] = 255;
	}
	lx.putImageData(im, 0, 0);
	x.imageSmoothingQuality = 'high';
	x.drawImage(lo, 0, 0, W, H);
}

/** Fine grain: a small tile of noise, repeated. */
function grain(x: CanvasRenderingContext2D, W: number, H: number, alpha: number, dark: number, light: number) {
	const gt = document.createElement('canvas');
	gt.width = gt.height = 128;
	const gx = gt.getContext('2d')!, gi = gx.createImageData(128, 128), r = rng(7);
	for (let k = 0; k < gi.data.length; k += 4) { const v = r(); gi.data[k] = gi.data[k + 1] = gi.data[k + 2] = v < 0.5 ? dark : light; gi.data[k + 3] = Math.abs(v - 0.5) * alpha; }
	gx.putImageData(gi, 0, 0);
	x.fillStyle = x.createPattern(gt, 'repeat')!;
	x.fillRect(0, 0, W, H);
}

// ---- the vellum ---------------------------------------------------------------------------------

function vellum(x: CanvasRenderingContext2D, W: number, H: number, night: boolean) {
	const r = rng(4), m = Math.min(W, H);
	const stains: [number, number, number][] = [[W * (0.08 + r() * 0.2), H * (0.7 + r() * 0.25), m * (0.12 + r() * 0.08)], [W * (0.6 + r() * 0.35), H * (0.02 + r() * 0.15), m * (0.07 + r() * 0.06)]];
	// The candle: a warm pool high in the middle of the page.
	const cx = W / 2, cy = H * 0.3, cr = Math.max(W, H) * 0.75;
	field(x, W, H, (X, Y) => {
		const ck = fbm(X / 260, Y / 260, 3) - 0.5, mo = vnoise(X / 38 + 50, Y / 38) - 0.5;
		const e = Math.min(X, Y, W - 1 - X, H - 1 - Y) / m, edge = 1 - Math.min(1, e / 0.16);
		let L = 1 + 0.07 * ck + 0.035 * mo - 0.2 * edge * edge, Yl = 0.5 * edge * edge + 0.15 * Math.max(0, ck);
		for (const [sx, sy, sr] of stains) if (Math.hypot(X - sx, Y - sy) < sr * (0.85 + 0.3 * fbm(X / 60, Y / 60, 2))) { L -= 0.018; Yl += 0.16; }
		if (!night) return [(238 - 10 * Yl) * L, (226 - 22 * Yl) * L, (194 - 42 * Yl) * L];
		const glow = Math.max(0, 1 - Math.hypot(X - cx, (Y - cy) * 1.2) / cr);
		const k = (0.16 + 0.34 * glow * glow) * L;
		return [(150 - 10 * Yl) * k + 6, (108 - 18 * Yl) * k + 4, (66 - 30 * Yl) * k + 2];
	});
	for (const [sx, sy, sr] of stains) {
		x.beginPath();
		for (let a = 0; a <= 6.3; a += 0.03) {
			const qx = sx + Math.cos(a) * sr, qy = sy + Math.sin(a) * sr, mm = sr * (0.85 + 0.3 * fbm(qx / 60, qy / 60, 2));
			const px = sx + Math.cos(a) * mm, py = sy + Math.sin(a) * mm;
			if (a) x.lineTo(px, py); else x.moveTo(px, py);
		}
		x.strokeStyle = night ? 'rgba(0,0,0,.22)' : 'rgba(120,85,45,.16)';
		x.lineWidth = 2.2;
		x.stroke();
	}
	grain(x, W, H, night ? 18 : 26, 60, 255);
	const dot = night ? (a: number) => `rgba(10,6,2,${a})` : (a: number) => `rgba(110,80,50,${a})`;
	for (let n = 0; n < (W * H) / 2600; n++) { x.fillStyle = dot(0.12 + r() * 0.18); x.beginPath(); x.arc(r() * W, r() * H, 0.5 + r() * 0.7, 0, 6.3); x.fill(); } // hair follicles
	for (let c = 0; c < 5; c++) { // foxing
		const fx = r() * W, fy = r() * H;
		for (let n = 0; n < 14; n++) { x.fillStyle = night ? `rgba(90,50,20,${0.08 + r() * 0.15})` : `rgba(150,95,45,${0.1 + r() * 0.25})`; x.beginPath(); x.arc(fx + (r() - 0.5) * 70, fy + (r() - 0.5) * 50, 0.8 + r() * 3.2, 0, 6.3); x.fill(); }
	}
	for (let n = 0; n < 3; n++) { x.fillStyle = 'rgba(30,18,8,.8)'; x.beginPath(); x.ellipse(r() * W, r() * H, 1.6, 1.2, r() * 3, 0, 6.3); x.fill(); } // worm holes
	// Pricking and ruling: the bounding lines either side of the text, the pricks down the outer margin.
	const col = column(W);
	x.strokeStyle = night ? 'rgba(200,150,80,.10)' : 'rgba(140,100,60,.2)';
	x.lineWidth = 0.7;
	for (const xx of [col.l, col.r]) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, H); x.stroke(); }
	x.fillStyle = night ? 'rgba(0,0,0,.4)' : 'rgba(110,70,40,.4)';
	for (let y = 24; y < H; y += 30) x.fillRect(col.l - 12, y - 0.8, 1.6, 1.6);
}

// ---- the Victorian book of the occult ------------------------------------------------------------

function occult(x: CanvasRenderingContext2D, W: number, H: number, night: boolean) {
	const r = rng(1887), col = column(W);
	const mid = (col.l + col.r) / 2, half = (col.r - col.l) / 2;
	const gas = night ? 0.75 : 1;
	field(x, W, H, (X, Y) => {
		// Marbling: the comb pulled through floating colour, then swirled.
		const wx = X / 140 + 2.2 * fbm(X / 210, Y / 210, 4), wy = Y / 140 + 2.2 * fbm(X / 210 + 9, Y / 210 + 4, 4);
		const v = Math.sin((wx + wy * 0.35) * 3.1 + 5 * fbm(wx * 0.6, wy * 0.6, 3));
		const vein = Math.exp(-Math.pow((v - 0.92) * 9, 2)), brass = Math.exp(-Math.pow((v + 0.97) * 26, 2)) * (fbm(wx, wy, 2) > 0.55 ? 1 : 0);
		const t = (v + 1) / 2;
		let R = 9 + 30 * (1 - t) * fbm(wx * 2, wy * 2, 2) + 46 * vein * 0.6, G = 21 + 34 * t + 70 * vein * 0.6, B = 18 + 22 * t + 54 * vein * 0.6;
		R += 120 * brass; G += 88 * brass; B += 30 * brass;
		// The page: a damp, smooth paper over the middle, the marbling only at the margins.
		const d = Math.abs(X - mid) / Math.max(half, 1);
		const page = 1 - Math.min(1, Math.max(0, (d - 0.92) / 0.22));
		const pm = fbm(X / 90, Y / 90, 4), damp = fbm(X / 300 + 3, Y / 300, 3);
		const pr = 15 + 10 * pm + 6 * damp, pg = 26 + 12 * pm + 8 * damp, pb = 23 + 9 * pm + 4 * damp;
		R = R * (1 - page) + pr * page; G = G * (1 - page) + pg * page; B = B * (1 - page) + pb * page;
		// Gaslight from above, a vignette below.
		const glow = Math.max(0, 1 - Math.hypot((X - W / 2) / (W * 0.8), (Y + H * 0.1) / (H * 0.9)));
		const k = (0.7 + 0.55 * glow * glow) * gas;
		return [R * k + 6 * glow, G * k + 9 * glow, B * k + 4 * glow];
	});
	grain(x, W, H, 20, 0, 200);
	// Mildew blooms on the page: grey-green, feathered.
	for (let c = 0; c < 7; c++) {
		const fx = col.l + r() * (col.r - col.l), fy = r() * H, fr = 20 + r() * 50;
		for (let n = 0; n < 40; n++) {
			const a = r() * 6.3, d = Math.sqrt(r()) * fr;
			x.fillStyle = `rgba(120,150,120,${0.02 + r() * 0.05})`;
			x.beginPath(); x.arc(fx + Math.cos(a) * d, fy + Math.sin(a) * d, 1 + r() * 4, 0, 6.3); x.fill();
		}
	}
	// The sigil, pressed into the paper.
	const sx = mid, sy = Math.min(H * 0.32, 300), sr = Math.min(half * 0.9, 220);
	x.save();
	x.strokeStyle = 'rgba(142,195,169,.07)';
	x.lineWidth = 2;
	x.beginPath(); x.arc(sx, sy, sr, 0, 6.3); x.stroke();
	x.beginPath(); x.arc(sx, sy, sr * 0.78, 0, 6.3); x.stroke();
	for (let k = 0; k < 7; k++) { // a seven-pointed star, drawn in one line
		const a = -Math.PI / 2 + (k * 3 * 2 * Math.PI) / 7, b = -Math.PI / 2 + ((k + 1) * 3 * 2 * Math.PI) / 7;
		x.beginPath(); x.moveTo(sx + Math.cos(a) * sr * 0.78, sy + Math.sin(a) * sr * 0.78); x.lineTo(sx + Math.cos(b) * sr * 0.78, sy + Math.sin(b) * sr * 0.78); x.stroke();
	}
	x.beginPath(); x.ellipse(sx, sy, sr * 0.2, sr * 0.11, 0, 0, 6.3); x.stroke();
	x.fillStyle = 'rgba(142,195,169,.07)'; x.beginPath(); x.arc(sx, sy, sr * 0.05, 0, 6.3); x.fill();
	x.restore();
	// A brass double rule round the text block, and tentacles curling out of its corners.
	const top = 10, bot = H - 10, brassC = 'rgba(184,149,79,.5)';
	x.strokeStyle = brassC;
	x.lineWidth = 1;
	for (const inset of [0, 4]) x.strokeRect(col.l - 6 + inset, top + inset, col.r - col.l + 12 - inset * 2, bot - top - inset * 2);
	const tentacle = (ox: number, oy: number, fx: number, fy: number) => {
		// A tapering curl: a spiral pulled out along the margin, with its suckers.
		const pts: [number, number, number][] = [];
		for (let i = 0; i <= 60; i++) {
			const u = i / 60, a = u * 4.4, rad = 46 * (1 - u * 0.82);
			pts.push([ox + fx * (u * 34 + Math.cos(a) * rad - rad * 0.2), oy + fy * (u * 18 + Math.sin(a) * rad * 0.8), 5.5 * (1 - u) + 0.6]);
		}
		x.fillStyle = 'rgba(78,112,96,.55)';
		for (const [px, py, w] of pts) { x.beginPath(); x.arc(px, py, w, 0, 6.3); x.fill(); }
		x.fillStyle = 'rgba(200,190,160,.35)';
		for (let i = 4; i < 50; i += 5) { const [px, py, w] = pts[i]; x.beginPath(); x.arc(px - fx * w * 0.4, py - fy * w * 0.4, Math.max(0.8, w * 0.32), 0, 6.3); x.fill(); }
	};
	if (col.l > 70) { tentacle(col.l - 6, top + 6, -1, 1); tentacle(col.r + 6, bot - 6, 1, -1); }
	else { tentacle(col.l + 2, bot - 4, 1, -1); tentacle(col.r - 2, top + 4, -1, 1); }
	// Brass fleurons where the rules turn.
	x.fillStyle = 'rgba(184,149,79,.6)';
	for (const [cxp, cyp] of [[col.l - 4, top + 2], [col.r + 4, top + 2], [col.l - 4, bot - 2], [col.r + 4, bot - 2]]) {
		x.beginPath(); x.moveTo(cxp, cyp - 5); x.lineTo(cxp + 5, cyp); x.lineTo(cxp, cyp + 5); x.lineTo(cxp - 5, cyp); x.closePath(); x.fill();
	}
}

// ---- painting and keeping it fresh ------------------------------------------------------------------

let url = '', key = '', busy = false;
function paint() {
	const root = document.documentElement;
	const theme = root.dataset.theme === 'occult' ? 'occult' : 'vellum', night = root.dataset.phase === 'night';
	// Paint a little bigger than the window, in steps, so small resizes (a phone's bar) keep it.
	const W = Math.min(2200, Math.ceil(innerWidth / 160) * 160), H = Math.min(2400, Math.ceil(innerHeight / 160) * 160);
	const col = column(W);
	const k = `${theme}:${night}:${W}x${H}:${Math.round(col.l)}`;
	if (k === key || busy) return;
	key = k;
	busy = true;
	const cv = document.createElement('canvas');
	cv.width = W; cv.height = H;
	const x = cv.getContext('2d');
	if (!x) { busy = false; return; }
	(theme === 'occult' ? occult : vellum)(x, W, H, night);
	cv.toBlob((b) => {
		busy = false;
		if (!b) return;
		const next = URL.createObjectURL(b);
		root.style.setProperty('--paper', `url("${next}")`);
		if (url) URL.revokeObjectURL(url);
		url = next;
		// Something changed while painting: paint again.
		requestAnimationFrame(paint);
	}, 'image/jpeg', 0.86);
}

/** Paint the page now, and again when the theme, the hour or the window changes. */
export function startBackdrop() {
	if (typeof document === 'undefined' || !document.createElement('canvas').getContext) return;
	paint();
	new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-phase'] });
	let t = 0;
	addEventListener('resize', () => { clearTimeout(t); t = setTimeout(paint, 200) as unknown as number; });
}
