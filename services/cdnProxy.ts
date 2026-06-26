// Rewrites Coachio Bunny CDN URLs so they go through a domain that
// Vietnamese ISPs (FPT, Viettel...) do not block.
//
// Default: cdn.coachio.ai — the existing custom hostname on the same Bunny
// pull zone (`coachio-prod`). Override via VITE_CDN_PROXY_BASE if you point
// another subdomain (e.g. cdn-banner.lovinbot.com) at that pull zone later.

const BUNNY_DEFAULT_HOST = 'https://coachio-prod.b-cdn.net';

const RAW_PROXY_BASE = (import.meta.env.VITE_CDN_PROXY_BASE as string | undefined) || 'https://cdn.coachio.ai';
const PROXY_BASE = RAW_PROXY_BASE.replace(/\/+$/, '');

export function proxiedBannerUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith(BUNNY_DEFAULT_HOST)) {
    return PROXY_BASE + url.slice(BUNNY_DEFAULT_HOST.length);
  }
  return url;
}
