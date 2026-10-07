#!/usr/bin/env node
// Quick "is this project ready for Vercel?" check. Run after "npm run build":  npm run check:deploy
// It only inspects files (package.json, vercel.json, .gitignore, dist/). It cannot know whether a real Vercel
// project exists or is configured: that part stays manual (see README, section Deployment).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProject } from './lib/deploy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { errors, warnings, info } = checkProject(root);

console.log('Vercel readiness check');
console.log('──────────────────────');
for (const i of info) console.log(`  ok   ${i}`);
for (const w of warnings) console.log(`  warn ${w}`);
for (const e of errors) console.log(`  FAIL ${e}`);
console.log();
if (errors.length) {
  console.log(`${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log('Local files are ready. Deployment itself still has to be done and checked in Vercel.');
