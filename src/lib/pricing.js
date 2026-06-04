// Pricing per 1M tokens (USD) for common models via OpenRouter
const MODEL_PRICING = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-2024-11-20": { input: 2.5, output: 10 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "claude-3.5-sonnet": { input: 3, output: 15 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-3.5-haiku": { input: 0.8, output: 4 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "gemini/gemini-2.0-flash-exp": { input: 0.1, output: 0.4 },
  "gemini/gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
  "gemini/gemini-2.0-flash-lite-001": { input: 0.075, output: 0.3 },
  "gemini/gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini/gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini/gemini-2.5-pro-exp-03-25": { input: 1.25, output: 5 },
  "qwen/qwen3-235b-a3b-instruct": { input: 0.9, output: 0.9 },
  "qwen/qwen3-30b-a3b-instruct": { input: 0.15, output: 0.15 },
  "qwen/qwen3-next-80b-a3b-instruct": { input: 0.35, output: 0.4 },
  "qwen/qwen3.6-flash": { input: 0.1, output: 0.4 },
};

// Dynamic pricing cache populated from the OpenRouter models API
const dynamicPricing = {};

export function populatePricingFromModels(models) {
  if (!Array.isArray(models)) return;
  for (const model of models) {
    if (model.id && model.pricing) {
      dynamicPricing[model.id] = {
        input: parseFloat(model.pricing.prompt) * 1_000_000,
        output: parseFloat(model.pricing.completion) * 1_000_000,
      };
    }
  }
}

export function getModelPricing(modelName) {
  return MODEL_PRICING[modelName] || dynamicPricing[modelName] || null;
}

export function calcCost(modelName, inputTokens, outputTokens) {
  const pricing = getModelPricing(modelName);
  if (!pricing) return null;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export function formatPrice(price) {
  const str = typeof price === "number" ? price.toString() : price;
  const num = parseFloat(str);
  if (!str || Number.isNaN(num)) return "N/A";
  if (num === 0) return "Free";

  const dotIndex = str.indexOf(".");
  let whole;
  let fraction;

  if (dotIndex === -1) {
    whole = str;
    fraction = "";
  } else {
    whole = str.substring(0, dotIndex);
    fraction = str.substring(dotIndex + 1);
  }

  whole = whole.replace(/^0+/, "") || "0";

  if (fraction.length > 6) {
    fraction = fraction.substring(0, 6);
  }

  fraction = fraction.padEnd(2, "0");
  fraction = fraction.replace(/0+$/, "");
  if (fraction.length < 2) {
    fraction = fraction.padEnd(2, "0");
  }

  return `$${whole}.${fraction}`;
}
