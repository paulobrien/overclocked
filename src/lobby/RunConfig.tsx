/**
 * RunConfigPanel — the config controls (§10).
 *
 * Picks: run time (blitz/short/standard/sudden-death), pipeline depth (single
 * vs full graph — the exhibition beat), the challenger model, the human lane
 * toggle, and crucially the mock-vs-live switch. The mock toggle is the
 * fake-first safety net: race with zero API calls, then flip to live.
 */
import { useEffect, useState } from 'react';
import { useArena } from '../store/arena';
import type { Mode } from '../engine/arrivalPump';
import { fetchProviderConfig, type ProviderStatus } from '../api/provider';

const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: 'blitz', label: '15s Blitz', desc: 'max-frenzy clip' },
  { id: 'short', label: '30s Short', desc: 'social cut' },
  { id: 'standard', label: '1 Min', desc: 'standard window' },
  { id: 'extended', label: '5 Min', desc: 'long demo' },
  { id: 'endless', label: 'Endless ∞', desc: 'runs until you stop it' },
  { id: 'sudden-death', label: 'Sudden Death', desc: 'ramp until one drowns' },
];

export function RunConfigPanel() {
  const runConfig = useArena((s) => s.runConfig);
  const setRunConfig = useArena((s) => s.setRunConfig);

  // Pull live provider config (which models are wired) from the Worker.
  const [providerCfg, setProviderCfg] = useState<ProviderStatus | null>(null);
  const [configError, setConfigError] = useState(false);
  useEffect(() => {
    fetchProviderConfig()
      .then((c) => {
        setProviderCfg(c);
        setConfigError(false);
      })
      .catch(() => {
        setProviderCfg(null);
        setConfigError(true);
      });
  }, []);

  const challengerProvider = runConfig.challengerProvider;
  const challengerLabel = challengerProvider === 'nvidia' ? 'NVIDIA' : 'OpenRouter';
  const challengerCfg = providerCfg?.[challengerProvider];
  const cerebrasReady = providerCfg?.cerebras.ready;
  const challengerReady = challengerCfg?.ready;
  const geminiReady = providerCfg?.gemini.ready;
  const anyPlaceholder = !!(providerCfg?.cerebras.placeholder || challengerCfg?.placeholder);

  return (
    <div className="lobby-right px-6 py-5">
      <div className="font-sig uppercase tracking-[0.18em] text-[13px] text-challenger-blue mb-3">Match Setup</div>

      {/* run time */}
      <Section title="Run time">
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setRunConfig({ mode: m.id })}
              className={`text-left rounded-md px-2.5 py-2 border transition-colors ${
                runConfig.mode === m.id
                  ? 'bg-challenger-blue/15 border-challenger-blue'
                  : 'bg-white/[0.03] border-white/10 hover:border-white/30'
              }`}
            >
              <div className="font-sig uppercase tracking-wide text-[12px] text-white">{m.label}</div>
              <div className="font-body text-[10.5px] text-[#8A93A3]">{m.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* pipeline depth */}
      <Section title="Pipeline depth">
        <div className="flex gap-1.5">
          <DepthButton active={runConfig.depth === 'single'} onClick={() => setRunConfig({ depth: 'single' })} label="Single agent" hint="worker only" />
          <DepthButton active={runConfig.depth === 'full'} onClick={() => setRunConfig({ depth: 'full' })} label="Full graph" hint="route→work→check→escalate" />
        </div>
        <p className="font-body text-[11px] text-[#828b99] mt-1.5">
          The full graph widens the speed gap: Cerebras runs 4 agents/parcel and still beats a single GPU pass.
        </p>
      </Section>

      {/* challenger provider */}
      <Section title="Challenger provider">
        <div className="flex gap-1.5">
          <DepthButton
            active={challengerProvider === 'openrouter'}
            onClick={() => setRunConfig({ challengerProvider: 'openrouter' })}
            label="OpenRouter"
            hint="GPU-hosted Gemma 4 31B"
          />
          <DepthButton
            active={challengerProvider === 'nvidia'}
            onClick={() => setRunConfig({ challengerProvider: 'nvidia' })}
            label="NVIDIA NIM"
            hint="GPU-hosted Gemma 4 31B"
          />
        </div>
        <p className="font-body text-[11px] text-[#828b99] mt-1.5">
          The GPU challenger runs the <em>same</em> Gemma 4 31B as Cerebras — pick which GPU host serves it.
        </p>
      </Section>

      {/* challenger model */}
      <Section title="Challenger model">
        <input
          type="text"
          value={runConfig.challengerModel ?? ''}
          onChange={(e) => setRunConfig({ challengerModel: e.target.value || undefined })}
          placeholder={challengerCfg?.model ?? 'google/gemma-4-31b-it'}
          className="w-full bg-black/30 border border-white/10 rounded-md px-2.5 py-2 font-hud text-[11.5px] text-white focus:border-challenger-blue focus:outline-none"
        />
        <p className="font-body text-[11px] text-[#828b99] mt-1">
          Default = the model id {challengerLabel} serves (pure silicon-vs-silicon). Override for exhibition rounds.
        </p>
      </Section>

      {/* Gemini lane (bottom production line) — opt-in third AI lane */}
      <Section title="Gemini lane (bottom line)">
        <Toggle
          on={runConfig.includeGemini}
          onClick={() => setRunConfig({ includeGemini: !runConfig.includeGemini })}
          label="Add Gemini lane"
          hint="A third AI lane (Gemini 3.1 Flash Lite). Off by default — the headline is Cerebras vs the GPU challenger."
        />
        {runConfig.includeGemini && (
          <>
            <input
              type="text"
              value={runConfig.geminiModel ?? ''}
              onChange={(e) => setRunConfig({ geminiModel: e.target.value || undefined })}
              placeholder={providerCfg?.gemini.model ?? 'gemini-3.1-flash-lite'}
              className="w-full mt-2 bg-black/30 border border-white/10 rounded-md px-2.5 py-2 font-hud text-[11.5px] text-white focus:border-cleared-green focus:outline-none"
            />
            <p className="font-body text-[11px] text-[#828b99] mt-1">
              The cost/latency workhorse — same structured-output pipeline, gradeable head-to-head.
            </p>
          </>
        )}
      </Section>

      {/* human lane */}
      <Section title="Human lane">
        <Toggle
          on={runConfig.includeHuman}
          onClick={() => setRunConfig({ includeHuman: !runConfig.includeHuman })}
          label="I Wanna Play"
          hint="Race the bots on the same queue (you'll get crushed)"
        />
      </Section>

      {/* mock vs live */}
      <Section title="Lanes">
        <Toggle
          on={runConfig.useMock}
          onClick={() => setRunConfig({ useMock: !runConfig.useMock })}
          label="Mock lanes (no API)"
          hint="Fake-first: deterministic fake latency. Flip off for live inference."
        />
        {!runConfig.useMock && (
          <div className="mt-2 space-y-1 font-hud text-[11px]">
            {configError ? (
              <div className="text-alert-red">
                ⚠ Worker unreachable at <code>/api</code> — start it with{' '}
                <code className="text-overflow-amber">npm run dev:worker</code>
              </div>
            ) : !providerCfg ? (
              <div className="text-[#828b99]">checking <code>/api/config</code>…</div>
            ) : (
              <>
                {(
                  [
                    ['Cerebras', providerCfg.cerebras],
                    [challengerLabel, providerCfg[challengerProvider]],
                    ['Gemini', providerCfg.gemini],
                  ] as const
                ).map(([name, p]) => (
                  <div key={name}>
                    <span className={p.ready ? 'text-cleared-green' : 'text-alert-red'}>
                      ● {name} key: {p.ready ? 'wired' : 'NOT SET'}
                    </span>
                    {p.ready && p.placeholder && (
                      <span className="text-overflow-amber"> · model id is a placeholder</span>
                    )}
                  </div>
                ))}
                {(!cerebrasReady || !challengerReady || !geminiReady) && (
                  <div className="text-[#828b99] text-[9px] mt-1">
                    Set in .dev.vars or via <code className="text-overflow-amber">wrangler secret put</code>
                  </div>
                )}
                {anyPlaceholder && (
                  <div className="text-[#828b99] text-[9px]">
                    Replace placeholder model ids in <code className="text-overflow-amber">wrangler.toml</code>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="font-sig uppercase tracking-[0.12em] text-[11.5px] text-[#8A93A3] mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function DepthButton({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left rounded-md px-2.5 py-2 border transition-colors ${active ? 'bg-cerebras-orange/15 border-cerebras-orange' : 'bg-white/[0.03] border-white/10 hover:border-white/30'}`}
    >
      <div className="font-sig uppercase tracking-wide text-[12px] text-white">{label}</div>
      <div className="font-body text-[10.5px] text-[#8A93A3]">{hint}</div>
    </button>
  );
}

function Toggle({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-start gap-2.5 group">
      <span
        className={`mt-0.5 w-9 h-5 rounded-full p-0.5 transition-colors flex-shrink-0 ${on ? 'bg-cleared-green' : 'bg-white/10'}`}
      >
        <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
      </span>
      <span>
        <span className="block font-sig uppercase tracking-wide text-[12px] text-white">{label}</span>
        <span className="block font-body text-[10.5px] text-[#8A93A3]">{hint}</span>
      </span>
    </button>
  );
}
