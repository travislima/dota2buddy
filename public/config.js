/* Site configuration. The only file you need to touch to turn things on. */

export const config = {
  /**
   * Analytics. Nothing third-party loads while provider is 'none' — no script,
   * no request, no cookie. Pick one and drop your site id in to switch it on.
   *
   *   'goatcounter'  — free for personal use, cookieless, and the only option
   *                    here that records custom events, so you can see *which*
   *                    headlines people open and vote on. site: 'yourcode'
   *                    (the bit before .goatcounter.com). Sign up at
   *                    https://www.goatcounter.com
   *
   *   'cloudflare'   — free, cookieless, pageviews only (no custom events).
   *                    site: your token from the Web Analytics dashboard.
   *
   *   'plausible'    — paid, cookieless, supports custom events.
   *                    site: your domain, e.g. 'travislima.github.io'
   *
   * All three are cookieless, so no consent banner is required. Google
   * Analytics would need one, which is why it isn't the default here.
   */
  analytics: {
    provider: 'goatcounter',
    site: 'dota2buddy',
  },

  /**
   * The "get notified" card. There's no mailing list wired up yet, so the form
   * only saves to the visitor's own device and says so plainly. Point this at a
   * real endpoint (Buttondown, ConvertKit, a Google Form) when you have one.
   */
  signup: {
    enabled: true,
    endpoint: null,
  },
};
