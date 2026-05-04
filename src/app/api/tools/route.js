// Tool execution endpoint
// Handles function/tool calls from the AI

import { exaAnswer } from "@/lib/api-client";

export async function POST(req) {
  try {
    const { tool, parameters } = await req.json();

    if (!tool || !parameters) {
      return Response.json(
        { error: "Tool and parameters required" },
        { status: 400 },
      );
    }

    let result;

    switch (tool) {
      case "web_search":
        // Use Exa to search the web
        result = await exaAnswer(parameters.query, {
          numResults: 5,
          useAutoprompt: true,
        });

        // Format the response for the AI
        return Response.json({
          tool: "web_search",
          result: result.answer || result.content,
          sources: result.citations || result.sources || [],
        });

      default:
        return Response.json(
          { error: `Unknown tool: ${tool}` },
          { status: 400 },
        );
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
