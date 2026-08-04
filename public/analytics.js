/* A thin, provider-agnostic wrapper so the app can answer "what actually gets
   read?" without the rest of the code knowing or caring who's counting.

   While config.analytics.provider is 'none' this makes no network requests at
   all — it just logs to the console on localhost so you can see the events. */

import { config } from './config.js';

const { provider, site } = config.analytics;
const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const enabled = provider !== 'none' && Boolean(site) && !isLocal;

let scriptLoaded = false;
/* The provider script is async, but the first pageview fires the moment the app
   routes — well before it arrives. Without this buffer every visitor's landing
   view would be dropped, which is the one number you least want to lose.
   Capped so a blocked script can't grow it without bound. */
let pending = [];
const MAX_PENDING = 40;

function loadScript(src, attrs = {}) {
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  s.addEventListener('load', () => {
    scriptLoaded = true;
    const queued = pending;
    pending = [];
    for (const hit of queued) send(hit);
  });
  document.head.appendChild(s);
}

/** Hand one hit to whichever provider is configured, or hold it until we can. */
function send(hit) {
  if (!scriptLoaded) {
    if (pending.length < MAX_PENDING) pending.push(hit);
    return;
  }
  if (provider === 'goatcounter') {
    window.goatcounter?.count?.(hit);
  } else if (provider === 'plausible') {
    if (hit.event) window.plausible?.(hit.title, { props: { detail: hit.path } });
    else window.plausible?.('pageview', { u: location.origin + hit.path });
  }
  // Cloudflare Web Analytics counts views itself and has no manual API.
}

export function initAnalytics() {
  if (!enabled) return;

  if (provider === 'goatcounter') {
    // no_onload stops it counting the initial load itself; we send views per route.
    window.goatcounter = { no_onload: true };
    loadScript('https://gc.zgo.at/count.js', {
      'data-goatcounter': `https://${site}.goatcounter.com/count`,
    });
  } else if (provider === 'cloudflare') {
    scriptLoaded = true; // nothing is ever queued for Cloudflare
    loadScript('https://static.cloudflareinsights.com/beacon.min.js', {
      'data-cf-beacon': JSON.stringify({ token: site }),
    });
  } else if (provider === 'plausible') {
    loadScript('https://plausible.io/js/script.manual.js', { 'data-domain': site });
  }
}

/** A page/route view. Called on every hash change. */
export function trackView(path, title) {
  if (!enabled) {
    if (isLocal) console.debug('[analytics] view', path);
    return;
  }
  send({ path, title, event: false });
}

/**
 * A thing someone did — expanding a headline, voting, picking heroes.
 * This is the data that answers "which of my write-ups are worth writing".
 */
export function trackEvent(name, detail = '') {
  if (!enabled) {
    if (isLocal) console.debug('[analytics] event', detail ? `${name}:${detail}` : name);
    return;
  }
  send({ path: detail ? `${name}:${detail}` : name, title: name, event: true });
}
