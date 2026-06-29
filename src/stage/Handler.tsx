/**
 * Handler — the lane's animal clerk, and the emotional engine of the race (§8).
 *
 * Each lane is a different animal — a badger (Cerebras), a penguin (the GPU
 * challenger), and a panda (Gemini) — but they all share the SAME animation
 * machinery and state machine. With no numbers, you must instantly read who's
 * winning by watching the animals' mood. Their suffering IS the scoreboard.
 *
 *   stress 0  (calm)     → smug, feet up, sipping a drink
 *   stress 1  (focused)  → leaning in, brow set
 *   stress 2  (strained) → sweating, twitching, fur/feathers ruffled
 *   stress 3  (drowning) → buried in paper, a waving paw + tears
 *   doom      (extreme)  → a tombstone / ghost — the animal has perished
 *   winning              → crown, a triumphant pose, sparkles
 */
export type Animal = 'badger' | 'penguin' | 'panda';

interface HandlerProps {
  animal: Animal;
  stress: 0 | 1 | 2 | 3;
  winning: boolean;
  stamping: boolean;
}

export function Handler({ animal, stress, winning, stamping }: HandlerProps) {
  const doomed = stress === 3 && !winning;
  const stressClass = doomed ? 'doom' : winning ? 'winning' : `stress-${stress}`;
  return (
    <div className="booth relative h-[166px]">
      <div className="lamp-glow absolute left-1/2 top-2 w-[166px] h-[166px] -translate-x-1/2 pointer-events-none" style={{ background: 'radial-gradient(closest-side, rgba(255,221,150,0.3), rgba(255,221,150,0) 70%))' }} />
      <div className={`op absolute left-1/2 bottom-0 -translate-x-1/2 w-[156px] h-[166px] ${stressClass} ${stamping ? 'stamping' : ''}`} data-animal={animal}>
        <svg viewBox="0 0 160 170" width="156" height="166" className="block overflow-visible">
          <AnimalSvg animal={animal} />
        </svg>
      </div>
      <Style />
    </div>
  );
}

/** Pick the character body. All three share the same layer + class structure. */
function AnimalSvg({ animal }: { animal: Animal }) {
  if (animal === 'penguin') return <Penguin />;
  if (animal === 'panda') return <Panda />;
  return <Badger />;
}

// ════════════════════════ shared scene chrome ══════════════════════════
// Desk, lamp, mug, papers, help-hand, doom-scene, crown — identical for every
// animal so the comedy reads the same per lane. Only the body differs.

function SceneChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* shared gradients/filters — give the flat shapes some depth + sheen.
          Referenced by url(#…); objectBoundingBox units so one def fits every
          shape it's applied to. */}
      <defs>
        <radialGradient id="gloss" cx="0.36" cy="0.28" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="botShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="furGrey" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9bec6" />
          <stop offset="1" stopColor="#777b83" />
        </linearGradient>
        <linearGradient id="furGreyDk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6a6d74" />
          <stop offset="1" stopColor="#4a4d53" />
        </linearGradient>
        <linearGradient id="belly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e3ddcd" />
        </linearGradient>
        <linearGradient id="beak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb84d" />
          <stop offset="1" stopColor="#e07f12" />
        </linearGradient>
        <radialGradient id="patch" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#2b2620" />
          <stop offset="1" stopColor="#120f0c" />
        </radialGradient>
        <filter id="charShadow" x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* desk + clutter */}
      <rect x="2" y="138" width="156" height="32" rx="4" fill="#0f141d" />
      <rect x="2" y="134" width="156" height="7" rx="3" fill="#2a3340" />
      <rect x="8" y="142" width="34" height="22" rx="2" fill="#1a2230" />
      <rect x="8" y="140" width="34" height="4" rx="2" fill="#3a4453" />
      <rect x="58" y="148" width="52" height="12" rx="2" fill="#1a2230" />
      <rect x="60" y="149" width="48" height="3" rx="1" fill="#2c3445" />
      {/* mug + steam */}
      <g className="mug">
        <rect x="120" y="130" width="16" height="18" rx="2" fill="var(--c)" />
        <path d="M136 133 q6 0 6 5 q0 5 -6 5" fill="none" stroke="var(--c)" strokeWidth="2.5" />
      </g>
      <g className="steam" stroke="#cfd6e2" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path className="st1" d="M124 124 q3 -5 0 -8 q-3 -3 0 -6" />
        <path className="st2" d="M130 124 q3 -5 0 -8 q-3 -3 0 -6" />
      </g>
      {/* lamp */}
      <g stroke="#39424f" strokeWidth="3" fill="none" strokeLinecap="round">
        <line x1="142" y1="134" x2="142" y2="84" />
        <line x1="142" y1="84" x2="122" y2="64" />
      </g>
      <path d="M112 56 l22 0 l-4 14 l-14 0 z" fill="#5a6271" />
      <ellipse cx="121" cy="71" rx="3.6" ry="2.6" fill="#ffe7ad" />

      {children}

      {/* feet up (calm) */}
      <g className="feet-up">
        <rect x="100" y="120" width="26" height="6" rx="3" fill="#1c2430" />
        <ellipse cx="126" cy="123" rx="7" ry="4" fill="#2a3340" />
      </g>
      {/* paper storm (drowning) */}
      <g className="papers" fill="#E8DCC0" stroke="#b9a373">
        <rect className="pp1" x="40" y="96" width="26" height="18" rx="2" transform="rotate(-14 53 105)" />
        <rect className="pp2" x="74" y="98" width="28" height="20" rx="2" transform="rotate(10 88 108)" />
        <rect className="pp3" x="50" y="84" width="24" height="16" rx="2" transform="rotate(18 62 92)" />
        <rect className="pp4" x="86" y="86" width="24" height="16" rx="2" transform="rotate(-8 98 94)" />
      </g>
      {/* waving help paw rising from the pile */}
      <g className="help-hand">
        <rect x="116" y="92" width="9" height="20" rx="4.5" fill="var(--c)" transform="rotate(12 120 102)" />
        <circle cx="123" cy="88" r="7" className="help-wave" style={{ transformOrigin: '123px 88px' }} />
      </g>
      {/* tombstone + ghost (doom) */}
      <g className="doom-scene">
        <path className="ghost" d="M72 70 q0 -16 8 -16 q8 0 8 16 l0 16 l-16 0 z M74 86 l-2 4 M78 86 l-2 4 M82 86 l-2 4" fill="rgba(207,214,226,0.85)" stroke="#9aa3b2" strokeWidth="1" />
        <circle cx="76" cy="60" r="1.6" fill="#5a6271" />
        <circle cx="84" cy="60" r="1.6" fill="#5a6271" />
        <path d="M75 66 q3 3 6 0 q3 3 6 0" stroke="#5a6271" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M50 150 l0 -22 q0 -8 8 -8 l24 0 q8 0 8 8 l0 22 z" fill="#4a4a52" />
        <text x="70" y="142" fontFamily="serif" fontSize="7" fill="#cfd6e2" textAnchor="middle">R.I.P.</text>
        <text x="70" y="150" fontFamily="serif" fontSize="4.5" fill="#9aa3b2" textAnchor="middle">THROUGHPUT</text>
      </g>
      {/* winning crown + sparkles */}
      <g className="spark" fill="#F5A623">
        <path className="sp1" d="M118 58 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2z" />
        <path className="sp2" d="M40 56 l1.6 4.5 l4.5 1.6 l-4.5 1.6 l-1.6 4.5 l-1.6 -4.5 l-4.5 -1.6 l4.5 -1.6z" />
        <path className="sp3" d="M108 102 l1.3 3.6 l3.6 1.3 l-3.6 1.3 l-1.3 3.6 l-1.3 -3.6 l-3.6 -1.3 l3.6 -1.3z" />
      </g>
      <g className="crown" fill="#F5A623" stroke="#c47e10" strokeWidth="1">
        <path d="M64 56 l6 8 l4 -10 l6 12 l4 -10 l6 8 l-2 8 l-28 0 z" className="crown-bob" style={{ transformOrigin: '80px 60px' }} />
        <circle cx="80" cy="50" r="2" fill="#e0533f" />
      </g>
    </>
  );
}

// ════════════════════════ the three animals ══════════════════════════
// Each renders: torso/neck in the body group, then the HEAD group with the
// shared toggleable layer classes (eyes-smug/focused/stressed/happy/x, brows,
// mouths, sweat, tear). The <Style> block below drives them all identically.

/** A reusable set of toggleable eyes + brows + mouths + sweat (shared by the
 *  badger + penguin; the panda draws its own eyes on the black patches). */
function Expressions({ dark }: { dark: string }) {
  return (
    <>
      {/* glasses */}
      <g className="glasses" stroke={dark} strokeWidth="1.8" fill="rgba(255,255,255,0.12)">
        <rect x="62" y="88" width="14" height="10" rx="3" />
        <rect x="84" y="88" width="14" height="10" rx="3" />
        <line x1="76" y1="92" x2="84" y2="92" />
      </g>
      <path className="vein" d="M100 80 l3 -3 l2 3 l3 -3" stroke="#c04030" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* eyes */}
      <g className="eyes-smug">
        <path d="M63 90 q6 4 12 0" fill="none" stroke={dark} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M85 90 q6 4 12 0" fill="none" stroke={dark} strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="eyes-focused">
        <circle cx="69" cy="92" r="2.6" fill={dark} />
        <circle cx="91" cy="92" r="2.6" fill={dark} />
      </g>
      <g className="eyes-stressed">
        <path d="M64 90 l4 4 M68 90 l-4 4" stroke={dark} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M88 90 l4 4 M92 90 l-4 4" stroke={dark} strokeWidth="1.8" strokeLinecap="round" />
        <circle className="eye-twitch" cx="93" cy="89" r="1.4" fill="#c04030" />
      </g>
      <g className="eyes-happy" stroke={dark} strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M63 93 q6 -6 12 0" />
        <path d="M85 93 q6 -6 12 0" />
      </g>
      <g className="eyes-x" stroke={dark} strokeWidth="2" strokeLinecap="round">
        <path d="M64 89 l6 6 M70 89 l-6 6" />
        <path d="M86 89 l6 6 M92 89 l-6 6" />
      </g>
      {/* brows */}
      <g className="brow" stroke={dark} strokeWidth="2" strokeLinecap="round">
        <line x1="63" y1="84" x2="73" y2="87" />
        <line x1="97" y1="84" x2="87" y2="87" />
      </g>
      {/* mouths */}
      <path className="mouth-smug" d="M72 104 q8 6 16 -1 q-8 2 -16 1z" fill="#7a2d28" stroke={dark} strokeWidth="1.2" />
      <path className="mouth-focused" d="M74 104 h12" fill="none" stroke={dark} strokeWidth="2.2" strokeLinecap="round" />
      <path className="mouth-grit" d="M72 106 q8 -4 16 0 q-8 2 -16 0z" fill="#7a2d28" stroke={dark} strokeWidth="1.2" />
      <g className="mouth-scream">
        <ellipse cx="80" cy="106" rx="6" ry="8" fill={dark} />
        <ellipse cx="80" cy="108" rx="3" ry="4" fill="#7a2d28" />
      </g>
      <path className="mouth-grin" d="M70 100 q10 14 20 0 q-10 4 -20 0z" fill="#7a2d28" stroke={dark} strokeWidth="1.4" />
      {/* cheeks (winning) */}
      <g className="cheeks" fill="#f3a3a3">
        <circle cx="66" cy="100" r="3" />
        <circle cx="94" cy="100" r="3" />
      </g>
      {/* sweat */}
      <g className="sweat" fill="#9fdcff">
        <path className="d1" d="M102 88 q5 7 0 11 q-5 -4 0 -11z" />
        <path className="d2" d="M58 90 q5 7 0 11 q-5 -4 0 -11z" />
      </g>
      <path className="tear" d="M64 96 q3 14 0 18 q-3 -4 0 -18z" fill="#9fdcff" />
      <circle className="help-wave-fill" cx="0" cy="0" r="0" fill="none" />
    </>
  );
}

/** BADGER — the Cerebras lane. Striped face mask, pointy snout, grey fur. */
function Badger() {
  const fur = '#8a8d93';
  const dark = '#2a2620';
  return (
    <SceneChrome>
      <g className="body-g" style={{ transformOrigin: '80px 158px' }}>
        {/* chair back */}
        <rect x="58" y="100" width="44" height="42" rx="8" fill="#161c26" />
        <rect x="62" y="104" width="36" height="34" rx="6" fill="#1d2531" />
        {/* torso (uniform) — lane colour with a sheen + bottom shade for volume */}
        <g className="torso">
          <path d="M38 170 C38 130 60 118 80 118 C100 118 122 130 122 170 Z" fill="var(--c)" filter="url(#charShadow)" />
          <path d="M38 170 C38 130 60 118 80 118 C100 118 122 130 122 170 Z" fill="url(#gloss)" />
          <path d="M38 170 C38 130 60 118 80 118 C100 118 122 130 122 170 Z" fill="url(#botShade)" />
          {/* open collar */}
          <path d="M66 120 L80 140 L94 120 L89 118 L80 132 L71 118 Z" fill="url(#belly)" />
          <line x1="74" y1="126" x2="72" y2="152" stroke="#1d2530" strokeWidth="1.5" opacity="0.5" />
          <rect x="67" y="150" width="11" height="9" rx="2" fill="#cfd6e2" />
          <circle cx="80" cy="150" r="1.6" fill="#1d2530" opacity="0.5" />
        </g>
        {/* neck */}
        <rect x="73" y="106" width="14" height="16" rx="6" fill={fur} />
        {/* arms: stamp (default) + flex (winning) */}
        <g className="arm-stamp" style={{ transformOrigin: '90px 132px' }}>
          <rect x="84" y="108" width="14" height="34" rx="7" fill="var(--c)" />
          <rect x="84" y="108" width="14" height="34" rx="7" fill="url(#botShade)" />
          <g className="hand-stamp">
            <rect x="80" y="92" width="20" height="13" rx="3.5" fill="#454f5d" />
            <rect x="80" y="92" width="20" height="5" rx="2.5" fill="#5a6473" />
            <rect x="87" y="82" width="8" height="12" rx="2.5" fill="#2a3340" />
          </g>
        </g>
        <g className="arm-flex" style={{ transformOrigin: '94px 138px' }}>
          {/* a clear arm thrown up high in a triumphant fist pump — bowed out to
              the right so it clears the head/ear silhouette and reads as an arm */}
          <path d="M94 140 C122 122 134 92 126 66" fill="none" stroke="var(--c)" strokeWidth="13" strokeLinecap="round" />
          <circle cx="125" cy="63" r="10.5" fill={fur} />
          <circle cx="125" cy="63" r="10.5" fill="url(#gloss)" />
          <path d="M119 60 q6 -3 12 0" fill="none" stroke="#5c5f66" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
        </g>
        {/* HEAD */}
        <g className="head" style={{ transformOrigin: '80px 112px' }}>
          {/* ears — outer fur + inner pink */}
          <g className="ears">
            <ellipse cx="57" cy="76" rx="8" ry="9" fill="url(#furGreyDk)" />
            <ellipse cx="103" cy="76" rx="8" ry="9" fill="url(#furGreyDk)" />
            <ellipse cx="57" cy="77" rx="3.4" ry="4.2" fill="#caa0a0" />
            <ellipse cx="103" cy="77" rx="3.4" ry="4.2" fill="#caa0a0" />
          </g>
          {/* head base with fur gradient + sheen */}
          <ellipse cx="80" cy="92" rx="25" ry="24" fill="url(#furGrey)" />
          <ellipse cx="80" cy="92" rx="25" ry="24" fill="url(#gloss)" />
          {/* the iconic white-striped badger face blaze */}
          <path d="M57 82 C57 62 103 62 103 82 C103 70 95 65 80 65 C65 65 57 70 57 82 Z" fill="url(#belly)" />
          {/* dark eye-mask bands either side of the stripe */}
          <path d="M55 92 q-5 -12 5 -19 q-3 10 0 19z" fill={dark} />
          <path d="M105 92 q5 -12 -5 -19 q3 10 0 19z" fill={dark} />
          {/* snout + glossy nose */}
          <ellipse cx="80" cy="105" rx="12" ry="9.5" fill="url(#belly)" />
          <ellipse cx="80" cy="100" rx="4" ry="3.1" fill={dark} />
          <circle cx="78.4" cy="98.8" r="1.1" fill="#fff" opacity="0.7" />
          <Expressions dark={dark} />
        </g>
      </g>
    </SceneChrome>
  );
}

/** PENGUIN — the GPU challenger. Black back, white belly, orange beak/feet. */
function Penguin() {
  const dark = '#1a1410';
  return (
    <SceneChrome>
      <g className="body-g" style={{ transformOrigin: '80px 158px' }}>
        <rect x="58" y="100" width="44" height="42" rx="8" fill="#161c26" />
        {/* orange feet peeking under the body */}
        <ellipse cx="69" cy="168" rx="10" ry="4.5" fill="url(#beak)" />
        <ellipse cx="91" cy="168" rx="10" ry="4.5" fill="url(#beak)" />
        {/* torso = the tuxedo body — lane colour with sheen, big white belly */}
        <g className="torso">
          <ellipse cx="80" cy="146" rx="38" ry="28" fill="var(--c)" filter="url(#charShadow)" />
          <ellipse cx="80" cy="146" rx="38" ry="28" fill="url(#gloss)" />
          <ellipse cx="80" cy="146" rx="38" ry="28" fill="url(#botShade)" />
          <ellipse cx="80" cy="149" rx="23" ry="21" fill="url(#belly)" />
          {/* bow tie for charm */}
          <path d="M72 129 l-7 -4 v8 l7 -4 l8 4 v-8z" fill={dark} />
          <circle cx="80" cy="129" r="2" fill="#3a342c" />
        </g>
        {/* neck */}
        <rect x="73" y="104" width="14" height="16" rx="6" fill="var(--c)" />
        {/* flippers: stamp + flex */}
        <g className="arm-stamp" style={{ transformOrigin: '90px 132px' }}>
          <ellipse cx="101" cy="124" rx="7.5" ry="19" fill="var(--c)" transform="rotate(8 101 124)" />
          <ellipse cx="101" cy="124" rx="7.5" ry="19" fill="url(#botShade)" transform="rotate(8 101 124)" />
          <g className="hand-stamp">
            <rect x="80" y="92" width="20" height="13" rx="3.5" fill="#454f5d" />
            <rect x="80" y="92" width="20" height="5" rx="2.5" fill="#5a6473" />
            <rect x="87" y="82" width="8" height="12" rx="2.5" fill="#2a3340" />
          </g>
        </g>
        <g className="arm-flex" style={{ transformOrigin: '94px 138px' }}>
          {/* a flipper thrown up high in celebration, bowed clear of the head */}
          <path d="M94 140 C122 122 134 92 126 68" fill="none" stroke="var(--c)" strokeWidth="13" strokeLinecap="round" />
          <ellipse cx="126" cy="65" rx="8.5" ry="11" fill="var(--c)" transform="rotate(-20 126 65)" />
          <ellipse cx="126" cy="65" rx="8.5" ry="11" fill="url(#gloss)" transform="rotate(-20 126 65)" />
        </g>
        {/* HEAD */}
        <g className="head" style={{ transformOrigin: '80px 112px' }}>
          <ellipse cx="80" cy="90" rx="24" ry="26" fill="var(--c)" />
          <ellipse cx="80" cy="90" rx="24" ry="26" fill="url(#gloss)" />
          {/* white face mask */}
          <ellipse cx="80" cy="96" rx="16" ry="19" fill="url(#belly)" />
          {/* the orange beak (a penguin's defining feature) */}
          <path d="M72 103 q8 -6 16 0 q-8 9 -16 0z" fill="url(#beak)" stroke="#b8740f" strokeWidth="0.8" />
          <line x1="72" y1="103" x2="88" y2="103" stroke="#b8740f" strokeWidth="0.8" />
          <Expressions dark={dark} />
          {/* tiny penguin cheeks */}
          <g className="cheeks" fill="#ffb380" opacity="0.7">
            <circle cx="66" cy="99" r="2.6" />
            <circle cx="94" cy="99" r="2.6" />
          </g>
        </g>
      </g>
    </SceneChrome>
  );
}

/** PANDA — the Gemini lane. Round white head, black ears + eye patches. */
function Panda() {
  const dark = '#1a1410';
  const white = '#f4f1ea';
  return (
    <SceneChrome>
      <g className="body-g" style={{ transformOrigin: '80px 158px' }}>
        <rect x="58" y="100" width="44" height="42" rx="8" fill="#161c26" />
        {/* torso — lane colour with sheen + a soft belly */}
        <g className="torso">
          <ellipse cx="80" cy="146" rx="38" ry="28" fill="var(--c)" filter="url(#charShadow)" />
          <ellipse cx="80" cy="146" rx="38" ry="28" fill="url(#gloss)" />
          <ellipse cx="80" cy="146" rx="38" ry="28" fill="url(#botShade)" />
          <ellipse cx="80" cy="150" rx="21" ry="19" fill="url(#belly)" opacity="0.92" />
          <path d="M66 120 L80 138 L94 120 L89 118 L80 132 L71 118 Z" fill="url(#belly)" />
          <rect x="67" y="150" width="11" height="9" rx="2" fill="#cfd6e2" />
        </g>
        {/* arms: chunky black panda arms */}
        <g className="arm-stamp" style={{ transformOrigin: '90px 132px' }}>
          <ellipse cx="101" cy="126" rx="10" ry="21" fill={dark} transform="rotate(6 101 126)" />
          <ellipse cx="98" cy="118" rx="5" ry="9" fill="#2e2820" opacity="0.6" transform="rotate(6 98 118)" />
          <g className="hand-stamp">
            <rect x="80" y="92" width="20" height="13" rx="3.5" fill="#454f5d" />
            <rect x="80" y="92" width="20" height="5" rx="2.5" fill="#5a6473" />
            <rect x="87" y="82" width="8" height="12" rx="2.5" fill="#2a3340" />
          </g>
        </g>
        <g className="arm-flex" style={{ transformOrigin: '94px 138px' }}>
          {/* a chunky black arm raised high in a fist pump, bowed clear of the head */}
          <path d="M94 140 C122 120 134 90 126 66" fill="none" stroke={dark} strokeWidth="15" strokeLinecap="round" />
          <circle cx="125" cy="63" r="10.5" fill={dark} />
          <circle cx="125" cy="63" r="10.5" fill="url(#gloss)" />
        </g>
        {/* HEAD — the panda's defining round white head + black ears + eye patches */}
        <g className="head" style={{ transformOrigin: '80px 112px' }}>
          {/* round black ears with inner shade */}
          <g className="ears">
            <circle cx="57" cy="73" r="12" fill="url(#patch)" />
            <circle cx="103" cy="73" r="12" fill="url(#patch)" />
            <circle cx="57" cy="74" r="5.5" fill="#3a322a" />
            <circle cx="103" cy="74" r="5.5" fill="#3a322a" />
          </g>
          {/* round white head with a soft sheen */}
          <ellipse cx="80" cy="92" rx="27" ry="26" fill={white} />
          <ellipse cx="80" cy="92" rx="27" ry="26" fill="url(#gloss)" />
          {/* the iconic black eye patches (big tilted teardrops) */}
          <ellipse cx="67" cy="90" rx="9.5" ry="11.5" fill="url(#patch)" transform="rotate(-20 67 90)" />
          <ellipse cx="93" cy="90" rx="9.5" ry="11.5" fill="url(#patch)" transform="rotate(20 93 90)" />
          {/* glossy black nose */}
          <ellipse cx="80" cy="104" rx="5.5" ry="4.2" fill="url(#patch)" />
          <circle cx="78" cy="102.6" r="1.3" fill="#fff" opacity="0.65" />
          {/* expressions — but the panda's eyes are dark-on-dark in the patch,
              so we render them white for visibility */}
          <g className="eyes-smug">
            <path d="M64 90 q4 3 8 0" fill="none" stroke={white} strokeWidth="2" strokeLinecap="round" />
            <path d="M88 90 q4 3 8 0" fill="none" stroke={white} strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="eyes-focused">
            <circle cx="68" cy="90" r="2.4" fill={white} />
            <circle cx="92" cy="90" r="2.4" fill={white} />
          </g>
          <g className="eyes-stressed">
            <path d="M64 88 l3 3 M67 88 l-3 3" stroke={white} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M89 88 l3 3 M92 88 l-3 3" stroke={white} strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g className="eyes-happy" stroke={white} strokeWidth="2.2" fill="none" strokeLinecap="round">
            <path d="M64 92 q4 -4 8 0" />
            <path d="M88 92 q4 -4 8 0" />
          </g>
          <g className="eyes-x" stroke={white} strokeWidth="1.8" strokeLinecap="round">
            <path d="M64 88 l5 5 M69 88 l-5 5" />
            <path d="M88 88 l5 5 M93 88 l-5 5" />
          </g>
          <g className="brow" stroke={dark} strokeWidth="2" strokeLinecap="round">
            <line x1="62" y1="80" x2="72" y2="83" />
            <line x1="98" y1="80" x2="88" y2="83" />
          </g>
          {/* mouths — a panda's mouth sits below the nose */}
          <path className="mouth-smug" d="M74 110 q6 4 12 0 q-6 2 -12 0z" fill="none" stroke={dark} strokeWidth="1.6" strokeLinecap="round" />
          <path className="mouth-focused" d="M74 110 h12" fill="none" stroke={dark} strokeWidth="2" strokeLinecap="round" />
          <path className="mouth-grit" d="M73 111 q7 -3 14 0 q-7 1 -14 0z" fill={dark} />
          <g className="mouth-scream">
            <ellipse cx="80" cy="110" rx="5" ry="7" fill={dark} />
          </g>
          <path className="mouth-grin" d="M71 108 q9 10 18 0 q-9 3 -18 0z" fill={dark} />
          <g className="cheeks" fill="#fdc" opacity="0.8">
            <circle cx="60" cy="102" r="3" />
            <circle cx="100" cy="102" r="3" />
          </g>
          <g className="sweat" fill="#9fdcff">
            <path className="d1" d="M104 84 q5 7 0 11 q-5 -4 0 -11z" />
            <path className="d2" d="M56 86 q5 7 0 11 q-5 -4 0 -11z" />
          </g>
          <path className="tear" d="M66 98 q3 14 0 18 q-3 -4 0 -18z" fill="#9fdcff" />
        </g>
      </g>
    </SceneChrome>
  );
}

/** Scoped styles: the shared state machine + comedic keyframes.
 *  Identical for every animal — they all animate the same way. */
function Style() {
  return (
    <style>{`
      /* default visibility */
      .op .steam, .op .vein, .op .cheeks, .op .spark, .op .crown,
      .op .feet-up, .op .papers, .op .help-hand,
      .op .doom-scene, .op .tear,
      .op .eyes-smug, .op .eyes-focused, .op .eyes-stressed, .op .eyes-happy, .op .eyes-x,
      .op .mouth-smug, .op .mouth-focused, .op .mouth-grit, .op .mouth-scream, .op .mouth-grin,
      .op .arm-flex, .op .sweat, .op .brow { opacity: 0; transition: opacity .35s; }
      .op .eyes-focused, .op .mouth-focused, .op .hand-stamp { opacity: 1; }
      .op .head { transition: transform .45s ease; }
      .op .body-g { transition: transform .4s ease; }

      /* idle eye-blinks — the open eyes squash briefly on a loop, so the face is
         never frozen. Per-element transform-box keeps the squash centered. */
      .op .eyes-smug, .op .eyes-focused { transform-box: fill-box; transform-origin: center; }
      .op .eyes-smug { animation: blink 4.6s ease-in-out infinite; }
      .op .eyes-focused { animation: blink 5.3s ease-in-out infinite; }
      /* the ears give a small periodic twitch when calm */
      .op .ears { transform-box: fill-box; transform-origin: center bottom; }

      .op.stress-0 .eyes-smug { opacity: 1; }
      .op.stress-0 .eyes-focused { opacity: 0; }
      .op.stress-0 .mouth-smug { opacity: 1; }
      .op.stress-0 .mouth-focused { opacity: 0; }
      .op.stress-0 .steam { opacity: 1; }
      .op.stress-0 .feet-up { opacity: 1; }
      .op.stress-0 .head { transform: rotate(4deg) translateX(2px); }
      .op.stress-0 .body-g { animation: lean-back 4s ease-in-out infinite; }
      .op.stress-0 .steam .st1 { animation: rise 2.4s ease-in-out infinite; }
      .op.stress-0 .steam .st2 { animation: rise 2.4s .8s ease-in-out infinite; }
      .op.stress-0 .ears { animation: ear-twitch 3.6s ease-in-out infinite; }

      .op.stress-1 .steam { opacity: .7; }
      .op.stress-1 .head { transform: translateY(2px); }
      .op.stress-1 .body-g { animation: lean-in 5s ease-in-out infinite; }

      .op.stress-2 .eyes-focused { opacity: 0; }
      .op.stress-2 .eyes-stressed { opacity: 1; }
      .op.stress-2 .mouth-focused { opacity: 0; }
      .op.stress-2 .mouth-grit { opacity: 1; }
      .op.stress-2 .brow { opacity: 1; }
      .op.stress-2 .vein { opacity: 1; }
      .op.stress-2 .sweat { opacity: 1; }
      .op.stress-2 .head { transform: rotate(-4deg); }
      .op.stress-2 .body-g { animation: tense .9s ease-in-out infinite; }
      .op.stress-2 .eye-twitch { animation: twitch .18s steps(2) infinite; }
      .op.stress-2 .sweat .d1 { animation: drop 1.2s infinite; }
      .op.stress-2 .sweat .d2 { animation: drop 1.2s .6s infinite; }

      .op.stress-3 .eyes-focused, .op.stress-3 .eyes-stressed { opacity: 0; }
      .op.stress-3 .eyes-x { opacity: 1; }
      .op.stress-3 .mouth-grit, .op.stress-3 .mouth-focused { opacity: 0; }
      .op.stress-3 .mouth-scream { opacity: 1; }
      .op.stress-3 .brow { opacity: 1; }
      .op.stress-3 .sweat { opacity: 1; }
      .op.stress-3 .tear { opacity: 1; }
      .op.stress-3 .papers { opacity: 1; }
      .op.stress-3 .help-hand { opacity: 1; }
      .op.stress-3 .head { transform: translateY(4px) rotate(-7deg); }
      .op.stress-3 .body-g { animation: tremble .18s linear infinite; }
      .op.stress-3 .sweat .d1 { animation: drop .8s infinite; }
      .op.stress-3 .sweat .d2 { animation: drop .8s .4s infinite; }
      .op.stress-3 .tear { animation: drop-tear 1.4s infinite; }
      .op.stress-3 .help-wave { animation: wave .5s ease-in-out infinite; }

      .op.doom .doom-scene { opacity: 1; }
      .op.doom .body-g, .op.doom .feet-up { opacity: 0; }
      .op.doom .ghost { animation: float 3s ease-in-out infinite; }

      .op.winning .eyes-smug, .op.winning .eyes-focused, .op.winning .eyes-stressed { opacity: 0; }
      .op.winning .eyes-happy { opacity: 1; }
      .op.winning .mouth-focused, .op.winning .mouth-smug, .op.winning .mouth-grit { opacity: 0; }
      .op.winning .mouth-grin { opacity: 1; }
      .op.winning .cheeks { opacity: 1; }
      .op.winning .spark { opacity: 1; }
      .op.winning .crown { opacity: 1; }
      .op.winning .arm-stamp, .op.winning .hand-stamp { opacity: 0; }
      .op.winning .arm-flex { opacity: 1; animation: fistpump .7s ease-in-out infinite; }
      .op.winning .body-g { animation: celebrate .6s ease-in-out infinite; }
      .op.winning .crown-bob { animation: bob 1.6s ease-in-out infinite; }
      .op.winning .spark .sp1 { animation: twinkle 1s infinite; }
      .op.winning .spark .sp2 { animation: twinkle 1s .33s infinite; }
      .op.winning .spark .sp3 { animation: twinkle 1s .66s infinite; }

      .op.stamping .arm-stamp { animation: stamp .4s ease; }

      @keyframes lean-back { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(1.5deg) translateX(1px); } }
      @keyframes lean-in { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1px); } }
      @keyframes rise { 0% { opacity: 0; transform: translateY(2px); } 40% { opacity: .8; } 100% { opacity: 0; transform: translateY(-8px); } }
      @keyframes tense { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-.8px); } }
      @keyframes tremble { 0% { transform: translateX(-1.4px); } 50% { transform: translateX(1.4px); } 100% { transform: translateX(-1.4px); } }
      @keyframes twitch { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
      @keyframes drop { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(20px); opacity: 0; } }
      @keyframes drop-tear { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(28px); opacity: 0; } }
      @keyframes wave { 0%,100% { transform: rotate(-12deg); } 50% { transform: rotate(18deg); } }
      @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      @keyframes celebrate { 0%,100% { transform: translateY(0) rotate(0deg); } 28% { transform: translateY(-9px) rotate(-3deg); } 55% { transform: translateY(-1px) rotate(3deg); } 80% { transform: translateY(-4px) rotate(-1deg); } }
      @keyframes bob { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-2px) rotate(2deg); } }
      @keyframes twinkle { 0%,100% { opacity: 0; transform: scale(.3); } 50% { opacity: 1; transform: scale(1); } }
      @keyframes stamp { 0% { transform: rotate(-18deg) translateY(-8px); } 40% { transform: rotate(8deg) translateY(2px); } 100% { transform: rotate(-18deg) translateY(-8px); } }
      @keyframes blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.12); } }
      @keyframes fistpump { 0%,100% { transform: translateY(0) rotate(0deg); } 45% { transform: translateY(-7px) rotate(-14deg); } }
      @keyframes ear-twitch { 0%,82%,100% { transform: rotate(0deg); } 88% { transform: rotate(-7deg); } 94% { transform: rotate(5deg); } }

      @media (prefers-reduced-motion: reduce) {
        .op .body-g, .op .head, .op .steam .st1, .op .steam .st2,
        .op.stress-2 .eye-twitch, .op .sweat .d1, .op .sweat .d2, .op .tear,
        .op .help-wave, .op.doom .ghost, .op .eyes-smug, .op .eyes-focused, .op .ears,
        .op.winning .arm-flex,
        .op.winning .body-g, .op.winning .crown-bob, .op.winning .spark .sp1,
        .op.winning .spark .sp2, .op.winning .spark .sp3 { animation: none !important; }
      }
    `}</style>
  );
}
