# HCAI Chat

A (vibe-coded) chat interface for Hack Club AI. 

## Features
- Agent Mode - executes JavaScript and shell commands in a per-conversation secure sandbox (e2b), with inline code blocks, live output, and file downloads
- Web search
- HTML artifacts
- File uploads (images, PDFs, text)
- Conversation history with search and rename
- Thinking/reasoning display
- Response metrics (tokens, time, cost, context)
- Dark mode and theme customization

## Setup

1. Install dependencies:
   `npm install`

2. Run the development server:
   `npm run dev`

3. Open http://localhost:3000

You need an API key from ai.hackclub.com.

## Scripts

- `npm run dev` - Start dev server
- `npm run build` - Build for production
- `npm run lint` - Run Biome linter
- `npm run format` - Format code with Biome
- `npm run test` - Run tests

## Tech Stack

Next.js (App Router), Tailwind CSS v4, Shadcn UI, AI SDK v6, Streamdown, Framer Motion, e2b, Biome, Vitest.
