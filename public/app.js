/* Dota Buddy — joins the raw patch, the written brief and live meta stats
   into one browsable thing. No build step, no framework. */

import { store } from './store.js';
import { config } from './config.js';
import { initAnalytics, trackView, trackEvent } from './analytics.js';

const state = {
  patches: null,
  raw: null,
  brief: null,
  meta: null,
  heroFilter: 'all',
  heroSearch: '',
  itemFilter: 'all',
  itemSearch: '',
  themeFilter: 'all',
  pickerSearch: '',
  previousVisit: null,
  isNewPatch: false,
};

const app = document.getElementById('app');

/* ---------- helpers ---------- */

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Prose from the brief, with *emphasis* honoured. Escapes first, so it stays safe. */
const rich = (s = '') => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

/** Valve leaves literal <br> rows and blank notes in the feed; drop them. */
const realNotes = (notes = []) =>
  notes.filter((n) => n.text && n.text.replace(/<br\s*\/?>/gi, '').trim().length > 0);

const cleanText = (t = '') => t.replace(/<br\s*\/?>/gi, ' ').trim();

const json = async (url) => {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, {
  day: 'numeric', month: 'short', year: 'numeric',
});

const daysAgo = (iso) => {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return fmtDate(iso);
};

const impactDots = (n = 0) =>
  `<span class="impact ${n >= 4 ? 'hi' : ''}">${
    [1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')
  }</span>`;

/* "QoL" is Dota shorthand that not everyone reads fluently, so the filters spell
   it out and the pills carry a tooltip. */
const VERDICT_LABEL = {
  nerf: 'Nerfed', buff: 'Buffed', mixed: 'Mixed', qol: 'Quality of life', rework: 'Reworked',
};
const VERDICT_HINT = {
  nerf: 'Weaker than it was',
  buff: 'Stronger than it was',
  mixed: 'Better in some ways, worse in others',
  qol: 'Quality of life — easier to use, not more powerful',
  rework: 'Fundamentally changed',
};

const verdictPill = (v) => v
  ? `<span class="verdict ${esc(v)}" title="${esc(VERDICT_HINT[v] ?? '')}">${esc(v)}</span>`
  : '';

/**
 * One filter row, shared by the brief, heroes and items so the colour language
 * means the same thing everywhere: red is weaker, green is stronger.
 */
function filterBar(options, current, scope) {
  return options.filter((o) => o.count !== 0).map((o) => `
    <button class="filter-btn ${esc(o.cls ?? o.key)} ${current === o.key ? 'active' : ''}"
            data-filter="${esc(o.key)}" data-scope="${esc(scope)}"
            ${o.hint ? `title="${esc(o.hint)}"` : ''}>
      ${esc(o.label)}${o.count != null ? ` <b>${o.count}</b>` : ''}
    </button>`).join('');
}

/** How many of `list` fall under each verdict, for the filter counts. */
function verdictCounts(list, lookup) {
  const counts = {};
  for (const entry of list) {
    const v = lookup(entry.key)?.verdict;
    if (v) counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

const VERDICT_ORDER = ['nerf', 'buff', 'mixed', 'qol', 'rework'];

/* How well a conclusion survived being checked against independent coverage.
   Stated per headline so a reader can weight it, rather than trusting the lot. */
/* Three plain tiers, driven by severity. A headline earns its own row if it's
   worth knowing at all; the small stuff goes to the bottom rather than being
   bundled into a vague "three small things" card. */
const TIERS = [
  { severity: 'major', label: 'The big changes', hint: '' },
  { severity: 'notable', label: 'Worth knowing about', hint: 'Smaller, but they change something' },
  { severity: 'minor', label: 'The rest of the patch', hint: 'Minor — read if you want everything' },
];

const AGREEMENT_LABEL = {
  corroborated: 'Other analysts agree',
  partial: 'Others mentioned it, but did not analyse it',
  ours: 'Our own opinion — nobody else flagged this',
  disputed: 'Another analyst disagrees with us',
};

/** Count of changed lines, used when a hero has no write-up yet. */
const lineCount = (h) =>
  realNotes(h.notes).length + (h.abilities ?? []).reduce((s, a) => s + realNotes(a.notes).length, 0)
  + (h.talents ?? []).length;

const heroByKey = (key) => state.raw.heroes.find((h) => h.key === key);
const itemByKey = (key) =>
  [...state.raw.items, ...state.raw.neutral_items].find((i) => i.key === key);
const metaByKey = (key) => state.meta?.heroes.find((h) => h.key === key);

const briefHero = (key) => state.brief?.heroes?.[key];
const briefItem = (key) => state.brief?.items?.[key] ?? state.brief?.neutrals?.[key];

/* ---------- boot ---------- */

async function boot() {
  try {
    state.patches = await json('data/patches.json');
    const v = state.patches.latest;

    const [raw, meta, brief] = await Promise.all([
      json(`data/raw/${v}.json`),
      json('data/meta.json').catch(() => null),
      json(`data/briefs/${v}.json`).catch(() => null),
    ]);

    state.raw = raw;
    state.meta = meta;
    state.brief = brief;

    // Reading progress resets when the patch changes, so "3 left" always means
    // 3 left in the patch you're actually looking at.
    const { isNewPatch } = store.startPatch(raw.patch);
    state.isNewPatch = isNewPatch;
    state.previousVisit = store.touchVisit();

    initAnalytics();

    document.getElementById('patch-chip').innerHTML =
      `<b>${esc(raw.patch)}</b><span>${esc(daysAgo(raw.released))}</span>`;

    const notes = [];
    if (meta?.fetched_at) notes.push(`Meta stats updated ${daysAgo(meta.fetched_at)}.`);
    if (brief?.written_at) {
      notes.push(`Analysis written ${fmtDate(brief.written_at)} by Claude, from Valve's full patch diff.`);
    }
    document.getElementById('footer-note').textContent = notes.join(' ');

    const heroesBtn = document.getElementById('my-heroes');
    heroesBtn.classList.toggle('on', store.heroes.length > 0);
    heroesBtn.addEventListener('click', openHeroPicker);

    window.addEventListener('hashchange', route);
    attachAppHandlers();
    attachShortcuts();
    route();
  } catch (err) {
    app.innerHTML = `<div class="empty">
      <p>Couldn't load the patch data.</p>
      <p style="font-size:13px">${esc(err.message)}</p>
      <p style="font-size:13px">Run <code>npm run update</code> to fetch it.</p>
    </div>`;
  }
}

/* ---------- router ---------- */

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [view, arg] = hash.split('/');

  document.getElementById('my-heroes')?.classList.toggle('on', store.heroes.length > 0);

  document.querySelectorAll('.tabs a').forEach((a) => {
    const tab = a.dataset.tab;
    const active = (!view && tab === 'brief')
      || (view === 'heroes' || view === 'hero') && tab === 'heroes'
      || (view === 'items' || view === 'item') && tab === 'items'
      || view === tab;
    a.classList.toggle('active', Boolean(active));
  });

  switch (view) {
    case 'heroes': renderHeroes(); break;
    case 'hero': renderHeroDetail(arg); break;
    case 'items': renderItems(); break;
    case 'item': renderItemDetail(arg); break;
    case 'notes': renderNotes(); break;
    case 'method': renderMethod(); break;
    case 'theme': renderBrief(); break;
    default: renderBrief();
  }

  trackView(`/${view || 'brief'}${arg ? `/${arg}` : ''}`, document.title);

  // A deep-linked headline scrolls itself into view; everything else starts at the top.
  if (view === 'theme' && arg) {
    const card = document.getElementById(`theme-${arg}`);
    if (card) { card.open = true; card.scrollIntoView({ block: 'center' }); return; }
  }
  window.scrollTo(0, 0);
}

/* ---------- view: brief ---------- */

function renderBrief() {
  const b = state.brief;

  if (!b) {
    app.innerHTML = `
      <div class="callout">
        <strong>Patch ${esc(state.raw.patch)} has been fetched, but nobody has written the brief yet.</strong>
        <br>The raw changes are all readable under <a href="#/notes" style="color:var(--accent-soft)">Full notes</a>,
        <a href="#/heroes" style="color:var(--accent-soft)">Heroes</a> and
        <a href="#/items" style="color:var(--accent-soft)">Items</a> in the meantime.
      </div>` + heroTeaser();
    return;
  }

  const v = b.verdict ?? {};
  const all = (b.themes ?? []).slice().sort((a, c) => (a.rank ?? 99) - (c.rank ?? 99));
  const unread = all.filter((t) => !store.hasRead(t.id)).length;

  // Headlines carry a direction rather than a verdict, but it means the same thing
  // to a reader: worse for you, better for you, or neither.
  const dirOf = (t) => t.punch?.dir ?? 'neutral';
  const dirCount = (d) => all.filter((t) => dirOf(t) === d).length;
  const themeOptions = [
    { key: 'all', label: 'All', count: all.length },
    { key: 'worse', cls: 'nerf', label: 'Nerfs', count: dirCount('worse'), hint: 'Something got weaker' },
    { key: 'better', cls: 'buff', label: 'Buffs', count: dirCount('better'), hint: 'Something got stronger' },
    { key: 'neutral', cls: 'mixed', label: 'Neither', count: dirCount('neutral'), hint: 'Changed, but not up or down' },
  ];
  const filtering = state.themeFilter !== 'all';
  const themes = filtering ? all.filter((t) => dirOf(t) === state.themeFilter) : all;

  app.innerHTML = `
    ${renderWelcome(unread, all.length)}

    ${renderGlance(v, all.length)}

    ${renderForYou()}

    <div class="section-head">
      <h2>${filtering ? 'Filtered' : TIERS[0].label}</h2>
      <div class="head-actions">
        ${!filtering && unread > 0 && unread < all.length
          ? `<span class="progress">${all.length - unread}/${all.length} read</span>` : ''}
        <button class="expand-all" id="expand-all">Expand all</button>
      </div>
    </div>

    <div class="filters">${filterBar(themeOptions, state.themeFilter, 'brief')}</div>

    ${filtering ? (themes.length
        ? themes.map(renderHeadline).join('')
        : '<div class="empty">Nothing in this patch matches that.</div>')
      : TIERS.map((tier, i) => {
          const inTier = themes.filter((t) => (t.severity ?? 'minor') === tier.severity);
          if (!inTier.length) return '';
          // The first tier's heading is already printed above, with the controls.
          return (i === 0 ? '' : `
            <div class="section-head">
              <h2>${esc(tier.label)}</h2>
              <span class="hint">${esc(tier.hint)}</span>
            </div>`) + inTier.map(renderHeadline).join('');
        }).join('')}


    ${renderBeyond()}

    ${renderCreators()}

    ${signupShownInline(unread) ? '' : renderJoin()}
  `;

  attachBriefHandlers();
}

/**
 * The patch in one screen: a sentence, three counts, and the buff/nerf split
 * as a bar you read rather than a paragraph you parse.
 */
function renderGlance(v, themeCount) {
  const b = state.brief;
  const tally = { nerf: 0, buff: 0, mixed: 0, qol: 0, rework: 0 };
  for (const h of state.raw.heroes) {
    const verdict = briefHero(h.key)?.verdict;
    if (verdict in tally) tally[verdict] += 1;
  }
  const total = Object.values(tally).reduce((s, n) => s + n, 0) || 1;
  const items = state.raw.items.length + state.raw.neutral_items.length;

  // "Late-game carries — Satanic, Refresher…" → bold headline, quiet detail.
  const split = (s = '') => {
    const [head, ...rest] = s.split(' — ');
    return { head, rest: rest.join(' — ') };
  };
  const win = split(v.biggest_winner);
  const lose = split(v.biggest_loser);

  const seg = (key, label) => tally[key]
    ? `<i class="${key}" style="flex:${tally[key]}" title="${tally[key]} ${label}">
         ${tally[key] / total > 0.12 ? `${tally[key]} ${label}` : ''}</i>`
    : '';

  return `
    <section class="glance">
      <div class="glance-top">
        <div class="glance-patch">
          <span class="glance-eyebrow">The patch at a glance</span>
          <div class="glance-patch-row">
            <b>${esc(b.patch)}</b>
            <span>${esc(fmtDate(b.released))} · ${esc(daysAgo(b.released))}</span>
          </div>
        </div>
        <div class="glance-counts">
          <div><b>${state.raw.heroes.length}</b><span>heroes</span></div>
          <div><b>${items}</b><span>items</span></div>
          <div><b>${themeCount}</b><span>to know</span></div>
        </div>
      </div>

      <p class="glance-tldr">${rich(b.tldr)}</p>

      <div class="split-bar" aria-label="How the hero changes break down">
        ${seg('nerf', 'nerfed')}${seg('buff', 'buffed')}${seg('mixed', 'mixed')}${seg('qol', 'QoL')}
      </div>

      <div class="wl">
        <div class="win">
          <span>▲ Biggest winner</span>
          <b>${esc(win.head)}</b>${win.rest ? `<p>${esc(win.rest)}</p>` : ''}
        </div>
        <div class="lose">
          <span>▼ Biggest loser</span>
          <b>${esc(lose.head)}</b>${lose.rest ? `<p>${esc(lose.rest)}</p>` : ''}
        </div>
      </div>

      ${config.provenance.showOnBrief && b.method ? `
        <details class="provenance">
          <summary>Written by AI from the official diff — how to read that</summary>
          <p>${esc(b.method)}</p>
        </details>` : ''}
    </section>`;
}

/** A short line that only appears when it has something to say. */
function renderWelcome(unread, total) {
  if (state.isNewPatch) {
    return `<div class="welcome new">
      <strong>New patch since you were last here.</strong>
      ${esc(state.raw.patch)} landed ${esc(daysAgo(state.raw.released))} — here's what changed.
    </div>`;
  }
  if (state.previousVisit && unread > 0 && unread < total) {
    return `<div class="welcome">
      Welcome back. <strong>${unread} of ${total}</strong> still unread from ${esc(state.raw.patch)}.
    </div>`;
  }
  if (state.previousVisit && unread === 0) {
    // The one moment the signup answers a need the reader just felt.
    return `<div class="welcome done">
      You're all caught up on ${esc(state.raw.patch)}. Nothing new until the next patch.
      ${renderJoin({ compact: true })}
    </div>`;
  }
  return '';
}

/** True when the caught-up banner is already carrying the signup. */
function signupShownInline(unread) {
  return Boolean(state.previousVisit) && unread === 0 && !state.isNewPatch && !store.joined;
}

/**
 * Other people's work, pointed at rather than summarised.
 *
 * We never paraphrase a named creator's take — putting words in a real person's
 * mouth is the fastest way to lose the trust this whole site runs on. Each entry
 * is a link to their own work plus an honest note on how current it is.
 */
function renderCreators() {
  const c = state.brief?.creators;
  if (!c?.people?.length) return '';

  return `
    <div class="section-head">
      <h2>Go deeper</h2>
      <span class="hint">${esc(c.note ?? '')}</span>
    </div>
    <div class="grid">
      ${c.people.map((p) => `
        <div class="creator">
          <div class="creator-head">
            <strong>${esc(p.name)}</strong>
            <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"
               class="link-btn" data-creator="${esc(p.name)}">Open →</a>
          </div>
          ${p.who ? `<p class="creator-who">${esc(p.who)}</p>` : ''}
          <p class="creator-what">${esc(p.what)}</p>
          ${p.status ? `<p class="creator-status">${esc(p.status)}</p>` : ''}
          ${p.extra ? `<a class="creator-extra" href="${esc(p.extra.url)}"
             target="_blank" rel="noopener noreferrer">${esc(p.extra.label)}</a>` : ''}
        </div>`).join('')}
    </div>
    ${c.checked ? `<p class="aside">Links checked ${esc(fmtDate(c.checked))}.</p>` : ''}
  `;
}

/** Shipped with the patch but absent from Valve's gameplay notes feed. */
function renderBeyond() {
  const b = state.brief?.beyond_gameplay;
  if (!b?.items?.length) return '';
  return `
    <div class="section-head">
      <h2>Also in this patch</h2>
      <span class="hint">${esc(b.note ?? '')}</span>
    </div>
    <div class="grid">
      ${b.items.map((i) => `
        <div class="beyond">
          <strong>${esc(i.title)}</strong>
          <p>${esc(i.what)}</p>
          <p class="beyond-why">${esc(i.why)}</p>
          ${i.source_url
            ? `<a class="beyond-src" href="${esc(i.source_url)}" target="_blank" rel="noopener noreferrer">via ${esc(i.source)} →</a>`
            : `<span class="beyond-src">via ${esc(i.source)}</span>`}
        </div>`).join('')}
    </div>`;
}

/* ---------- view: method ---------- */

function renderMethod() {
  const b = state.brief;
  const counts = (b?.themes ?? []).reduce((acc, t) => {
    const k = t.agreement?.level ?? 'ours';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  app.innerHTML = `
    <div class="section-head">
      <h2>How this is put together</h2>
    </div>

    <div class="callout">
      We take Valve's patch notes, add live win-rate data, read what other Dota analysts said
      about the patch, and turn all of it into one short guide. The numbers come from Valve.
      The opinions are ours, and we tell you which ones other people agree with.
    </div>

    ${b?.method ? `
      <div class="section-head"><h2>Who writes it</h2></div>
      <div class="callout">
        <p style="margin:0 0 9px">${esc(b.method)}</p>
        <p style="margin:0;color:var(--text-faint);font-size:13px">
          Most sites that work this way don't tell you. We'd rather say it, show the process
          below, and let you weigh the calls yourself — which is why every point on the Brief
          says whether other analysts agreed with it.</p>
      </div>` : ''}

    <div class="section-head"><h2>What we actually do</h2></div>
    <ol class="method-steps">
      <li><b>Read every change.</b> All 57 heroes and 32 items, start to finish. Some of the
        biggest stories are several small changes that add up — you only spot those by reading
        the lot in one go.</li>
      <li><b>Check the maths.</b> When a change hides its real effect, we work it out and look
        up the numbers we need on Liquipedia rather than trusting memory.</li>
      <li><b>Add real data.</b> Pick and win rates come from OpenDota and are printed on every
        hero card, so you can check what we say against the number.</li>
      <li><b>Compare with other analysts.</b> We read other people's patch write-ups and note
        whether they reached the same conclusion. We never copy their words.</li>
      <li><b>Say how sure we are.</b> Numbers and mechanics are facts. What the meta does next
        is a guess, and we label it as one.</li>
    </ol>

    <div class="section-head">
      <h2>How our analysis compares</h2>
      <span class="hint">We checked all ${(b?.themes ?? []).length} of our points against other analysts</span>
    </div>
    <div class="compare">
      ${Object.entries(AGREEMENT_LABEL).map(([k, label]) => {
        const inGroup = (b?.themes ?? []).filter((t) => (t.agreement?.level ?? 'ours') === k);
        if (!inGroup.length) return '';
        return `
        <details class="agreement ${esc(k)} standalone">
          <summary>
            <b>${esc(label)}</b>
            <span>${inGroup.length} of ${b.themes.length}</span>
            <i class="chev-sm" aria-hidden="true">▶</i>
          </summary>
          <ul class="compare-list">
            ${inGroup.map((t) => `
              <li>
                <a class="compare-title" href="#/theme/${esc(t.id)}">${esc(t.title)}</a>
                <p>${esc(t.agreement?.note ?? '')}</p>
                ${(t.agreement?.sources ?? []).length ? `
                  <p class="compare-links">Check it yourself:
                    ${t.agreement.sources.map((src) => `
                      <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.name)} →</a>`).join('')}
                  </p>` : `<p class="compare-links none">No source to link — this one is ours alone.</p>`}
              </li>`).join('')}
          </ul>
        </details>`;
      }).join('')}
    </div>
    <p class="aside">Open any of these to see which points they cover and read the source yourself.
      Every point on the Brief carries the same label.</p>

    <div class="section-head"><h2>Where the information comes from</h2></div>
    <div class="grid">
      ${(b?.sources ?? []).map((src) => `
        <div class="creator">
          <div class="creator-head">
            <strong>${esc(src.name)}</strong>
            <a class="link-btn" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">Open →</a>
          </div>
          <p class="creator-what">${esc(src.role)}</p>
          ${src.licence ? `<p class="creator-status">${esc(src.licence)}</p>` : ''}
        </div>`).join('')}
    </div>

    <div class="section-head"><h2>What we don't do</h2></div>
    <div class="callout">
      We don't copy anyone's writing, and we never claim someone said something they didn't.
      Other people's analysis is linked so you can read it yourself. Valve's patch text is
      quoted word for word and marked as theirs. If we get something wrong, tell us and we'll
      fix it.
    </div>
  `;
}

/* ---------- your heroes ---------- */

/**
 * The whole point of picking heroes: 57 changed heroes becomes the handful you
 * actually play, plus a short warning list for the ones you'll be up against.
 */
function renderForYou() {
  const picked = store.heroes;

  // No prompt card — the header button carries this, so the brief stays the brief.
  if (!picked.length) return '';

  const mine = state.raw.heroes
    .filter((h) => picked.includes(h.key))
    .sort((a, c) => (briefHero(c.key)?.impact ?? 0) - (briefHero(a.key)?.impact ?? 0));

  const untouched = picked.length - mine.length;

  /* Heroes you don't play, that changed meaningfully, ranked by how often they're
     actually picked. The pick rate is real data from OpenDota and is printed on
     each card, so the claim is checkable rather than asserted. */
  const facing = state.raw.heroes
    .filter((h) => !picked.includes(h.key) && (briefHero(h.key)?.impact ?? 0) >= 3)
    .map((h) => ({ hero: h, pickrate: metaByKey(h.key)?.all.pickrate ?? 0 }))
    .filter((x) => x.pickrate > 0)
    .sort((a, c) => c.pickrate - a.pickrate)
    .slice(0, 4);

  return `
    <div class="section-head">
      <h2>Your heroes in ${esc(state.raw.patch)}</h2>
      <button class="expand-all" data-open-picker>Edit list</button>
    </div>

    ${mine.length
      ? `<div class="grid">${mine.map(heroCard).join('')}</div>`
      : `<div class="welcome done">None of your ${picked.length} heroes were touched this patch.
           Nothing to relearn.</div>`}

    ${untouched > 0 && mine.length
      ? `<p class="aside">${untouched} of your heroes ${untouched === 1 ? 'was' : 'were'} untouched this patch.</p>`
      : ''}

    ${facing.length ? `
      <div class="section-head">
        <h2>Most likely to show up against you</h2>
        <span class="hint">Changed heroes you don't play, by how often they're picked</span>
      </div>
      <div class="grid">${facing.map((x) => heroCard(x.hero)).join('')}</div>
      <p class="aside">Pick rates are from OpenDota public matches, shown on each card.</p>` : ''}
  `;
}

/** Full-screen hero chooser, built from the OpenDota roster so every hero is offered. */
function openHeroPicker() {
  const all = (state.meta?.heroes ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const changed = new Set(state.raw.heroes.map((h) => h.key));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-label="Pick your heroes">
      <div class="modal-head">
        <div>
          <h3>Which heroes do you play?</h3>
          <p>Pick as many as you like. Stored on this device only.</p>
        </div>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <input class="search" id="picker-search" type="search" placeholder="Search heroes…" autocomplete="off">
      <div class="picker-grid" id="picker-grid"></div>
      <div class="modal-foot">
        <span id="picker-count"></span>
        <button class="btn-primary" id="picker-done">Done</button>
      </div>
    </div>`;

  const paint = () => {
    const q = (overlay.querySelector('#picker-search').value || '').toLowerCase();
    const list = all.filter((h) => !q || h.name.toLowerCase().includes(q));
    overlay.querySelector('#picker-grid').innerHTML = list.map((h) => `
      <button class="picker-hero ${store.playsHero(h.key) ? 'on' : ''}" data-hero="${esc(h.key)}"
              title="${esc(h.name)}${changed.has(h.key) ? ' — changed this patch' : ''}">
        <img src="${esc(h.icon)}" alt="" loading="lazy">
        <span>${esc(h.name)}</span>
        ${changed.has(h.key) ? '<i class="dot" aria-hidden="true"></i>' : ''}
      </button>`).join('');
    const n = store.heroes.length;
    overlay.querySelector('#picker-count').textContent =
      n ? `${n} hero${n === 1 ? '' : 'es'} selected` : 'None selected yet';
  };

  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
    route();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.modal-close') || e.target.closest('#picker-done')) {
      trackEvent('heroes_picked', String(store.heroes.length));
      close();
      return;
    }
    const btn = e.target.closest('[data-hero]');
    if (btn) { store.toggleHero(btn.dataset.hero); paint(); }
  });
  overlay.querySelector('#picker-search').addEventListener('input', paint);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  paint();
  overlay.querySelector('#picker-search').focus();
}

/* ---------- signup placeholder ---------- */

const signupLive = () => Boolean(config.signup.endpoint);

/**
 * The signup, in two shapes. `compact` rides inside the "you're caught up"
 * banner — the one moment the need is actually felt — and the full card sits at
 * the foot of the brief for everyone else.
 */
function renderJoin({ compact = false } = {}) {
  if (!config.signup.enabled) return '';
  const joined = store.joined;

  if (joined) {
    if (compact) return '';
    return `<div class="join done">
      <h3>You're on the list</h3>
      <p>${signupLive()
        ? `Check your inbox — we've sent <strong>${esc(joined.email)}</strong> a confirmation link.`
        : `We'll use <strong>${esc(joined.email)}</strong> when the next patch is distilled.`}</p>
      ${signupLive() ? '' : `<p class="note">Heads up: there's no mailing list connected yet, so this
         is saved on your device and nothing has been sent anywhere.</p>`}
    </div>`;
  }

  const form = `
    <form class="join-form" novalidate>
      <input type="email" class="join-email" placeholder="you@example.com"
             aria-label="Email address" required>
      <button class="btn-primary" type="submit">Notify me</button>
    </form>`;

  const disclaimer = signupLive()
    ? `<p class="note">One email per patch. Unsubscribe in a click.</p>`
    : `<p class="note">Placeholder — no mailing list is connected yet, so your address stays on
         this device and isn't sent anywhere.</p>`;

  if (compact) {
    return `<div class="join-inline">
      <p>Want a nudge when the next one lands?</p>
      ${form}${disclaimer}
    </div>`;
  }

  return `<div class="join">
    <h3>Get the next patch distilled</h3>
    <p>One email when a patch lands, with the three things that actually matter. Nothing else.</p>
    ${form}${disclaimer}
  </div>`;
}

/**
 * One delegated listener for the whole app, bound once at boot.
 *
 * This used to live in attachBriefHandlers() and bind to `app` on every brief
 * render — which both stacked duplicate listeners and, worse, kept firing after
 * you navigated away, so a filter click on Heroes re-rendered the Brief on top
 * of you. Filters carry a data-scope so a click always reaches its own view.
 */
function attachAppHandlers() {
  // The form renders in two places, so listen once and let submit bubble.
  app.addEventListener('submit', (e) => {
    const form = e.target.closest('.join-form');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('.join-email');
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { input.focus(); return; }
    submitSignup(email);
    store.join(email);
    trackEvent('signup', form.closest('.join-inline') ? 'inline' : 'card');
    renderBrief();
  });

  app.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-filter]');
    if (filterBtn) {
      const { filter, scope } = filterBtn.dataset;
      trackEvent(`filter_${scope}`, filter);
      if (scope === 'brief') {
        state.themeFilter = filter;
        renderBrief();
        // The list below the filters just resized — park the row at the top so
        // you're looking at the result rather than wherever you were scrolled.
        app.querySelector('.filters')?.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -100);
      } else if (scope === 'heroes') {
        state.heroFilter = filter;
        renderHeroes();
      } else if (scope === 'items') {
        state.itemFilter = filter;
        renderItems();
      }
      return;
    }

    const dismiss = e.target.closest('[data-dismiss]');
    if (dismiss) { store.dismiss(dismiss.dataset.dismiss); route(); return; }

    if (e.target.closest('[data-open-picker]')) { openHeroPicker(); return; }

    const voteBtn = e.target.closest('[data-vote]');
    if (voteBtn) {
      const card = voteBtn.closest('details.headline');
      const id = card.dataset.theme;
      const result = store.vote(id, voteBtn.dataset.vote);
      trackEvent('vote', `${voteBtn.dataset.vote}:${id}`);
      card.querySelector('.vote').outerHTML = voteBlock(id, result);
      return;
    }

    const share = e.target.closest('[data-share]');
    if (share) {
      const url = `${location.origin}${location.pathname}#/theme/${share.dataset.share}`;
      navigator.clipboard?.writeText(url);
      share.textContent = 'Link copied';
      setTimeout(() => { share.textContent = 'Copy link'; }, 1600);
      trackEvent('share', share.dataset.share);
    }
  });
}

/* ---------- brief interactions ---------- */

function attachBriefHandlers() {
  const toggle = document.getElementById('expand-all');
  toggle?.addEventListener('click', () => {
    const cards = [...app.querySelectorAll('details.headline')];
    const expanding = cards.some((d) => !d.open);
    cards.forEach((d) => { d.open = expanding; if (expanding) markRead(d); });
    toggle.textContent = expanding ? 'Collapse all' : 'Expand all';
    trackEvent('expand_all', expanding ? 'open' : 'close');
  });

  // Opening a headline is the strongest signal that a write-up earned attention.
  app.querySelectorAll('details.headline').forEach((d) => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      markRead(d);
      trackEvent('headline_open', d.dataset.theme);
    });
  });

}

/**
 * Sends the address to whatever `config.signup.endpoint` points at.
 *
 * Providers like Buttondown accept a plain form POST but don't send CORS
 * headers, so the response is unreadable from here — `no-cors` still delivers
 * it. That's fine because the real confirmation is the double opt-in email the
 * provider sends; we just never claim more certainty than we have.
 */
async function submitSignup(email) {
  if (!signupLive()) return;
  const body = new FormData();
  body.append('email', email);
  try {
    await fetch(config.signup.endpoint, { method: 'POST', mode: 'no-cors', body });
  } catch {
    // Offline or blocked — the address is still stored locally, so nothing is lost
    // from the reader's point of view and they can try again.
  }
}

function markRead(details) {
  if (store.markRead(details.dataset.theme)) details.classList.remove('unread');
}

function voteBlock(id, current) {
  if (current) {
    return `<div class="vote voted">
      <span>${current === 'up' ? 'Glad it helped.' : 'Noted — that one needs work.'}</span>
      <button class="vote-btn" data-vote="${current}">Undo</button>
    </div>`;
  }
  return `<div class="vote">
    <span>Was this useful?</span>
    <button class="vote-btn" data-vote="up">Yes</button>
    <button class="vote-btn" data-vote="down">Not really</button>
  </div>`;
}

function renderHeadline(t) {
  const heroChips = (t.affects?.heroes ?? [])
    .map((k) => heroByKey(k))
    .filter(Boolean)
    .map((h) => `<a class="chip" href="#/hero/${esc(h.key)}">
        <img src="${esc(h.icon)}" alt="" loading="lazy">${esc(h.name)}</a>`);

  const itemChips = (t.affects?.items ?? [])
    .map((k) => itemByKey(k))
    .filter(Boolean)
    .map((i) => `<a class="chip item" href="#/item/${esc(i.key)}">
        <img src="${esc(i.icon)}" alt="" loading="lazy">${esc(i.name)}</a>`);

  const chips = [...heroChips, ...itemChips];

  return `
  <details class="headline ${t.severity === 'major' ? 'top' : ''} ${store.hasRead(t.id) ? '' : 'unread'}"
           id="theme-${esc(t.id)}" data-theme="${esc(t.id)}">
    <summary class="headline-row">
      <span class="rank">#${t.rank ?? '?'}</span>
      <h3>${esc(t.title)}</h3>
      <span class="row-stats">
        <span class="pill ${esc(t.severity ?? 'minor')}">${esc(t.severity ?? 'minor')}</span>
      </span>
      <span class="chev" aria-hidden="true">
        <svg viewBox="0 0 14 14"><path d="M3.5 5.25 L7 8.75 L10.5 5.25"
          fill="none" stroke="currentColor" stroke-width="1.9"
          stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      ${(t.bites ?? []).length ? `
        <span class="bites">
          ${t.bites.map((b, i) => `<span class="bite ${i === 0 ? esc(t.punch?.dir ?? '') : ''}">${esc(b)}</span>`).join('')}
        </span>` : ''}
    </summary>

    <div class="headline-top">
      ${(t.bites ?? []).length ? '' : `<p class="what">${rich(t.what)}</p>`}

      <div class="why-label">Why it matters</div>
      <p class="why">${rich(t.why)}</p>

      ${t.agreement ? `
        <div class="agreement ${esc(t.agreement.level)}">
          <b>${esc(AGREEMENT_LABEL[t.agreement.level] ?? t.agreement.level)}</b>
          <span>${esc(t.agreement.note)}</span>
        </div>` : ''}

      ${(t.do ?? []).length ? `
        <div class="do-list">
          <div class="why-label">What to do about it</div>
          <ul>${t.do.map((d) => `<li>${rich(d)}</li>`).join('')}</ul>
        </div>` : ''}

      ${t.watch ? `<p class="watch">${rich(t.watch)}</p>` : ''}

      ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
    </div>

    ${(t.changes ?? []).length ? `
      <details class="verbatim">
        <summary>Read the actual patch lines (${t.changes.length})</summary>
        <div class="body">
          ${t.changes.map((c) => `<div class="raw-line"><b>${esc(c.source)}</b>${esc(cleanText(c.text))}</div>`).join('')}
        </div>
      </details>` : ''}

    <div class="card-foot">
      ${voteBlock(t.id, store.voteFor(t.id))}
      <button class="link-btn" data-share="${esc(t.id)}">Copy link</button>
    </div>
  </details>`;
}

/* ---------- view: heroes ---------- */

function heroTeaser() {
  return `<div class="section-head"><h2>Changed heroes</h2></div>
    <div class="grid">${state.raw.heroes.slice(0, 6).map(heroCard).join('')}</div>`;
}

function heroCard(h) {
  const b = briefHero(h.key);
  const m = metaByKey(h.key);
  const verdict = b?.verdict ?? '';

  return `
  <a class="entity ${esc(verdict)} ${store.playsHero(h.key) ? 'mine' : ''}" href="#/hero/${esc(h.key)}">
    <img class="portrait" src="${esc(h.portrait ?? h.icon)}" alt="" loading="lazy">
    <div class="entity-body">
      <div class="entity-name">
        <strong>${esc(h.name)}</strong>
        ${store.playsHero(h.key) ? '<span class="yours" title="One of yours">◆</span>' : ''}
        ${verdictPill(verdict)}
        ${b?.impact ? impactDots(b.impact) : ''}
      </div>
      <p class="entity-summary">${rich(b?.summary ?? `${lineCount(h)} change${lineCount(h) === 1 ? '' : 's'} — not written up yet`)}</p>
      ${m ? `<div class="entity-stats">
        <span><b>${m.high.winrate ?? '–'}%</b> win</span>
        <span><b>${m.all.pickrate ?? '–'}%</b> picked</span>
      </div>` : ''}
    </div>
  </a>`;
}

function renderHeroes() {
  const order = { nerf: 0, buff: 1, mixed: 2, rework: 3, qol: 4, '': 5 };
  const q = state.heroSearch.toLowerCase();

  let list = state.raw.heroes.filter((h) => {
    const b = briefHero(h.key);
    if (state.heroFilter === 'mine') {
      if (!store.playsHero(h.key)) return false;
    } else if (state.heroFilter !== 'all' && (b?.verdict ?? '') !== state.heroFilter) {
      return false;
    }
    if (q && !h.name.toLowerCase().includes(q)) return false;
    return true;
  });

  list = list.sort((a, c) => {
    const ba = briefHero(a.key), bc = briefHero(c.key);
    const ia = ba?.impact ?? 0, ic = bc?.impact ?? 0;
    if (ic !== ia) return ic - ia;
    const oa = order[ba?.verdict ?? ''] ?? 5, oc = order[bc?.verdict ?? ''] ?? 5;
    if (oa !== oc) return oa - oc;
    return a.name.localeCompare(c.name);
  });

  const counts = verdictCounts(state.raw.heroes, briefHero);
  const mine = state.raw.heroes.filter((h) => store.playsHero(h.key)).length;

  const options = [
    { key: 'all', label: 'All', count: state.raw.heroes.length },
    // "Mine" only earns a slot once you've told us who you play.
    ...(mine ? [{ key: 'mine', cls: 'gold', label: '◆ Mine', count: mine, hint: 'Heroes you play' }] : []),
    ...VERDICT_ORDER.map((v) => ({
      key: v, label: VERDICT_LABEL[v], count: counts[v] ?? 0, hint: VERDICT_HINT[v],
    })),
  ];

  app.innerHTML = `
    <div class="section-head">
      <h2>Every hero that changed</h2>
      <span class="hint">Sorted by how much it matters</span>
    </div>

    <input class="search" id="hero-search" type="search" placeholder="Search heroes…"
           value="${esc(state.heroSearch)}" autocomplete="off">
    <div class="filters">${filterBar(options, state.heroFilter, 'heroes')}</div>

    ${list.length
      ? `<div class="grid">${list.map(heroCard).join('')}</div>`
      : '<div class="empty">No heroes match that.</div>'}
  `;

  const search = document.getElementById('hero-search');
  search.addEventListener('input', (e) => {
    state.heroSearch = e.target.value;
    renderHeroes();
    const s = document.getElementById('hero-search');
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  });
}

/* ---------- view: hero detail ---------- */

function renderHeroDetail(key) {
  const h = heroByKey(key);
  if (!h) { app.innerHTML = '<div class="empty">Hero not found.</div>'; return; }

  const b = briefHero(key);
  const m = metaByKey(key);

  const groups = [];
  if (realNotes(h.notes).length) {
    groups.push({ name: 'Base stats', icon: null, notes: realNotes(h.notes) });
  }
  for (const a of h.abilities ?? []) {
    if (realNotes(a.notes).length) groups.push({ name: a.name, icon: a.icon, notes: realNotes(a.notes) });
  }
  if ((h.talents ?? []).length) {
    groups.push({ name: 'Talents', icon: null, notes: h.talents.map((t) => ({ text: t.text, indent: 1 })) });
  }

  app.innerHTML = `
    <a class="back" href="#/heroes">← All heroes</a>

    <div class="detail-head">
      <img src="${esc(h.portrait ?? h.icon)}" alt="">
      <div>
        <h1>${esc(h.name)}</h1>
        <div class="badges">
          ${verdictPill(b?.verdict)}
          ${b?.impact ? impactDots(b.impact) : ''}
          ${h.belongs_to ? `<span class="tag">${esc(h.belongs_to)}'s unit</span>` : ''}
          ${m ? (m.roles ?? []).slice(0, 3).map((r) => `<span class="tag">${esc(r)}</span>`).join('') : ''}
        </div>
      </div>
    </div>

    ${m ? `
      <div class="statline">
        <div class="stat"><span>Win rate</span><b>${m.high.winrate ?? '–'}<small>%</small></b></div>
        <div class="stat"><span>Pick rate</span><b>${m.all.pickrate ?? '–'}<small>%</small></b></div>
        <div class="stat"><span>All brackets</span><b>${m.all.winrate ?? '–'}<small>%</small></b></div>
        <div class="stat"><span>Pro picks</span><b>${m.pro.picks ?? 0}</b></div>
      </div>` : ''}

    ${b ? `
      <div class="block lead">
        <h4>The short version</h4>
        <p>${rich(b.summary)}</p>
      </div>
      <div class="block">
        <h4>Why it matters</h4>
        <p>${rich(b.why)}</p>
      </div>` : `
      <div class="callout">
        This hero's changes haven't been written up yet — the official lines are below, unedited.
      </div>`}

    ${(b?.play?.length || b?.counter?.length) ? `
      <div class="advice">
        ${b.play?.length ? `<div class="play"><h4>If you play them</h4>
          <ul>${b.play.map((p) => `<li>${rich(p)}</li>`).join('')}</ul></div>` : ''}
        ${b.counter?.length ? `<div class="counter"><h4>If you're against them</h4>
          <ul>${b.counter.map((p) => `<li>${rich(p)}</li>`).join('')}</ul></div>` : ''}
      </div>` : ''}

    <div class="section-head"><h2>The actual changes</h2></div>
    ${groups.map((g) => `
      <div class="ability-group">
        <div class="head">
          ${g.icon ? `<img src="${esc(g.icon)}" alt="" loading="lazy">` : ''}
          <strong>${esc(g.name)}</strong>
        </div>
        <ul>${g.notes.map((n) => `<li class="${n.indent > 1 ? 'indent' : ''}">${esc(cleanText(n.text))}</li>`).join('')}</ul>
      </div>`).join('')}

    ${m ? `<p class="footer-note" style="font-size:12px;color:var(--text-faint);margin-top:14px">
      Win rate shown is Ancient bracket and above, where changes get exploited first.
      Pick rate is across all brackets. ${esc(state.meta.note ?? '')}</p>` : ''}
  `;
}

/* ---------- view: items ---------- */

function itemCard(i, isNeutral) {
  const b = briefItem(i.key);
  const verdict = b?.verdict ?? '';
  return `
  <a class="entity ${esc(verdict)}" href="#/item/${esc(i.key)}">
    <img class="itemimg" src="${esc(i.icon)}" alt="" loading="lazy">
    <div class="entity-body">
      <div class="entity-name">
        <strong>${esc(i.name)}</strong>
        ${verdictPill(verdict)}
        ${b?.impact ? impactDots(b.impact) : ''}
      </div>
      <p class="entity-summary">${rich(b?.summary ?? `${realNotes(i.notes).length} change(s) — not written up yet`)}</p>
      ${isNeutral && i.neutral_tier > 0 ? `<div class="entity-stats"><span>Tier ${i.neutral_tier}</span></div>` : ''}
    </div>
  </a>`;
}

function renderItems() {
  const q = state.itemSearch.toLowerCase();
  const all = [...state.raw.items, ...state.raw.neutral_items];
  const match = (i) => {
    if (q && !i.name.toLowerCase().includes(q)) return false;
    if (state.itemFilter !== 'all' && (briefItem(i.key)?.verdict ?? '') !== state.itemFilter) return false;
    return true;
  };

  const sortByImpact = (a, c) =>
    (briefItem(c.key)?.impact ?? 0) - (briefItem(a.key)?.impact ?? 0)
    || a.name.localeCompare(c.name);

  const items = state.raw.items.filter(match).sort(sortByImpact);
  const neutrals = state.raw.neutral_items.filter(match).sort(sortByImpact);

  const counts = verdictCounts(all, briefItem);
  const options = [
    { key: 'all', label: 'All', count: all.length },
    ...VERDICT_ORDER.map((v) => ({
      key: v, label: VERDICT_LABEL[v], count: counts[v] ?? 0, hint: VERDICT_HINT[v],
    })),
  ];

  app.innerHTML = `
    <div class="section-head">
      <h2>Every item that changed</h2>
      <span class="hint">Sorted by how much it matters</span>
    </div>

    <input class="search" id="item-search" type="search" placeholder="Search items…"
           value="${esc(state.itemSearch)}" autocomplete="off">
    <div class="filters">${filterBar(options, state.itemFilter, 'items')}</div>

    ${items.length ? `<div class="grid">${items.map((i) => itemCard(i, false)).join('')}</div>` : ''}

    ${neutrals.length ? `
      <div class="section-head">
        <h2>Neutral items &amp; enchantments</h2>
        ${state.raw.neutral_headings?.length
          ? `<span class="hint">${esc(state.raw.neutral_headings.join(' · '))}</span>` : ''}
      </div>
      <div class="grid">${neutrals.map((i) => itemCard(i, true)).join('')}</div>` : ''}

    ${!items.length && !neutrals.length ? '<div class="empty">No items match that.</div>' : ''}
  `;

  const search = document.getElementById('item-search');
  search.addEventListener('input', (e) => {
    state.itemSearch = e.target.value;
    renderItems();
    const s = document.getElementById('item-search');
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  });
}

/* ---------- view: item detail ---------- */

function renderItemDetail(key) {
  const i = itemByKey(key);
  if (!i) { app.innerHTML = '<div class="empty">Item not found.</div>'; return; }
  const b = briefItem(key);

  app.innerHTML = `
    <a class="back" href="#/items">← All items</a>

    <div class="detail-head">
      <img class="item" src="${esc(i.icon)}" alt="">
      <div>
        <h1>${esc(i.name)}</h1>
        <div class="badges">
          ${verdictPill(b?.verdict)}
          ${b?.impact ? impactDots(b.impact) : ''}
          ${i.neutral_tier > 0 ? `<span class="tag">Neutral tier ${i.neutral_tier}</span>` : ''}
        </div>
      </div>
    </div>

    ${b ? `
      <div class="block lead">
        <h4>The short version</h4>
        <p>${rich(b.summary)}</p>
      </div>
      <div class="block">
        <h4>Why it matters</h4>
        <p>${rich(b.why)}</p>
      </div>
      ${b.who ? `<div class="block"><h4>Who this hits</h4><p>${rich(b.who)}</p></div>` : ''}
    ` : `<div class="callout">This item hasn't been written up yet — official lines below.</div>`}

    <div class="section-head"><h2>The actual changes</h2></div>
    <div class="ability-group">
      <ul>${realNotes(i.notes).map((n) =>
        `<li class="${n.indent > 1 ? 'indent' : ''}">${esc(cleanText(n.text))}</li>`).join('')}</ul>
    </div>
  `;
}

/* ---------- view: full notes ---------- */

function renderNotes() {
  const r = state.raw;

  const group = (title, body) => `<div class="notes-group"><h3>${esc(title)}</h3>${body}</div>`;
  const noteList = (notes) =>
    `<ul>${realNotes(notes).map((n) =>
      `<li class="${n.indent > 1 ? 'indent' : ''}">${esc(cleanText(n.text))}</li>`).join('')}</ul>`;

  app.innerHTML = `
    <div class="section-head">
      <h2>Patch ${esc(r.patch)} in full</h2>
      <span class="hint">Verbatim, nothing added</span>
    </div>

    <div class="callout">
      This is the official text exactly as Valve published it, with hero, item and ability
      ids resolved to names. <a href="${esc(r.source)}" target="_blank" rel="noopener"
      style="color:var(--accent-soft)">Read it on dota2.com →</a>
    </div>

    ${r.general?.length ? group('General', r.general.map((g) => `
      <div class="ability-group">
        <div class="head"><strong>${esc(g.title)}</strong></div>
        ${noteList(g.notes)}
      </div>`).join('')) : ''}

    ${group(`Items (${r.items.length})`, r.items.map((i) => `
      <div class="ability-group">
        <div class="head">
          <img src="${esc(i.icon)}" alt="" loading="lazy" style="width:34px;height:26px;border-radius:3px">
          <strong>${esc(i.name)}</strong>
        </div>
        ${noteList(i.notes)}
      </div>`).join(''))}

    ${r.neutral_items.length ? group(`Neutral items (${r.neutral_items.length})`,
      r.neutral_items.map((i) => `
      <div class="ability-group">
        <div class="head">
          <img src="${esc(i.icon)}" alt="" loading="lazy" style="width:34px;height:26px;border-radius:3px">
          <strong>${esc(i.name)}</strong>
        </div>
        ${noteList(i.notes)}
      </div>`).join('')) : ''}

    ${group(`Heroes (${r.heroes.length})`, r.heroes.map((h) => `
      <div class="ability-group">
        <div class="head">
          <img src="${esc(h.icon)}" alt="" loading="lazy">
          <strong><a href="#/hero/${esc(h.key)}">${esc(h.name)}</a></strong>
        </div>
        ${realNotes(h.notes).length ? noteList(h.notes) : ''}
        ${(h.abilities ?? []).filter((a) => realNotes(a.notes).length).map((a) => `
          <div style="margin-top:9px">
            <strong style="font-size:13px;color:var(--text-dim)">${esc(a.name)}</strong>
            ${noteList(a.notes)}
          </div>`).join('')}
        ${(h.talents ?? []).length ? `
          <div style="margin-top:9px">
            <strong style="font-size:13px;color:var(--text-dim)">Talents</strong>
            <ul>${h.talents.map((t) => `<li>${esc(cleanText(t.text))}</li>`).join('')}</ul>
          </div>` : ''}
      </div>`).join(''))}
  `;
}

/* ---------- keyboard ---------- */

function attachShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const overlay = document.querySelector('.modal-overlay');
    if (e.key === 'Escape' && overlay) {
      overlay.remove();
      document.body.style.overflow = '';
      route();
      return;
    }

    // Never hijack a key while someone is typing into a field.
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    if (typing) return;

    if (e.key === '/') {
      const search = document.querySelector('.search');
      if (search) { e.preventDefault(); search.focus(); search.select(); }
    } else if (e.key === 'e') {
      document.getElementById('expand-all')?.click();
    } else if (e.key === 'h') {
      openHeroPicker();
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      const tab = document.querySelectorAll('.tabs a')[Number(e.key) - 1];
      if (tab) location.hash = tab.getAttribute('href');
    }
  });
}

/* ---------- PWA ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

boot();
