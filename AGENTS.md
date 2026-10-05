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
  No Radix, no shadcn; React Aria Components throughout, plus `class-variance-authority`
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
  `Header`, `SidebarContent`, `MessageList`, `ChatInput`, `ArtifactPanel`
  (the right panel: artifact preview **and** the `SandboxTerminal` command
  transcript on one track, switched by header tabs), `SandboxTerminal`,
  `ModelPicker`, `ContextUsage`, `ResponseMetrics`, `CustomLink`,
  `ThinkingIndicator`, and `message/` (row/bodypart components).
- `src/components/settings/` — `SettingsModal` orchestrator + one file per
  section + shared `chrome.jsx`. Five sections: Connection, Sandbox, Models,
  Appearance, Behavior.
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
mid-tool-execution. `api-client.js` retries **once** with a fresh streamed
request — on transport failure, on a clean EOF that delivered nothing at all,
and on a clean EOF that delivered content **without the server's `data: [DONE]`
marker**: the marker is the only proof the answer is whole, so content without
it is a truncation, not a completion (finding 15 — this was the silent cutoff
bug). The retry streams for a reason: a non-streaming request sends *zero
bytes* for the whole regeneration, which is exactly what a proxy read-timeout
kills — a long answer can finish at the provider, get billed, and still die on
the way back (finding 16). It uses a fresh frame router so its ending is
judged on its own evidence. Precedence: empty → replay; marker → complete; a
delivered error frame → complete and already surfaced, never retried;
content or a search/sandbox `serverEvent` without the marker → **continue**;
thinking-only without the marker → **continue** too (the assistant turn is sent
back with `reasoning_details` attached so the model resumes its reasoning, not
restarts it); tool-call-only without the marker → replay (nothing a text
continuation could anchor to). Error bodies are not
guaranteed to be JSON — a proxy answers a dead upstream with plain text, so
`postChat` reads the body as text first and surfaces `Chat API Error (502) …
— Bad Gateway` instead of a JSON parse crash (finding 16). A failed turn
commits whatever partial text it has alongside the error instead of
`content: ""`. A read silent for 15s (the server keepalives every 5s), or one
that goes stale while its tab is backgrounded, is cancelled into that same
EOF decision instead of hanging. `sse-parser.js` holds the frame buffer; a
partial frame waits for its boundary rather than being decoded early, and
`[DONE]` dispatches as `SSE_DONE`.

The one blind spot that remained — a clean upstream cut mid-answer — is closed
on the server: `streamText` ends such a cut with `finishReason: "other"` (a
normal end is `stop`/`length`/`tool-calls`; probed), and the route then closes
**markerless** instead of writing `[DONE]`, so the client's continue logic
resumes the answer rather than committing the truncation. The `[stream start]`
/ `[stream end]` logs (finishReason, duration, steps, usage) correlate with the
client's markerless-EOF warning to identify which leg a cut happens on.

### The agent loop is client-side
The browser drives the loop: each round is one short stream, the route opens a
single `client.chat.completions.create` round (the official OpenAI SDK against
`https://ai.hackclub.com/proxy/v1`) and emits the upstream deltas in the
wire-shape the client already parses (`content`, `thinking` from
`delta.reasoning`/`reasoning_details`, `tool_calls`), and tool execution
itself happens on the client via the on-demand endpoints (`/api/sandbox` for
E2B, `/api/tools` for search/calculator — keys stay server-side). The round
ends at the first assistant completion, no matter whether it is text or a
`finish_reason: "tool_calls"`. No single connection spans the turn — during
E2B execution the chat connection is closed, which is what keeps long agent
turns off the duration cap that cut them. Usage is summed across rounds into
the final message. Rounds are unlimited by default (Libre's
`tool_max_iterations` pattern).

### Continue, don't regenerate (finding 17)
A replay regenerates the *whole* answer, so under a deterministic killer in
front of the app (a duration/size cap — production saw "retry failed" twice at
the same spot) the replay reaches the same length and dies the same death.
A cut that delivered text, a search result, or a sandbox result is therefore
**continued**: a new streamed request whose body is the original messages plus
the partial as an `assistant` turn plus a "continue exactly where it stopped"
user message — only the remainder is generated. Continuations **append**;
`onFallbackStart` (the replay's clear-on-first-chunk) never fires for them, so
the partial and sources stay on screen, and because they never re-run search
or tool work, a tool-result cut continues visibly instead of completing
silently the way it did before. Mechanics to know before touching it:
- The seam: a leg's first ~160 chars are held against the partial's last 240
  and a matched overlap is trimmed once (`trimOverlap`, min 12 chars) — a
  model that repeats the tail it was shown loses the repeat, not the answer.
  Held bytes flush before the next leg and before an error commit, or text is
  lost; flushing is idempotent.
- Budgets: `MAX_CONTINUE_LEGS` (3) legs in total, `MAX_EMPTY_LEGS` (2)
  consecutive legs that delivered nothing — an empty leg is *continued again*
  (product decision), never spun on. Exhausted budgets reuse the replay's two
  error texts, so the partial still commits alongside them; a leg that threw
  surfaces its own message when its budget runs out.
- The one replay still exists for endings with nothing to continue from
  (empty, thinking-only), and a replay that is itself cut hands its partial to
  the continuation — one replay, then bounded continuations, never a second
  regeneration. Mirror caveat: the client mirrors delivered content for exactly
  one purpose — the next leg's `assistant` turn — so keep every router fed
  through `mirroredHandlers.onChunk`.
- Known limitations: metrics reflect the last leg only (cut legs never
  receive a `usage` frame), a client-side cut does not abort server-side
  generation, and `finish_reason` is never forwarded.

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
- **No Radix, no shadcn.** `src/components/ui/` is gone and `radix-ui` is out of
  `dependencies`. RAC links `aria-labelledby` to a heading **only** when the
  heading declares `slot="title"`. Two tooltip traps remain: the trigger must be a
  React Aria `Button` (a bare `<button>` is silently not wired to hover), and
  `isOpen` on a `TooltipTrigger` makes it inert — it is uncontrolled-only, and a
  controlled `false` means hover can never open it.
- **Negative-control every new check.** Break the thing, confirm the check fails,
  restore. Two checks here passed against the wrong thing and were only caught by
  asking what they would *report* if their subject were wrong — a title-generation
  check that scraped the sidebar and matched a nav button called `"Settings"`,
  and a header-gating check that asserted on a DOM node React had already
  replaced. A green check is not evidence; a red one under a deliberate break is.
  **Verify the break landed before trusting the red-or-green at all**: a `perl -0pi`
  pattern that drifted from what `biome format` actually printed, or a `?` read as a
  regex quantifier instead of a literal, edits *nothing* — the check stays green and
  reads as a pass. Grep the source for the break first. And never run
  `sed 's/^$/…/'` over a file: it rewrites every blank line in it.
- **A control that exists in the DOM can still be unreachable.** The closed
  side panel's grid track is `0px` wide at the viewport's right edge, and the
  reopen button rendered *inside* it came out at `left: 1280` on a 1280px
  window — `visible`, `flex`, off-screen, `elementFromPoint` → `null` — while
  `queryByLabelText` passed for weeks. Any control living in a collapsed,
  zero-sized or off-screen container needs its geometry checked in
  `scripts/smoke.mjs` (`getBoundingClientRect` inside the viewport **and**
  `elementFromPoint` hitting it), not just a presence assertion. Presence is
  free; reachability is layout, and jsdom has none.
- **A measurement that is constant in the test environment can never fail.** jsdom matches no
  media query, so `useIsDesktop()` is `false` in every test and `ChatLayout`'s panel track is
  always `0px` — a check for "the track is wrongly reserved for a panel that rendered nothing"
  passed against exactly that. Anything asserting on viewport-dependent layout has to pin
  `window.matchMedia` to a desktop viewport first (`components/chat/__tests__/ArtifactPanelVisibility.test.jsx`).
  The same class of failure: a negative control you wrote to prove a check has teeth, which
  passes because *your break* was malformed — its dependency array threw before the assertion
  ran, or its condition was already tautological. If the break does not fail the check, the
  check is not yet doing anything.
- **jsdom has no layout engine at all, so a layout bug lives only in the browser.** A grid
  item's `min-height` defaults to `auto` — its content-based minimum — so a tall answer grew
  `ChatLayout`'s row past `h-screen`, where `overflow-hidden` clipped the composer below the
  fold and neither the page nor the thread had anything to scroll. Every box measures `0`
  under jsdom with or without `min-h-0`, so no unit test could have seen it; the check is
  `scripts/smoke.mjs` seeding a 12,870px conversation and measuring the composer's bottom
  against the real viewport.
- **A styling rule written for one renderer styles everything else too.** `globals.css`
  indents markdown lists with `ul:not([class*="list-none"]) { padding-left: 1.5em }`. The
  selector is global, so it also caught the sidebar's conversation list — titles sat 46px in
  from the edge of a 260px sidebar, and nobody saw it as a bug because it read as padding.
  `list-none` is the rule's own opt-out. Before adding a `:not([class*="..."])` gate, grep for
  the class it expects callers to carry.
- **React 19 does not warn about everything people assume it warns about.** Passing a *string*
  event handler used to log `Expected onError listener to be a function`; 19 does not say it,
  so a console check aimed at that string can never fail (that was one of the checks in this
  repo). Smoke now captures the console from first paint and asserts on what 19 actually
  emits — and note the limit: React Aria warns about missing labels only on **its own**
  controls. A plain `<button role="switch">` with no accessible name says nothing at all, so
  those names belong in a unit test (`components/settings/__tests__/chrome.test.jsx`), not in
  the console.
- **A shared stream response is a one-shot reader.** `mockResolvedValue(makeStreamResponse(..))`
  hands the same reader to every turn; the second turn sees an empty stream and takes the error
  path, so a two-turn test fails for a reason unrelated to what it is testing. Use
  `mockImplementation(() => makeStreamResponse(...))`.
- **Reset stores in `beforeEach`** (table above).
- **`vi.spyOn(globalThis.indexedDB, "open")` does not intercept
  fake-indexeddb.** Use a stand-in factory with a counter.
- **A React Aria tooltip does not open under jsdom when its trigger contains
  element children** (an icon, an `<svg>`, a value) — and every trigger here is
  one. Drive **focus** instead: it works, and it is the keyboard path, which is
  the more important half of the contract. Hover is covered by `scripts/smoke.mjs`
  with a real `Input.dispatchMouseEvent`, which needs **two** moves rather than
  one — a single `mouseMoved` does not reliably produce the enter event hover is
  built on, and `el.click()` never opens a pointer-driven tooltip at all.
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
