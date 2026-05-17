Here is a complete, production-ready documentation file for `streamdown` (Streamdown.ai). You can save this file as `STREAMDOWN_GUIDE.md` or `README.md`.

---

# Streamdown.ai — Usage Guide

`streamdown` is an open-source, streaming-optimized Markdown renderer for React, created by Vercel. Designed as a drop-in replacement for `react-markdown`, it is re-imagined from the ground up for AI chat applications where text arrives token-by-token.

Unlike traditional libraries that re-parse the entire document on every update, Streamdown splits content into discrete blocks and formats incomplete tokens in real-time—preventing layout shifts and ensuring a smooth user experience.

---

## Key Features

* **Streaming Optimization:** Built-in caret/cursor indicators and intelligent token parsing. Incomplete bold text or markdown blocks style seamlessly on the fly.
* **Typography & GFM:** Built-in Tailwind typography and GitHub Flavored Markdown (tables, task lists, strikethroughs, autolinks).
* **Rich Plugin Ecosystem:** Dedicated, tree-shakeable plugins for interactive Shiki syntax highlighting, KaTeX math formulas, and interactive Mermaid diagrams.
* **Security & Link Safety:** Strict Origin validation for content, coupled with optional link safety confirmation modals.

---

## 1. Installation

Install the core renderer via your preferred package manager:

```bash
npm install streamdown
# or
yarn add streamdown
# or
pnpm add streamdown

```

### Optional Plugins

Streamdown uses isolated packages to keep your production bundle lean. Install only what your AI requires:

```bash
npm install @streamdown/code @streamdown/mermaid @streamdown/math @streamdown/cjk

```

---

## 2. Tailwind CSS Configuration (Required)

Streamdown uses Tailwind CSS under the hood for elements like headings, lists, and code blocks. You **must** configure Tailwind to scan Streamdown's bundle for utility classes.

### For Tailwind CSS v4 (`globals.css`)

Add the source path directive to your main CSS file:

```css
@source "../node_modules/streamdown/dist/*.js";

```

### For Tailwind CSS v3 (`tailwind.config.js`)

Include the distribution file paths within your config array:

```javascript
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/streamdown/dist/*.js", // <-- Crucial line
  ],
  plugins: [
    require('@tailwindcss/typography'), // Optional but recommended
  ],
};

```

---

## 3. Basic & Static Usage

For static contexts such as blogs, markdown files, or pre-rendered documentation, invoke `mode="static"`.

```tsx
import { Streamdown } from 'streamdown';

export default function StaticDoc() {
  const markdownContent = "# Hello World \n This is static markdown layout.";
  
  return (
    <Streamdown mode="static">
      {markdownContent}
    </Streamdown>
  );
}

```

---

## 4. Advanced Streaming Setup (With Vercel AI SDK)

The core strength of Streamdown shines when paired with real-time text generation (e.g., `useChat` hook from `@ai-sdk/react`).

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code'; // Syntax highlighting plugin

export default function AIInterface() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <div className="flex flex-col max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex-1 space-y-4 overflow-y-auto">
        {messages.map((msg, index) => {
          const isLatestAssistantMessage = 
            isLoading && 
            index === messages.length - 1 && 
            msg.role === 'assistant';

          return (
            <div key={msg.id} className={`p-4 rounded ${msg.role === 'user' ? 'bg-gray-100' : 'bg-white'}`}>
              <Streamdown 
                plugins={{ code }} 
                caret="block" // Options: "block", "inline", or false
                isAnimating={isLatestAssistantMessage}
              >
                {msg.content}
              </Streamdown>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input 
          className="border p-2 flex-1 rounded"
          value={input} 
          onChange={handleInputChange} 
          placeholder="Ask something..."
          disabled={isLoading} 
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
          Send
        </button>
      </form>
    </div>
  );
}

```

---

## 5. Plugin Integration

To enable richer content types like LaTeX formulas and visual state flows, load the modules directly into the `plugins` prop array:

```tsx
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { cjk } from '@streamdown/cjk';

function HighPerformanceRenderer({ payload }) {
  return (
    <Streamdown 
      plugins={{ 
        code,    // Enables Shiki-powered copyable code-blocks
        math,    // Enables LaTeX render blocks (KaTeX)
        mermaid, // Renders interactive diagrams with fullscreen controls
        cjk      // Handles proper Asian typography and punctuation spacing
      }}
    >
      {payload}
    </Streamdown>
  );
}

```

---

## 6. Configuration API Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `string` | `""` | The raw markdown text block or streaming buffer chunk. |
| `mode` | `"stream" | "static"` | `"stream"` | Changes parser strategy. Use `static` for instant complete text renders. |
| `caret` | `"block" | "inline" | false` | `false` | Visual text insertion pointer styled automatically at the terminal line end. |
| `isAnimating` | `boolean` | `false` | Toggles whether the caret pulses or animations stay active. |
| `plugins` | `Record<string, StreamdownPlugin>` | `{}` | Register extra functional formatting wrappers (Code, Math, Mermaid). |
| `components` | `Record<string, React.ComponentType>` | `{}` | Component overrides to map custom elements (e.g., custom handling for `<a />`). |
