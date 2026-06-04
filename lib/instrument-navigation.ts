/**
 * Build URLs for the pair detail page (chart + alerts).
 */
export function pairToInstrumentPath(pair: string): string {
  return encodeURIComponent(pair.replace(/[^a-z0-9]/gi, "").toUpperCase());
}

export function buildInstrumentPairUrl(pair: string, price?: number): string {
  const path = `/instruments/${pairToInstrumentPath(pair)}`;
  if (price === undefined || !Number.isFinite(price)) {
    return path;
  }
  return `${path}?${new URLSearchParams({ price: String(price) })}`;
}
