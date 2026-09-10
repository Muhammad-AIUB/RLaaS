import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * render.yaml documents how rlaas-backend is meant to deploy. It does not
 * control how it actually deploys: the running service takes its build and
 * start commands from the Render dashboard, which is why the deploy of 8b9ca64
 * ran a startCommand matching no version of the file ever committed. The
 * header in render.yaml carries the evidence.
 *
 * So these tests guard a document, not the running service - they cannot see
 * the dashboard. What they can do is stop the document drifting into nonsense
 * while nobody executes it. `startCommand: node dist/main` was wrong from the
 * first commit (a08ca3c, 2026-05-11) and went unnoticed for four months
 * precisely because nothing ran it. A file nobody reads is a file where
 * mistakes accumulate in silence.
 *
 * These tests give it a reader. If the Blueprint is ever linked, they start
 * guarding production too, unchanged.
 */

const REPO_ROOT = resolve(__dirname, '../../../..');
const RENDER_YAML = resolve(REPO_ROOT, 'render.yaml');
const BACKEND_PKG = resolve(REPO_ROOT, 'apps/backend/package.json');

function readStartCommand(): string {
  const yaml = readFileSync(RENDER_YAML, 'utf8');
  const match = yaml.match(/^[^\S\n]*startCommand:[^\S\n]*(.+?)[^\S\n]*$/m);
  if (!match) {
    throw new Error(`No startCommand: found in ${RENDER_YAML}`);
  }
  return match[1];
}

function entrypointOf(command: string): string {
  const match = command.match(/\bnode\s+(\S+)/);
  if (!match) {
    throw new Error(`No 'node <entrypoint>' found in: ${command}`);
  }
  return match[1];
}

describe('render.yaml deployment contract', () => {
  it('starts the server from the path nest build actually emits', () => {
    // package.json's start:prod is the other place this repo states how
    // production starts, and it has been right the whole time. When the two
    // disagree, one of them boots nothing: `node dist/main` exits
    // MODULE_NOT_FOUND, because tsconfig.json's `include` spans src/ and
    // prisma/seed.js, which puts TypeScript's common root at the package root
    // and the entrypoint at dist/src/main.js.
    const pkg = JSON.parse(readFileSync(BACKEND_PKG, 'utf8'));
    const fromPackageJson = entrypointOf(pkg.scripts['start:prod']);
    const fromRenderYaml = entrypointOf(readStartCommand());

    expect(fromRenderYaml).toBe(fromPackageJson);
  });

  it('does not seed the database on container start', () => {
    // SEED_DEMO_PASSWORD and SEED_RAW_API_KEY were committed to this public
    // repository between 2026-05-07 and 2026-08-27 and stay readable in git
    // history forever. seed.js upserts both from env, so a seed step in the
    // start command re-arms published credentials on every boot. It came out
    // of this file in 152dc31; this keeps it out.
    //
    // The dashboard copy of the start command is the one that runs, and it
    // still had the seed step at the deploy of 8b9ca64. This test cannot reach
    // it. Rotating that value is a dashboard job.
    expect(readStartCommand()).not.toMatch(/db\s+seed/);
  });
});
