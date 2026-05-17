import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, jsonSchema, streamText, tool } from "ai";
import { ARTIFACT_INSTRUCTIONS } from "@/lib/artifacts";

function toSdkTools(clientTools, apiKey) {
  if (!Array.isArray(clientTools) || clientTools.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    clientTools
      .filter(
        (toolDef) => toolDef?.type === "function" && toolDef.function?.name,
      )
      .map((toolDef) => [
        toolDef.function.name,
        tool({
          description: toolDef.function.description,
          inputSchema: jsonSchema(
            toolDef.function.parameters || { type: "object" },
          ),
          execute: async (args) => {
            if (toolDef.function.name === "web_search") {
              const query = args.query || "";
              const numResults = Math.min(args.numResults || 5, 10);

              const response = await fetch(
                "https://ai.hackclub.com/proxy/v1/exa/answer",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                  },
                  body: JSON.stringify({ query, numResults }),
                },
              );

              if (!response.ok) {
                return `Search failed with status ${response.status}`;
              }

              const data = await response.json();

              const citations = data.citations || data.sources || [];

              return {
                answer: data.answer || data.content || "",
                citations,
                query,
                numResults,
                success: true,
              };
            }

            throw new Error(`Unknown tool: ${toolDef.function.name}`);
          },
        }),
      ]),
  );
}

async function emitStreamParts(
  result,
  send,
  toolCallIndexes,
  nextToolIndexRef,
) {
  const collectedToolCalls = [];
  const collectedToolResults = [];
  let collectedText = "";

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta": {
        collectedText += part.text;
        send({
          choices: [{ delta: { content: part.text } }],
        });
        break;
      }

      case "reasoning-delta": {
        send({
          choices: [{ delta: { thinking: part.text } }],
        });
        break;
      }

      case "tool-input-start": {
        const index = nextToolIndexRef.current;
        nextToolIndexRef.current += 1;
        toolCallIndexes.set(part.id, index);

        send({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index,
                    id: part.id,
                    function: {
                      name: part.toolName,
                      arguments: "",
                    },
                  },
                ],
              },
            },
          ],
        });
        break;
      }

      case "tool-input-delta": {
        const index = toolCallIndexes.get(part.id);
        if (index == null) break;

        send({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index,
                    function: {
                      arguments: part.delta,
                    },
                  },
                ],
              },
            },
          ],
        });
        break;
      }

      case "tool-call": {
        const hasExistingToolInput = toolCallIndexes.has(part.toolCallId);
        let index = toolCallIndexes.get(part.toolCallId);
        if (index == null) {
          index = nextToolIndexRef.current;
          nextToolIndexRef.current += 1;
          toolCallIndexes.set(part.toolCallId, index);
        }

        const toolCallPayload = hasExistingToolInput
          ? {
              index,
              id: part.toolCallId,
            }
          : {
              index,
              id: part.toolCallId,
              function: {
                name: part.toolName,
                arguments: JSON.stringify(part.input ?? {}),
              },
            };

        send({
          choices: [
            {
              delta: {
                tool_calls: [toolCallPayload],
              },
            },
          ],
        });

        collectedToolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
        break;
      }

      case "tool-result": {
        collectedToolResults.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: part.result,
        });
        if (part.toolName === "web_search" && part.result) {
          const res = part.result;
          send({
            type: "search_result",
            sources: res.citations || [],
            content: res.answer || "",
          });
        }
        break;
      }

      default:
        break;
    }
  }

  return { result, collectedToolCalls, collectedToolResults, collectedText };
}

export async function POST(req) {
  try {
    const {
      messages,
      model,
      apiKey,
      artifacts,
      tools: clientTools,
      stream,
    } = await req.json();

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = now.toLocaleTimeString("en-US", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    });

    let systemPrompt = `Current date: ${dateStr}. Current time: ${timeStr} UTC.`;
    const processedMessages = messages;

    if (artifacts) {
      systemPrompt += `\n\n${ARTIFACT_INSTRUCTIONS}`;
    }

    const availableTools = toSdkTools(clientTools, apiKey);

    const hackclub = createOpenRouter({
      apiKey: apiKey,
      baseUrl: "https://ai.hackclub.com/proxy/v1",
    });

    if (stream === false) {
      const result = await generateText({
        model: hackclub(model),
        system: systemPrompt,
        messages: processedMessages,
        tools: availableTools,
      });

      return Response.json({
        text: result.text,
        finishReason: result.finishReason,
      });
    }

    const encoder = new TextEncoder();

    const streamResponse = new ReadableStream({
      async start(controller) {
        const toolCallIndexes = new Map();
        const nextToolIndexRef = { current: 0 };

        const send = (payload) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
        };

        try {
          const currentMessages = [...processedMessages];
          const MAX_STEPS = 5;

          for (let step = 0; step < MAX_STEPS; step++) {
            const { collectedToolCalls, collectedToolResults, collectedText } =
              await emitStreamParts(
                await streamText({
                  model: hackclub(model),
                  system: systemPrompt,
                  messages: currentMessages,
                  tools: availableTools,
                  maxSteps: 1,
                }),
                send,
                toolCallIndexes,
                nextToolIndexRef,
              );

            if (collectedToolCalls.length === 0) {
              break;
            }

            const assistantToolCalls = collectedToolCalls.map((tc) => ({
              id: tc.toolCallId,
              type: "function",
              function: {
                name: tc.toolName,
                arguments: JSON.stringify(tc.input),
              },
            }));

            currentMessages.push({
              role: "assistant",
              content: collectedText,
              tool_calls: assistantToolCalls,
            });

            for (const toolCall of collectedToolCalls) {
              const toolResult = collectedToolResults.find(
                (r) => r.toolCallId === toolCall.toolCallId,
              );
              if (toolResult) {
                currentMessages.push({
                  role: "tool",
                  content: JSON.stringify(toolResult.result),
                  tool_call_id: toolCall.toolCallId,
                  name: toolCall.toolName,
                });
              }
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(streamResponse, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
