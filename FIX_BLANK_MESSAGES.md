# Fix Blank Messages

## Problem

Assistant messages can appear while the response is streaming, but end up blank or disappear once streaming completes.

## Root Cause

The main bug is a stream format mismatch between the API route and the client parser.

### Server output

`src/app/api/chat/route.js:35-41`

```js
const result = await streamText({
  model: hackclub(model),
  messages: processedMessages,
  tools: availableTools,
});

return result.toTextStreamResponse();
```

This returns a plain text stream.

### Client expectation

`src/lib/api-client.js:75-113`

```js
const chunk = decoder.decode(value);
const lines = chunk.split("\n");

for (const line of lines) {
  if (line.startsWith("data: ")) {
    const data = line.slice(6);
    if (data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta || {};
      const content = delta.content || "";
      const thinking = delta.thinking || "";
      if (content) onChunk(content, "content");
      if (thinking) onChunk(thinking, "thinking");
    } catch (e) {}
  }
}
```

The client only handles SSE-style lines beginning with `data: ` and only extracts content from JSON in the shape `choices[0].delta`.

Because `toTextStreamResponse()` does not produce that format, most streamed content is ignored.

## Exact Failure Path

### 1. Streaming callback never accumulates final assistant text

`src/app/page.js:406-416`

```js
await streamChatCompletion(
  updatedMessages,
  selectedModel,
  (chunk, type) => {
    if (type === "thinking") {
      fullThinking += chunk;
      setStreamingThinking(fullThinking);
    } else {
      fullResponse += chunk;
      setStreamingContent(fullResponse);
    }
  },
```

If `streamChatCompletion()` never calls `onChunk()` with content, `fullResponse` stays `""`.

### 2. Completion persists an empty assistant message

`src/app/page.js:424-441`

```js
const assistantMessage = {
  role: "assistant",
  content: fullResponse,
  thinking: fullThinking || undefined,
};
const finalMessages = [...updatedMessages, assistantMessage];

setStreamingContent("");
setStreamingThinking("");
setMessages(finalMessages);
```

When `fullResponse` is empty, the saved assistant message is also empty.

### 3. Rendering filters can hide or blank the persisted assistant message

There are two rendering paths in `src/components/chat/MessageList.jsx` that matter.

#### Persisted message rendering

`src/components/chat/MessageList.jsx:261-278`

```js
{activeMessages
  .filter((message) => {
    if (message.role === "user") return true;
    if (message.role === "tool") return false;
    const { artifacts } = extractHtmlArtifacts(message.content || "");
    return (
      (message.content && message.content.trim() !== "") ||
      artifacts.length > 0 ||
      (message.thinking && message.thinking.trim() !== "")
    );
  })
  .map((message, index) => (
    <Message ... />
  ))}
```

If the assistant message has:
- empty `content`
- no extracted artifacts
- no `thinking`

then it is filtered out completely and never renders.

#### Individual message body rendering

`src/components/chat/MessageList.jsx:140-181`

```js
const content = message.content || "";
const { cleanedText, artifacts } = extractHtmlArtifacts(content);

{cleanedText && (
  <Streamdown mode="static" ...>
    {cleanedText}
  </Streamdown>
)}
```

If `content` is empty, `cleanedText` is also empty, so there is no visible assistant text.

### 4. Streaming UI can still appear before persistence fails

`src/components/chat/MessageList.jsx:280-316`

```js
{(streamingContent || streamingThinking) && (
  ...
  {streamingContent && (
    <Streamdown mode="stream" ...>
      {extractHtmlArtifacts(streamingContent).cleanedText}
    </Streamdown>
  )}
)}
```

This explains the symptom where content may appear in the streaming block, then vanish after completion: the temporary streaming state and the persisted message state are separate paths.

## Silent Failure

`src/lib/api-client.js:92-110`

```js
try {
  const parsed = JSON.parse(data);
  ...
} catch (e) {}
```

Parsing failures are swallowed, so the app shows no browser error even when the stream format is wrong.

## Additional Issues

## Web search branch does not persist final messages

The tool-calling branch updates local `messages` but does not write final `currentMessages` back into `conversations`.

### Initial user message is persisted

`src/app/page.js:215-219`

```js
setConversations((prev) =>
  prev.map((conv) =>
    conv.id === currentId ? { ...conv, messages: updatedMessages } : conv,
  ),
);
```

### Final assistant/tool messages are only written to local state

`src/app/page.js:335-354`

```js
isStreamingComplete.current = true;
setStreamingContent("");
setStreamingThinking("");
...
setMessages(currentMessages);
setIsLoading(false);
```

There is no matching `setConversations(... messages: currentMessages ...)` in this completion path.

### Effect

The reply may appear in the current view, but disappear after:
- reloading the page
- switching conversations
- rehydrating from `localStorage`

That persistence model is defined in:
- `src/app/page.js:71-80` for initial load
- `src/app/page.js:103-105` for saving `conversations` to `localStorage`

## Title generation path is also inconsistent

`generateTitle()` expects JSON when `stream: false` is set.

### Client request

`src/lib/api-client.js:123-149`

```js
const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [...],
    apiKey,
    stream: false,
  }),
});

const data = await response.json();
```

### Server behavior

`src/app/api/chat/route.js:8-41`

```js
const { messages, model, apiKey, artifacts, tools: clientTools, think } = await req.json();
...
return result.toTextStreamResponse();
```

The route ignores `stream: false` and always returns a stream. That makes title generation inconsistent and forces the fallback path.

## Affected Files

- `src/app/api/chat/route.js`
- `src/lib/api-client.js`
- `src/app/page.js`
- `src/components/chat/MessageList.jsx`

## Recommended Fix

### 1. Unify the stream format

Pick one protocol and use it on both sides.

#### Option A: Keep the current client parser

Change `/api/chat` to return SSE/OpenAI-style `data: {...}` chunks that match `src/lib/api-client.js:88-109`.

#### Option B: Keep `toTextStreamResponse()`

Change `streamChatCompletion()` in `src/lib/api-client.js:75-113` to read raw streamed text instead of expecting `data: ` JSON lines.

Option B is the smaller change if tool/thinking metadata is not required in the current server stream format. If those deltas are required, the route should emit a structured stream instead.

### 2. Persist final web-search results

In the web-search completion branch in `src/app/page.js:335-375`, update both:
- `messages`
- the matching conversation inside `conversations`

That branch should mirror the persistence behavior already present in the non-web-search path at `src/app/page.js:466-472`.

### 3. Honor `stream: false` in `/api/chat`

The route should branch between:
- streaming response for chat UI
- JSON response for title generation and other non-streaming callers

## Validation Checklist

### Normal chat

1. Send a prompt with web search off.
2. Confirm `streamingContent` appears during generation.
3. Confirm the final assistant message remains visible after completion.
4. Reload the page and confirm the message is still present.

### Web search chat

1. Send a prompt with web search on.
2. Confirm the final assistant reply remains visible after completion.
3. Switch away and back to the conversation.
4. Reload the page and confirm the reply persists.

### Title generation

1. Start a brand-new chat.
2. Send the first prompt.
3. Confirm the conversation title updates from `New Chat`.

## Expected Outcome

After the fix:
- streamed assistant content is parsed consistently
- persisted assistant messages contain real content instead of `""`
- blank assistant messages stop appearing
- web-search replies survive reloads and conversation switches
- title generation works without silently falling back
