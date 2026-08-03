#!/usr/bin/env node
/**
 * Grabs what r/DotA2 is actually talking about.
 *
 * Reddit's plain .json endpoints now require OAuth, but the Atom feeds are
 * still open, so that's what we read. This is deliberately best-effort: if
 * Reddit blocks us, the dashboard just hides the section rather than breaking.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getText } from './lib/dota-api.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FEEDS = [
  { id: 'top_week', label: 'Top this week', url: 'https://www.reddit.com/r/DotA2/top/.rss?t=week' },
  { id: 'hot', label: 'Hot right now', url: 'https://www.reddit.com/r/DotA2/hot/.rss' },
  { id: 'learn', label: 'r/learndota2', url: 'https://www.reddit.com/r/learndota2/top/.rss?t=week' },
];

const decode = (s = '') => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

function parseAtom(xml) {
  const entries = [];
  for (const block of xml.split('<entry>').slice(1)) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1];
    const link = block.match(/<link[^>]*href="([^"]+)"/)?.[1];
    const updated = block.match(/<updated>([^<]+)<\/updated>/)?.[1];
    const author = block.match(/<name>([^<]+)<\/name>/)?.[1];
    if (!title || !link) continue;
    entries.push({
      title: decode(title.trim()),
      url: decode(link),
      posted: updated ?? null,
      author: author ?? null,
    });
  }
  return entries;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reddit throttles bursts of feed requests, so back off and try again. */
async function getFeed(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await getText(url);
    } catch (err) {
      const last = i === attempts - 1;
      if (last || !/429|503/.test(err.message)) throw err;
      const wait = 5000 * (i + 1);
      console.log(`  rate limited, waiting ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
}

async function main() {
  const sections = [];
  for (const [i, feed] of FEEDS.entries()) {
    if (i > 0) await sleep(4000); // be polite to Reddit
    try {
      console.log(`Fetching ${feed.label}…`);
      const posts = parseAtom(await getFeed(feed.url)).slice(0, 12);
      sections.push({ ...feed, posts });
      console.log(`  ${posts.length} posts`);
    } catch (err) {
      console.warn(`  skipped (${err.message})`);
      sections.push({ ...feed, posts: [], error: err.message });
    }
  }

  const path = resolve(ROOT, 'public/data/community.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    fetched_at: new Date().toISOString(),
    sections,
  }, null, 2));

  console.log(`✓ public/data/community.json`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
