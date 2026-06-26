import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

// Resolve the `@/*` path alias (mirrors tsconfig.json) so tests can import
// modules that use it, e.g. the Generator store.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
