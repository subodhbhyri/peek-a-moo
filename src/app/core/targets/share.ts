/**
 * Link that opens straight into a target: this page's origin and path with only `?target=<id>`.
 * Other params (`debug`, a previous `target`) are dropped on purpose.
 */
export function shareUrl(targetId: string, loc: { origin: string; pathname: string }): string {
  return `${loc.origin}${loc.pathname}?target=${encodeURIComponent(targetId)}`;
}

/** "Found Jupiter in 4.2s — https://…/?target=jupiter" */
export function shareMessage(text: string, url: string): string {
  return `${text} — ${url}`;
}
