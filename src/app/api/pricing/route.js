/**
 * API Route to fetch model pricing from Hack Club AI proxy
 * Server-side proxy to bypass CORS on client-side calls.
 * Returns all models with pricing (no text-only filter).
 */

export async function GET() {
  try {
    const response = await fetch("https://ai.hackclub.com/proxy/v1/models", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: `Failed to fetch pricing: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();

    const map = {};
    const rawModels = data.data || data;
    if (Array.isArray(rawModels)) {
      for (const model of rawModels) {
        if (model.id && model.pricing) {
          const prompt = Number.parseFloat(model.pricing.prompt);
          const completion = Number.parseFloat(model.pricing.completion);
          if (Number.isFinite(prompt) && Number.isFinite(completion)) {
            map[model.id] = { input: prompt, output: completion };
          }
        }
      }
    }

    return Response.json(
      { data: map },
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching pricing:", error);
    return Response.json(
      { error: `Failed to fetch pricing: ${error.message}` },
      { status: 500 },
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
