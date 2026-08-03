# Dota Buddy

Dota 2 patch notes, distilled into what actually matters — and why.

Valve tells you *Satanic cooldown increased from 30s to 40s*. Dota Buddy tells you that means
one Unholy Rage per fight instead of two, so extended fights against a fed carry are winnable
again. That gap is the whole point.

## Run it

```bash
npm run dev
```

Then open <http://localhost:4173>. No install step — there are no dependencies.

On a phone, "Add to Home Screen" installs it as a PWA and it works offline.

## Update it when a patch drops

```bash
npm run update
```

That pulls three things:

| What | From | Gives you |
|---|---|---|
| Patch notes | Valve's official datafeed | Every change, with ids resolved to real names |
| Pick/win rates | OpenDota public matches | Whether a hero is *actually* being played more |
| Community posts | r/DotA2 and r/learndota2 RSS | What people have noticed that the notes don't say |

Then the analysis gets written into `public/data/briefs/<version>.json`. That part is done by
hand in a Claude Code session — say "new patch dropped" and it reads the diff and writes the
brief. No API key, no cost. `CLAUDE.md` has the full instructions and the craft notes.

```bash
npm run validate   # fails if any changed hero or item has no write-up
```

## What's in it

- **Brief** — a TL;DR plus the ranked headlines. Each one says what changed, why it matters,
  what to do about it, and expands to show the official lines verbatim.
- **Heroes** — all 57 changed heroes, sorted by how much it matters. Click any of them for the
  verdict, the reasoning, how to play them and how to play against them, their live win rate,
  and the raw changes.
- **Items** — same treatment, including neutrals and enchantments.
- **Full notes** — the official text, unedited, for when you want the source.
- **Community** — what r/DotA2 is talking about right now.

## Deploy it

`public/` is a plain static folder — nothing to build. Every path in the app is relative and
routing happens in the URL hash, so it works from a subpath like `you.github.io/dota-buddy/`
without any server rewrites.

**GitHub Pages:** push the repo, then in *Settings → Pages* set **Source: GitHub Actions**.
The included workflow publishes `public/` on every push to `main`. To update after a patch,
run `npm run update`, write the brief, commit, push.

Netlify, Vercel and Cloudflare Pages all work too — point them at `public/` with no build
command.

## Layout

```
scripts/
  fetch-patch.mjs      Valve datafeed → readable, name-resolved JSON
  fetch-meta.mjs       OpenDota pick/win rates per bracket
  fetch-community.mjs  Reddit RSS (best-effort, rate-limit aware)
  validate-brief.mjs   checks the write-up covers everything
  make-icons.mjs       generates the PWA PNGs, no image deps
  serve.mjs            tiny static server
public/
  data/raw/<v>.json    the patch, verbatim but legible   ← generated
  data/briefs/<v>.json the analysis                      ← written by hand
  data/meta.json       live hero stats                   ← generated
  data/community.json  Reddit                            ← generated
  index.html app.js styles.css sw.js manifest.webmanifest
```

The split matters: `raw` is facts, `briefs` is judgement. Regenerating one never overwrites
the other.

## Beyond Dota

The framework here — pull a structured changelog, group it into systemic themes, explain the
second-order consequence, keep the verbatim source one click away — isn't specific to Dota.
It works for anything that ships opaque release notes.
