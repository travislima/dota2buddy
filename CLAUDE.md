# Dota 2 Buddy — the build guide

Read this before touching anything. It is the accumulated result of a lot of specific feedback,
and most of the rules here exist because an earlier version got it wrong.

---

## 1. What this actually is

**The product is not "here's what changed."** Valve publishes that, in full, for free. The product
is **"here's what it means for you, and what to do about it"** — delivered fast enough that a busy
person actually reads it.

Three things make it worth existing. Protect all three:

1. **Speed.** The whole brief is scannable in about a minute. Rival write-ups run 4,000 words.
2. **Personalisation.** Pick your heroes, see only what changed for you. Nothing else does this.
3. **Honesty.** Every number is sourced, every opinion is labelled with whether others agree.

If a change would make the site slower, vaguer or less checkable, don't make it.

---

## 2. When a patch drops

The user says "new patch." Then:

```bash
npm run update      # pulls the patch, OpenDota stats, and what people build
npm run validate    # tells you exactly what still needs writing
npm run dev         # look at it
```

1. `npm run update` writes `public/data/raw/<version>.json` and refreshes `public/data/meta.json`
   and `public/data/builds.json`. The builds fetch makes 127 OpenDota calls at ~1.1s apart, so it
   takes about three minutes — that's the rate limit, not a bug.
2. **Read the entire raw file.** Every hero, every item, in one pass. The best headlines are
   patterns spread 40 lines apart — you only see them with the whole thing in front of you.
3. **Search the web for what else shipped.** Valve's feed carries gameplay notes only. 7.41e also
   had a soft ranked reset and a ~200-bug Summer Scrub, and neither was in our data. For a lot of
   players the reset was the biggest thing in the patch. Put those in `beyond_gameplay` with a
   source link.
4. **Read 2–3 independent analyses** of the patch (Dota2ProTips, win.gg, CyberScore, esports.gg).
   Not to copy — to test your conclusions. Record the result in each theme's `agreement`.
5. Write `public/data/briefs/<version>.json`. Copy the previous patch's file as the shape.
6. `npm run validate` until it passes.
7. Check the site at desktop **and** 375px before saying it's done.

There is no API key and no generation step. The analysis is written by hand, in session.

---

## 3. How to write — this is the part that matters most

Every rule below came from direct feedback. Breaking them is how the product gets worse.

### Say the thing. Don't perform it.

Headlines are **plain and literal**. Say what changed, with the number.

| Don't | Do |
|---|---|
| "The Kaya line's mana regen cut by a third" | **"Kaya's mana regen drops from 30% to 20%"** |
| "Late-game carries trimmed four ways" | **"Four separate nerfs to late-game carries"** |
| "Spectre's Haunt was flattened" | **"Spectre's Haunt is weaker at max level"** |
| "Three small lines, big consequences" | *(split it — see below)* |

Name the hero or item so the headline stands alone. 5–9 words. No wordplay, no cleverness.
**If a reader has to decode the headline, it has failed.**

### "Why it matters" answers "so what?"

Never restate the change. The change is already in the bites and the verbatim lines.

> ❌ "Four more strength." / "A clean durability gain on an already excellent item."
> ✅ **"4 more strength is about 88 extra health, free, on an item you were already buying.
>    You're simply harder to kill."**

**Convert stats into what a player feels.** Verify these each patch, they change:

- **1 strength = 22 health** (+0.1 HP regen)
- **1 intelligence = 12 mana** (+0.05 mana regen, +0.1% magic resist)
- **1 agility = 1/6 armour + 1 attack speed**

If a change only makes sense once you know how the ability works, **explain it in the sentence**:

> "Haunt sends illusions that copy a share of her damage. That share moved from 30/50/70% to
> 35/50/65%, so an early Haunt hits slightly harder and a max-level Haunt hits noticeably less."

### Banned words

Anything the reader has to decode: **flattened, rescaled, amplification, front-loaded,
percentage points, second-order, degenerate, ceiling/floor**. Also never surface the raw key
`qol` — the UI says "Quality of life".

### Cut the fluff

No throat-clearing openers ("This looks like a footnote and isn't"). No self-congratulation
("Most sites that work this way don't tell you"). No sentence explaining why the previous
sentence mattered. **If a sentence carries no number, consequence or instruction, delete it.**

### The `do[]` bullets are the most valued part of the whole product

Keep them imperative and concrete. This is what a reader takes into their next game. The user
specifically confirmed these land — "play her harder earlier, extended fights are survivable
again" was read correctly as *win fast, don't bank on the late game*.

### Length budgets

| Field | Budget |
|---|---|
| `title` | 5–9 words, plain, literal |
| `bites[]` | **2–4 facts, 3–6 words each.** Numbers where possible (`Satanic 30s → 40s`), hero names where behavioural (`Troll, Zeus, Elder Titan`). Never a sentence — if it needs a verb it's too long |
| `why` (theme) | 2–3 sentences, ~40 words. Lead with the consequence |
| `why` (hero/item) | 1–2 sentences. Answer "so what?" |
| `summary` | one line, always |
| `tldr` | one short paragraph, ~25 words |

### There is no target number of headlines

Anything genuinely noteworthy gets its own row. **Never bundle unrelated changes into one card
to keep the count down** — "Three small lines, big consequences" was hiding three real changes
and got split. 7.41e has 15. Twenty would be fine.

`severity` places it in a tier: `major` → "The big changes", `notable` → "Worth knowing about",
`minor` → "The rest of the patch".

### Cover everything

Every changed hero and item gets an entry, even boring ones — someone can click any hero and
must get an answer. Two honest sentences beats an omission. `npm run validate` enforces this.

---

## 4. Accuracy — non-negotiable

### Check every input the maths depends on

The patch file gives you *the change*. Base attack ranges, item bonuses, attribute ratios come
from memory unless you look them up, **and that is exactly where the one published error came
from**: the Drow claim assumed Dragon Lance gave +140 attack range. It gives +130. The
conclusion held; the numbers didn't.

Verify against [Liquipedia](https://liquipedia.net/dota2) before publishing any calculated claim.

### Ground claims in real data

`public/data/meta.json` has pick/win rates per bracket. "Spectre got nerfed" is weak; "Spectre
got nerfed, and she's at 54.1% winrate in 13% of games" explains *why Valve did it*. Use the
high bracket (Ancient+) — that's where changes get exploited first.

**If a section name asserts something, the sort key must be that thing.** "Most likely to show up
against you" is sorted by pick rate, not by our editorial impact score. It was originally sorted
by impact, which made the heading a claim the data didn't support.

### Label the two kinds of claim

Mechanics, numbers and arithmetic are checkable — state them plainly. How the meta will respond
is a prediction — write "expect", "likely", set `confidence.meta`. **Never write "pros are doing
X" or "players are building Y"** unless a source says so and you link it.

### Corroborate every headline

After writing, read independent analyses and record how each held up in `theme.agreement`:

- `corroborated` — someone else independently reached the same conclusion
- `partial` — mentioned elsewhere but not analysed; the reading is ours
- `ours` — nobody else flagged it (fine — say so)
- `disputed` — other coverage disagrees. Keep our view if defensible, show theirs

Add `agreement.sources` (`[{name, url}]`) wherever a real link exists. The Method page groups
every headline under its verdict and prints the link so a reader can check. Where there's no
link, say so — "no source to link" is more credible than a gap.

7.41e came out 7 corroborated / 3 partial / 4 ours / 1 disputed.

---

## 5. Copyright — hard lines

**Never reproduce another writer's words, and never paraphrase their analysis closely.** Reading
someone to test your own conclusion is research and is encouraged. Copying is not, ever.

- **Facts aren't copyrightable.** "Satanic 30s → 40s" is free. Every number chip is fine.
- **Valve's patch text** is quoted verbatim under a disclosure and labelled as theirs.
- **Liquipedia** is CC-BY-SA 3.0 — reusable with attribution *and* share-alike (your derivative
  takes the same licence). Their images are separately licensed.
- **Other analysts** get linked and characterised in our words, never quoted at length.
- **Never put words in a named person's mouth.** If asked what a creator said about a patch,
  go and find it. If they haven't covered it, say that — as we do for Torte de Lini, whose
  guides were on 7.41d when this was written.

---

## 6. File shapes

`public/data/briefs/<version>.json`:

- `patch`, `released`, `written_at`, `method`
- `tldr` — one short paragraph
- `verdict` — `shape`, `biggest_loser`, `biggest_winner`. Format as `"Headline — detail"`; the UI
  splits on the em dash into a bold name and quiet detail
- `beyond_gameplay` — `{note, items[{title, what, why, source, source_url}]}` for anything that
  shipped with the patch but isn't in Valve's gameplay feed
- `sources[]` — `{name, url, role, licence?}` rendered on the Method page
- `creators` — `{checked, note, people[{name, who, what, url, extra, status}]}` — links out only
- `themes[]` — `id`, `rank`, `title`, `punch{stat,dir}`, `bites[]`, `severity`, `tags[]`, `what`,
  `why`, `do[]`, `watch`, `affects{heroes[],items[]}` (must be real keys), `changes[{source,text}]`,
  `agreement{level,note,sources[]}`, `confidence`
- `heroes{}` / `items{}` / `neutrals{}` — keyed by the raw file's `key`. Fields: `verdict`
  (`buff`/`nerf`/`mixed`/`qol`/`rework`), `impact` (1-5, drives sort), `summary`, `why`, plus
  `play[]`/`counter[]` for heroes, and `who` plus optional `instead` for items

`punch.stat` is no longer rendered but `punch.dir` drives the brief filter and colours the first
bite — keep it accurate. Prose supports `*emphasis*`; everything is escaped before rendering.

---

## 7. The look

`public/styles.css` is **two layers in one file**. Above the RESKIN banner is structure — grids,
flex containers, `grid-template-areas`. Below is the visual system from the "more like Dota 2"
handoff. The reskin loads last so it wins the cascade and assumes the structure stays put. Keep
that split: layout up top, looks below.

- **Two fonts.** Cinzel (`--display`) names things — brand, tabs, headings, hero and item names,
  verdict slabs. Barlow Semi Condensed (`--font`) is prose, numbers, controls. `--mono` stays on
  Valve's verbatim lines; that contrast between our words and theirs is doing real work.
- **Gold is the accent** (`#c9a227`). Red (`--dire`) is only destructive buttons and "biggest loser".
- **Nothing is round.** `--radius: 0`. Softening is angular `clip-path` notches.
- **Colour language, everywhere:** red = weaker, green = stronger, amber = mixed, blue = quality
  of life. Used by verdict pills, card borders, the split bar and every filter. `filterBar()` and
  `VERDICT_LABEL` / `VERDICT_HINT` in `app.js` are the single source.
- Hero cards and hero detail use `portrait` (the `crops/` art); chips, the picker and full notes
  use `icon`. `spirit_bear` reusing `lone_druid`'s crop is correct.
- `scripts/make-icons.mjs` mirrors `public/icon.svg` by hand. Change one, change the other, then
  `npm run icons`.
- Filters with a count of zero hide themselves rather than render a dead button.
- The picker has a "Clear all" that empties your list without closing the modal, so you can drop
  back to browsing every hero. Clearing also brings the intro strip back, which is correct — you
  are no longer using the feature it points at.
- The split bar labels its wide segments in place and carries a legend defining all four
  (`26 nerfed = weaker`). The narrow ones can't hold a label and a tooltip does nothing on a
  phone, so without the legend the orange and blue blocks are mystery colours. Any colour-coded
  chart needs a key that works without hovering.
- The topbar and tabs span the window for their background but pad in to `--maxw`, so the brand
  and the first tab sit on the same edge as the content. On a 1900px screen they were 365px
  outside it.
- Expandable things need a visible affordance. The chevron is a 24px bordered square that rotates
  and turns gold when open — an 11px grey glyph was technically an affordance and practically
  invisible.

---

## 7b. What this means for your build

Each hero page ends with the items people *actually* buy on that hero, split into the ones that
changed this patch and the ones that didn't. `builds.json` is live OpenDota item popularity and
is deliberately **not** filtered by the current patch, so it keeps working when the next one lands.

Two things that took a rebuild to get right:

- **Components are not a build.** Mithril Hammer and Demon Edge top every list and mean nothing.
  Only finished items count — the test is whether the item has `components` of its own, plus a
  small `KEEP` list for real purchases that don't (Boots, Aghanim's Shard, Quelling Blade).
- **The per-hero cap decides what you can see.** At 22 items Satanic fell off Sniper's list even
  though it changed. It's 25 now, after components stopped taking half the slots.

Item names live in one shared `names` lookup rather than repeating per hero — 224KB to 56KB. The
file is lazy-loaded on hero pages only, and the section fills in when it arrives rather than
blocking the render.

"Untouched — build these exactly as before" earns its place: knowing what *didn't* change is half
of what a patch reader wants.

### `instead` — the item-level version of `do[]`

Each changed item shows `summary` (what moved), `why` (so what) and, where it applies, `instead`
(what to do). Three weights, and the eye can stop after any one of them.

**Only write `instead` where the nerf changes a decision.** 7.41e has eleven of twenty-six. It is
not "here is a worse item to buy instead" — most of the time the honest answer is *keep buying it,
and change one thing*:

- Kaya multiplies regen you already have, so name the flat sources that feed it — Void Stone +1.75,
  Octarine +6 — and the pool items for when refilling isn't the problem.
- Mask of Madness: still buy it, switch it off before you commit, or hold it for after the BKB.
- Satanic: there is no substitute. Say so, then say what changes — spend the one Rage on the fight
  you have to win.
- Hurricane Pike, Rapier, Chasm Stone, Smoke: nothing changes. **No `instead` field at all.** An
  empty recommendation is worse than none.

**Every item you name must be verified.** These are the same checkable claims as anything else —
`api.opendota.com/api/constants/items` gives you the attribute block. It lags the live patch (it
still showed Kaya at 30% and Refresher Shard with its stats after both were cut), so use it for
*other* items' properties, never for the ones this patch touched.

## 8. Density is a feature — measure it

The collapsed brief was audited at 742 words and 3.2 screens. It is now ~690 and 2.6 with 15
headlines instead of 13, each row carrying ~24 words of structured facts rather than 39 words of
prose. If a future brief creeps up, **re-measure rather than eyeball**: count words in `main` and
divide `scrollHeight` by `innerHeight`.

---

## 9. Gotchas already hit

- Valve's feed is entirely numeric ids. `scripts/lib/dota-api.mjs` resolves them.
- Some entries aren't heroes. Lone Druid's Spirit Bear is `hero_id: 1961` and isn't in `herolist`
  — see `UNIT_OVERRIDES`. If a patch shows "Hero <number>", check the ability icon filename.
- The feed contains literal `<br>` rows and blank notes. `realNotes()` filters them.
- GitHub Pages sends `max-age=600`, so the service worker fetches with `cache: 'no-cache'`.
  Without it, a returning visitor gets fresh JSON against stale JS — worse than either alone.
- Delegated listeners belong in `attachAppHandlers()`, bound **once** at boot. Binding them per
  render leaked and made a filter click on Heroes re-render the Brief underneath you.
- The tabs pin at `top: 0` because the reskin lets the brand bar scroll away. Don't reintroduce a
  height-derived offset — that coupling broke once already.
- OpenDota's window is ~a week, so just after a patch it blends before and after. Don't call it
  post-patch data.
- A Reddit feed was tried and removed — the subreddit's top posts are memes and cosplay. If it
  returns, query the search RSS for the patch number specifically.

---

## 10. Client-side layer

- `public/config.js` — the only file to edit for analytics, signup or provenance.
  Analytics is GoatCounter (`dota2buddy`). Signup posts to Buttondown (`dota2buddy`).
  `provenance.showOnBrief` is `false`: authorship is always on the Method page and in the footer,
  never on the Brief's glance panel.
- `public/store.js` — one `localStorage` key: chosen heroes, votes, read state, last visit,
  signup. `startPatch()` clears reads and votes when the patch changes.
- `public/analytics.js` — `trackEvent()` / `trackView()`. Hits buffer until the provider script
  loads, or the first pageview of every visit is lost. Events: `headline_open`, `vote`, `share`,
  `heroes_picked`, `signup`, `expand_all`, `filter_*`.

The signup is a promise. While `endpoint` is null it says plainly nothing is connected. It renders
inline in the "you're caught up" banner *or* as a card at the foot — never both — and `signupEarned()`
withholds it entirely until the site has been useful: three headlines opened, or a return visit.
Don't ask a first-timer who has read nothing.

`renderIntro()` is the only thing a first-timer reads before deciding whether to stay. It has to
answer "what is this, why do I care" in one line and point at the personalisation, because that's
the one feature nothing else has — and without it the site presents as just another patch summary.

**It has no dismiss button, deliberately.** Picking heroes is what retires it. A dismiss let
someone permanently hide the one thing that makes the site different, which is the opposite of
what it's for; without one it persists for everyone who hasn't used the feature and vanishes for
good the moment they do. It never nags anyone it has already served.

---

## 11. Don't

- Don't add a build step, a framework, or dependencies. Plain files on purpose.
- Don't make the reader work. If you're unsure whether something is clear, it isn't.
- Don't pad. The user's most repeated instruction across the whole project is **be less verbose
  and get to the point.**
