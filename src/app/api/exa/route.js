// Exa API endpoints proxy
// Proxy requests to Hack Club AI's Exa endpoints

const EXA_BASE_URL = "https://ai.hackclub.com/proxy/v1/exa";

export async function POST(req) {
  try {
    const { endpoint, apiKey, data, stream } = await req.json();

    if (
      !endpoint ||
      !["search", "findSimilar", "contents", "answer"].includes(endpoint)
    ) {
      return Response.json(
        {
          error:
            "Invalid endpoint. Must be one of: search, findSimilar, contents, answer",
        },
        { status: 400 },
      );
    }

    if (!apiKey) {
      return Response.json({ error: "API key required" }, { status: 401 });
    }

    const url = `${EXA_BASE_URL}/${endpoint}`;

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(data || {}),
    };

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      // Try to parse as JSON, but handle non-JSON responses (like HTML error pages)
      let error;
      const contentType = response.headers.get("content-type");
      try {
        if (contentType && contentType.includes("application/json")) {
          error = await response.json();
        } else {
          const textError = await response.text();
          error = { error: textError || `HTTP error ${response.status}` };
        }
      } catch (parseError) {
        error = { error: `HTTP error ${response.status}: ${response.statusText}` };
      }
      return Response.json(error, { status: response.status });
    }

    // Handle streaming response for answer endpoint with stream option
    if (endpoint === "answer" && stream) {
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // For non-streaming responses, return as JSON
    const result = await response.json();
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
