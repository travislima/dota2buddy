#!/usr/bin/env node
/**
 * Pulls live hero pick/win rates from OpenDota so the dashboard can say
 * "this hero is actually being played more", not just "this hero was buffed".
 *
 * Brackets 1-8 map to Herald → Immortal. We surface two numbers: all-bracket
 * (what most people will experience) and high-bracket (where a change gets
 * exploited first). Pro data is included but is thin between majors.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJSON, heroIcon } from './lib/dota-api.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HIGH_BRACKETS = [6, 7, 8]; // Ancient, Divine, Immortal
const ALL_BRACKETS = [1, 2, 3, 4, 5, 6, 7, 8];

const sum = (hero, brackets, suffix) =>
  brackets.reduce((total, b) => total + (hero[`${b}_${suffix}`] ?? 0), 0);

const rate = (wins, picks) => (picks > 0 ? +((wins / picks) * 100).toFixed(2) : null);

async function main() {
  console.log('Fetching hero stats from OpenDota…');
  const stats = await getJSON('https://api.opendota.com/api/heroStats');

  const heroes = stats.map((h) => {
    const allPicks = sum(h, ALL_BRACKETS, 'pick');
    const allWins = sum(h, ALL_BRACKETS, 'win');
    const highPicks = sum(h, HIGH_BRACKETS, 'pick');
    const highWins = sum(h, HIGH_BRACKETS, 'win');

    return {
      id: h.id,
      key: h.name.replace('npc_dota_hero_', ''),
      name: h.localized_name,
      icon: heroIcon(h.name.replace('npc_dota_hero_', '')),
      roles: h.roles,
      primary_attr: h.primary_attr,
      attack_type: h.attack_type,
      complexity: h.complexity ?? null,
      all: { picks: allPicks, winrate: rate(allWins, allPicks) },
      high: { picks: highPicks, winrate: rate(highWins, highPicks) },
      pro: {
        picks: h.pro_pick ?? 0,
        bans: h.pro_ban ?? 0,
        winrate: rate(h.pro_win ?? 0, h.pro_pick ?? 0),
      },
    };
  });

  const totalPicks = heroes.reduce((t, h) => t + h.all.picks, 0);
  for (const h of heroes) {
    // Pick rate is per-match-slot; x10 because 10 heroes are drafted per game.
    h.all.pickrate = totalPicks > 0 ? +((h.all.picks / (totalPicks / 10)) * 100).toFixed(2) : null;
  }

  const path = resolve(ROOT, 'public/data/meta.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    fetched_at: new Date().toISOString(),
    source: 'https://api.opendota.com/api/heroStats',
    note: 'Public matches from roughly the last week. High = Ancient/Divine/Immortal.',
    heroes,
  }, null, 2));

  const top = [...heroes].sort((a, b) => (b.high.winrate ?? 0) - (a.high.winrate ?? 0)).slice(0, 5);
  console.log(`✓ ${heroes.length} heroes → public/data/meta.json`);
  console.log('  Highest winrate (Ancient+):', top.map((h) => `${h.name} ${h.high.winrate}%`).join(', '));
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
