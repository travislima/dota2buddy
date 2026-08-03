/* A thin, provider-agnostic wrapper so the app can answer "what actually gets
   read?" without the rest of the code knowing or caring who's counting.

   While config.analytics.provider is 'none' this makes no network requests at
   all — it just logs to the console on localhost so you can see the events. */

import { config } from './config.js';

const { provider, site } = config.analytics;
const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);

let ready = false;

function loadScript(src, attrs = {}) {
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.dataset.noSw = 'true';
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
  return s;
}

export function initAnalytics() {
  if (ready || provider === 'none' || !site) return;
  if (isLocal) return; // don't pollute your own stats while developing

  if (provider === 'goatcounter') {
    window.goatcounter = { no_onload: true };
    loadScript('https://gc.zgo.at/count.js', { 'data-goatcounter': `https://${site}.goatcounter.com/count` });
  } else if (provider === 'cloudflare') {
    loadScript('https://static.cloudflareinsights.com/beacon.min.js',
      { 'data-cf-beacon': JSON.stringify({ token: site }) });
  } else if (provider === 'plausible') {
    loadScript('https://plausible.io/js/script.manual.js', { 'data-domain': site });
    window.plausible = window.plausible || function (...a) { (window.plausible.q ||= []).push(a); };
  }
  ready = true;
}

/** A page/route view. Called on every hash change. */
export function trackView(path, title) {
  if (provider === 'none' || !site) {
    if (isLocal) console.debug('[analytics] view', path);
    return;
  }
  if (provider === 'goatcounter') window.goatcounter?.count?.({ path, title, event: false });
  else if (provider === 'plausible') window.plausible?.('pageview', { u: location.origin + path });
  // Cloudflare counts views automatically and has no manual API.
}

/**
 * A thing someone did — expanding a headline, voting, picking heroes.
 * This is the data that answers "which of my write-ups are worth writing".
 */
export function trackEvent(name, detail = '') {
  const path = detail ? `${name}:${detail}` : name;
  if (provider === 'none' || !site) {
    if (isLocal) console.debug('[analytics] event', path);
    return;
  }
  if (provider === 'goatcounter') window.goatcounter?.count?.({ path, title: name, event: true });
  else if (provider === 'plausible') window.plausible?.(name, { props: { detail } });
  // Cloudflare Web Analytics doesn't support custom events.
}
