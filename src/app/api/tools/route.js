// Tool execution endpoint
// Handles function/tool calls from the AI

import { executeTool, getTools } from "@/lib/tools";

export async function POST(req) {
  let tool = null;
  try {
    const { tool: toolName, parameters, apiKey } = await req.json();
    tool = toolName; // Store for error reporting

    if (!tool || !parameters) {
      return Response.json(
        { error: "Tool name and parameters required" },
        { status: 400 },
      );
    }

    if (!apiKey) {
      return Response.json(
        { error: "API key required for tool execution" },
        { status: 401 },
      );
    }

    // Execute the tool using the central tool executor
    // Pass the API key from the client
    const result = await executeTool(tool, parameters, apiKey);
    const resultText =
      result?.answer ||
      result?.content ||
      (typeof result?.result === "number" ? String(result.result) : "");

    // Return standardized response format
    return Response.json({
      tool,
      result: resultText,
      rawResult: result,
      sources: result.citations || result.sources || [],
      metadata: {
        query: result.query,
        numResults: result.numResults,
        expression: result.expression,
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
