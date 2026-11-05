# Full Backend Refactor Plan — AI SDK V7 + Streamdown v2.6

## Overview
Full refactor of the HCAI Chat backend using AI SDK v7 (`ai@7.0.106`) and Streamdown v2.6.0 + `@streamdown/mermaid@1.0.2`. We adopt v7's recommended **callback-based streaming** architecture instead of the v6 pattern of iterating `result.stream`/`result.fullStream` and manually switching on part types.

## Packages Installed (verified in node_modules)
- `ai@7.0.106` ✅
- `@openrouter/ai-sdk-provider@3.0.0` ✅
- `streamdown@2.6.0` ✅
- `@streamdown/mermaid@1.0.2` ✅

## Architecture: Callback-Based Streaming (v7 Recommended)

**Current (v6):** Route creates a `ReadableStream`, iterates `result.fullStream` in `emitStreamParts`, switches on part types, and manually sends SSE `data:` frames.

**New (v7 recommended):** Use `streamText` with `onChunk`, `onStepEnd`, `onEnd` callbacks. Each callback receives typed events. The route still wraps this in a `ReadableStream` for SSE output, but the streaming logic is declarative via callbacks.

### Callback Flow
1. **`onStart`** — (optional) Capture initial timing metadata
2. **`onChunk`** — Called for each chunk: `text-delta`, `reasoning-delta`, `tool-input-start`, `tool-input-delta`, `tool-call`, `tool-result`, `tool-error`. Emit SSE `data: { choices: [...] }` frames for text deltas and tool call deltas. **Skip tool-result/tool-error here** — they are handled in `onStepEnd`.
3. **`onStepEnd`** — Called after each step (LLM call) completes. Has `stepResult.toolResults`, `stepResult.performance`, `stepResult.usage`. Emit `sandbox_result` and `search_result` SSE events for any tool results in this step.
4. **`onEnd`** — Called when all steps complete. Has `event.usage` (aggregated `LanguageModelUsage`), `event.finishReason`, `event.steps` (array with `performance` for each). Extract final usage + cost from `event.usage` and `finalStep.providerMetadata`. Emit final `usage` SSE event with v7's server-calculated stats, then `[DONE]`.

### Key Constraint: Backpressure & Controller Management
With callbacks, `streamText` manages its own internal stream consumption. The route's `ReadableStream` controller is written to via direct `controller.enqueue()` calls from within callbacks. Since `streamText` is `await`ed, and the client reads the `ReadableStream` with backpressure handling, this works — the SDK pauses stream processing when the controller's desired size is null. The existing `send()` function's `controller.desiredSize` guard remains important.

### Advantage: v7's `StepResultPerformance`
Instead of manually computing `tokensPerSecond` from `generationTiming.startTime/endTime` and `totalUsage`, we use v7's built-in `StepResultPerformance` from `onStepEnd`/`onEnd`:

| Field | Description |
|-------|-------------|
| `effectiveOutputTokensPerSecond` | `outputTokens / requestSeconds` — total including tool time |
| `outputTokensPerSecond` | `outputTokens / outputStreamSeconds` — streaming only, excludes tool time |
| `inputTokensPerSecond` | `inputTokens / ttftSeconds` |
| `timeToFirstOutputMs` | ms until first chunk |
| `responseTimeMs` | pure model response time |
| `stepTimeMs` | total step duration |
| `toolExecutionMs` | Record of per-tool execution times |

These are more accurate than the manual approach and are calculated by the SDK itself.

### OnChunk Callback Details
- Receives `{ chunk: TextStreamPart<TOOLS> }`
- **Only handle**: `text-delta` (`.text`), `reasoning-delta` (`.text`), `tool-input-start` (`.id`, `.toolName`), `tool-input-delta` (`.id`, `.delta`), `tool-call` (`.toolCallId`, `.toolName`, `.input`)
- **Skip**: `tool-result`, `tool-error` — these are handled in `onStepEnd`
- **Markdown streaming preserved**: `text-delta` chunks contain raw markdown text from the model. The `onChunk` callback emits the same SSE `data: { choices: [{ delta: { content: chunk.text } }] }` format as the current route. The client (`api-client.js`) accumulates these as `onChunk` calls and passes the raw text to Streamdown — no client changes needed.
- **Note**: `onChunk` does NOT fire for `finish` parts — final usage is extracted from `onEnd` event

### Final Usage Extraction (replaces `finish` part handling)
- In `onEnd`, access `event.usage` (`LanguageModelUsage` with `inputTokens`, `outputTokens`, `outputTokenDetails.reasoningTokens`, `totalTokens`)
- Access `event.finalStep.providerMetadata?.openrouter?.usage?.cost` for cost (replaces the v6 `finish` part's `providerMetadata`)
- Access `event.steps` array for aggregated `StepResultPerformance` stats

### Constraint: `onChunk` vs `result.stream` Are Mutually Exclusive
If you pass `onChunk` to `streamText`, the `result.stream` property is not available (or would be consumed by the callbacks internally). The callbacks ARE the stream consumption. This is the v7 pattern.

## V7 API Changes (from actual installed type definitions)

### 1. Provider API: Callable → Method Call
- v6: `createOpenRouter({ apiKey, baseUrl }); openrouter(model)` — callable
- v7: `createOpenRouter({ apiKey, baseURL }); openrouter.chat(model)` — must use `.chat()`

### 2. Parameter Renames
- `baseUrl` → `baseURL`
- `system` → `instructions` (preferred)
- `maxTokens` → `maxOutputTokens`
- `fullStream` → `stream` (deprecated alias)
- `result.totalUsage` → `result.usage` (deprecated alias)

### 3. `allowSystemInMessages` default: `false`
- Must set `allowSystemInMessages: true` if system messages appear in `messages[]`

### 4. Reasoning Control
- `providerOptions.openrouter.include_reasoning` → `providerOptions.openrouter.reasoning: { exclude: bool }`

### 5. `generateText` Result: `toolResults` Field Names
- v6: `toolResult.args`, `toolResult.result`
- v7: `toolResult.input`, `toolResult.output`

## Files to Modify

### 1. `package.json`
- `ai`: `^7.0.106`
- `@openrouter/ai-sdk-provider`: `^3.0.0`
- `streamdown`: `^2.6.0`
- Add `@streamdown/mermaid`: `^1.0.2`

### 2. `src/app/api/chat/route.js` — Major Refactor
- `createOpenRouter({ apiKey, baseUrl })` → `createOpenRouter({ apiKey, baseURL })`
- `hackclub(model)` → `hackclub.chat(model)` (2 call sites)
- `system: systemPrompt` → `instructions: systemPrompt` (2 call sites)
- `maxTokens` → `maxOutputTokens`
- `{ include_reasoning: true/false }` → `{ reasoning: { exclude: false/true } }`
- Add `allowSystemInMessages: true`
- **Replace `emitStreamParts` + `result.stream` iteration** with `onChunk`/`onStepEnd`/`onEnd` callbacks
- In `onChunk`: handle `text-delta`, `reasoning-delta`, `tool-input-start`, `tool-input-delta`, `tool-call` (skip `tool-result`/`tool-error` — handled in `onStepEnd`)
- In `onStepEnd`: emit `sandbox_result`/`search_result` from `stepResult.toolResults`, collect `stepResult.performance`
- In `onEnd`: extract final usage from `event.usage`, cost from `event.finalStep.providerMetadata`, stats from `event.steps[].performance`; emit `usage` SSE event; emit `[DONE]`
- **Remove manual `tokensPerSecond` calculation** — use v7's `StepResultPerformance.outputTokensPerSecond` from `onEnd`/`onStepEnd`
- `toolResult.args` → `toolResult.input`, `toolResult.result` → `toolResult.output`

### 3. `src/lib/api-client.js` — No changes needed for markdown streaming
- The `onChunk` callback emits the exact same SSE `data: { choices: [{ delta: { content } }] }` format as the current `emitStreamParts` — client parsing is unchanged
- `sandbox_result` events still use the same `{ type: "sandbox_result", tool, code, stdout, ... }` structure — client handling is unchanged
- If the `usage` SSE event includes new server-provided stats (`tokensPerSecond`, `timeToFirstOutputMs`), the client will use those instead of computing tps locally — but the client's fallback to local calculation still works
- The client's `streamChatWithTools` SSE parsing format is identical — no changes needed

### 4. `src/app/page.js` — Display enhanced stats
- If the `usage` SSE event now includes server-provided `tokensPerSecond`, `timeToFirstOutputMs`, etc., update the `ResponseMetrics` display if needed

### 5. `src/lib/streamdown.js` — Simplify with `@streamdown/mermaid`
- Replace 70-line hand-rolled mermaid CDN loader with `createMermaidPlugin` from `@streamdown/mermaid`

### 6. `src/app/api/chat/__tests__/route.test.js` — Update for callback-based streaming
- Update `createOpenRouter` mock: return `{ chat: (model) => ({ modelId }) }` instead of callable
- `expect(call.system)` → `expect(call.instructions)`
- `expect(call.maxTokens)` → `expect(call.maxOutputTokens)`
- `expect(call.providerOptions.openrouter.include_reasoning)` → `expect(call.providerOptions.openrouter.reasoning)`
- `expect(createOpenRouter).toHaveBeenCalledWith({ ... baseUrl: ... })` → `baseURL: ...`
- **Replace `streamText.mockReturnValue({ fullStream: ... })`** with `streamText.mockImplementation(({ onChunk, onStepEnd, onEnd }) => { ... })`:
  - The mock must capture the callback functions and return a thenable/iterable that triggers them. Since `streamText` returns `StreamTextResult` (which is `PromiseLike`), the mock should:
    1. Call `onChunk`, `onStepEnd`, `onEnd` with mock events synchronously or in sequence
    2. Return an object that satisfies `StreamTextResult` (with `usage`, `finishReason`, etc.)
  - Each streaming test will need to provide mock chunk/step/end events appropriate to the test case
  - The mock should invoke callbacks via `Promise.resolve()` or async iteration to match real v7 behavior
- Update all streaming test assertions to match callback-based event emission timing
- Update `toolResults` assertions: `.result` → `.output`, `.args` → `.input`

### 7. `src/lib/tool-stream.mjs` — Verify (likely no changes)
- `getToolOutput` already handles `.output` (v7), `.result` (v6), and `.error`

### 8. `src/lib/tools.js` — Verify (likely no changes)
- Uses `jsonSchema` for `inputSchema` — v7 compatible
- Tool `execute` functions — v7 compatible

### 9. Other API routes (`exa`, `tools`, `models`, `sandbox`, `upload`, `balance`)
- No changes needed — don't use AI SDK directly

## Q&A Notes

### Why callbacks instead of keeping the stream iteration?
The user asked to "refactor entirely," not just migrate. The callback-based approach is v7's recommended pattern and provides:
1. **Server-calculated performance stats** (`StepResultPerformance`) — more accurate than manual tps
2. **Cleaner code** — declarative callbacks instead of 150-line `emitStreamParts` switch statement
3. **Better separation of concerns** — chunk handling, step handling, and end handling are distinct

The trade-off is that `onStepEnd` fires at step boundaries (after each LLM call completes), so `sandbox_result`/`search_result` events come at step boundaries rather than interleaved within the chunk stream. This is acceptable because:
- Tool results (`tool-result` parts) always arrive after tool execution completes
- In v6, `tool-result` parts were already at end-of-tool boundaries
- The client already handles `sandbox_result` events as separate SSE events (not as `choices` deltas)
- `onStepEnd` fires BEFORE the next LLM call, so intermediate tool results are visible before the next step begins

### Chat mode vs Agent mode
The app uses **chat mode** by default with **agent mode as an overlay**. Both use the same `streamText` tool loop — agent mode just adds sandbox tools. The callback-based refactor supports both modes since `tool.execute` callbacks still work within `streamText`. The `onStepEnd` callback will see sandbox `toolResults` in multi-step agent flows.

## Verification Steps
1. `npm run lint` (Biome check)
2. `npm test` (Vitest — should have 0 failures)
3. `npm run build` (Next.js compilation check)
