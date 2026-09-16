import { execSync } from 'node:child_process';

import { defineConfig } from 'vite';

/** Short commit hash and build date, shown in Settings so a phone can tell which build it is running. */
function buildId(): string {
  let commit = 'dev';
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // Not a git checkout (a tarball build): the date alone still tells builds apart.
  }
  return `${commit} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
}

// GitHub Pages serves project sites under /<repo>/; the deploy workflow sets
// BASE_PATH accordingly. Local dev and preview use the root.
export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  build: { target: 'es2022' },
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
});
