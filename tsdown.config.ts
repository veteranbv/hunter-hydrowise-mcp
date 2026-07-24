import { defineConfig } from 'tsdown';

// Replaces the previous tsup config. tsup's last release was 2025-11-12 and it
// pins esbuild at ^0.27.0, which cannot reach the 0.28.1 that fixes
// GHSA-g7r4-m6w7-qqqr — that stale pin was the sole reason the repo carried an
// `overrides` entry for esbuild. tsdown is Rolldown-based and pulls no esbuild
// at all, so the advisory is resolved by removing the dependency rather than by
// overriding it.
//
// Output contract is unchanged: a single executable ESM bundle at
// dist/server.js with runtime deps left external and a #! banner.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // This is a bin, not a library — no consumer imports its types.
  dts: false,
  // tsdown defaults ESM output to .mjs; package.json `bin`, `npm start`, and the
  // published contract all point at dist/server.js. `"type": "module"` already
  // makes a .js file ESM, so force the extension back rather than churn the path.
  outExtensions: () => ({ js: '.js' }),
  // tsdown sets the execute bit itself when it detects the shebang banner, so
  // the explicit chmod the old tsup config needed in onSuccess is not required.
  banner: '#!/usr/bin/env node',
});
