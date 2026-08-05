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

**Do the arithmetic — then check the inputs.** The most useful line in the 7.41e brief was
working out that Drow's Multishot range rescale is a wash at base attack range but a ~90 range
*loss* once you buy Dragon Lance. That's not opinion, it's two formulas evaluated at two numbers — and it turns a
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

- theme `title` — 5-8 words. It is the whole card when collapsed, so it has to land alone.
- theme `punch` — `{stat, dir}`. `stat` is unused in the UI now but `dir` drives the brief
  filter and colours the first bite, so keep it accurate.
- theme `bites[]` — **2-4 concrete facts, 3-6 words each.** These sit on the collapsed row and
  are what a reader uses to decide whether to open it. Numbers where possible
  (`Satanic 30s → 40s`), hero names where the change is behavioural
  (`Troll, Zeus, Elder Titan`). Never a sentence — a bite that needs a verb is too long.
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
- `themes[]` — the ranked headlines. Fields: `id`, `rank`, `title`,
  `punch` (`{stat, dir}` where dir is `better`/`worse`/`neutral` — renders as the coloured chip
  on the collapsed row), `severity` (`major`/`notable`/`minor`), `tags[]`,
  `what` (neutral statement — only rendered as a fallback when `bites` is absent, since the
  bites say the same thing more scannably), `why` (the payload),
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

## Density is a feature

The collapsed brief was audited at 742 words and 3.2 screens; it is now ~435 and 2.5, with each
row carrying 24 words of structured facts instead of 39 words of prose. That was achieved by moving `what` inside the expanded card,
replacing the TL;DR paragraph with counts plus a split bar, and giving every headline one
number chip. If a future patch's brief starts creeping back up, re-measure rather than eyeball
it — count words in `main` and divide `scrollHeight` by `innerHeight`.

## The visual system

`public/styles.css` is two layers in one file. Everything above the RESKIN banner is **structure**
— grids, flex containers, `grid-template-areas`. Everything below is the **visual system** from the
"more like Dota 2" design handoff: tokens, type, colour, panel treatment. The reskin layer loads
last so it wins the cascade, and it was written assuming the structure above stays put. If you move
a rule between layers, keep that split — layout up top, looks below.

Key facts to preserve:

- **Two fonts.** Cinzel (`--display`) names things: brand, tabs, section headings, hero and item
  names, verdict slabs, labels. Barlow Semi Condensed (`--font`) is prose, numbers and controls.
  `--mono` stays on the verbatim patch lines — that contrast between our words and Valve's is
  doing real work.
- **Gold is the accent** (`#c9a227`), not red. Red (`--dire`) is now only for destructive buttons
  and "biggest loser".
- **Nothing is round.** `--radius: 0`. Softening happens with angular `clip-path` notches on hero
  art and the icon plate, not radii.
- Hero cards and hero detail use `portrait` (the `crops/` art) from the raw feed; chips, the picker
  and the full-notes list use `icon`. `spirit_bear` reusing `lone_druid`'s crop is correct.
- `scripts/make-icons.mjs` mirrors `public/icon.svg` by hand. Change one, change the other, then
  `npm run icons`.

## Filters and the colour language

Red = weaker, green = stronger, amber = mixed, blue = quality of life. Since the reskin these are
Dire crimson and Radiant moss, so "biggest winner / biggest loser" and "buffed / nerfed" share one
colour language instead of colliding. That mapping is used by
verdict pills, hero/item card borders, the split bar and the filter buttons, so it has to stay
consistent — `filterBar()` and `VERDICT_LABEL` / `VERDICT_HINT` in `app.js` are the single
source. Filters with a count of zero hide themselves rather than render a dead button.

Never surface the raw key `qol` as a label. It reads as jargon to anyone who isn't deep in Dota
discourse; the filter says "Quality of life" and the pill carries a tooltip.

The brief filters on `punch.dir` (`worse`/`better`/`neutral`) rather than a verdict, because a
headline groups several changes and often has no single verdict. When a filter is active the
two-tier "if you read nothing else / worth knowing" split collapses into one flat list.

## Fact-check the numbers you didn't get from the diff

The patch file gives you the change. Anything else the arithmetic depends on — base attack
range, an item's bonus, how much armour a point of agility is worth — comes from memory unless
you look it up, and memory is where the errors are. The 7.41e Drow claim originally read
"1339 → 1240" because it assumed Dragon Lance still gave +140 attack range; it gives +130, so
the real figures are 1321 → 1230. The conclusion held, the numbers didn't.

Before publishing any calculated claim, verify every input against
[Liquipedia](https://liquipedia.net/dota2) or the Dota 2 wiki and note what you checked. Reading
other people's analysis to test your own conclusions is research and is encouraged — reproducing
their words is not, and never is.

## Claims have to be backed by something

"Most likely to show up against you" is ranked by **pick rate from `meta.json`**, and the number
is printed on every card so a reader can check it. It was originally ranked by the hand-authored
`impact` score, which made the heading a claim the data didn't support — impact is an editorial
judgement about how much a change matters, not a prediction about who you'll meet. If a section
name asserts something, the sort key has to be the thing it asserts.

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

The signup form is a promise. While `config.signup.endpoint` is null it says plainly that
nothing is connected and the address stays on-device; when an endpoint is set the copy switches
to the real commitment. Never let it imply an email was sent when none was. It renders in two
places — inline in the "you're caught up" banner (the moment the need is felt, and where it
converts) and as a card at the foot of the brief for everyone else. Only ever one at a time.

## Not this

Don't add a build step, a framework, or dependencies. It's plain files on purpose so it can be
dropped on any static host and still work in a year.
