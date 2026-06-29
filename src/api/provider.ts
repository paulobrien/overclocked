/**
 * Provider config client — fetches the Worker's /api/config so the lobby knows
 * which models are wired (and whether keys are set) WITHOUT exposing keys.
 *
 * Re-exports the ProviderConfig type so UI code imports from one place.
 */
import type { ProviderConfig } from '../agents/streaming';

export type { ProviderConfig };

interface ProviderEntry {
  baseUrl: string;
  model: string;
  ready: boolean;
  /** True when the model id is still a known wrangler.toml placeholder. */
  placeholder?: boolean;
}
export interface ProviderStatus {
  cerebras: ProviderEntry;
  openrouter: ProviderEntry;
  nvidia: ProviderEntry;
  gemini: ProviderEntry;
}

export async function fetchProviderConfig(): Promise<ProviderStatus> {
  const base = import.meta.env.VITE_AGENT_BASE ? `${import.meta.env.VITE_AGENT_BASE}/api` : '/api';
  const res = await fetch(`${base}/config`);
  if (!res.ok) throw new Error('config fetch failed');
  return res.json();
}
