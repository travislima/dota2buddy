# Dota Buddy — how to update this

The product is **not** "here's what changed." Valve already publishes that. The product is
**"here's why it matters and what you should do about it."** Everything below serves that.

## The workflow when a new patch drops

The user says "new patch." Then:

```bash
npm run update              # fetch patch + live meta stats
npm run validate            # tells you exactly what still needs writing
```

1. `npm run update` writes `public/data/raw/<version>.json` and refreshes
   `public/data/meta.json`.
2. **Read the whole raw file.** Not a skim — every hero, every item. The systemic themes only
   become visible when you've seen all of it at once.
3. Write `public/data/briefs/<version>.json` (copy the previous patch's file as the shape).
4. `npm run validate` until it passes. It fails if any changed hero or item has no write-up,
   or if a theme references a key that doesn't exist.
5. `npm run dev` and look at it.

There is no API key and no generation step. The analysis is written by hand, in session.

## Writing the brief — the actual craft

**Find the systemic themes first.** The best headlines in 7.41e weren't single hero changes,
they were patterns spread across the file: six unrelated heroes all got "toggling no longer
breaks invisibility"; four items in the Kaya line all lost mana regen amplification; three
charge items all stopped working in the stash. Nobody reading the official notes top-to-bottom
notices these, because they're 40 lines apart. Grouping them is the single highest-value thing
this dashboard does. Read the whole file before writing a word.

**Do the arithmetic.** The most useful line in the 7.41e brief was working out that Drow's
Multishot range rescale is a wash at base attack range but a ~100 range *loss* once you buy
Dragon Lance. That's not opinion, it's two formulas evaluated at two numbers — and it turns a
change that reads as neutral into a clear nerf. Look for rescales, percentage-to-flat
conversions, and anything where the direction depends on a value the note doesn't mention.

**Ground claims in `public/data/meta.json`.** It has real pick/win rates per bracket. "Spectre
got nerfed" is weak; "Spectre got nerfed, and she's at 54.1% winrate in 13% of games" explains
*why Valve did it*. Use the high bracket (Ancient+) number — that's where changes get exploited
first.

**Be honest about the two kinds of claim.** Mechanics, numbers and arithmetic are checkable —
state them plainly. How the meta will respond is a prediction — write "expect", "likely",
and set `confidence.meta` accordingly. Never write "pros are doing X" or "players are building
Y" — there is no data source backing that claim. Inventing community consensus is the one
thing that would make this dashboard worthless.

**Explain the second-order effect, not the first.** "Cooldown 30s → 40s" is the change.
"You get one Satanic per fight instead of two, so extended fights against a fed carry are
winnable again" is the product. Always push one step past the obvious reading.

**Keep it short. This is the rule most likely to slip.** The reader is busy — that is the
entire premise of the product. Budgets, enforced by taste not tooling:

- theme `why` — 2-3 sentences, ~40 words. Lead with the consequence.
- hero and item `why` — 1-2 sentences, ~20 words.
- `summary` — one line, always.
- `do[]` — the most valued part. Keep these, keep them imperative, keep them concrete.

Cut throat-clearing openers ("This looks like a footnote and isn't", "Read these as a set,
because..."). Cut restating the change you already put in `what`. Cut the sentence explaining
why the previous sentence mattered. If a sentence doesn't carry a number, a consequence or an
instruction, delete it.

**Cover everything.** Every changed hero and item gets an entry, even the boring ones — the
point is that someone can click any hero and get an answer. Two honest sentences beats an
omission. `npm run validate` enforces this.

## File shapes

`public/data/briefs/<version>.json`:

- `tldr` — one paragraph. The whole patch for someone with fifteen seconds.
- `verdict` — `shape`, `biggest_loser`, `biggest_winner`.
- `themes[]` — the ranked headlines. Fields: `id`, `rank`, `title`, `severity`
  (`major`/`notable`/`minor`), `tags[]`, `what` (neutral statement), `why` (the payload),
  `do[]` (actionable), `watch`, `affects.heroes[]` / `affects.items[]` (must be real keys —
  they render as clickable chips), `changes[]` (`{source, text}`, shown verbatim under a
  disclosure), `confidence`.
- `heroes{}` / `items{}` / `neutrals{}` — keyed by the `key` field in the raw file.
  Fields: `verdict` (`buff`/`nerf`/`mixed`/`qol`/`rework`), `impact` (1-5, drives sort order),
  `summary` (one line), `why` (the reasoning), and for heroes `play[]` / `counter[]`,
  for items `who`.

Prose fields support `*emphasis*`. Everything is escaped before rendering.

## Gotchas already hit

- Valve's patch feed is entirely numeric ids. `scripts/lib/dota-api.mjs` resolves them against
  `herolist` / `itemlist` / `abilitylist`.
- Some entries aren't heroes. Lone Druid's Spirit Bear appears as `hero_id: 1961` and isn't in
  `herolist` — see `UNIT_OVERRIDES` in `scripts/fetch-patch.mjs`. If a new patch shows
  "Hero <number>", check the ability icon filename to identify the unit and add an override.
- The feed contains literal `<br>` rows and blank notes. `realNotes()` in `app.js` filters them.
- A Reddit community feed was tried and removed: the subreddit's top posts are mostly memes
  and cosplay, so it surfaced noise rather than patch discussion. If it comes back, it should
  query Reddit's search RSS for the patch number specifically, not the general subreddit feed.
- OpenDota's window is roughly the last week, so just after a patch it's a blend of before and
  after. Don't describe it as post-patch data.

## The client-side layer

- `public/config.js` — the only file to edit to switch analytics or the signup form on. Analytics
  defaults to `none` and loads nothing third-party until a provider and site id are set.
- `public/store.js` — one `localStorage` key holding chosen heroes, votes, read state, last visit
  and the signup placeholder. `startPatch()` deliberately clears reads and votes when the patch
  changes, so progress always refers to the patch on screen.
- `public/analytics.js` — `trackEvent()` / `trackView()` wrappers. Events fired today:
  `headline_open`, `vote`, `share`, `heroes_picked`, `signup`, `expand_all`. If you add a feature
  worth measuring, fire an event for it — that data is what tells us which write-ups earn their
  keep.

The signup form has no backend. It says so in the UI, and it must keep saying so until
`config.signup.endpoint` is real — never let it imply an email was sent.

## Not this

Don't add a build step, a framework, or dependencies. It's plain files on purpose so it can be
dropped on any static host and still work in a year.
