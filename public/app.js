/* Dota Buddy — joins the raw patch, the written brief, live meta stats and
   community chatter into one browsable thing. No build step, no framework. */

const state = {
  patches: null,
  raw: null,
  brief: null,
  meta: null,
  community: null,
  heroFilter: 'all',
  heroSearch: '',
  itemSearch: '',
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

    const [raw, meta, community, brief] = await Promise.all([
      json(`data/raw/${v}.json`),
      json('data/meta.json').catch(() => null),
      json('data/community.json').catch(() => null),
      json(`data/briefs/${v}.json`).catch(() => null),
    ]);

    state.raw = raw;
    state.meta = meta;
    state.community = community;
    state.brief = brief;

    document.getElementById('patch-chip').innerHTML =
      `<b>${esc(raw.patch)}</b><span>${esc(daysAgo(raw.released))}</span>`;

    const notes = [];
    if (meta?.fetched_at) notes.push(`Meta stats updated ${daysAgo(meta.fetched_at)}.`);
    if (brief?.written_at) notes.push(`Analysis written ${fmtDate(brief.written_at)}.`);
    document.getElementById('footer-note').textContent = notes.join(' ');

    window.addEventListener('hashchange', route);
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
    case 'community': renderCommunity(); break;
    default: renderBrief();
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

  app.innerHTML = `
    <section class="tldr">
      <div class="eyebrow">Patch ${esc(b.patch)} · released ${esc(fmtDate(b.released))}</div>
      <p>${rich(b.tldr)}</p>
      ${v.shape || v.biggest_loser ? `
        <div class="verdict-grid">
          ${v.shape ? `<div><span>The shape of it</span><p>${rich(v.shape)}</p></div>` : ''}
          ${v.biggest_loser ? `<div><span>Biggest loser</span><p>${rich(v.biggest_loser)}</p></div>` : ''}
          ${v.biggest_winner ? `<div><span>Biggest winner</span><p>${rich(v.biggest_winner)}</p></div>` : ''}
        </div>` : ''}
    </section>

    <div class="section-head">
      <h2>If you read nothing else</h2>
      <button class="expand-all" id="expand-all">Expand all</button>
    </div>

    ${themes.filter((t) => (t.rank ?? 99) <= 3).map(renderHeadline).join('')}

    <div class="section-head">
      <h2>Worth knowing</h2>
      <span class="hint">${themes.length - 3} more, ranked</span>
    </div>

    ${themes.filter((t) => (t.rank ?? 99) > 3).map(renderHeadline).join('')}

    <div class="section-head">
      <h2>Everything else</h2>
    </div>
    <div class="grid">
      ${quickLink('#/heroes', 'Heroes', `${state.raw.heroes.length} changed — see what each one means for you`)}
      ${quickLink('#/items', 'Items', `${state.raw.items.length + state.raw.neutral_items.length} changed, including neutrals`)}
      ${quickLink('#/notes', 'Full notes', 'The official changes, verbatim, nothing added')}
      ${quickLink('#/community', 'Community', 'What r/DotA2 is talking about right now')}
    </div>
  `;

  const toggle = document.getElementById('expand-all');
  toggle.addEventListener('click', () => {
    const cards = [...app.querySelectorAll('details.headline')];
    const expanding = cards.some((d) => !d.open);
    cards.forEach((d) => { d.open = expanding; });
    toggle.textContent = expanding ? 'Collapse all' : 'Expand all';
  });
}

const quickLink = (href, title, sub) => `
  <a class="entity" href="${href}">
    <div class="entity-body">
      <div class="entity-name"><strong>${esc(title)}</strong></div>
      <p class="entity-summary">${esc(sub)}</p>
    </div>
  </a>`;

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
  <details class="headline ${(t.rank ?? 99) <= 3 ? 'top' : ''}">
    <summary class="headline-row">
      <span class="rank">#${t.rank ?? '?'}</span>
      <div class="headline-row-text">
        <h3>${esc(t.title)}</h3>
        <p class="what">${rich(t.what)}</p>
      </div>
      <span class="pill ${esc(t.severity ?? 'minor')}">${esc(t.severity ?? 'minor')}</span>
      <span class="chev" aria-hidden="true">▸</span>
    </summary>

    <div class="headline-top">
      <div class="headline-meta">
        ${(t.tags ?? []).map((g) => `<span class="tag">${esc(g)}</span>`).join('')}
      </div>

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
  <a class="entity ${esc(verdict)}" href="#/hero/${esc(h.key)}">
    <img class="portrait" src="${esc(h.icon)}" alt="" loading="lazy">
    <div class="entity-body">
      <div class="entity-name">
        <strong>${esc(h.name)}</strong>
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
    if (state.heroFilter !== 'all' && (b?.verdict ?? '') !== state.heroFilter) return false;
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

  app.innerHTML = `
    <div class="section-head">
      <h2>Every hero that changed</h2>
      <span class="hint">Sorted by how much it matters</span>
    </div>

    <div class="filters">
      <input class="search" id="hero-search" type="search" placeholder="Search heroes…"
             value="${esc(state.heroSearch)}" autocomplete="off">
      ${['all', 'nerf', 'buff', 'mixed', 'qol'].map((f) => `
        <button class="filter-btn ${state.heroFilter === f ? 'active' : ''}" data-filter="${f}">
          ${f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}${counts[f] ? ` ${counts[f]}` : ''}
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

/* ---------- view: community ---------- */

function renderCommunity() {
  const c = state.community;
  if (!c) {
    app.innerHTML = '<div class="empty">No community data. Run <code>npm run community</code>.</div>';
    return;
  }

  const sections = c.sections.filter((s) => s.posts.length);

  app.innerHTML = `
    <div class="section-head">
      <h2>What people are talking about</h2>
      <span class="hint">Updated ${esc(daysAgo(c.fetched_at))}</span>
    </div>

    <div class="callout">
      Straight from Reddit, unfiltered and unranked by us — useful for spotting what the
      community has noticed that a patch note doesn't tell you.
    </div>

    ${sections.length ? sections.map((s) => `
      <div class="section-head"><h2>${esc(s.label)}</h2></div>
      ${s.posts.map((p) => `
        <a class="post" href="${esc(p.url)}" target="_blank" rel="noopener">
          <div class="title">${esc(p.title)}</div>
          <div class="meta">
            ${p.author ? `<span>${esc(p.author)}</span>` : ''}
            ${p.posted ? `<span>${esc(daysAgo(p.posted))}</span>` : ''}
          </div>
        </a>`).join('')}
    `).join('') : '<div class="empty">Reddit didn\'t return anything this time. Try again later.</div>'}
  `;
}

/* ---------- PWA ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

boot();
