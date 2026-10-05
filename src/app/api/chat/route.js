import OpenAI from "openai";
import {
  ARTIFACT_AGENT_MODE_INSTRUCTIONS,
  ARTIFACT_INSTRUCTIONS,
} from "@/lib/artifacts";
import { getMessageText, sanitizeMessages } from "@/lib/messages";
import { calcApiCost, getModelPricingMap } from "@/lib/model-pricing";

const AGENT_MODE_PROMPT = `

You are running in Agent Mode with access to a secure cloud sandbox (E2B).
The sandbox has its own dedicated filesystem (files persist in /workspace across the whole conversation while the sandbox is running) and full network access.

Available tools:
- execute_code: Run JavaScript code. Supports top-level await and all Node.js built-in modules (fs, path, child_process, http, fetch, etc.). Use this for computation, data processing, file operations, API calls, or running scripts.
- run_command: Run shell commands. Use this to install npm packages, list files, run scripts, or use CLI tools.

IMPORTANT RULES:
- The sandbox has full network access - you can fetch APIs, download packages, etc.
- Files written to /workspace persist across the entire conversation while the sandbox is alive.
- execute_code has a 30-second timeout; run_command has a 120-second timeout (enough for npm install).
- Install packages with 'npm install <package>' via run_command first, then import them in execute_code.`;

/**
 * The client speaks the OpenAI wire shape for messages and tool specs. The
 * only thing we still own here is: fold `thinking` out of the conversation
 * (it was persisted for the UI, but providers only see the final text),
 * normalize the few attachment shapes the client uses into OpenAI content
 * parts, and bound validate max_tokens.
 */
function toOpenAiContentParts(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return null;
      if (part.type === "text") return { type: "text", text: part.text ?? "" };
      if (part.type === "image") {
        const url = part.image ?? part.url;
        if (!url) return null;
        return { type: "image_url", image_url: { url } };
      }
      if (part.type === "file") {
        const data = part.data ?? part.url;
        if (!data) return null;
        return {
          type: "file",
          file: {
            filename: part.filename ?? "attachment",
            file_data: data,
          },
        };
      }
      return null;
    })
    .filter((p) => p != null);
}

const toOpenAiMessage = (msg) => {
  if (!msg || typeof msg !== "object") return null;
  if (msg.role === "system") return null; // hoisted into instructions above
  if (msg.role === "tool") {
    return {
      role: "tool",
      tool_call_id: msg.tool_call_id ?? "",
      content:
        typeof msg.content === "string"
          ? msg.content
          : getMessageText(msg.content),
    };
  }
  if (msg.role === "assistant") {
    const hasToolCalls =
      Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
    const contentText =
      typeof msg.content === "string"
        ? msg.content
        : getMessageText(msg.content);
    const hasReasoningDetails =
      Array.isArray(msg.reasoning_details) && msg.reasoning_details.length > 0;
    return {
      role: "assistant",
      content: contentText && contentText.trim() !== "" ? contentText : null,
      ...(hasToolCalls ? { tool_calls: msg.tool_calls } : {}),
      // Continuations send the interrupted partial back with its reasoning
      // attached so the model resumes from where its thinking stopped rather
      // than restarting it.
      ...(hasReasoningDetails
        ? { reasoning_details: msg.reasoning_details }
        : {}),
    };
  }
  // user
  const rawContent = msg.content;
  return {
    role: "user",
    content: toOpenAiContentParts(rawContent),
  };
};

const toOpenAiTools = (clientTools) => {
  if (!Array.isArray(clientTools)) return undefined;
  const tools = clientTools
    .filter((t) => t?.type === "function" && t.function?.name)
    .map((t) => ({
      type: "function",
      function: {
        name: t.function.name,
        description: t.function.description ?? "",
        parameters: t.function.parameters ?? { type: "object" },
      },
    }));
  return tools.length > 0 ? tools : undefined;
};

const THINKING_DELTA_KEYS = (delta) => {
  if (!delta || typeof delta !== "object") return "";
  if (typeof delta.reasoning === "string" && delta.reasoning.length > 0) {
    return delta.reasoning;
  }
  if (
    typeof delta.reasoning_content === "string" &&
    delta.reasoning_content.length > 0
  ) {
    return delta.reasoning_content;
  }
  if (
    Array.isArray(delta.reasoning_details) &&
    delta.reasoning_details.length > 0
  ) {
    return delta.reasoning_details
      .filter(
        (d) =>
          d &&
          typeof d === "object" &&
          d.type === "reasoning.text" &&
          typeof d.text === "string",
      )
      .map((d) => d.text)
      .join("");
  }
  return "";
};

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
    const sanitizedMessages = sanitizeMessages(messages);

    // A system-role message is a legitimate thing for a client to send — the
    // title generator sends one on every conversation — but the prompts field
    // wants instructions folded in. Hoist them here where the constraint is
    // known, not in every caller.
    const systemInstructions = sanitizedMessages
      .filter((msg) => msg.role === "system")
      .map((msg) => getMessageText(msg.content))
      .filter((text) => text.trim() !== "");
    if (systemInstructions.length > 0) {
      systemPrompt += `\n\n${systemInstructions.join("\n\n")}`;
    }

    const wireMessages = sanitizedMessages
      .filter((msg) => msg.role !== "system")
      .map(toOpenAiMessage)
      .filter((m) => m != null);

    if (artifacts) {
      systemPrompt += `\n\n${ARTIFACT_INSTRUCTIONS}`;
    }

    if (agentMode) {
      systemPrompt += AGENT_MODE_PROMPT;
      if (artifacts) {
        systemPrompt += `\n\n${ARTIFACT_AGENT_MODE_INSTRUCTIONS}`;
      }
    }

    const openAiTools = toOpenAiTools(clientTools);

    const completionParams = {
      model,
      messages: [{ role: "system", content: systemPrompt }, ...wireMessages],
      ...(openAiTools ? { tools: openAiTools, tool_choice: "auto" } : {}),
      ...(max_tokens ? { max_tokens } : {}),
      // Same OpenRouter reasoning/usage opt-ins the AI SDK provider turned
      // providerOptions into wire fields: spread straight into the body.
      ...(think === true
        ? { include_reasoning: true, reasoning: { exclude: false } }
        : { include_reasoning: false, reasoning: { exclude: true } }),
    };

    const client = new OpenAI({
      apiKey,
      baseURL: "https://ai.hackclub.com/proxy/v1",
    });

    if (stream === false) {
      const result = await client.chat.completions.create({
        ...completionParams,
        stream: false,
      });

      const choice = result.choices?.[0];
      return Response.json({
        text: choice?.message?.content ?? "",
        finishReason: choice?.finish_reason ?? null,
      });
    }

    const encoder = new TextEncoder();

    const streamResponse = new ReadableStream({
      async start(controller) {
        const send = (payload) => {
          if (controller.desiredSize === null) return;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
        };

        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch (_e2) {
            clearInterval(keepalive);
          }
        }, 5_000);

        const startedAt = Date.now();
        let firstOutputAt = null;
        let generationStartAt = null;
        let lastOutputAt = null;
        let finishReason = null;
        let usageObj = null;

        try {
          const stream = await client.chat.completions.create({
            ...completionParams,
            stream: true,
            stream_options: { include_usage: true },
          });

          for await (const chunk of stream) {
            const choice = chunk.choices?.[0];
            if (chunk.usage) usageObj = chunk.usage;
            if (choice?.finish_reason != null)
              finishReason = choice.finish_reason;

            const delta = choice?.delta;
            if (!delta) continue;

            const text = typeof delta.content === "string" ? delta.content : "";
            if (text && text.length > 0) {
              if (generationStartAt == null) generationStartAt = Date.now();
              lastOutputAt = Date.now();
              firstOutputAt ??= Date.now();
              send({ choices: [{ delta: { content: text } }] });
            }

            const thinking = THINKING_DELTA_KEYS(delta);
            if (thinking) {
              if (generationStartAt == null) generationStartAt = Date.now();
              lastOutputAt = Date.now();
              firstOutputAt ??= Date.now();
              send({ choices: [{ delta: { thinking } }] });
            }

            if (
              Array.isArray(delta.tool_calls) &&
              delta.tool_calls.length > 0
            ) {
              if (generationStartAt == null) generationStartAt = Date.now();
              lastOutputAt = Date.now();
              firstOutputAt ??= Date.now();
              send({ choices: [{ delta: { tool_calls: delta.tool_calls } }] });
            }
          }
        } catch (error) {
          console.error(`[stream] model=${model}:`, error);
          send({
            type: "error",
            error:
              typeof error?.message === "string"
                ? error.message
                : "Stream error",
          });
          clearInterval(keepalive);
          try {
            controller.close();
          } catch {}
          return;
        }

        const endTime = Date.now();
        const totalDuration = (endTime - startedAt) / 1000;
        const generationDurationMs =
          generationStartAt != null && lastOutputAt != null
            ? Math.max(lastOutputAt - generationStartAt, 0)
            : 0;
        const generationDuration = generationDurationMs / 1000;
        const outputTokens =
          typeof usageObj?.completion_tokens === "number"
            ? usageObj.completion_tokens
            : 0;

        console.log(
          `[stream end] model=${model} finishReason=${finishReason ?? "none"} durationMs=${Math.round(totalDuration * 1000)} usage=${usageObj ? "yes" : "no"}`,
        );

        if (usageObj || finishReason != null) {
          const cost =
            typeof usageObj?.cost === "number" ? usageObj.cost : null;
          let finalCost = cost;
          if (finalCost == null) {
            const pricingMap = await getModelPricingMap();
            const pricing = pricingMap[model];
            if (pricing) {
              finalCost = calcApiCost(
                pricing,
                usageObj?.prompt_tokens ?? 0,
                outputTokens,
              );
            }
          }
          send({
            type: "usage",
            usage: {
              model,
              inputTokens: usageObj?.prompt_tokens ?? 0,
              outputTokens,
              reasoningTokens:
                usageObj?.completion_tokens_details?.reasoning_tokens ?? 0,
              totalTokens:
                usageObj?.total_tokens ??
                (usageObj?.prompt_tokens ?? 0) +
                  (usageObj?.completion_tokens ?? 0),
              duration: totalDuration,
              generationDuration,
              tokensPerSecond:
                generationDuration > 0
                  ? Math.round((outputTokens / generationDuration) * 100) / 100
                  : 0,
              ...(firstOutputAt != null
                ? { timeToFirstOutputMs: firstOutputAt - startedAt }
                : {}),
              cost: finalCost,
            },
          });
        }

        if (finishReason == null) {
          // Upstream closed without ever stating a finish reason: a cut, not
          // a completion. Trace, then close markerless so the client
          // continue-logic owns the retry semantics guaranteed by finding 17.
          console.warn(
            `[stream end] no finish_reason after ${Math.round(totalDuration * 1000)}ms — closing markerless so the client continues`,
          );
        } else {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {}
      },
    });

    return new Response(streamResponse, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "Alt-Svc": "clear",
      },
    });
  } catch (error) {
    console.error(`[chat route error] model=${body?.model}:`, error);
    return Response.json(
      {
        error: `Internal server error processing chat with model "${body?.model}"`,
      },
      { status: 500 },
    );
  }
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
      max_tokens > 1048576
    ) {
      return {
        valid: false,
        status: 400,
        error: "max_tokens must be between 1 and 1048576",
      };
    }
  }

  return { valid: true };
}
