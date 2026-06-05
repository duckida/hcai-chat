let pricingCache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function getModelPricingMap() {
  if (pricingCache && Date.now() - cacheTime < CACHE_TTL) {
    return pricingCache;
  }
  try {
    const res = await fetch("https://ai.hackclub.com/proxy/v1/models", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return pricingCache || {};
    const data = await res.json();
    const map = {};
    for (const model of data.data || []) {
      if (model.id && model.pricing) {
        const prompt = Number.parseFloat(model.pricing.prompt);
        const completion = Number.parseFloat(model.pricing.completion);
        if (Number.isFinite(prompt) && Number.isFinite(completion)) {
          map[model.id] = { input: prompt, output: completion };
        }
      }
    }
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
