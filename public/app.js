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
  itemSearch: '',
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

const verdictPill = (v) => v ? `<span class="verdict ${esc(v)}">${esc(v)}</span>` : '';

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
    if (brief?.written_at) notes.push(`Analysis written ${fmtDate(brief.written_at)}.`);
    document.getElementById('footer-note').textContent = notes.join(' ');

    const heroesBtn = document.getElementById('my-heroes');
    heroesBtn.classList.toggle('on', store.heroes.length > 0);
    heroesBtn.addEventListener('click', openHeroPicker);

    window.addEventListener('hashchange', route);
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
  const themes = (b.themes ?? []).slice().sort((a, c) => (a.rank ?? 99) - (c.rank ?? 99));
  const unread = themes.filter((t) => !store.hasRead(t.id)).length;

  app.innerHTML = `
    ${renderWelcome(unread, themes.length)}

    ${renderGlance(v, themes.length)}

    ${renderForYou()}

    <div class="section-head">
      <h2>If you read nothing else</h2>
      <div class="head-actions">
        ${unread > 0 && unread < themes.length
          ? `<span class="progress">${themes.length - unread}/${themes.length} read</span>` : ''}
        <button class="expand-all" id="expand-all">Expand all</button>
      </div>
    </div>

    ${themes.filter((t) => (t.rank ?? 99) <= 3).map(renderHeadline).join('')}

    <div class="section-head">
      <h2>Worth knowing</h2>
      <span class="hint">${themes.length - 3} more, ranked</span>
    </div>

    ${themes.filter((t) => (t.rank ?? 99) > 3).map(renderHeadline).join('')}


    ${renderJoin()}
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
          <b>${esc(b.patch)}</b>
          <span>${esc(fmtDate(b.released))} · ${esc(daysAgo(b.released))}</span>
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
    return `<div class="welcome done">
      You're all caught up on ${esc(state.raw.patch)}. Nothing new until the next patch.
    </div>`;
  }
  return '';
}

/* ---------- your heroes ---------- */

/**
 * The whole point of picking heroes: 57 changed heroes becomes the handful you
 * actually play, plus a short warning list for the ones you'll be up against.
 */
function renderForYou() {
  const picked = store.heroes;

  if (!picked.length) {
    if (store.isDismissed('hero-prompt')) return '';
    return `
      <div class="setup-prompt" id="hero-prompt">
        <button class="dismiss" data-dismiss="hero-prompt" aria-label="Dismiss">×</button>
        <h3>Make this about your games</h3>
        <p>Pick the heroes you actually play and this page will lead with what changed for
           you — and flag the ones you'll be facing.</p>
        <button class="btn-primary" data-open-picker>Pick my heroes</button>
      </div>`;
  }

  const mine = state.raw.heroes
    .filter((h) => picked.includes(h.key))
    .sort((a, c) => (briefHero(c.key)?.impact ?? 0) - (briefHero(a.key)?.impact ?? 0));

  const untouched = picked.length - mine.length;

  // Heroes you don't play that got a big change — you'll meet these in games.
  const facing = state.raw.heroes
    .filter((h) => !picked.includes(h.key) && (briefHero(h.key)?.impact ?? 0) >= 4)
    .sort((a, c) => (briefHero(c.key)?.impact ?? 0) - (briefHero(a.key)?.impact ?? 0))
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
        <h2>You'll be facing</h2>
        <span class="hint">Big changes on heroes you don't play</span>
      </div>
      <div class="grid">${facing.map(heroCard).join('')}</div>` : ''}
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

function renderJoin() {
  if (!config.signup.enabled) return '';
  const joined = store.joined;

  if (joined) {
    return `<div class="join done">
      <h3>You're on the list</h3>
      <p>We'll use <strong>${esc(joined.email)}</strong> when the next patch is distilled.</p>
      <p class="note">Heads up: there's no mailing list connected yet, so this is saved on your
         device and nothing has been sent anywhere.</p>
    </div>`;
  }

  return `<div class="join">
    <h3>Get the next patch distilled</h3>
    <p>One email when a patch lands, with the three things that actually matter. Nothing else.</p>
    <form id="join-form" novalidate>
      <input type="email" id="join-email" placeholder="you@example.com" aria-label="Email address" required>
      <button class="btn-primary" type="submit">Notify me</button>
    </form>
    <p class="note">Placeholder — no mailing list is connected yet, so your address stays on
       this device and isn't sent anywhere.</p>
  </div>`;
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

  app.addEventListener('click', (e) => {
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

  document.getElementById('join-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('join-email');
    if (!input.value.includes('@')) { input.focus(); return; }
    store.join(input.value.trim());
    trackEvent('signup');
    route();
  });
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
  <details class="headline ${(t.rank ?? 99) <= 3 ? 'top' : ''} ${store.hasRead(t.id) ? '' : 'unread'}"
           id="theme-${esc(t.id)}" data-theme="${esc(t.id)}">
    <summary class="headline-row">
      <span class="rank">#${t.rank ?? '?'}</span>
      <h3>${esc(t.title)}</h3>
      <span class="row-stats">
        ${t.punch ? `<span class="punch ${esc(t.punch.dir)}">${esc(t.punch.stat)}</span>` : ''}
        <span class="pill ${esc(t.severity ?? 'minor')}">${esc(t.severity ?? 'minor')}</span>
      </span>
      <span class="chev" aria-hidden="true">▸</span>
    </summary>

    <div class="headline-top">
      <p class="what">${rich(t.what)}</p>

      <div class="why-label">Why it matters</div>
      <p class="why">${rich(t.why)}</p>

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
    <img class="portrait" src="${esc(h.icon)}" alt="" loading="lazy">
    <div class="entity-body">
      <div class="entity-name">
        <strong>${esc(h.name)}</strong>
        ${store.playsHero(h.key) ? '<span class="yours" title="One of yours">★</span>' : ''}
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

  const counts = { all: state.raw.heroes.length };
  for (const h of state.raw.heroes) {
    const v = briefHero(h.key)?.verdict ?? 'unwritten';
    counts[v] = (counts[v] ?? 0) + 1;
  }
  counts.mine = state.raw.heroes.filter((h) => store.playsHero(h.key)).length;

  // "Mine" only earns a slot once you've told us who you play.
  const filters = ['all', ...(store.heroes.length ? ['mine'] : []), 'nerf', 'buff', 'mixed', 'qol'];

  app.innerHTML = `
    <div class="section-head">
      <h2>Every hero that changed</h2>
      <span class="hint">Sorted by how much it matters</span>
    </div>

    <div class="filters">
      <input class="search" id="hero-search" type="search" placeholder="Search heroes…"
             value="${esc(state.heroSearch)}" autocomplete="off">
      ${filters.map((f) => `
        <button class="filter-btn ${state.heroFilter === f ? 'active' : ''} ${f === 'mine' ? 'gold' : ''}" data-filter="${f}">
          ${f === 'all' ? 'All' : f === 'mine' ? '★ Mine' : f[0].toUpperCase() + f.slice(1)}${counts[f] ? ` ${counts[f]}` : ''}
        </button>`).join('')}
    </div>

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
  app.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.heroFilter = btn.dataset.filter;
      renderHeroes();
    });
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
      <img src="${esc(h.icon)}" alt="">
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
  const match = (i) => !q || i.name.toLowerCase().includes(q);

  const sortByImpact = (a, c) =>
    (briefItem(c.key)?.impact ?? 0) - (briefItem(a.key)?.impact ?? 0)
    || a.name.localeCompare(c.name);

  const items = state.raw.items.filter(match).sort(sortByImpact);
  const neutrals = state.raw.neutral_items.filter(match).sort(sortByImpact);

  app.innerHTML = `
    <div class="section-head">
      <h2>Every item that changed</h2>
      <span class="hint">Sorted by how much it matters</span>
    </div>

    <div class="filters">
      <input class="search" id="item-search" type="search" placeholder="Search items…"
             value="${esc(state.itemSearch)}" autocomplete="off">
    </div>

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
