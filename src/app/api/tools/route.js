// Tool execution endpoint
// Handles function/tool calls from the AI

import { executeTool, getTools } from "@/lib/tools";

export async function POST(req) {
  try {
    const { tool, parameters } = await req.json();

    if (!tool || !parameters) {
      return Response.json(
        { error: "Tool name and parameters required" },
        { status: 400 },
      );
    }

    // Execute the tool using the central tool executor
    const result = await executeTool(tool, parameters);

    // Return standardized response format
    return Response.json({
      tool,
      result: result.answer || result.content || "",
      sources: result.citations || result.sources || [],
      metadata: {
        query: result.query,
        numResults: result.numResults,
        success: result.success,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message,
        tool: tool || null,
      },
      { status: 500 },
    );
  }
}

// GET endpoint to list available tools
export async function GET() {
  try {
    const tools = getTools();
    return Response.json({ tools });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
