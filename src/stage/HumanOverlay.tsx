/**
 * HumanActionPanel — the inline click-to-classify card for the "I Wanna Play"
 * lane (§10). It lives INSIDE the human lane column (to the right of the AI
 * lanes) rather than as a full-screen modal, so the player can see the bots
 * racing while they work. When the engine hands the human a parcel, the current
 * question appears here; the player picks an answer and stamps it — fast.
 *
 * Answer options come from the task's declared humanControls (schema enums +
 * plausible distractors), never leaking ground truth.
 */
import { useEffect, useState } from 'react';
import { subscribe, submit, forfeit, type HumanQuestion } from './humanInput';
import type { HumanControl } from '../shared/contract';
import { ClipPlayer } from '../components/ClipPlayer';

export function HumanActionPanel() {
  const [question, setQuestion] = useState<HumanQuestion | null>(null);
  useEffect(() => subscribe(setQuestion), []);

  if (!question) {
    return (
      <div className="rounded-lg border border-cleared-green/30 bg-[#0f1f17]/60 px-3 py-6 text-center" style={{ height: 204 }}>
        <div className="font-sig uppercase tracking-[0.12em] text-[13px] text-cleared-green/80">✋ waiting for next parcel…</div>
        <div className="font-body text-[11px] text-[#7f8a84] mt-1.5">the belt feeds you the same queue as the bots</div>
      </div>
    );
  }

  const fields = buildFields(question.task);
  return (
    <div
      role="group"
      aria-label="Your parcel — classify and stamp"
      className="rounded-lg border border-cleared-green/40 bg-[#0f1f17]/70 p-3 flex flex-col"
      style={{ minHeight: 204 }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-sig uppercase tracking-[0.1em] text-[13px] text-cleared-green">
          🧑 Parcel #{8800 + question.id}
        </span>
        <span className="font-hud text-[11px] text-[#9aa3b0] flex items-center gap-1">
          {question.task.icon} {question.task.label}
        </span>
      </div>

      {/* 30s pressure bar (keyed to the question so it restarts each parcel) */}
      <div key={`cd-${question.id}`} className="h-1 rounded bg-white/10 overflow-hidden mb-2">
        <div className="h-full bg-cleared-green/70" style={{ animation: 'human-countdown 30s linear forwards' }} />
      </div>

      <div className="font-body text-[11px] text-[#7f8a84] mb-2">
        You're racing the bots on the same queue — classify it and stamp, fast.
      </div>

      {question.scenario.input.frames ? (
        <ClipPlayer
          frames={question.scenario.input.frames}
          fps={4}
          alt={`Clip for ${question.task.label}`}
          className="w-full h-28 object-contain rounded-md mb-2 border border-white/10 bg-black/20"
        />
      ) : question.scenario.input.imageUrl ? (
        <img
          src={question.scenario.input.imageUrl}
          alt={`Parcel for ${question.task.label}`}
          className="w-full h-28 object-contain rounded-md mb-2 border border-white/10 bg-black/20"
        />
      ) : null}
      {question.scenario.input.text && (
        <div className="font-hud text-[11px] text-[#a0a8b4] mb-2 whitespace-pre-wrap max-h-20 overflow-auto bg-black/30 rounded p-2 leading-snug">
          {question.scenario.input.text.slice(0, 200)}
        </div>
      )}

      <HumanForm key={`form-${question.id}`} fields={fields} onSubmit={(ans) => submit(ans)} onSkip={forfeit} />
    </div>
  );
}

interface FieldDef {
  key: string;
  label: string;
  type: 'enum' | 'boolean' | 'number' | 'text';
  options?: string[];
}

/** Map the task's declared humanControls to the panel's render fields.
 *  Reads task.humanControls (explicit config) rather than poking Zod internals,
 *  so it's robust across Zod v3/v4. */
function buildFields(task: { humanControls?: HumanControl[] }): FieldDef[] {
  return (task.humanControls ?? []).map((c) => ({ key: c.key, label: c.label, type: c.kind, options: c.options }));
}

function HumanForm({ fields, onSubmit, onSkip }: { fields: FieldDef[]; onSubmit: (a: Record<string, unknown>) => void; onSkip: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const submitAnswer = () => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.type === 'boolean') out[f.key] = v === 'true';
      else if (f.type === 'number') out[f.key] = v ? Number(v) : 0;
      else out[f.key] = v ?? '';
    }
    onSubmit(out);
  };
  return (
    <div className="mt-auto">
      <div className="space-y-2">
        {fields.map((f) => {
          const fid = `hf-${f.key}`;
          return (
            <div key={f.key}>
              <label htmlFor={fid} className="block font-sig uppercase tracking-[0.08em] text-[10px] text-[#828b99] mb-1">{f.label}</label>
              {(f.type === 'enum' && f.options) || f.type === 'boolean' ? (
                <div role="group" aria-label={f.label} className="flex flex-wrap gap-1">
                  {(f.type === 'boolean' ? ['true', 'false'] : f.options!).map((opt) => {
                    const selected = values[f.key] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setValues((s) => ({ ...s, [f.key]: opt }))}
                        className={`font-hud text-[11px] rounded px-2 py-1 border transition-colors ${
                          selected ? 'bg-cleared-green text-black border-cleared-green' : 'bg-white/[0.04] text-white border-white/10 hover:border-white/30'
                        }`}
                      >
                        {opt}{selected ? ' ✓' : ''}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  id={fid}
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder="…"
                  aria-label={f.label}
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 font-hud text-[12px] text-white focus:border-cleared-green"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={submitAnswer}
          className="flex-1 font-sig uppercase tracking-[0.12em] text-[13px] text-black bg-cleared-green border-none rounded-md py-2 font-bold cursor-pointer hover:brightness-110"
        >
          ✓ Stamp
        </button>
        <button
          onClick={onSkip}
          className="font-sig uppercase tracking-[0.12em] text-[12px] text-[#8A93A3] bg-white/[0.06] border border-white/10 rounded-md px-3 py-2 cursor-pointer hover:text-white"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
