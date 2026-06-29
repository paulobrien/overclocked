import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// During local dev, the Vite app talks to a single API origin that proxies to
// either the local Cloudflare Worker (wrangler dev on :8787) or a deployed
// Worker. Either way the browser only ever hits OUR endpoint — keys never
// reach the client. Set VITE_AGENT_BASE to point elsewhere (e.g. a deployed
// Worker URL) for production builds.
const agentBase = process.env.VITE_AGENT_BASE || 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Any request the browser makes to /api/* is forwarded to the Worker,
      // which injects secrets and streams the model response back.
      '/api': {
        target: agentBase,
        changeOrigin: true,
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_NAME': JSON.stringify('OVERCLOCKED'),
  },
});
