# Exa Tool Calling Implementation

## Overview

This document describes the implementation of Exa as a proper callable function/tool that can be used by the LLM through OpenAI-style function calling.

## Changes Made

### 1. Central Tool Registry (`src/lib/tools.js`)

Created a proper tool registry with:
- **Standardized tool schemas** following OpenAI function calling format
- **Tool execution functions** for each tool
- **Tool discovery** API (`getTools()`)
- **Tool execution API** (`executeTool()`)

Key features:
- Proper JSON Schema definitions with types, descriptions, and constraints
- Error handling and validation
- Extensible architecture for adding more tools

Available tools:
- `web_search`: Search the web using Exa's answer endpoint

### 2. Updated API Endpoints

**`/api/tools`** - Tool execution endpoint
- POST: Execute a tool by name with parameters
- GET: List available tools and their schemas

**`/api/chat`** - Enhanced chat endpoint
- Now accepts `tools` parameter for OpenAI-style function calling
- Passes tools to upstream AI API
- Maintains backward compatibility with existing `useWebSearch` toggle

### 3. Client-Side Tool Execution (`src/lib/api-client.js`)

Added `executeToolCall()` function to allow client-side code to execute tools directly.

## How to Use

### For AI Models (Function Calling)

The chat API now supports OpenAI-style tool calling:

```javascript
// Request with tools
{
  "messages": [...],
  "model": "gpt-4o-mini",
  "apiKey": "...",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "web_search",
        "description": "Search the web...",
        "parameters": {
          "type": "object",
          "properties": {
            "query": { "type": "string" },
            "numResults": { "type": "number" }
          },
          "required": ["query"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

The model will:
1. Decide when to call tools
2. Return `tool_calls` in the response
3. Client should execute tools and send results back

### From Client Code

```javascript
import { executeToolCall } from '@/lib/api-client';

// Execute a tool directly
const result = await executeToolCall('web_search', {
  query: 'What is the weather today?',
  numResults: 5
});

console.log(result);
// { 
//   tool: 'web_search',
//   result: 'Answer text...',
//   sources: [...],
//   metadata: { query: '...', numResults: 5, success: true }
// }
```

### List Available Tools

```javascript
// GET /api/tools returns all available tools
const response = await fetch('/api/tools');
const { tools } = await response.json();
```

## Architecture

```
┌─────────────────┐
│   Client UI     │
│   (page.js)     │
└────────┬────────┘
         │
         │ sends messages with tools array
         ▼
┌─────────────────┐
│  /api/chat      │  ← Handles tool calling
│  route.js       │    - Adds tools to request
└────────┬────────┘    - Streams responses
         │
         │ forwards to AI API with tools
         ▼
┌─────────────────────────────┐
│ AI API (Hack Club Proxy)    │
│ - Receives tool definitions  │
│ - Model decides to call tool│
│ - Returns tool_calls in delta│
└────────┬────────────────────┘
         │
         │ client sees tool_calls
         ▼
┌─────────────────┐
│   Client        │  ← Execute tools
│   (page.js)     │    - Call executeToolCall()
└────────┬────────┘    - Get results
         │
         │ send results back in follow-up message
         ▼
┌─────────────────┐
│  /api/chat      │
│  (continued)    │
└─────────────────┘
```

## Tool Definition Format

Tools follow the OpenAI function calling schema:

```javascript
{
  type: "function",
  function: {
    name: "tool_name",
    description: "What the tool does",
    parameters: {
      type: "object",
      properties: {
        param_name: {
          type: "string|number|boolean|array|object",
          description: "..."
        }
      },
      required: ["param_name"]
    }
  }
}
```

## Adding New Tools

1. Add execution function in `src/lib/tools.js`
2. Add tool schema to `TOOLS` array
3. Add case in `executeTool()` switch statement
4. Document the tool

Example:

```javascript
// 1. Execution function
async function executeNewTool(param1, param2) {
  // Implementation
}

// 2. Add to TOOLS array
{
  type: "function",
  function: {
    name: "new_tool",
    description: "...",
    parameters: { ... }
  }
}

// 3. Add to executeTool switch
case 'new_tool':
  return await executeNewTool(params.param1, params.param2);
```

## Testing

Test the tools endpoint:

```bash
# List tools
curl http://localhost:3000/api/tools

# Execute web_search
curl -X POST http://localhost:3000/api/tools \
  -H "Content-Type: application/json" \
  -d '{"tool":"web_search","parameters":{"query":"test query"}}'
```

## Benefits

- **Standardized**: Uses OpenAI function calling format
- **Extensible**: Easy to add new tools
- **Centralized**: Single source of truth for tool definitions
- **Client-agnostic**: Works with any client that follows the schema
- **Backward compatible**: Existing web search toggle still works

## Notes

- The existing `useWebSearch` toggle in the UI bypasses tool calling and sends requests directly to Exa.
- True tool calling requires the AI model to support function calling (most modern models do).
- The implementation is ready for automatic tool calling where the AI decides when to search.
- To enable full tool calling, the client code (`page.js`) should be updated to handle `tool_calls` in the response and execute them automatically.
