/**
 * Belt — the conveyor. The single strongest readability signal (§8): with no
 * numbers, a viewer must instantly read who's winning — and that read is the
 * belt physically backing up. Folders stack and the overflow tag flashes when
 * a lane is jammed. Fast lanes (Cerebras) have a quicker tread.
 */
import { useEffect, useRef, useState } from 'react';

export function Belt({ backlog, queueDepth, fast, offline = false }: { backlog: number; queueDepth: number; fast: boolean; offline?: boolean }) {
  const [folders, setFolders] = useState<{ id: number; x: number }[]>([]);
  const idRef = useRef(0);
  const beltRef = useRef<HTMLDivElement>(null);
  const jammed = backlog > 4 && !offline;

  // Visible folder count = queue depth (capped) + backlog spill. An offline lane
  // shows an empty, stopped belt.
  const visibleCount = offline ? 0 : Math.min(9, queueDepth + Math.min(4, backlog));

  useEffect(() => {
    // Rebuild the folder row when count changes; positions tile left-to-right.
    const gap = fast ? 54 : 40;
    const next = Array.from({ length: visibleCount }, () => idRef.current++).map((id, i) => ({
      id,
      x: 12 + i * gap,
    }));
    setFolders(next);
  }, [visibleCount, fast]);

  const w = beltRef.current?.clientWidth ?? 600;

  return (
    <div className={`belt ${jammed ? 'jam' : ''}`} ref={beltRef} style={offline ? { opacity: 0.45, filter: 'grayscale(1)' } : undefined}>
      <div className={`tread ${fast ? '' : 'slow'}`} style={offline ? { animationPlayState: 'paused' } : undefined} />
      <div className="rail top" />
      <div className="rail bot" />
      {folders.map((f) => (
        <div
          key={f.id}
          className="folder"
          style={{ left: `${Math.min(f.x, w - 50)}px`, transition: 'left 0.9s linear' }}
        >
          <div className="body" />
          <div className="tape" />
          <div className="label" />
          <div className="bc" />
        </div>
      ))}
      {jammed && (
        <div
          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-[6] font-hud font-extrabold text-[12px] text-[#1a1206] bg-overflow-amber rounded-md px-[7px] py-[3px]"
          style={{ boxShadow: '0 0 14px rgba(245,166,35,0.6)', animation: 'nudge 0.8s infinite' }}
        >
          +{backlog}
        </div>
      )}
    </div>
  );
}
