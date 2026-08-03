// Thin wrappers around Valve's public Dota 2 datafeed + OpenDota.
// No API keys required for any of this.

const DATAFEED = 'https://www.dota2.com/datafeed';
export const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react';

const UA = 'DotaBuddy/0.1 (personal dashboard)';

export async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

export async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** All patches Valve knows about, oldest first. */
export async function fetchPatchList() {
  const data = await getJSON(`${DATAFEED}/patchnoteslist?language=english`);
  return data.patches;
}

/** Raw, ID-based patch notes for a given version string e.g. "7.41e". */
export async function fetchPatchNotes(version) {
  return getJSON(`${DATAFEED}/patchnotes?version=${encodeURIComponent(version)}&language=english`);
}

/**
 * Valve's datafeed refers to everything by numeric id. These three lookups turn
 * those ids back into names humans recognise, which is the whole reason the raw
 * notes are unreadable without them.
 */
export async function fetchLookups() {
  const [heroRes, itemRes, abilityRes] = await Promise.all([
    getJSON(`${DATAFEED}/herolist?language=english`),
    getJSON(`${DATAFEED}/itemlist?language=english`),
    getJSON(`${DATAFEED}/abilitylist?language=english`),
  ]);

  const heroes = new Map();
  for (const h of heroRes.result.data.heroes) {
    heroes.set(h.id, {
      id: h.id,
      key: h.name.replace('npc_dota_hero_', ''),
      name: h.name_loc || h.name_english_loc,
      primary_attr: h.primary_attr,
      complexity: h.complexity,
    });
  }

  const items = new Map();
  for (const i of itemRes.result.data.itemabilities) {
    items.set(i.id, {
      id: i.id,
      key: i.name.replace(/^item_/, ''),
      name: i.name_loc || i.name_english_loc,
      neutral_tier: i.neutral_item_tier,
    });
  }

  // The ability list is a superset that also contains items, so seed it with the
  // item map first and let real abilities win where ids collide.
  const abilities = new Map();
  for (const a of abilityRes.result.data.itemabilities) {
    if (!a.name_loc && !a.name_english_loc) continue;
    abilities.set(a.id, {
      id: a.id,
      key: a.name,
      name: a.name_loc || a.name_english_loc,
    });
  }

  return { heroes, items, abilities };
}

export function heroIcon(key) {
  return `${CDN}/heroes/${key}.png`;
}
export function heroPortrait(key) {
  return `${CDN}/heroes/crops/${key}.png`;
}
export function itemIcon(key) {
  return `${CDN}/items/${key}.png`;
}
export function abilityIcon(key) {
  return `${CDN}/abilities/${key}.png`;
}
