/**
 * Shim for astro:i18n getRelativeLocaleUrl.
 * Adds /en/ prefix when locale is "en", no prefix otherwise.
 */
export function getRelativeLocaleUrl(locale: string, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const clean = normalized.replace(/\/+$/, "") || "/";
  return locale === "en" ? `/en${clean === "/" ? "" : clean}`.replace(/\/+$/, "") || "/en" : clean;
}
