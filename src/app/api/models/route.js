/**
 * API Route to fetch available models from Hack Club AI proxy
 * This bypasses CORS issues on the client side
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
        { error: `Failed to fetch models: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();

    // Filter to only models whose output modality is strictly text
    const rawModels = data.data || data;
    if (Array.isArray(rawModels)) {
      data.data = rawModels.filter(
        (model) =>
          model.architecture?.output_modalities &&
          model.architecture.output_modalities.length === 1 &&
          model.architecture.output_modalities[0] === "text",
      );
    }

    // Return with proper CORS headers for client-side access
    return Response.json(data, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Error fetching models:", error);
    return Response.json({ error: "Failed to fetch models" }, { status: 500 });
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
