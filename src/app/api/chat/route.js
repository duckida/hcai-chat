import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, jsonSchema, stepCountIs, streamText, tool } from "ai";
import { ARTIFACT_INSTRUCTIONS } from "@/lib/artifacts";
import { getToolOutput } from "@/lib/tool-stream.mjs";
import { executeTool } from "@/lib/tools";

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
          execute: async (args) =>
            executeTool(toolDef.function.name, args || {}, apiKey),
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
  let finalUsage = null;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta": {
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

      case "finish": {
        finalUsage = part.usage;
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

        break;
      }

      case "tool-result":
      case "tool-error": {
        const output = getToolOutput(part);
        if (part.toolName === "web_search" && output) {
          const res = output;
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

  return {
    usage: finalUsage || (await result.usage.catch(() => null)),
  };
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
      think,
      max_tokens,
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

    const reasoningOpts =
      think === true
        ? { include_reasoning: true }
        : { include_reasoning: false };

    if (stream === false) {
      const result = await generateText({
        model: hackclub(model),
        system: systemPrompt,
        messages: processedMessages,
        tools: availableTools,
        maxTokens: max_tokens,
        providerOptions: {
          openrouter: reasoningOpts,
        },
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
          const totalUsage = { inputTokens: 0, outputTokens: 0 };
          const startTime = Date.now();

          const { usage } = await emitStreamParts(
            await streamText({
              model: hackclub(model),
              system: systemPrompt,
              messages: currentMessages,
              tools: availableTools,
              maxTokens: max_tokens,
              stopWhen: stepCountIs(5),
              providerOptions: {
                openrouter: reasoningOpts,
              },
            }),
            send,
            toolCallIndexes,
            nextToolIndexRef,
          );

          // Accumulate usage data
          if (usage) {
            totalUsage.inputTokens +=
              usage.promptTokens || usage.inputTokens || 0;
            totalUsage.outputTokens +=
              usage.completionTokens || usage.outputTokens || 0;
          }

          const endTime = Date.now();
          const duration = (endTime - startTime) / 1000; // in seconds
          const tokensPerSecond =
            duration > 0 ? totalUsage.outputTokens / duration : 0;

          // Send usage data before [DONE]
          send({
            type: "usage",
            usage: {
              model,
              inputTokens: totalUsage.inputTokens,
              outputTokens: totalUsage.outputTokens,
              totalTokens: totalUsage.inputTokens + totalUsage.outputTokens,
              duration,
              tokensPerSecond: Math.round(tokensPerSecond * 100) / 100,
            },
          });

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
