import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, jsonSchema, stepCountIs, streamText, tool } from "ai";
import { ARTIFACT_INSTRUCTIONS } from "@/lib/artifacts";
import { calcApiCost, getModelPricingMap } from "@/lib/model-pricing";
import {
  executeCodeInSandbox,
  executeCommandInSandbox,
} from "@/lib/sandbox-executor";
import { getToolOutput } from "@/lib/tool-stream.mjs";
import { executeTool, SANDBOX_TOOL_NAMES } from "@/lib/tools";

const AGENT_MODE_PROMPT = `

You are running in Agent Mode with access to a secure JavaScript sandbox.
The sandbox has its own dedicated filesystem (files persist in /workspace across the whole conversation) and full network access.

Available tools:
- execute_code: Run JavaScript code. Supports top-level await and all Node.js built-in modules (fs, path, child_process, http, fetch, etc.). Use this for computation, data processing, file operations, API calls, or running scripts.
- run_command: Run shell commands. Use this to install npm packages, list files, run scripts, or use CLI tools.

IMPORTANT RULES:
- The sandbox has full network access - you can fetch APIs, download packages, etc.
- Files written to /workspace persist across the entire conversation.
- Each execution has a 30-second timeout.
- Install packages with 'npm install <package>' via run_command first, then require them in execute_code.`;

function toSdkTools(clientTools, apiKey, conversationId) {
  if (!Array.isArray(clientTools) || clientTools.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    clientTools
      .filter(
        (toolDef) => toolDef?.type === "function" && toolDef.function?.name,
      )
      .map((toolDef) => {
        const toolName = toolDef.function.name;
        const isSandboxTool = SANDBOX_TOOL_NAMES.includes(toolName);

        return [
          toolName,
          tool({
            description: toolDef.function.description,
            inputSchema: jsonSchema(
              toolDef.function.parameters || { type: "object" },
            ),
            execute: async (args) => {
              if (isSandboxTool) {
                if (!conversationId) {
                  throw new Error(
                    "conversationId is required for sandbox tools",
                  );
                }
                if (toolName === "execute_code") {
                  return executeCodeInSandbox(args?.code, conversationId);
                }
                if (toolName === "run_command") {
                  return executeCommandInSandbox(args?.command, conversationId);
                }
              }
              return executeTool(toolName, args || {}, apiKey);
            },
          }),
        ];
      }),
  );
}

async function emitStreamParts(
  result,
  send,
  toolCallIndexes,
  nextToolIndexRef,
  generationTiming,
) {
  let finalUsage = null;
  let finalCost = null;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
      case "reasoning-delta": {
        const now = Date.now();
        if (generationTiming.startTime == null) {
          generationTiming.startTime = now;
        }
        generationTiming.endTime = now;

        if (part.type === "text-delta") {
          send({
            choices: [{ delta: { content: part.text } }],
          });
        } else {
          send({
            choices: [{ delta: { thinking: part.text } }],
          });
        }
        break;
      }

      case "finish": {
        finalUsage = part.usage;
        finalCost = part.providerMetadata?.openrouter?.usage?.cost ?? null;
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
        if (SANDBOX_TOOL_NAMES.includes(part.toolName) && output) {
          send({
            type: "sandbox_result",
            tool: part.toolName,
            code: output.code || output.command || "",
            stdout: output.stdout || "",
            stderr: output.stderr || "",
            exitCode: output.exitCode,
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
    cost: finalCost,
  };
}

function validateRequest(body) {
  const { messages, model, apiKey, max_tokens } = body;

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return { valid: false, status: 401, error: "Valid API key is required" };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, status: 400, error: "Messages array is required" };
  }

  if (messages.length > 200) {
    return {
      valid: false,
      status: 400,
      error: "Too many messages (max 200)",
    };
  }

  if (!model || typeof model !== "string") {
    return { valid: false, status: 400, error: "Model is required" };
  }

  if (max_tokens !== undefined && max_tokens !== null) {
    if (
      typeof max_tokens !== "number" ||
      max_tokens < 1 ||
      max_tokens > 65536
    ) {
      return {
        valid: false,
        status: 400,
        error: "max_tokens must be between 1 and 65536",
      };
    }
  }

  return { valid: true };
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateRequest(body);
  if (!validation.valid) {
    return Response.json(
      { error: validation.error },
      { status: validation.status },
    );
  }

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
      agentMode,
      conversationId,
    } = body;

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

    if (agentMode) {
      systemPrompt += AGENT_MODE_PROMPT;
    }

    const availableTools = toSdkTools(clientTools, apiKey, conversationId);

    const hackclub = createOpenRouter({
      apiKey: apiKey,
      baseUrl: "https://ai.hackclub.com/proxy/v1",
    });

    const reasoningOpts =
      think === true
        ? { include_reasoning: true }
        : { include_reasoning: false };

    const providerOpts = {
      ...reasoningOpts,
      ...(max_tokens ? { max_tokens } : {}),
    };

    if (stream === false) {
      const result = await generateText({
        model: hackclub(model),
        system: systemPrompt,
        messages: processedMessages,
        tools: availableTools,
        ...(max_tokens ? { maxTokens: max_tokens } : {}),
        providerOptions: {
          openrouter: providerOpts,
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
          const generationTiming = { startTime: null, endTime: null };

          const { usage, cost } = await emitStreamParts(
            await streamText({
              model: hackclub(model),
              system: systemPrompt,
              messages: currentMessages,
              tools: availableTools,
              stopWhen: stepCountIs(100),
              providerOptions: {
                openrouter: providerOpts,
              },
            }),
            send,
            toolCallIndexes,
            nextToolIndexRef,
            generationTiming,
          );

          // Accumulate usage data
          if (usage) {
            totalUsage.inputTokens +=
              usage.promptTokens || usage.inputTokens || 0;
            totalUsage.outputTokens +=
              usage.completionTokens || usage.outputTokens || 0;
          }

          const endTime = Date.now();
          const totalDuration = (endTime - startTime) / 1000; // wall-clock seconds
          // Generation duration excludes tool execution / network wait time:
          // it spans only the windows in which text or reasoning deltas arrived.
          const generationDurationMs =
            generationTiming.startTime != null &&
            generationTiming.endTime != null
              ? generationTiming.endTime - generationTiming.startTime
              : 0;
          const generationDuration = generationDurationMs / 1000;
          const durationForTps =
            generationDurationMs > 0 ? generationDuration : 0;
          const tokensPerSecond =
            durationForTps > 0 ? totalUsage.outputTokens / durationForTps : 0;

          let finalCost = cost;
          if (finalCost == null) {
            const pricingMap = await getModelPricingMap();
            const pricing = pricingMap[model];
            if (pricing) {
              finalCost = calcApiCost(
                pricing,
                totalUsage.inputTokens,
                totalUsage.outputTokens,
              );
            }
          }

          // Send usage data before [DONE]
          send({
            type: "usage",
            usage: {
              model,
              inputTokens: totalUsage.inputTokens,
              outputTokens: totalUsage.outputTokens,
              totalTokens: totalUsage.inputTokens + totalUsage.outputTokens,
              duration: totalDuration,
              generationDuration,
              tokensPerSecond: Math.round(tokensPerSecond * 100) / 100,
              cost: finalCost,
            },
          });

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error(
            `[stream error] model=${model} msgs=${messages.length}:`,
            error,
          );
          send({ type: "error", error: error.message || "Stream failed" });
          // Yield control to let the enqueued error drain before closing
          await new Promise((r) => queueMicrotask(r));
          controller.close();
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
    console.error(`[chat route error] model=${body?.model}:`, error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
