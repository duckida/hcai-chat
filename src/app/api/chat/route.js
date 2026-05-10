import { ARTIFACT_INSTRUCTIONS } from "@/lib/artifacts";
import { getTools } from "@/lib/tools";

export async function POST(req) {
  try {
    const {
      messages,
      model,
      apiKey,
      think,
      artifacts,
      stream: requestStream,
      useWebSearch,
      tools: clientTools, // Optional custom tools from client
    } = await req.json();

    // Process messages with optional artifact instructions
    let processedMessages = messages;
    if (artifacts) {
      const hasSystemMessage =
        messages.length > 0 && messages[0].role === "system";
      if (hasSystemMessage) {
        processedMessages = [
          {
            ...messages[0],
            content: `${messages[0].content}\n\n${ARTIFACT_INSTRUCTIONS}`,
          },
          ...messages.slice(1),
        ];
      } else {
        processedMessages = [
          { role: "system", content: ARTIFACT_INSTRUCTIONS },
          ...messages,
        ];
      }
    }

    // Determine which endpoint to use
    const endpoint = useWebSearch
      ? "https://ai.hackclub.com/proxy/v1/exa/answer"
      : "https://ai.hackclub.com/proxy/v1/chat/completions";

    const body = {
      model: useWebSearch ? undefined : model,
      messages: useWebSearch ? undefined : processedMessages,
      query: useWebSearch ? messages[messages.length - 1]?.content : undefined,
      stream: requestStream !== false,
      numResults: useWebSearch ? 5 : undefined,
    };

    // Add think parameter for compatible models
    if (think && !useWebSearch) {
      body.think = true;
    }

    // Add tool definitions if using tool calling (not useWebSearch)
    // Use client-provided tools or fall back to built-in tools
    if (!useWebSearch) {
      const availableTools =
        clientTools && Array.isArray(clientTools) && clientTools.length > 0
          ? clientTools
          : getTools();

      if (availableTools.length > 0) {
        body.tools = availableTools;
        body.tool_choice = "auto"; // Let the model decide when to use tools
      }
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Try to parse as JSON, but handle non-JSON responses (like HTML error pages)
      let error;
      const contentType = response.headers.get("content-type");
      try {
        if (contentType?.includes("application/json")) {
          error = await response.json();
        } else {
          const textError = await response.text();
          error = { error: textError || `HTTP error ${response.status}` };
        }
      } catch {
        error = {
          error: `HTTP error ${response.status}: ${response.statusText}`,
        };
      }
      return Response.json(error, { status: response.status });
    }

    if (requestStream === false) {
      const data = await response.json();
      // For Exa answers, format the response
      if (useWebSearch) {
        return Response.json({
          choices: [
            {
              message: {
                role: "assistant",
                content: data.answer || data.content,
                sources: data.citations || data.sources || [],
              },
            },
          ],
        });
      }
      return Response.json(data);
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
