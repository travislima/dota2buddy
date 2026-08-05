#!/usr/bin/env node
/**
 * Pulls what people actually build on each hero from OpenDota, so the site can
 * tell you which of *your* items changed this patch.
 *
 * This is live meta data, not patch data — it's deliberately not filtered by the
 * current patch, so the same file keeps working when the next one lands.
 *
 *   npm run builds
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJSON } from './lib/dota-api.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Consumables and wards aren't a build. */
const IGNORE = new Set([
  'tango', 'clarity', 'faerie_fire', 'enchanted_mango', 'flask', 'bottle',
  'ward_observer', 'ward_sentry', 'ward_dispenser', 'tpscroll', 'smoke_of_deceit',
  'dust', 'recipe',
]);

/* Real purchases that happen to have no components of their own. Everything
   else must be craftable — see isRealItem. */
const KEEP = new Set([
  'boots', 'aghanims_shard', 'quelling_blade', 'wind_lace', 'infused_raindrop',
  'magic_stick', 'blight_stone', 'orb_of_venom', 'ring_of_protection',
]);

/**
 * Components like Mithril Hammer and Demon Edge show up constantly and tell you
 * nothing — nobody's build "is" a Demon Edge. Finished items are the ones with
 * components of their own, so that's the test.
 */
const isRealItem = (item) => Boolean(item?.components) || KEEP.has(item?.key);

const PER_HERO = 25;      // a full build plus alternates, once parts are gone
const MIN_BUILDS = 3;     // below this it's noise
const DELAY_MS = 1100;    // OpenDota allows ~60/min unauthenticated

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await getJSON(url);
    } catch (err) {
      const last = i === attempts - 1;
      if (last || !/429|502|503/.test(err.message)) throw err;
      const wait = 5000 * (i + 1);
      process.stdout.write(` rate limited, waiting ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
}

async function main() {
  console.log('Fetching item constants…');
  const constants = await getJSON('https://api.opendota.com/api/constants/items');
  const byId = new Map();
  const nameOf = new Map();
  for (const [key, item] of Object.entries(constants)) {
    if (!item?.id) continue;
    byId.set(item.id, { key, name: item.dname ?? key, components: item.components });
    nameOf.set(key, item.dname ?? key);
  }

  console.log('Fetching hero list…');
  const heroes = await getJSON('https://api.opendota.com/api/heroStats');

  const out = {};
  const used = new Set();
  let done = 0;

  for (const hero of heroes) {
    const key = hero.name.replace('npc_dota_hero_', '');
    process.stdout.write(`  [${++done}/${heroes.length}] ${hero.localized_name}`);

    try {
      const pop = await withRetry(`https://api.opendota.com/api/heroes/${hero.id}/itemPopularity`);

      // One item can appear in several build phases; sum them so a row is an item,
      // not an item-in-a-phase.
      const totals = new Map();
      for (const phase of Object.values(pop ?? {})) {
        for (const [id, count] of Object.entries(phase ?? {})) {
          const item = byId.get(Number(id));
          if (!item || IGNORE.has(item.key) || !isRealItem(item)) continue;
          totals.set(item.key, (totals.get(item.key) ?? 0) + count);
        }
      }

      out[key] = [...totals.entries()]
        .filter(([, n]) => n >= MIN_BUILDS)
        .sort((a, b) => b[1] - a[1])
        .slice(0, PER_HERO)
        .map(([k, n]) => {
          used.add(k);
          return [k, n];   // name lives once in the shared lookup below
        });

      console.log(` — ${out[key].length} items`);
    } catch (err) {
      console.log(` — skipped (${err.message})`);
      out[key] = [];
    }
    await sleep(DELAY_MS);
  }

  const path = resolve(ROOT, 'public/data/builds.json');
  await mkdir(dirname(path), { recursive: true });
  // Item names repeat across every hero, so they live in one lookup rather than
  // ~2,800 times. Takes the file from 224KB to 56KB.
  const names = Object.fromEntries([...used].map((k) => [k, nameOf.get(k) ?? k]));

  await writeFile(path, JSON.stringify({
    fetched_at: new Date().toISOString(),
    source: 'https://api.opendota.com/api/heroes/{id}/itemPopularity',
    note: 'What players actually buy on each hero in recent public matches. Live meta data, not patch data.',
    names,
    heroes: out,
  }));

  const covered = Object.values(out).filter((v) => v.length).length;
  console.log(`\n✓ ${covered}/${heroes.length} heroes → public/data/builds.json`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
