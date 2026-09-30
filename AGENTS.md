# AGENTS.md — Coding Agent Guide for HCAI Chat

Orientation for agents working on this repo. It describes the code as it is
today. Where a decision has a non-obvious reason, the reason is here too, so it
does not have to be rediscovered by breaking something.

**`REWRITE.md` is the working tracker** for the frontend rewrite: phase status,
the file→phase inventory, and a `Findings from PN` section per phase recording
the traps that were found the hard way (a parser that tested a copy of itself, a
controlled prop that silently bypassed a delay, a `setPointerCapture` that threw
before the cursor lock). Read the relevant section before touching an area it
covers.

## Project overview

A chat interface on **Next.js (App Router)**: real-time streaming, web search,
an Agent Mode that runs code in per-user **E2B cloud sandboxes** (always
available; the user supplies their own E2B key), and an Artifacts system that
renders HTML the model emits. It talks to the Hack Club AI proxy
(`https://ai.hackclub.com/proxy/v1`).

## Tech stack

- **Framework**: Next.js 16 (App Router), React 19, JavaScript (ESM) + JSX
- **Styling**: Tailwind CSS v4. **Two** config surfaces: theme tokens live in
  `@theme inline` in `src/app/globals.css`, and a legacy `tailwind.config.js`
  still exists but is **not loaded** (there is no `@config` directive) — treat
  it as dead.
- **Components**: **React Aria Components** in `src/components/primitives/`.
  One Radix holdout: `src/components/ui/tooltip.jsx` (see the exception below)
- **Icons**: `lucide-react`
- **API**: Next.js API routes (serverless)
- **Streaming**: AI SDK v7 (`ai` + `@openrouter/ai-sdk-provider`)
- **Markdown**: Streamdown (+ cjk, code, math, mermaid plugins)
- **Sandbox**: E2B SDK **pinned to `2.37.0`**
- **Quality**: Biome (lint + format), Vitest + React Testing Library + jsdom

## Architecture — read this first

State lives in **four module-level stores**, not in a single `useState` pile.
Each owns one domain and is read directly by whichever component needs it, so
data is not threaded down as props from a single owner.

| Store | Owns | Reset for tests |
|---|---|---|
| `src/stores/settings.js` | display toggles, model choice, theme | `resetSettings()` |
| `src/stores/models.js` | model catalog, context windows, tool support | `resetModels()` |
| `src/stores/conversations.js` | conversation list, active id, messages | `resetConversations()` |
| `src/stores/turn.js` | the in-flight response: content, thinking, sandbox tools, loading, error, predicted usage | `resetTurn()` |

They are plain `createStore`/`useStore` singletons (`src/lib/store.js`).
**Because they are module-level, any test that touches one must reset it in
`beforeEach`** or state leaks into the next test. This is the single most
common source of confusing test failures in this repo.

`conversations.js` also exports mirrors (`conversationsRef`, `messagesRef`,
`activeConversationRef`) that are updated **synchronously** inside `commit()`,
because the stream loop reads them in the same tick it mutates state.

## Directory map

- `src/app/` — pages and API routes. `page.js` is a **10-line pass-through** to
  `ChatApp`; `search/page.js` renders the same component with `initialQuery` /
  `initialSearchEnabled`.
  Routes: `balance`, `chat`, `models`, `pricing`, `sandbox`, `tools`, `upload`.
- `src/components/primitives/` — the Aria layer. `button`, `dialog`, `input`,
  `label`, `menu`, `popover`, `select`, `sheet`, `tooltip`, plus `index.js`.
- `src/components/chat/` — `ChatApp` (the composition root), `ChatLayout`,
  `Header`, `SidebarContent`, `MessageList`, `ChatInput`, `ArtifactPanel`,
  `ModelPicker`, `ContextUsage`, `ResponseMetrics`, `CustomLink`,
  `ThinkingIndicator`, and `message/` (row/bodypart components).
- `src/components/settings/` — `SettingsModal` orchestrator + one file per
  section + shared `chrome.jsx`. Five sections: Connection, Sandbox, Models,
  Appearance, Behavior.
- `src/components/ui/tooltip.jsx` — **the only Radix file left.**
- `src/hooks/` — `use-chat-turn.js` (the send lifecycle), `use-thread-scroll.js`
  (tail-following), `use-media-query.js`.
- `src/lib/` — pure/client helpers. `api-client.js` (SSE chat client),
  `sse-parser.js` (frame splitting), `db.js` (IndexedDB), `store.js`,
  `settings.js` (the storage-key table), `artifacts.js`, `tools.js`,
  `sandbox.js`, and others.

### Do not edit these casually

`artifacts.js`, `messages.js`, `model-pricing.js`, `tool-stream.mjs`,
`tools.js`, `sandbox.js` and `sandbox-executor.js` are imported by **API
routes**, so they run on the server too. Keep them free of React and browser
globals.

## Mechanics worth knowing before you change them

### The turn store, and why it buffers
`stores/turn.js` holds the in-flight response. Text and reasoning accumulate in
module-level **buffers**, and the rendered store values are only a mirror
published **once per animation frame** — a fast model pushes dozens of chunks a
second and each store write re-renders the whole thread. The commit path reads
the buffers directly (`readTurnDeltas()`), never the rendered snapshot, which is
what stops a response losing its tail. `setContextUsage()` is separate and
immediate: a server-reported total is a fact, and it drops any buffered
prediction so a pending frame cannot overwrite the real number with an estimate.

### Stream rendering is conversation-scoped
A stream running for another conversation must never render here. `MessageList`
compares `streamingConversationId` against `activeConversation` **once**, at the
top, and gates every stream value on it. `StreamingMessage` therefore takes its
text and tool list as **props**, not from the store — do not "simplify" it into
a store read, that is the leak the check exists to prevent.

### SSE resilience
The Caddy proxy advertises HTTP/3 and can reset long-lived SSE streams
mid-tool-execution. `api-client.js` retries **once** via the non-streaming path
— on transport failure, and on a clean EOF that delivered nothing at all. Tool
results and error frames count as *delivered* and must never trigger a retry,
because their work already happened server-side. `sse-parser.js` holds the frame
buffer; a partial frame waits for its boundary rather than being decoded early.

### Storage and schema are contracts
`contracts.test.js` pins the fourteen `localStorage` storage keys, the
IndexedDB database name / store / `keyPath`, and the rule that the E2B key never
appears in a URL. **None of these fail loudly if broken** — a renamed key reads
back as a default, a renamed store reads back as an empty history. A deliberate
rename has to edit that test too.

### Hydration safety
Never read `localStorage` during render. Initialise state to a server-safe
default and populate it in a mount effect, or the first client paint disagrees
with the server HTML.

## Testing

```
npm test          # single run — the gate
npm run test:watch
npm run lint      # biome check
npm run format    # biome format --write
npm run build     # must stay clean; `e2b` is lazy-loaded specifically to keep it from OOMing
node scripts/smoke.mjs   # end-to-end, needs `npm run dev` on :3000
```

Traps, all of which have cost real debugging time:

- **Biome does not lint or format test files.** `biome.json` excludes
  `**/__tests__` and `**/*.test.*`, so `npm run lint` and `npm run format` skip
  every one of them. Test files are yours to keep tidy.
- **No overlay opens inside a dialog under jsdom** — not menus, not selects.
  A `Menu` inside the settings dialog produces zero items, and it has since P4.
  This is a jsdom limitation, not a regression. `scripts/smoke.mjs` is what
  actually verifies overlays, because it runs a real browser.
- **`ui/tooltip.jsx` is the only Radix holdout**, and it is not stuck: the Aria
  equivalent is in `primitives/tooltip.jsx` with a passing test. Migrating it is
  a matter of changing four call sites. Two things to know if you do — the
  working composition is `TooltipTrigger` wrapping **both** the trigger and the
  content (`<TooltipTrigger><Button/><Tooltip>…</Tooltip></TooltipTrigger>`);
  nesting a bare `Tooltip` around a button instead renders nothing — and RAC
  links `aria-labelledby` to a heading **only** when the heading declares
  `slot="title"`. `primitives/tooltip.jsx` is currently unused.
- **Reset stores in `beforeEach`** (table above).
- **`vi.spyOn(globalThis.indexedDB, "open")` does not intercept
  fake-indexeddb.** Use a stand-in factory with a counter.
- **Radix tooltips render twice** — a visible one and a visually-hidden copy for
  assistive tech. `queryByRole("tooltip")` therefore cannot answer "is it
  visible"; assert the trigger's `data-state`.
- Model references: use `qwen/qwen3.6-flash` in tests. The app's default chat
  model is `xiaomi/mimo-v2.5`.
- Sandbox tests must `vi.mock("e2b", ...)` with a static factory and **not** use
  `vi.resetModules()`; re-evaluating a mocked module fails to destructure
  `Sandbox`.

### Before you commit
`npm run format`, `npm run lint`, `npm test`, `npm run build` — and
`node scripts/smoke.mjs` if you touched the chat path, settings, or any overlay.
**Stop the dev server before running the test suite**: on a 4-core box a warm
`next-server` starves it, and tests in files you did not touch fail on timeouts
that get *worse* on each retry. That is starvation, not a regression. See the
Smoke section of `REWRITE.md`.

## Coding guidelines

- Components read what they need from a store. Do not add a prop that only
  forwards a store value down two levels.
- Styling is Tailwind only, via `cn()`. Tailwind 4.2 has **no**
  `scrollbar-gutter` utility — the arbitrary-property form
  `[scrollbar-gutter:stable]` is used instead.
- **Motion tokens go in the plain `@theme` block in `globals.css`, not the
  `@theme inline` one.** `inline` emits the custom property but does *not*
  generate the matching `animate-*` utility, so the class is silently inert.
  Every `animate-hcai-*` class in the app was dead for two phases because of
  this, and the visual result was not wrong, so nothing caught it.
- **Verify a utility is real by grepping for its use, not its name.** These two
  look identical and prove opposite things:

  ```
  grep -c 'animate-hcai-fade-in'   # matches the *definition* in @theme — proves nothing
  grep -c 'var(--animate-hcai'     # only appears in a generated rule — this is the check
  ```
- **Entrances are opacity-only.** Nothing animates transform on mount, and
  anything that moves is something the thread underneath has to re-layout
  behind.
- API communication goes through `src/lib/api-client.js`.
- Explain *why* in a comment where the reason is not obvious from the code.
  Do not narrate what the line does.
