const PROVIDER_SLUG_SEGMENT = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;

/** OpenRouter accepts both provider slugs and exact provider endpoint slugs. */
export function isValidOpenRouterProviderSlug(value) {
  if (typeof value !== "string") return false;
  const slug = value.trim();
  if (slug.length === 0 || slug.length > 64) return false;
  return slug
    .split("/")
    .every((segment) => PROVIDER_SLUG_SEGMENT.test(segment));
}
