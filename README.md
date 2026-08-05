# Dota 2 Buddy

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

Then the analysis gets written into `public/data/briefs/<version>.json`. That part is done by
hand in a Claude Code session — say "new patch dropped" and it reads the diff and writes the
brief. No API key, no cost. `CLAUDE.md` has the full instructions and the craft notes.

```bash
npm run validate   # fails if any changed hero or item has no write-up
```

## What's in it

- **Brief** — the patch at a glance, then the ranked headlines. Each collapsed headline carries
  two to four concrete facts (`Satanic 30s → 40s · Refresher Shard: all stats gone`) so you can
  decide whether it's worth opening. Expand for why it matters, what to do, and the official
  lines verbatim.
- **Heroes** — all 57 changed heroes, sorted by how much it matters. Click any of them for the
  verdict, the reasoning, how to play them and how to play against them, their live win rate,
  and the raw changes.
- **Items** — same treatment, including neutrals and enchantments.
- **Full notes** — the official text, unedited, for when you want the source.

Every one of those three pages filters by the same colour language: **red is weaker, green is
stronger, amber is mixed, blue is quality of life** (easier to use, not more powerful). Want just
the nerfs? One click on any page. The brief filters by direction rather than verdict, since a
headline is a theme rather than a single hero.

## Made yours

Hit **★ Your heroes** in the corner (or press `h`) and pick the heroes you actually play. From then on the
brief opens with **Your heroes in this patch**, plus a short **You'll be facing** list of the big
changes on heroes you don't play — because those still decide your games. The Heroes tab gains a
★ Mine filter too.

It also keeps track of what you've read. Come back later and the top of the page tells you how
much is left, unread headlines keep a small dot, and a new patch resets the count. All of it
lives in one `localStorage` key on your own device — no account, no server, no cookies.

Each headline has a **Was this useful?** vote and a **Copy link** that deep-links straight to it
(`#/theme/kaya-mana`), which is the fastest way to send a friend the one thing they need.

Keyboard: `1`-`4` switch tabs, `/` focuses search, `e` expands everything, `h` opens the hero
picker, `Esc` closes.

## Analytics

GitHub Pages has none built in. `public/config.js` is wired for three cookieless providers, so
no consent banner is needed — and **nothing third-party loads until you set one**:

| Provider | Cost | Custom events |
|---|---|---|
| **GoatCounter** | Free for personal use | Yes — see which headlines get opened and voted on |
| Cloudflare Web Analytics | Free | No, pageviews only |
| Plausible | Paid | Yes |

GoatCounter is the one to pick, because the custom events are the interesting part. Sign up,
then set:

```js
analytics: { provider: 'goatcounter', site: 'your-code' }
```

It records `headline_open`, `vote`, `share`, `heroes_picked`, `signup` and `expand_all` — so
"which write-ups actually earned attention" becomes a real answer rather than a guess. Local
development is excluded automatically, and with `provider: 'none'` the events just log to the
console so you can watch them.

Google Analytics is deliberately not the default: it uses cookies, which would mean a consent
banner on a page whose whole point is getting out of your way.

## The email list

`public/config.js` points `signup.endpoint` at Buttondown. Addresses are POSTed straight there,
Buttondown handles double opt-in and unsubscribe, and nothing is stored by this site beyond the
visitor's own device.

The form renders in two places, never both: inline in the "you're all caught up" banner — the
moment the need is actually felt — and as a card at the foot of the brief for everyone else.
The `signup` event records which one converted.

Set `endpoint` back to `null` and the copy automatically reverts to saying nothing is connected.
The UI is built so it can't imply an email was sent when it wasn't.

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
  validate-brief.mjs   checks the write-up covers everything
  make-icons.mjs       generates the PWA PNGs, no image deps
  serve.mjs            tiny static server
public/
  data/raw/<v>.json    the patch, verbatim but legible   ← generated
  data/briefs/<v>.json the analysis                      ← written by hand
  data/meta.json       live hero stats                   ← generated
  config.js            analytics + signup switches       ← the file you edit
  store.js             everything remembered on-device
  analytics.js         provider-agnostic event tracking
  index.html app.js styles.css sw.js manifest.webmanifest
```

The split matters: `raw` is facts, `briefs` is judgement. Regenerating one never overwrites
the other.

## Beyond Dota

The framework here — pull a structured changelog, group it into systemic themes, explain the
second-order consequence, keep the verbatim source one click away — isn't specific to Dota.
It works for anything that ships opaque release notes.
