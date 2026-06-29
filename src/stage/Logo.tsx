/**
 * Logo — the OVERCLOCKED arcade-cabinet sign.
 *
 * A detailed lightning-bolt mark (the "overclocked processor" pun) in a notched
 * hex tile, plus the wordmark in the industrial grotesque. Designed to read as
 * a coin-op marquee: a glowing neon bolt with a subtle electric pulse, the way
 * an arcade cabinet advertises itself across the room.
 *
 * Reusable: pass `size` ('sm' | 'md' | 'lg') and whether to show the tagline.
 */
interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTag?: boolean;
  tag?: string;
}

const SIZES = {
  sm: { tile: 34, word: 'text-[20px]', tag: 'text-[10px]' },
  md: { tile: 48, word: 'text-[clamp(22px,3.4vw,40px)]', tag: 'text-[11px]' },
  lg: { tile: 64, word: 'text-[clamp(30px,4.6vw,56px)]', tag: 'text-[12px]' },
};

export function Logo({ size = 'md', showTag = true, tag = 'Sortation Arena' }: LogoProps) {
  const s = SIZES[size];
  return (
    <div className="flex items-center gap-3 select-none">
      {/* the bolt mark — a glowing notched tile */}
      <div className="logo-mark relative" style={{ width: s.tile, height: s.tile }}>
        <BoltMark />
      </div>

      {/* the wordmark */}
      <div className="flex flex-col">
        <h1
          className={`font-sig font-bold tracking-[0.14em] m-0 leading-[0.95] ${s.word} logo-word`}
        >
          OVERCLOCKED
        </h1>
        {showTag && (
          <span className={`font-sig uppercase tracking-[0.32em] text-[#8A93A3] mt-0.5 ${s.tag}`}>
            {tag}
          </span>
        )}
      </div>

      <LogoStyle />
    </div>
  );
}

/** The lightning-bolt SVG mark. Enclosed in a notched hex tile with a neon glow. */
function BoltMark() {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full overflow-visible" aria-hidden="true">
      <defs>
        {/* the orange→amber gradient fill for the bolt */}
        <linearGradient id="oc-bolt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD9C9" />
          <stop offset="35%" stopColor="#EF5A2A" />
          <stop offset="100%" stopColor="#c4471f" />
        </linearGradient>
        {/* the radial glow */}
        <radialGradient id="oc-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="rgba(239,90,42,0.55)" />
          <stop offset="70%" stopColor="rgba(239,90,42,0.12)" />
          <stop offset="100%" stopColor="rgba(239,90,42,0)" />
        </radialGradient>
      </defs>

      {/* soft halo behind the tile — the "neon" */}
      <circle className="oc-halo" cx="32" cy="32" r="30" fill="url(#oc-glow)" />

      {/* the notched hex tile — like a chip / arcade bezel */}
      <path
        d="M22 4 L42 4 L60 22 L60 42 L42 60 L22 60 L4 42 L4 22 Z"
        fill="#0e1320"
        stroke="rgba(239,90,42,0.35)"
        strokeWidth="1.5"
      />
      {/* inner ridge for depth */}
      <path
        d="M22 4 L42 4 L60 22 L60 42 L42 60 L22 60 L4 42 L4 22 Z"
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="1"
        transform="scale(0.9) translate(3.5,3.5)"
      />

      {/* the bolt — a bold angular lightning stroke */}
      <path
        className="oc-bolt"
        d="M36 10 L20 36 H29 L25 54 L46 26 H36 Z"
        fill="url(#oc-bolt)"
        stroke="#FFD9C9"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* a tiny highlight on the bolt for sheen */}
      <path d="M34 12 L24 32 H28 L34 22 Z" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

/** Scoped styles: the neon pulse on the bolt + the wordmark gradient + glow. */
function LogoStyle() {
  return (
    <style>{`
      .logo-word {
        background: linear-gradient(180deg, #ffffff 0%, #cfd6e2 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: 0 0 26px rgba(239,90,42,0.25);
      }
      /* the neon bolt pulses like a lit arcade sign */
      .logo-mark .oc-bolt {
        filter: drop-shadow(0 0 3px rgba(239,90,42,0.7));
        animation: oc-flicker 4.5s ease-in-out infinite;
        transform-origin: 32px 32px;
      }
      .logo-mark .oc-halo {
        animation: oc-pulse 4.5s ease-in-out infinite;
        transform-origin: 32px 32px;
      }
      @keyframes oc-pulse {
        0%, 100% { opacity: 0.85; transform: scale(1); }
        45%      { opacity: 1;    transform: scale(1.06); }
        50%      { opacity: 0.7;  transform: scale(0.98); }   /* the flicker dip */
        55%      { opacity: 1;    transform: scale(1.05); }
      }
      @keyframes oc-flicker {
        0%, 100% { filter: drop-shadow(0 0 3px rgba(239,90,42,0.7)); }
        45%      { filter: drop-shadow(0 0 7px rgba(239,90,42,0.95)); }
        50%      { filter: drop-shadow(0 0 1px rgba(239,90,42,0.4)); }  /* dims on the flicker */
        55%      { filter: drop-shadow(0 0 6px rgba(239,90,42,0.9)); }
      }
      @media (prefers-reduced-motion: reduce) {
        .logo-mark .oc-bolt, .logo-mark .oc-halo { animation: none; }
      }
    `}</style>
  );
}
