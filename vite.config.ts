import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
// @ts-expect-error plain ESM server modules
import { aiMiddleware } from './server/ai.mjs';
// @ts-expect-error plain ESM server modules
import { attachRelay } from './server/relay.mjs';
// @ts-expect-error plain ESM server modules
import { controlMiddleware } from './server/control.mjs';
// @ts-expect-error plain ESM server modules
import { dmxMiddleware } from './server/dmx.mjs';
// @ts-expect-error plain ESM server modules
import { cloudMiddleware } from './server/cloud.mjs';

/** Dev server gets the same AI endpoints and remote relay as `npm start`. */
function freecastServer(): Plugin {
  return {
    name: 'freecast-server',
    configureServer(server) {
      server.middlewares.use(aiMiddleware);
      server.middlewares.use(dmxMiddleware);
      server.middlewares.use(cloudMiddleware);
      if (server.httpServer) {
        const wss = attachRelay(server.httpServer);
        server.middlewares.use(controlMiddleware(wss));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), freecastServer()],
  server: { host: true },
  test: { include: ['tests/**/*.test.ts'] },
});
