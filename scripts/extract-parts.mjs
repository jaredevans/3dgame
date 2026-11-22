#!/usr/bin/env node
// Copies the single Polyfork parts the Scenic Tour uses out of the owner's Polyfork catalogue zip into kits/parts/, where
// the tour loads them from (tour/config.js PART_BASES), beside the self-hosted kits. kits/ is gitignored: these files
// are licensed to the owner and never committed. Run it again whenever the tour starts using another part; until then
// the tour takes that one from Polyfork's public CDN and says so in the console.
//
//   node scripts/extract-parts.mjs [path/to/polyfork-catalog.zip] [--to kits/parts]
//
// Which parts: every catalogue asset id written anywhere in tour/ (the suburbs' houses, the events' animals and props)
// or in the Scenic Tour plans (parts a task is still to use), each as its .mjs and its .glb, and its -params.json
// (its knobs and night map) from Polyfork's public CDN; and Polyfork's materials engine (materials.mjs), which dresses the
// animals in HD (tour/hd.js): polyfork.dev serves it without CORS headers, so a page can only import it from here.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const toAt = args.indexOf('--to');
const to = join(root, toAt >= 0 ? args.splice(toAt, 2)[1] : 'kits/parts');
const zip = args[0] ?? join(root, 'polyfork-catalog.zip');
if (!existsSync(zip)) {
  console.error(`No catalogue at ${zip}: give its path (node scripts/extract-parts.mjs path/to/polyfork-catalog.zip)`);
  process.exit(1);
}

// every asset id in the catalogue (its files are <id>.mjs and <id>.glb at the top level)
const inZip = execFileSync('unzip', ['-Z1', zip], { maxBuffer: 64 << 20 }).toString().split('\n');
const ids = new Set(inZip.filter((f) => /^[^/]+\.(mjs|glb)$/.test(f)).map((f) => f.replace(/\.(mjs|glb)$/, '')));

// the files to search: the tour's code (not its tests) and the Scenic Tour plans
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'test') walk(p); } else if (/\.(js|mjs)$/.test(name)) files.push(p);
  }
};
walk(join(root, 'tour'));
const plans = join(root, 'docs/superpowers/plans');
if (existsSync(plans)) for (const name of readdirSync(plans)) if (/scenic-tour/.test(name)) files.push(join(plans, name));

const used = new Set();
for (const f of files) for (const word of readFileSync(f, 'utf8').match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) ?? []) if (ids.has(word)) used.add(word);
if (!used.size) { console.error('No catalogue parts found in tour/ or the plans'); process.exit(1); }

const want = [...used].sort().flatMap((id) => [`${id}.mjs`, `${id}.glb`]).filter((f) => inZip.includes(f));
mkdirSync(to, { recursive: true });
execFileSync('unzip', ['-o', '-q', zip, ...want, '-d', to]);
const bytes = want.reduce((sum, f) => sum + statSync(join(to, f)).size, 0);
console.log(`${used.size} parts (${want.length} files, ${(bytes / 1e6).toFixed(1)} MB) copied into ${relative(root, to)}/:`);
console.log([...used].sort().join('\n'));

// each part's <id>-params.json (its knobs and, for one that lights up after dark, its `night` map: which colour zones
// glow, and how) isn't in the catalogue: it's public on Polyfork's CDN, so it's fetched from there
let got = 0;
for (const id of used) {
  try {
    const res = await fetch(`https://polyfork.dev/cdn/${id}-params.json`);
    if (!res.ok) continue;
    writeFileSync(join(to, `${id}-params.json`), await res.text());
    got++;
  } catch { /* offline: the parts work without it, only their night map is missing */ }
}
console.log(`${got} of ${used.size} parts' -params.json fetched from Polyfork's CDN`);

// Polyfork's materials engine, for the HD animals (tour/hd.js): public on polyfork.dev, but without the CORS headers a
// page on another origin needs to import it, so it's kept beside the parts too
try {
  const res = await fetch('https://polyfork.dev/materials.mjs');
  if (!res.ok) throw new Error(`${res.status}`);
  writeFileSync(join(to, 'materials.mjs'), await res.text());
  console.log('materials.mjs (the materials engine) fetched from polyfork.dev');
} catch (err) { console.log(`materials.mjs not fetched (${err.message}): the HD animals stay flat`); }
