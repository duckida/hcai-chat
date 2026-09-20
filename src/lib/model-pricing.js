let pricingCache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function getModelPricingMap() {
  if (pricingCache && Date.now() - cacheTime < CACHE_TTL) {
    return pricingCache;
  }
  try {
    const res = await fetch("/api/pricing");
    if (!res.ok) return pricingCache || {};
    const data = await res.json();
    const map = data.data || {};
    pricingCache = map;
    cacheTime = Date.now();
    return map;
  } catch {
    return pricingCache || {};
  }
}

export function calcApiCost(pricing, inputTokens, outputTokens) {
  if (!pricing) return null;
  const inputCost = inputTokens * pricing.input;
  const outputCost = outputTokens * pricing.output;
  const total = inputCost + outputCost;
  return Number.isFinite(total) ? total : null;
}

export function isModelFree(pricing) {
  if (!pricing) return false;
  return pricing.input === 0 && pricing.output === 0;
}
