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
   * Who writes the analysis is always stated on the Method page — that page
   * exists to answer exactly this, and the repo is public anyway.
   *
   * This flag only controls whether it *also* appears on the Brief's glance
   * panel, which is prime real estate. Off means it's honest but not shouted.
   * The wording lives in the brief's `method` field.
   */
  provenance: {
    showOnBrief: false,
  },

  /**
   * The "get notified" form.
   *
   * While `endpoint` is null the form saves to the visitor's own device and says
   * so plainly — it never implies an email was sent. Set the endpoint and the
   * copy switches to the real promise ("one email per patch, unsubscribe in a
   * click") and addresses are POSTed to your provider.
   *
   * Buttondown:  https://buttondown.com/api/emails/embed-subscribe/YOUR_USERNAME
   * Kit:         https://app.kit.com/forms/YOUR_FORM_ID/subscriptions
   *
   * Use a provider with a real unsubscribe link rather than a form-to-inbox
   * service — that part is an obligation, not a nice-to-have.
   */
  signup: {
    enabled: true,
    endpoint: 'https://buttondown.com/api/emails/embed-subscribe/dota2buddy',
  },
};
