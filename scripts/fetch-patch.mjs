#!/usr/bin/env node
/**
 * Pulls a patch out of Valve's datafeed and writes a readable, name-resolved
 * version to public/data/raw/<version>.json
 *
 *   npm run fetch            # newest patch
 *   npm run fetch -- 7.41e   # a specific one
 *
 * The output of this script is the *input* to the human/AI write-up that lives
 * in public/data/briefs/<version>.json. This script never editorialises — it
 * only makes the raw notes legible.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchPatchList, fetchPatchNotes, fetchLookups,
  heroIcon, heroPortrait, itemIcon, abilityIcon,
} from './lib/dota-api.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A few controllable units get their own "hero" entries in the patch notes but
 * are absent from herolist, so they'd otherwise render as "Hero 1961".
 */
const UNIT_OVERRIDES = {
  1961: { key: 'spirit_bear', icon_key: 'lone_druid', name: 'Spirit Bear', belongs_to: 'Lone Druid' },
};

function normaliseNotes(notes = []) {
  return notes.map((n) => ({
    indent: n.indent_level ?? 1,
    text: n.note,
    icon: n.info_icon || n.icon || null,
  }));
}

/** Rough "how much did this actually move" score, used to order the dashboard. */
function weight(entry) {
  const own = entry.notes?.length ?? 0;
  const abilities = (entry.abilities ?? []).reduce((sum, a) => sum + a.notes.length, 0);
  return own + abilities;
}

async function main() {
  const requested = process.argv[2];

  console.log('Fetching patch list…');
  const patches = await fetchPatchList();
  const target = requested
    ? patches.find((p) => p.patch_number === requested)
    : patches[patches.length - 1];

  if (!target) {
    console.error(`Unknown patch "${requested}".`);
    console.error('Recent patches:', patches.slice(-10).map((p) => p.patch_number).join(', '));
    process.exit(1);
  }

  console.log(`Fetching notes for ${target.patch_number} and resolving ids…`);
  const [notes, lookups] = await Promise.all([
    fetchPatchNotes(target.patch_number),
    fetchLookups(),
  ]);

  const heroes = (notes.heroes ?? []).map((h) => {
    const override = UNIT_OVERRIDES[h.hero_id];
    const info = lookups.heroes.get(h.hero_id);
    const key = override?.key ?? info?.key ?? `hero_${h.hero_id}`;
    return {
      id: h.hero_id,
      key,
      name: override?.name ?? info?.name ?? `Hero ${h.hero_id}`,
      belongs_to: override?.belongs_to ?? null,
      icon: heroIcon(override?.icon_key ?? key),
      portrait: heroPortrait(override?.icon_key ?? key),
      notes: normaliseNotes(h.hero_notes),
      abilities: (h.abilities ?? []).map((a) => {
        const ab = lookups.abilities.get(a.ability_id);
        return {
          id: a.ability_id,
          name: ab?.name ?? `Ability ${a.ability_id}`,
          icon: ab?.key ? abilityIcon(ab.key) : null,
          notes: normaliseNotes(a.ability_notes),
        };
      }),
      talents: (h.talent_notes ?? []).map((t) => ({ text: t.note, indent: t.indent_level ?? 1 })),
    };
  });

  const mapItems = (list = []) => list
    .filter((i) => !i.is_general_note && i.ability_id > 0)
    .map((i) => {
      const info = lookups.items.get(i.ability_id);
      const key = info?.key ?? `item_${i.ability_id}`;
      return {
        id: i.ability_id,
        key,
        name: info?.name ?? `Item ${i.ability_id}`,
        icon: itemIcon(key),
        neutral_tier: info?.neutral_tier ?? -1,
        notes: normaliseNotes(i.ability_notes),
      };
    });

  // Neutral items are grouped under "Tier N"/"Artifacts" heading rows that carry
  // no ability of their own; keep the heading so tier context isn't lost.
  const neutralHeadings = (notes.neutral_items ?? [])
    .filter((i) => i.is_general_note)
    .map((i) => i.title);

  const out = {
    patch: target.patch_number,
    name: target.patch_name,
    released: new Date(target.patch_timestamp * 1000).toISOString(),
    fetched_at: new Date().toISOString(),
    source: `https://www.dota2.com/patches/${target.patch_number}`,
    general: (notes.general_notes ?? []).map((g) => ({
      title: g.title,
      notes: normaliseNotes(g.generic),
    })),
    items: mapItems(notes.items).sort((a, b) => weight(b) - weight(a)),
    neutral_headings: neutralHeadings,
    neutral_items: mapItems(notes.neutral_items).sort((a, b) => weight(b) - weight(a)),
    heroes: heroes.sort((a, b) => weight(b) - weight(a)),
  };

  const path = resolve(ROOT, 'public/data/raw', `${target.patch_number}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(out, null, 2));

  // Keep a tiny index so the site knows which patches exist without a directory listing.
  const indexPath = resolve(ROOT, 'public/data/patches.json');
  await writeFile(indexPath, JSON.stringify({
    latest: target.patch_number,
    patches: patches.slice(-20).reverse().map((p) => ({
      patch: p.patch_number,
      released: new Date(p.patch_timestamp * 1000).toISOString(),
    })),
  }, null, 2));

  console.log(`\n✓ ${target.patch_number} → public/data/raw/${target.patch_number}.json`);
  console.log(`  ${out.heroes.length} heroes, ${out.items.length} items, ${out.neutral_items.length} neutrals`);
  console.log(`\nBiggest hero changes by volume:`);
  for (const h of out.heroes.slice(0, 12)) {
    console.log(`   ${String(weight(h)).padStart(3)} lines  ${h.name}`);
  }
  console.log(`\nNext: write the analysis in public/data/briefs/${target.patch_number}.json`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
