# Exa Integration Guide

This document describes how to integrate Exa API functionality into the HCAI Chat application.

## What is Exa?

Exa is a web search API that provides:
- **Search**: Search the web for pages matching a query
- **Find Similar**: Find pages similar to a given URL
- **Contents**: Extract page contents from URLs
- **Answer**: Answer questions with live web context

## API Endpoints

All endpoints are proxied through `ai.hackclub.com/proxy/v1/exa/`:

1. `POST /search` - Search the web
2. `POST /findSimilar` - Find similar pages  
3. `POST /contents` - Extract page contents
4. `POST /answer` - Answer questions with web context

## Authentication

All requests use the Hack Club AI API key (same as chat completions).

## Implementation Summary

The following files have been added/modified:

### 1. API Route: `src/app/api/exa/route.js`
- Proxies requests to Hack Club AI's Exa endpoints
- Handles streaming responses for the `answer` endpoint
- Validates endpoint parameter

### 2. Client Functions: `src/lib/api-client.js`
Added functions:
- `exaSearch(query, options)` - Search the web
- `exaFindSimilar(url, options)` - Find similar pages
- `exaContents(urls, options)` - Extract content from URLs
- `exaAnswer(query, options)` - Answer questions with web context
- `streamExaAnswer(query, onChunk, onError, onComplete, options)` - Stream answers

### 3. Exa Client: `src/lib/exa-client.js`
- Exports all Exa functions
- Provides tool definitions for function calling
- Example `ExaChatSystem` class for chat integration

## Usage Examples

### Basic Web Search

```javascript
import { exaSearch } from '@/lib/exa-client';

const results = await exaSearch('Hack Club projects', { numResults: 5 });
console.log(results);
```

### Find Similar Pages

```javascript
import { exaFindSimilar } from '@/lib/exa-client';

const similar = await exaFindSimilar('https://hackclub.com/', { numResults: 5 });
console.log(similar);
```

### Extract Content from URLs

```javascript
import { exaContents } from '@/lib/exa-client';

const contents = await exaContents(['https://hackclub.com/']);
console.log(contents);
```

### Answer Questions with Web Context

```javascript
import { exaAnswer } from '@/lib/exa-client';

const answer = await exaAnswer('What is Hack Club?');
console.log(answer);
```

### Streaming Answers

```javascript
import { streamExaAnswer } from '@/lib/exa-client';

let fullContent = '';

await streamExaAnswer(
  'What is Hack Club?',
  (chunk) => {
    fullContent += chunk;
    console.log('Streaming:', chunk);
  },
  (error) => {
    console.error('Error:', error);
  },
  () => {
    console.log('Complete:', fullContent);
  },
  { numResults: 5 }
);
```

### Integration with Chat System

```javascript
import { ExaChatSystem } from '@/lib/exa-client';

const exaChat = new ExaChatSystem(apiKey);

// Non-streaming
const response = await exaChat.sendMessage('What is Hack Club?');
console.log(response.content);
console.log(response.citations);

// Streaming
const response = await exaChat.sendMessage('What is Hack Club?', {
  stream: true,
  onChunk: (chunk) => {
    console.log('Streaming:', chunk);
  },
  onComplete: (fullContent) => {
    console.log('Complete:', fullContent);
  }
});
```

## Integration Options

### Option 1: Dedicated Web Search Mode
Add a toggle in the UI to switch between regular chat and web search mode.

### Option 2: Automatic Detection
Automatically detect when a user needs web search (e.g., questions about current events, specific facts).

### Option 3: Tool Calling
Use the tool definitions provided in `exa-client.js` for function calling.

### Option 4: Hybrid Approach
Use regular chat for general conversations and switch to Exa when specific web search is needed.

## Example: Adding Web Search to Chat

```javascript
// In your chat component
const handleSendMessage = async (content) => {
  const needsWebSearch = content.toLowerCase().includes('search') || 
                         content.toLowerCase().includes('web') ||
                         content.toLowerCase().includes('current') ||
                         content.toLowerCase().includes('news');

  if (needsWebSearch) {
    // Use Exa for web-powered responses
    const response = await exaAnswer(content, {
      numResults: 5,
      useAutoprompt: true
    });
    
    addMessage({
      role: 'assistant',
      content: response.answer,
      citations: response.citations
    });
  } else {
    // Use regular chat completion
    // ... existing logic
  }
};
```

## Error Handling

All Exa functions throw errors when:
- API key is not found
- Network requests fail
- Exa API returns an error

Example error handling:

```javascript
try {
  const result = await exaSearch('query');
} catch (error) {
  console.error('Exa API error:', error.message);
  // Handle error appropriately
}
```

## Notes

- Exa usage counts toward your normal Hack Club AI daily spending limit
- The proxy records Exa's `costDollars.total` value for each request
- Exa access requires the `enable_exa` feature flag (closed beta)
- Contact @mahad on Slack for access
