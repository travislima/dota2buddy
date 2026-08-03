#!/usr/bin/env node
/**
 * Checks a hand-written brief against the raw patch data:
 *  - every changed hero/item has a write-up (nothing silently missing)
 *  - every write-up points at something that actually changed (no typos)
 *
 *   node scripts/validate-brief.mjs 7.41e
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? JSON.parse(
  await readFile(resolve(ROOT, 'public/data/patches.json'), 'utf8')
).latest;

const raw = JSON.parse(await readFile(resolve(ROOT, `public/data/raw/${version}.json`), 'utf8'));
const brief = JSON.parse(await readFile(resolve(ROOT, `public/data/briefs/${version}.json`), 'utf8'));

const problems = [];
const check = (label, rawKeys, briefObj) => {
  const written = new Set(Object.keys(briefObj ?? {}).filter((k) => briefObj[k] !== null));
  const actual = new Set(rawKeys);
  const missing = [...actual].filter((k) => !written.has(k));
  const extra = [...written].filter((k) => !actual.has(k));
  const nulls = Object.keys(briefObj ?? {}).filter((k) => briefObj[k] === null);

  console.log(`\n${label}: ${written.size}/${actual.size} written up`);
  if (missing.length) { console.log(`  MISSING (${missing.length}): ${missing.join(', ')}`); problems.push(`${label} missing ${missing.length}`); }
  if (extra.length) { console.log(`  UNKNOWN KEY (${extra.length}): ${extra.join(', ')}`); problems.push(`${label} unknown ${extra.join(',')}`); }
  if (nulls.length) { console.log(`  NULL ENTRY: ${nulls.join(', ')}`); problems.push(`${label} null entries`); }
  if (!missing.length && !extra.length && !nulls.length) console.log('  ✓ complete');
};

check('Heroes', raw.heroes.map((h) => h.key), brief.heroes);
check('Items', raw.items.map((i) => i.key), brief.items);
check('Neutrals', raw.neutral_items.map((i) => i.key), brief.neutrals);

// Themes must reference real keys, or the dashboard will render dead links.
const heroKeys = new Set(raw.heroes.map((h) => h.key));
const itemKeys = new Set([...raw.items, ...raw.neutral_items].map((i) => i.key));
for (const t of brief.themes ?? []) {
  for (const h of t.affects?.heroes ?? []) {
    if (!heroKeys.has(h)) { console.log(`\n  theme "${t.id}" → unknown hero "${h}"`); problems.push('bad theme ref'); }
  }
  for (const i of t.affects?.items ?? []) {
    if (!itemKeys.has(i)) { console.log(`\n  theme "${t.id}" → unknown item "${i}"`); problems.push('bad theme ref'); }
  }
}

console.log(`\n${problems.length ? `✗ ${problems.length} problem(s)` : '✓ brief is complete and consistent'}`);
process.exit(problems.length ? 1 : 0);
