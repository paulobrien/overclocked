/**
 * TaskExplorer — browse the task pool (§10).
 *
 * Opens a parcel, shows what's messy about it, gives a feel for the work. Each
 * task type lists its baked scenarios with difficulty + adversarial flags so
 * the operator understands the mix before GO.
 */
import { useEffect, useState } from 'react';
import type { TaskScenario, TaskType } from '../shared/contract';
import { ClipPlayer } from '../components/ClipPlayer';

interface Props {
  tasks: TaskType[];
  selectedTask: string;
  onSelect: (id: string) => void;
  selected: TaskType;
  taskScenarios: TaskScenario[];
}

export function TaskExplorer({ tasks, selectedTask, onSelect, selected, taskScenarios }: Props) {
  // Click-to-enlarge lightbox for the scenario "photos" (or conveyor clips).
  const [zoom, setZoom] = useState<{ imageUrl?: string; frames?: string[]; videoUrl?: string; label: string } | null>(null);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  return (
    <div className="lobby-left flex flex-col px-6 py-5 border-r border-white/5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-sig uppercase tracking-[0.18em] text-[13px] text-overflow-amber">Sortation Line · Task Pool</span>
        <span className="font-hud text-[11px] text-[#828b99]">{tasks.length} tasks</span>
      </div>

      {/* task chips — tidy uniform grid so the row doesn't ragged-wrap */}
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {tasks.map((t) => {
          const active = t.id === selectedTask;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              title={`${t.label} · ${t.modality}`}
              className={`flex items-center gap-1.5 font-sig uppercase tracking-[0.04em] text-[11.5px] rounded-md px-2.5 py-2 border text-left transition-colors ${
                active
                  ? 'bg-cerebras-orange/20 border-cerebras-orange text-white'
                  : 'bg-white/[0.04] border-white/10 text-[#9aa3b0] hover:text-white hover:border-white/30'
              }`}
            >
              <span className="text-[15px] leading-none">{t.icon}</span>
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* selected task detail — fills the remaining column height so the panel
          doesn't leave a gap (or jump) when the right-hand config changes size */}
      <div className="bg-black/20 border border-white/5 rounded-lg p-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <span className="font-sig text-[17px] text-white truncate">
            {selected.icon} {selected.label}
          </span>
          <div className="flex gap-1.5 flex-shrink-0">
            <Tag>{selected.modality}</Tag>
            <Tag>diff {selected.difficulty}</Tag>
          </div>
        </div>
        <div className="flex items-center justify-between font-hud text-[11px] text-[#828b99] mb-3">
          <span>{selected.id}</span>
          <span>{taskScenarios.length} scenarios</span>
        </div>

        {/* scenario list — fills the available height and scrolls only on
            overflow; each row is a uniform thumbnail + text. Thumbnails enlarge. */}
        <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
          {taskScenarios.map((s) => (
            <div key={s.id} className="flex gap-2.5 bg-white/[0.03] border border-white/5 rounded-md px-3 py-2">
              {(s.input.imageUrl || s.input.frames) && (
                <button
                  type="button"
                  onClick={() =>
                    setZoom({
                      imageUrl: s.input.imageUrl,
                      frames: s.input.frames,
                      videoUrl: s.input.videoUrl,
                      label: `${s.id} — ${s.blurb ?? selected.label}`,
                    })
                  }
                  title={s.input.frames ? 'Click to play the clip' : 'Click to enlarge'}
                  className="relative flex-shrink-0 rounded border border-white/10 bg-black/20 overflow-hidden hover:border-overflow-amber/70 transition-colors cursor-zoom-in"
                >
                  {s.input.frames ? (
                    <>
                      <ClipPlayer frames={s.input.frames} className="w-[88px] h-[60px] object-contain block" fps={4} alt={s.id} />
                      <span className="absolute bottom-0 right-0 text-[8px] font-sig uppercase tracking-wide text-white bg-black/70 px-1 leading-[1.4]">🎞 clip</span>
                    </>
                  ) : (
                    <img src={s.input.imageUrl} alt={s.id} className="w-[88px] h-[60px] object-contain block" />
                  )}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-hud text-[12px] text-white">{s.id}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {s.adversarial && (
                      <span className="text-[10px] font-sig uppercase tracking-wide text-alert-red bg-alert-red/15 border border-alert-red/30 rounded px-1.5 py-0.5">
                        ⚠ adversarial
                      </span>
                    )}
                    <span className="text-[10px] font-hud text-[#8A93A3]">diff {s.difficulty}</span>
                  </div>
                </div>
                {s.blurb && <div className="font-body text-[12.5px] text-[#9aa3b0] mt-0.5 truncate">{s.blurb}</div>}
                {s.input.text && (
                  <div className="font-hud text-[11px] text-[#7a8290] mt-1 line-clamp-2 leading-snug">
                    {s.input.text.slice(0, 150)}
                    {s.input.text.length > 150 ? '…' : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* lightbox — click a thumbnail to view the parcel photo full-size */}
      {zoom && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          style={{ background: 'rgba(8,11,18,0.82)', backdropFilter: 'blur(3px)' }}
          onClick={() => setZoom(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged image: ${zoom.label}`}
        >
          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {zoom.frames ? (
              <ClipPlayer
                frames={zoom.frames}
                videoUrl={zoom.videoUrl}
                preferVideo
                fps={4}
                alt={zoom.label}
                className="max-w-[72vw] max-h-[74vh] rounded-lg border border-white/15 bg-black/30 object-contain shadow-2xl"
              />
            ) : (
              <img
                src={zoom.imageUrl}
                alt={zoom.label}
                className="max-w-[72vw] max-h-[74vh] rounded-lg border border-white/15 bg-black/30 object-contain shadow-2xl"
              />
            )}
            <div className="font-hud text-[12px] text-[#cfd6e2]">
              {zoom.label}
              {zoom.frames ? ' · clip — 5 keyframes sampled for the model' : ''}
            </div>
            <button
              onClick={() => setZoom(null)}
              className="font-sig uppercase tracking-[0.12em] text-[12px] text-[#1A1F2B] bg-overflow-amber rounded-md px-5 py-2 font-bold cursor-pointer hover:brightness-110"
            >
              Close ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-hud text-[10px] text-[#8A93A3] bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5">
      {children}
    </span>
  );
}
