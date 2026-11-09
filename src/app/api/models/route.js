/**
 * API Route to fetch available models from Hack Club AI proxy.
 *
 * The proxy's catalog is ~860 KB and every entry carries endpoint, pricing and
 * description data this app never reads. It is trimmed here to the handful of
 * fields the client actually uses, which keeps the response roughly five times
 * smaller, and cached both in-process and in the browser/CDN: the catalog
 * changes rarely, and re-downloading it on every page load is what made the
 * picker feel slow.
 */

const MODELS_URL = "https://ai.hackclub.com/proxy/v1/models";
const UPSTREAM_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

// Only text-output models are offered. `output_modalities` is what the proxy
// reports; a model without it is not known to be text-only and is left out.
function isTextModel(model) {
  const modalities = model?.architecture?.output_modalities;
  return (
    Array.isArray(modalities) &&
    modalities.length === 1 &&
    modalities[0] === "text"
  );
}

// The client's `normalizeModelCatalog` reads exactly these fields. Anything
// else would be transferred and parsed only to be dropped.
function toCatalogEntry(model) {
  return {
    id: model.id,
    name: model.name,
    context_length: model.context_length,
    supported_parameters: model.supported_parameters,
    reasoning: model.reasoning,
  };
}

// Module-level so a warm serverless instance (and the dev server) reuses one
// upstream response instead of paying for it per request.
let cache = null;

function responseHeaders(cacheControl = CACHE_CONTROL) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": cacheControl,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// A failed or empty response must not be cached — otherwise a transient
// upstream blip would keep the picker empty for the full cache lifetime.
const NO_STORE = "no-store";

export async function GET() {
  if (cache && cache.expires > Date.now()) {
    return Response.json(cache.payload, { headers: responseHeaders() });
  }

  try {
    const response = await fetch(MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      // A hung upstream must not hold the request open indefinitely.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      return Response.json(
        { error: `Failed to fetch models: ${response.status}` },
        { status: response.status, headers: responseHeaders(NO_STORE) },
      );
    }

    const body = await response.json();
    // The proxy has answered with a bare array in the past. Normalising it here
    // matters: assigning `.data` to an array does not survive JSON serialization,
    // so the client would read `payload.data` as undefined and render an empty
    // catalog.
    const rawModels = Array.isArray(body) ? body : body?.data;
    const models = Array.isArray(rawModels)
      ? rawModels.filter(isTextModel).map(toCatalogEntry)
      : [];
    const payload = { data: models };

    // Only a non-empty catalog is cached. An unexpected empty payload is more
    // likely a bad upstream moment than a real empty catalog.
    if (models.length > 0) {
      cache = { payload, expires: Date.now() + CACHE_TTL_MS };
    }

    return Response.json(payload, {
      headers: responseHeaders(models.length > 0 ? CACHE_CONTROL : NO_STORE),
    });
  } catch (error) {
    // AbortSignal.timeout rejects with a TimeoutError; report it as a gateway
    // timeout rather than a generic server crash.
    const timedOut = error?.name === "TimeoutError";
    console.error("Error fetching models:", error);
    return Response.json(
      {
        error: timedOut
          ? "Models request timed out"
          : `Failed to fetch models: ${error.message}`,
      },
      { status: timedOut ? 504 : 500, headers: responseHeaders(NO_STORE) },
    );
  }
}

export async function OPTIONS() {
  return Response.json(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
