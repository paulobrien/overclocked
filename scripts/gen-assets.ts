/**
 * Asset generator — renders the vision "photos" for the vision tasks, driven by
 * the authored ground truth so every image MATCHES its scenario (§7 vision
 * pipeline). Output is PNG (most vision providers reject SVG), and crucially the
 * images DEPICT the situation rather than printing the answer — a crushed corner
 * instead of the word "CRUSHED", the real carton count instead of a label — so
 * they're solvable vision tasks, not OCR of the verdict.
 *
 * For each vision scenario with an `input.imageUrl`, we render an SVG scene from
 * its groundTruth, rasterize it to PNG with sharp, write it next to the old
 * asset, point the scenario's imageUrl at the .png, and remove the stale .svg.
 *
 * Re-run with:  npm run gen:assets   (or tsx scripts/gen-assets.ts)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const SCEN_DIR = resolve(ROOT, 'data', 'scenarios');

const W = 512;
const H = 384;

// ─────────────────────────── shared chrome ───────────────────────────
const DEFS = `
<defs>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3a4150"/><stop offset="1" stop-color="#222833"/>
  </linearGradient>
  <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e0bd86"/><stop offset="1" stop-color="#c79c63"/>
  </linearGradient>
  <linearGradient id="cardTop" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#edcf9c"/><stop offset="1" stop-color="#d8b483"/>
  </linearGradient>
  <linearGradient id="cardSide" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b88f55"/><stop offset="1" stop-color="#9c7a4a"/>
  </linearGradient>
  <radialGradient id="stain" cx="0.5" cy="0.4" r="0.6">
    <stop offset="0" stop-color="#2c3f52" stop-opacity="0.75"/><stop offset="1" stop-color="#2c3f52" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#8e98a6"/><stop offset="0.5" stop-color="#cdd5df"/><stop offset="1" stop-color="#8e98a6"/>
  </linearGradient>
  <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000" flood-opacity="0.35"/>
  </filter>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="1.6"/>
  </filter>
</defs>`;

function scene(inner: string, bg = 'url(#floor)'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${DEFS}
  <rect width="${W}" height="${H}" fill="${bg}"/>
  ${inner}
</svg>`;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

/** Deterministic barcode-ish bars derived from a value's char codes. */
function barcode(value: string, x: number, y: number, w: number, h: number): string {
  const bars: string[] = [];
  let cx = x;
  let i = 0;
  const seq = value
    .split('')
    .flatMap((c) => {
      const n = c.charCodeAt(0);
      return [1 + (n % 3), 1 + ((n >> 2) % 3), 1 + ((n >> 3) % 2), 2];
    });
  for (const unit of seq) {
    const bw = unit * 1.3;
    if (cx + bw > x + w) break;
    if (i % 2 === 0) bars.push(`<rect x="${cx.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${h}" fill="#15181d"/>`);
    cx += bw;
    i += 1;
  }
  return bars.join('');
}

/** A simple corrugated-cardboard front face with tape seam. */
function boxFace(x: number, y: number, w: number, h: number): string {
  return `
  <polygon points="${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}" fill="url(#card)" filter="url(#sh)"/>
  <rect x="${x + w / 2 - 16}" y="${y}" width="32" height="${h}" fill="#caa46e" opacity="0.6"/>
  <line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="#a9854f" stroke-width="2"/>`;
}

// ─────────────────────────── renderers ───────────────────────────
const CARRIER: Record<string, { bg: string; fg: string }> = {
  DHL: { bg: '#FFCC00', fg: '#D40511' },
  UPS: { bg: '#3b2a1a', fg: '#FFB500' },
  FedEx: { bg: '#4D148C', fg: '#FF6600' },
  'Royal Mail': { bg: '#DA291C', fg: '#FFD200' },
  DPD: { bg: '#DC0032', fg: '#ffffff' },
  Hermes: { bg: '#00B14E', fg: '#0a2540' },
  Evri: { bg: '#00B14E', fg: '#0a2540' },
  Yodel: { bg: '#6c2bd9', fg: '#ffffff' },
};

function renderLabel(gt: any): string {
  const c = CARRIER[gt.carrier] ?? { bg: '#222', fg: '#fff' };
  const addr = String(gt.address ?? '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const lines = addr.length > 1 ? addr : String(gt.address ?? '').split(' ');
  const addrLines = lines.length > 3 ? [lines.slice(0, -2).join(' '), lines.slice(-2).join(' ')] : lines;
  const body = `
  <g transform="translate(86,52) rotate(-1.5)">
    <rect width="340" height="280" rx="6" fill="#fbfaf6" filter="url(#sh)"/>
    <rect width="340" height="46" rx="6" fill="${c.bg}"/>
    <rect y="30" width="340" height="16" fill="${c.bg}"/>
    <text x="18" y="31" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="800" fill="${c.fg}">${esc(gt.carrier)}</text>
    <text x="322" y="29" font-family="Arial" font-size="11" font-weight="700" fill="${c.fg}" text-anchor="end" opacity="0.9">${esc(gt.serviceLevel)}</text>
    <text x="18" y="76" font-family="Arial" font-size="10" letter-spacing="2" fill="#8a8170">SHIP TO</text>
    ${addrLines.slice(0, 3).map((l, i) => `<text x="18" y="${98 + i * 22}" font-family="Arial" font-size="${i === 0 ? 17 : 15}" font-weight="${i === 0 ? 700 : 400}" fill="#211d17">${esc(l)}</text>`).join('')}
    <line x1="18" y1="176" x2="322" y2="176" stroke="#e3ddcd"/>
    <text x="18" y="196" font-family="Arial" font-size="10" letter-spacing="2" fill="#8a8170">TRACKING</text>
    <g transform="translate(18,204)">${barcode(String(gt.trackingNumber), 0, 0, 304, 52)}</g>
    <text x="18" y="276" font-family="'Courier New',monospace" font-size="15" letter-spacing="1.5" fill="#15181d">${esc(gt.trackingNumber)}</text>
  </g>`;
  return scene(`<rect width="${W}" height="${H}" fill="url(#card)"/>${body}`);
}

function renderDamage(gt: any): string {
  const bx = 150, by = 120, bw = 220, bh = 170, dep = 46;
  const top = `<polygon points="${bx},${by} ${bx + bw},${by} ${bx + bw + dep},${by - dep} ${bx + dep},${by - dep}" fill="url(#cardTop)"/>`;
  const side = `<polygon points="${bx + bw},${by} ${bx + bw + dep},${by - dep} ${bx + bw + dep},${by - dep + bh} ${bx + bw},${by + bh}" fill="url(#cardSide)"/>`;
  // Scale the damage strongly with severity so the TIER is legible from the
  // image alone: a shallow dent at sev 1–2 (repackage) vs a deep, caved-in,
  // collapsed box at sev 4–5 (refuse). The viewer judges severity from the
  // depicted damage, never a printed number.
  const sev: number = Number(gt.severity ?? 0);
  const t = Math.max(0, Math.min(1, sev / 5)); // 0 = pristine, 1 = destroyed
  const n = (v: number) => v.toFixed(0);
  let dmg = '';
  if (gt.damageType === 'crushed') {
    const depth = 22 + t * 96;
    const spread = 52 + t * 122;
    const op = (0.6 + t * 0.35).toFixed(2);
    const creases = Array.from({ length: 2 + Math.round(t * 6) }, (_, i) => {
      const yy = by + 10 + (i + 1) * (depth / (4 + t * 5));
      return `<polyline points="${bx + 8},${n(yy)} ${n(bx + 26 + t * 50)},${n(yy + 7)} ${n(bx + spread * 0.7)},${n(yy - 5)}" fill="none" stroke="#4a3620" stroke-width="${(1.8 + t * 2.4).toFixed(1)}"/>`;
    }).join('');
    dmg = `<polygon points="${bx},${by} ${n(bx + spread)},${n(by + depth * 0.45)} ${n(bx + spread * 0.5)},${n(by + depth)} ${bx},${n(by + depth + 22)}" fill="#5a4326" opacity="${op}"/>
      ${creases}
      ${t >= 0.7 ? `<polygon points="${bx + dep},${by - dep} ${n(bx + dep + 70)},${n(by - dep + 26 + t * 26)} ${n(bx + dep + 150)},${n(by - dep + 6)} ${bx + bw + dep},${by - dep}" fill="#7a5a30" opacity="0.55"/>
        <polygon points="${bx + bw},${by} ${n(bx + bw - 80 - t * 30)},${n(by + 50 + t * 40)} ${bx + bw},${n(by + 90 + t * 50)}" fill="#4a3620" opacity="${op}"/>` : ''}`;
  } else if (gt.damageType === 'wet') {
    const rx = 56 + t * 96, ry = 32 + t * 72;
    dmg = `<ellipse cx="${n(bx + bw * 0.45)}" cy="${n(by + bh * 0.72)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#stain)"/>
      <ellipse cx="${n(bx + bw * 0.72)}" cy="${n(by + bh * 0.82)}" rx="${n(30 + t * 36)}" ry="${n(18 + t * 24)}" fill="url(#stain)"/>
      ${t >= 0.55 ? `<ellipse cx="${n(bx + bw * 0.5)}" cy="${n(by + bh * 0.5)}" rx="${n(rx * 1.05)}" ry="${n(ry * 1.15)}" fill="url(#stain)" opacity="0.85"/>` : ''}`;
  } else if (gt.damageType === 'torn') {
    const gape = 26 + t * 64;
    dmg = `<polygon points="${bx + 40},${by} ${bx + 70},${by + 40} ${bx + 50},${by + 70} ${n(bx + 50 + gape)},${by + 96} ${bx + 60},${by + 130} ${bx + 40},${by + 130}" fill="#241810"/>
      ${t >= 0.6 ? `<polygon points="${bx + 50},${by + 28} ${n(bx + 52 + gape)},${by + 72} ${bx + 44},${by + 116}" fill="#140d07"/>` : ''}
      <polyline points="${bx + 40},${by} ${bx + 72},${by + 42} ${bx + 52},${by + 72} ${n(bx + 52 + gape)},${by + 96}" fill="none" stroke="#caa46e" stroke-width="2"/>`;
  }
  const fragile = `<g transform="translate(${bx + 24},${by + bh - 54})" opacity="0.75"><rect width="78" height="40" rx="3" fill="#fff" stroke="#d8b483"/><text x="39" y="17" font-family="Arial" font-size="9" fill="#b53a2a" text-anchor="middle" font-weight="700">FRAGILE</text><path d="M14 24 l10 -8 l8 10 l8 -6" stroke="#b53a2a" stroke-width="2" fill="none"/></g>`;
  return scene(`${top}${side}${boxFace(bx, by, bw, bh)}${fragile}${dmg}`);
}

function renderDim(gt: any): string {
  // Box drawn roughly to proportion; the printed label states dims + weight and
  // the viewer judges whether the weight is plausible for the size (no verdict).
  const maxL = 70;
  const sc = 150 / maxL;
  const bw = Math.max(90, Math.min(240, gt.declaredLengthCm * sc));
  const bh = Math.max(80, Math.min(190, gt.declaredHeightCm * sc));
  const dep = Math.max(24, Math.min(70, gt.declaredWidthCm * sc * 0.7));
  const bx = (W - bw) / 2 - 10, by = (H - bh) / 2 + 20;
  const top = `<polygon points="${bx},${by} ${bx + bw},${by} ${bx + bw + dep},${by - dep} ${bx + dep},${by - dep}" fill="url(#cardTop)"/>`;
  const side = `<polygon points="${bx + bw},${by} ${bx + bw + dep},${by - dep} ${bx + bw + dep},${by - dep + bh} ${bx + bw},${by + bh}" fill="url(#cardSide)"/>`;
  const label = `<g transform="translate(${bx + 14},${by + 18})">
    <rect width="150" height="70" rx="4" fill="#fbfaf6" filter="url(#sh)"/>
    <text x="10" y="22" font-family="'Courier New',monospace" font-size="14" fill="#15181d">DIM ${gt.declaredLengthCm}×${gt.declaredWidthCm}×${gt.declaredHeightCm}cm</text>
    <line x1="10" y1="32" x2="140" y2="32" stroke="#e3ddcd"/>
    <text x="10" y="54" font-family="'Courier New',monospace" font-size="16" font-weight="700" fill="#15181d">WT ${gt.declaredWeightKg} kg</text>
  </g>`;
  return scene(`${top}${side}${boxFace(bx, by, bw, bh)}${label}`);
}

function renderHazmat(gt: any): string {
  const bx = 130, by = 110, bw = 250, bh = 190, dep = 50;
  const top = `<polygon points="${bx},${by} ${bx + bw},${by} ${bx + bw + dep},${by - dep} ${bx + dep},${by - dep}" fill="url(#cardTop)"/>`;
  const side = `<polygon points="${bx + bw},${by} ${bx + bw + dep},${by - dep} ${bx + bw + dep},${by - dep + bh} ${bx + bw},${by + bh}" fill="url(#cardSide)"/>`;
  const cls = String(gt.unClass);
  const major = cls.split('.')[0];
  const palette: Record<string, { fill: string; sym: string; symColor: string }> = {
    '2': { fill: '#d8232a', sym: 'flame', symColor: '#fff' },
    '3': { fill: '#d8232a', sym: 'flame', symColor: '#fff' },
    '5': { fill: '#f5d000', sym: 'oxid', symColor: '#111' },
    '6': { fill: '#ffffff', sym: 'skull', symColor: '#111' },
    '8': { fill: '#ffffff', sym: 'corr', symColor: '#111' },
    '9': { fill: '#ffffff', sym: 'misc', symColor: '#111' },
  };
  const p = palette[major] ?? { fill: '#f5d000', sym: 'oxid', symColor: '#111' };
  let placard = '';
  if (gt.labelMissing) {
    // adhesive ghost where the placard was — no diamond, no class number
    placard = `<g transform="translate(${bx + bw / 2 - 56},${by + 30})">
      <rect width="112" height="112" rx="4" fill="#caa46e" opacity="0.5" transform="rotate(45 56 56)"/>
      <rect width="112" height="112" rx="4" fill="none" stroke="#9c7a4a" stroke-dasharray="6 5" transform="rotate(45 56 56)"/>
    </g>`;
  } else {
    const sym =
      p.sym === 'flame'
        ? `<path d="M0,18 C-10,2 6,2 -2,-16 C16,-4 14,12 0,18 Z" fill="${p.symColor}" transform="translate(0,-6) scale(1.4)"/>`
        : p.sym === 'oxid'
          ? `<circle r="11" fill="none" stroke="${p.symColor}" stroke-width="3"/><path d="M0,-16 C-7,-6 7,-6 0,4" fill="${p.symColor}"/>`
          : p.sym === 'skull'
            ? `<circle cy="-4" r="11" fill="${p.symColor}"/><rect x="-9" y="2" width="18" height="6" fill="${p.symColor}"/><circle cx="-4" cy="-5" r="2.4" fill="#fff"/><circle cx="4" cy="-5" r="2.4" fill="#fff"/>`
            : p.sym === 'corr'
              ? `<path d="M-12,-12 l10,8 M8,-12 l-10,18" stroke="${p.symColor}" stroke-width="2.5"/><path d="M-12,8 q12,8 22,0" stroke="${p.symColor}" stroke-width="2.5" fill="none"/>`
              : `<rect x="-13" y="-13" width="26" height="13" fill="${p.symColor}"/>`;
    placard = `<g transform="translate(${bx + bw / 2},${by + 86})">
      <g transform="rotate(45)"><rect x="-58" y="-58" width="116" height="116" rx="4" fill="${p.fill}" stroke="#111" stroke-width="3"/></g>
      <g transform="translate(0,-30)">${sym}</g>
      <text x="0" y="40" font-family="Arial" font-size="30" font-weight="800" fill="#111" text-anchor="middle">${esc(cls)}</text>
    </g>`;
  }
  return scene(`${top}${side}${boxFace(bx, by, bw, bh)}${placard}`);
}

function renderSeal(gt: any): string {
  const doors = `
  <rect x="80" y="40" width="352" height="300" rx="4" fill="#2f6f9a"/>
  <rect x="80" y="40" width="176" height="300" fill="#2f6f9a" stroke="#1f4f70" stroke-width="3"/>
  <rect x="256" y="40" width="176" height="300" fill="#357aa6" stroke="#1f4f70" stroke-width="3"/>
  ${Array.from({ length: 6 }).map((_, i) => `<line x1="${100 + i * 60}" y1="40" x2="${100 + i * 60}" y2="340" stroke="#1f4f70" stroke-width="2" opacity="0.5"/>`).join('')}
  <rect x="236" y="120" width="40" height="150" rx="4" fill="#cdd5df" stroke="#7a828c" stroke-width="2"/>`;
  let seal = '';
  if (gt.flag === 'tamper' || gt.tampered) {
    seal = `<g transform="translate(256,150)">
      <rect x="-26" y="0" width="22" height="20" rx="3" fill="url(#steel)" stroke="#555"/>
      <path d="M-4,8 q26,-16 40,18" stroke="#b8412e" stroke-width="6" fill="none"/>
      <path d="M30,30 l18,18 M48,30 l-18,18" stroke="#e0533f" stroke-width="4"/>
      <rect x="20" y="46" width="40" height="20" rx="3" fill="url(#steel)" stroke="#555" transform="rotate(18 40 56)"/>
    </g>`;
  } else if (gt.flag === 'unknown') {
    seal = `<g transform="translate(236,150)">
      <rect x="0" y="0" width="56" height="26" rx="4" fill="url(#steel)" stroke="#555"/>
      <rect x="0" y="0" width="56" height="26" rx="4" fill="#3a3f47" opacity="0.45" filter="url(#soft)"/>
      <text x="28" y="18" font-family="monospace" font-size="11" fill="#222" text-anchor="middle" filter="url(#soft)" opacity="0.5">######</text>
    </g>`;
  } else {
    seal = `<g transform="translate(236,150)">
      <rect x="0" y="0" width="56" height="26" rx="4" fill="url(#steel)" stroke="#555"/>
      <circle cx="8" cy="13" r="4" fill="#46C46E"/>
      <text x="34" y="18" font-family="monospace" font-size="12" fill="#15181d" text-anchor="middle">SL${(String(gt.flag).length * 84731) % 100000}</text>
      <rect x="20" y="-14" width="16" height="18" rx="3" fill="url(#steel)" stroke="#555"/>
    </g>`;
  }
  return scene(doors + seal);
}

function renderPallet(gt: any): string {
  const count: number = gt.cartonCount;
  const cols = count >= 20 ? 5 : count >= 12 ? 4 : 3;
  const cw = 60, ch = 34, gap = 3;
  const palletW = cols * (cw + gap) + 20;
  const baseX = (W - palletW) / 2 + 10;
  const floorY = 330;
  const cartons: string[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const layer = Math.floor(i / cols);
    let x = baseX + col * (cw + gap);
    const y = floorY - 26 - (layer + 1) * (ch + gap);
    // top layer juts past the right edge
    const topLayer = Math.floor((count - 1) / cols);
    if (gt.overhang && layer === topLayer) x += cw * 0.7;
    // instability: alternate columns lean, breaking the tidy stack
    if (gt.stackingViolation) x += (col % 2 ? 1 : -1) * layer * 5 + ((i * 37) % 7) - 3;
    cartons.push(
      `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})${gt.stackingViolation ? ` rotate(${(((i * 13) % 7) - 3).toFixed(1)} ${cw / 2} ${ch / 2})` : ''}">
        <rect width="${cw}" height="${ch}" rx="2" fill="url(#card)" stroke="#8a6a3a" stroke-width="1.5"/>
        <line x1="${cw / 2}" y1="0" x2="${cw / 2}" y2="${ch}" stroke="#a9854f" stroke-width="1.5"/>
      </g>`,
    );
  }
  const pallet = `
  <polygon points="${baseX - 12},${floorY} ${baseX + palletW},${floorY} ${baseX + palletW + 24},${floorY - 22} ${baseX + 12},${floorY - 22}" fill="#7a5a30"/>
  <rect x="${baseX - 12}" y="${floorY}" width="${palletW + 12}" height="18" fill="#6b4a2a"/>
  ${Array.from({ length: 4 }).map((_, i) => `<rect x="${baseX - 6 + i * (palletW / 3.2)}" y="${floorY}" width="14" height="18" fill="#5a3f22"/>`).join('')}`;
  return scene(pallet + cartons.join('\n'));
}

function renderHandwritten(gt: any): string {
  const fam = "'Segoe Script','Comic Sans MS','Bradley Hand',cursive";
  const note = `
  <g transform="translate(96,84) rotate(-2)">
    <rect width="320" height="220" rx="3" fill="#fcfbf4" filter="url(#sh)"/>
    ${Array.from({ length: 4 }).map((_, i) => `<line x1="24" y1="${72 + i * 44}" x2="296" y2="${72 + i * 44}" stroke="#c9d6e8" stroke-width="1"/>`).join('')}
    <text x="26" y="40" font-family="Arial" font-size="10" letter-spacing="2" fill="#9aa0a6">DELIVER TO:</text>
    <text x="30" y="66" font-family="${fam}" font-size="26" fill="#1c2740">${esc(gt.name)}</text>
    <text x="30" y="110" font-family="${fam}" font-size="24" fill="#1c2740">${esc(gt.addressLine)}</text>
    <text x="30" y="154" font-family="${fam}" font-size="28" font-weight="700" fill="#1c2740" letter-spacing="2">${esc(gt.postcode)}</text>
  </g>`;
  return scene(`<rect width="${W}" height="${H}" fill="url(#card)"/>${note}`);
}

// ─────────────────────── conveyor incident (video) ───────────────────────
// The "video" modality: a parcel travels along a belt across an ordered frame
// sequence, and an INCIDENT plays out over time — it rides clear, stalls and
// jams (a queue piling behind it), drifts off the side edge and falls, or gets
// rammed and crushed against the sorter. Motion is the signal: the same still
// box could be "fine" — only the sequence reveals what happened. A smooth clip
// is rendered then SAMPLED to a few keyframes (exactly how a video model
// ingests a clip), so the frames the model sees and the mp4 the UI plays come
// from one motion.
const BELT_TOP = 214; // y of the belt surface where parcels sit
const BELT_H = 16; // belt band thickness
const FLOOR_Y = 346; // where a parcel that falls off lands
const GANTRY_X = 392; // fixed sorter post — a crush pins the parcel against it
const PW = 72; // parcel width
const PH = 58; // parcel height

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

type Tint = { face: string; top: string; tape: string };
function tintFor(id: string): Tint {
  const palette: Tint[] = [
    { face: '#e0bd86', top: '#edcf9c', tape: '#a9854f' },
    { face: '#cdb89a', top: '#dcc9ac', tape: '#8a7350' },
    { face: '#d6b48a', top: '#e6c79e', tape: '#9c7a4a' },
  ];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

/** One parcel: a corrugated box with a tape seam and a small 3D top, optionally
 *  rotated (tipping/fallen) and crushed (flattened + crumple creases). */
function parcel(x: number, y: number, w: number, h: number, tint: Tint, rot = 0, crush = 0): string {
  const n = (v: number) => v.toFixed(1);
  const dep = Math.min(15, h * 0.3);
  const top = `<polygon points="${n(x)},${n(y)} ${n(x + w)},${n(y)} ${n(x + w + dep)},${n(y - dep)} ${n(x + dep)},${n(y - dep)}" fill="${tint.top}"/>`;
  const face = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${tint.face}" stroke="#8a6a3a" stroke-width="1.5"/>`;
  const tape = `<rect x="${n(x + w / 2 - 7)}" y="${n(y)}" width="14" height="${n(h)}" fill="${tint.tape}" opacity="0.55"/>`;
  let creases = '';
  if (crush > 0) {
    const rows = 2 + Math.round(crush * 3);
    const lines: string[] = [];
    for (let i = 1; i <= rows; i++) {
      const yy = y + (i / (rows + 1)) * h;
      lines.push(
        `<polyline points="${n(x + 2)},${n(yy)} ${n(x + w * 0.32)},${n(yy + 4 * crush)} ${n(x + w * 0.62)},${n(yy - 5 * crush)} ${n(x + w - 2)},${n(yy + 3 * crush)}" fill="none" stroke="#5a4326" stroke-width="${(1.4 + crush * 1.8).toFixed(1)}" opacity="0.8"/>`,
      );
    }
    creases = lines.join('');
  }
  const inner = `${top}${face}${tape}${creases}`;
  if (!rot) return inner;
  return `<g transform="rotate(${rot.toFixed(1)} ${n(x + w / 2)} ${n(y + h / 2)})">${inner}</g>`;
}

/** The running belt — its direction chevrons SHIFT each frame, so a parcel that
 *  stays put against a moving belt unmistakably reads as "stopped / jammed". */
function belt(frame: number): string {
  const y = BELT_TOP;
  const body = `<rect x="0" y="${y}" width="${W}" height="${BELT_H}" fill="#1c222b"/>
    <rect x="0" y="${y + BELT_H}" width="${W}" height="40" fill="url(#steel)" opacity="0.45"/>
    <rect x="0" y="${y - 2}" width="${W}" height="3" fill="#3a4250"/>`;
  const rollers = Array.from({ length: 14 }, (_, i) => `<circle cx="${10 + i * 38}" cy="${y + BELT_H + 18}" r="9" fill="#aeb7c2" stroke="#6c7682" stroke-width="2"/>`).join('');
  const shift = (frame * 26) % 52;
  const chevrons = Array.from({ length: 13 }, (_, i) => {
    const cx = -52 + i * 52 + shift;
    return `<path d="M${cx},${y + 3} l9,5 l-9,5" fill="none" stroke="#5a6678" stroke-width="3" opacity="0.55"/>`;
  }).join('');
  return body + rollers + chevrons;
}

/** A sort diverter arm swung DOWN across the belt — the visible CAUSE of a jam
 *  (a blocked belt), so the stall reads as a jam and not normal parcel flow. */
function diverter(baseX: number): string {
  const hubY = BELT_TOP - 80;
  return `<g>
    <circle cx="${baseX + 40}" cy="${hubY}" r="6" fill="#5a626e" stroke="#3a4250"/>
    <line x1="${baseX + 40}" y1="${hubY}" x2="${baseX}" y2="${BELT_TOP - 2}" stroke="#e0533f" stroke-width="9" stroke-linecap="round"/>
    <line x1="${baseX + 40}" y1="${hubY}" x2="${baseX}" y2="${BELT_TOP - 2}" stroke="#7a2418" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
  </g>`;
}

/** The fixed sorter scan-post on the right (crush incidents pin against it). */
function gantry(): string {
  const x = GANTRY_X;
  return `<g>
    <rect x="${x - 7}" y="72" width="14" height="${BELT_TOP - 72}" fill="url(#steel)" stroke="#5a626e" stroke-width="1.5"/>
    <rect x="${x - 36}" y="58" width="86" height="16" rx="3" fill="#2c3440" stroke="#5a626e"/>
    <rect x="${x - 20}" y="74" width="44" height="15" rx="2" fill="#10151c"/>
    <circle cx="${x + 2}" cy="81" r="3.6" fill="#e0533f"/>
  </g>`;
}

/** Render frame `fi` of `total` for a conveyor scenario. p∈[0,1] is progress. */
function conveyorFrame(gt: any, id: string, fi: number, total: number): string {
  const p = total <= 1 ? 1 : fi / (total - 1);
  const tint = tintFor(id);
  const onBelt = BELT_TOP - PH;
  let boxes = '';
  if (gt.event === 'clear') {
    boxes = parcel(lerp(40, 476, p), onBelt, PW, PH, tint);
  } else if (gt.event === 'jam') {
    const xStuck = 206;
    const jammed = p >= 0.4;
    const x = jammed ? xStuck : lerp(40, xStuck, p / 0.4);
    // Once jammed: the diverter arm is down (the cause), the lead box cocks
    // forward against it, and parcels shove up tight behind it (a real pile-up,
    // not evenly-spaced normal flow).
    const stop = jammed ? diverter(xStuck + PW) : '';
    const lead = parcel(x, onBelt, PW, PH, tint, jammed ? 7 : 0);
    const queued = jammed ? Math.min(3, Math.floor(((p - 0.4) / 0.6) * 3 + 0.5)) : 0;
    let behind = '';
    for (let k = 1; k <= queued; k++) behind += parcel(xStuck - k * (PW - 12), onBelt, PW, PH, tint);
    boxes = behind + stop + lead;
  } else if (gt.event === 'fall') {
    if (p <= 0.5) {
      boxes = parcel(lerp(40, 250, p / 0.5), onBelt, PW, PH, tint);
    } else {
      const q = (p - 0.5) / 0.5;
      boxes = parcel(lerp(250, 300, q), lerp(onBelt, FLOOR_Y - PH * 0.7, q), PW, PH, tint, lerp(8, 76, q));
    }
  } else if (gt.event === 'crush') {
    const rightEdge = lerp(40 + PW, GANTRY_X - 9, Math.min(1, p / 0.5));
    if (p < 0.5) {
      const trailRight = lerp(-8, rightEdge - PW - 4, p / 0.5);
      boxes = parcel(trailRight - PW, onBelt, PW, PH, tint) + parcel(rightEdge - PW, onBelt, PW, PH, tint);
    } else {
      const q = (p - 0.5) / 0.5;
      const crushW = PW * (1 - 0.46 * q);
      const flatH = PH * (1 - 0.5 * q);
      const frontX = GANTRY_X - 9 - crushW;
      boxes = parcel(frontX - PW, onBelt, PW, PH, tint) + parcel(frontX, BELT_TOP - flatH, crushW, flatH, tint, 0, q);
    }
  }
  return scene(`${belt(fi)}${gantry()}${boxes}`);
}

const RENDER: Record<string, (gt: any, input: any) => string> = {
  'label-parse': renderLabel,
  'damage-assessment': renderDamage,
  'hazmat-detection': renderHazmat,
  'seal-tamper': renderSeal,
  'dim-weight': renderDim,
  'pallet-check': renderPallet,
  'handwritten-label': renderHandwritten,
};

// How many frames the smooth clip is rendered at, and which of them are sampled
// as the model's keyframes (an even spread incl. first + last). The sampled
// frames ARE clip frames — what the model sees is literally drawn from the mp4.
const CLIP_N = 16;
const KEY_IDX = [0, 4, 8, 12, 15];

/** Render the conveyor "video" scenarios: a smooth mp4 (the line-camera clip)
 *  plus the sampled keyframe PNGs the model actually consumes. */
async function generateClips(): Promise<number> {
  const file = resolve(SCEN_DIR, 'conveyor-incident.json');
  if (!existsSync(file)) return 0;
  const scenarios = JSON.parse(readFileSync(file, 'utf8')) as any[];
  let made = 0;
  let ffmpegOk = true;
  for (const s of scenarios) {
    const frames: string[] = s.input?.frames ?? [];
    if (frames.length !== KEY_IDX.length) {
      throw new Error(`${s.id}: expected ${KEY_IDX.length} frame paths, got ${frames.length}`);
    }
    const tmp = join(tmpdir(), `oc-clip-${s.id}`);
    mkdirSync(tmp, { recursive: true });
    // Render the smooth clip frames to a temp dir.
    const clipPaths: string[] = [];
    for (let i = 0; i < CLIP_N; i++) {
      const svg = conveyorFrame(s.groundTruth, s.id, i, CLIP_N);
      const p = join(tmp, `clip-${String(i).padStart(2, '0')}.png`);
      await sharp(Buffer.from(svg)).png().toFile(p);
      clipPaths.push(p);
    }
    // Copy the sampled clip frames out as the model's keyframes.
    KEY_IDX.forEach((idx, j) => {
      const dest = resolve(PUBLIC, frames[j].replace(/^\//, ''));
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(clipPaths[idx], dest);
    });
    // Composite the mp4 the UI plays (best-effort — frames already exist, so the
    // UI flipbook still works if ffmpeg is unavailable).
    if (s.input?.videoUrl && ffmpegOk) {
      const mp4 = resolve(PUBLIC, String(s.input.videoUrl).replace(/^\//, ''));
      mkdirSync(dirname(mp4), { recursive: true });
      try {
        execFileSync(
          'ffmpeg',
          ['-y', '-framerate', '6', '-start_number', '0', '-i', join(tmp, 'clip-%02d.png'),
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
          { stdio: 'ignore' },
        );
      } catch {
        ffmpegOk = false;
        console.warn('  ! ffmpeg unavailable — mp4 skipped, UI will flipbook the frames');
      }
    }
    rmSync(tmp, { recursive: true, force: true });
    made += 1;
    console.log('✓', `${s.id} — ${KEY_IDX.length} keyframes${ffmpegOk && s.input?.videoUrl ? ' + mp4' : ''}`);
  }
  return made;
}

async function main(): Promise<void> {
  let rendered = 0;
  for (const taskId of Object.keys(RENDER)) {
    const file = resolve(SCEN_DIR, `${taskId}.json`);
    if (!existsSync(file)) continue;
    const scenarios = JSON.parse(readFileSync(file, 'utf8')) as any[];
    let changed = false;
    for (const s of scenarios) {
      const url: string | undefined = s.input?.imageUrl;
      if (!url) continue;
      const pngUrl = url.replace(/\.svg$/i, '.png');
      const svg = RENDER[taskId](s.groundTruth, s.input);
      const pngPath = resolve(PUBLIC, pngUrl.replace(/^\//, ''));
      mkdirSync(dirname(pngPath), { recursive: true });
      await sharp(Buffer.from(svg)).png().toFile(pngPath);
      rendered += 1;
      console.log('✓', pngUrl);
      if (pngUrl !== url) {
        const oldPath = resolve(PUBLIC, url.replace(/^\//, ''));
        if (existsSync(oldPath)) rmSync(oldPath);
        s.input.imageUrl = pngUrl;
        changed = true;
      }
    }
    if (changed) writeFileSync(file, JSON.stringify(scenarios, null, 2) + '\n', 'utf8');
  }
  const clips = await generateClips();
  console.log(`\nDone — rendered ${rendered} PNG asset(s)${clips ? ` and ${clips} conveyor clip(s)` : ''} into public/data/assets/.`);
}

main().catch((err) => {
  console.error('✗', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
