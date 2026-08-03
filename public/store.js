/* Everything the app remembers about you, kept on your own device.
   No account, no server, no cookies — one localStorage key. */

const KEY = 'dotabuddy:v1';

const DEFAULTS = {
  heroes: [],        // hero keys you play
  votes: {},         // themeId -> 'up' | 'down'
  read: {},          // themeId -> true
  lastVisit: null,   // ISO of the visit before this one
  lastPatch: null,   // patch you last saw
  joined: null,      // placeholder signup
  dismissed: {},     // one-off prompts you've closed
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let data = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private browsing or a full quota — the app works fine without persistence.
  }
}

export const store = {
  get heroes() { return data.heroes; },
  playsHero(key) { return data.heroes.includes(key); },
  toggleHero(key) {
    data.heroes = this.playsHero(key)
      ? data.heroes.filter((h) => h !== key)
      : [...data.heroes, key];
    save();
    return this.playsHero(key);
  },
  clearHeroes() { data.heroes = []; save(); },

  voteFor(themeId) { return data.votes[themeId] ?? null; },
  vote(themeId, direction) {
    if (data.votes[themeId] === direction) delete data.votes[themeId];
    else data.votes[themeId] = direction;
    save();
    return data.votes[themeId] ?? null;
  },
  get voteCounts() {
    const v = Object.values(data.votes);
    return { up: v.filter((x) => x === 'up').length, down: v.filter((x) => x === 'down').length };
  },

  hasRead(themeId) { return Boolean(data.read[themeId]); },
  markRead(themeId) {
    if (data.read[themeId]) return false;
    data.read[themeId] = true;
    save();
    return true;
  },
  get readCount() { return Object.keys(data.read).length; },

  /** Reading progress is per-patch, so a new patch starts fresh. */
  startPatch(patch) {
    const previous = data.lastPatch;
    if (previous !== patch) {
      data.read = {};
      data.votes = {};
      data.lastPatch = patch;
      save();
    }
    return { isNewPatch: Boolean(previous) && previous !== patch, previousPatch: previous };
  },

  /** Returns the *previous* visit, then records this one. */
  touchVisit() {
    const previous = data.lastVisit;
    data.lastVisit = new Date().toISOString();
    save();
    return previous;
  },

  get joined() { return data.joined; },
  join(email) { data.joined = { email, at: new Date().toISOString() }; save(); },

  isDismissed(id) { return Boolean(data.dismissed[id]); },
  dismiss(id) { data.dismissed[id] = true; save(); },

  reset() { data = { ...DEFAULTS }; save(); },
};
