/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_BASE?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Allow importing CSS modules / plain CSS.
declare module '*.css';
declare module '*.svg' {
  const src: string;
  export default src;
}
