# Frontend Rewrite — Working Tracker

## Status

| | |
|---|---|
| **Phase** | **P3 complete** → next: P4 (models: store + `ModelPicker` + `ContextUsage`) |
| **Baseline commit** | `8aa44a6` fix(chat): scope stream rendering per conversation and drop stale UI state |
| **Baseline test suite** | 29 files / **385 tests passing**, 22.1s (`npm test`) |
| **Current test suite** | 32 files / **449 tests passing** — lint, format and `next build` all clean · smoke **10/10** |
| **Origin sync SHA** | `8aa44a6` — every phase starts with a sync against this |
| **Stack** | Next.js App Router · React · Tailwind v4 (existing tokens/themes unchanged) · React Aria Components · Vitest + RTL |

## P2 decomposition — where everything lives now

| File | Lines | Contents |
|---|---|---|
| `src/app/page.js` | 15 | Thin route: re-exports `Home` → `ChatApp`. **`search/page.js` imports `Home` from here — keep the name.** |
| `src/components/chat/ChatApp.jsx` | 389 | The former `page.js` body, verbatim. All state/effects/handlers. |
| `src/components/chat/ChatLayout.jsx` | 171 | Shell: sidebar width/drag state, `<aside>`, composes `Header` + `main` + panel slot. |
| `src/components/layout/SidebarContent.jsx` | 270 | Conversation list: search filter, rename, delete, long-press. **P5 seam.** |
| `src/components/layout/Header.jsx` | 224 | Collapse button, mobile sheet, 4 feature toggles, `ModelPicker`, `ContextUsage`. **P4 seam.** |

**Proved verbatim** with `diff` against `HEAD` — the only deltas are the seams themselves:
`page.js→ChatApp` 1 line (function name) · `SidebarContent` 1 line (`export default`) ·
`ToggleButton` 0 lines · header JSX 2 lines (`setSidebarOpen`/`setMobileSheetOpen` → props).

**Deferred polish (do not sneak into a phase):** the four header toggles and the sidebar
collapse button are icon-only with no `aria-label`. Adding labels is an a11y behaviour change
— schedule it with the P9 primitive swap, not during a mechanical phase.

## P3 decomposition — Settings

`src/components/chat/SettingsModal.jsx` (661 lines) → `src/components/settings/`:

| File | Lines | Contents |
|---|---|---|
| `settings/SettingsModal.jsx` | 175 | Shell: dialog, key state, `handleSave`, section switch, footer. |
| `settings/sections.js` | 47 | The `SECTIONS` registry (ids, labels, descriptions, icons). |
| `settings/chrome.jsx` | 106 | `SectionLabel`, `SectionHeading`, `SwitchRow`, `KeyInput` — the four shapes every section reuses. |
| `settings/SectionNav.jsx` | 91 | Desktop `SidebarNav` + `MobileSectionPills`. Holds the `DialogTitle`. |
| `settings/{Connection,Sandbox,Models,Appearance,Behavior,Data}Section.jsx` | ~50 each | One section per file: props in, JSX out. |

`hooks/use-settings.js` was **deleted in the same commit** as `src/stores/settings.js` (P3a) —
single-writer rule. Its 8 assertions moved to `src/stores/__tests__/settings.test.js`.

## Findings from P3 — read before touching dialogs

1. **The `Dialog` primitive cannot place its title.** RAC `Dialog` takes `title` as a prop and
   renders a fixed header; Settings puts its `DialogTitle` *inside* the sidebar nav
   (`hidden sm:flex`), and the test pins exactly one `getByText(/^Settings$/)`.
   **→ the Radix→Aria dialog swap is deferred to P9**, where all four consumers
   (`SettingsModal`, `ChatApp`, `ImportDialog`, `CustomLink`) move together. The primitive
   needs context-registered `DialogTitle`/`DialogDescription` first — design it against all
   four at once, not piecemeal. Radix `Dialog` is also *not* on the anti-jank list (that is
   ScrollArea / framer-motion / tw-animate-css), so nothing is lost by waiting.
2. **Settings must keep calling `useModels()` itself** — it cannot take `groupedModels` as a
   prop, because the `fetches models on open` test renders the modal *alone* and needs the
   fetch to originate here. ChatApp was passing a `groupedModels` prop Settings never
   accepted. Dead prop, removed.
3. **Mobile settings content was unreachable (real bug, now fixed).** The body is
   `flex flex-col max-h-[90vh]` and the content column was `flex-1` with no `min-h-0`, so
   `min-height:auto` refused to shrink and Radix's `overflow-hidden` ScrollArea root clipped
   the bottom of every section — Save/Cancel included. Replaced `ScrollArea` with
   `overflow-y-auto min-h-0`. **This is a behavior change, not a refactor**: the smoke script
   must scroll Settings on a narrow viewport.
4. **`ui/scroll-area` has two consumers left** — `MessageList` (P7) and `SidebarContent`
   (P5). It dies with the last one.
5. **Switches are switches now.** The old `Toggle` was a bare `<button>`: no `role`, no
   `aria-checked`, no label association. `SwitchRow` renders `role="switch"` + `aria-checked`
   + `<label for>`, so the name and state are announced and clicking the visible label
   toggles it. DOM depth is unchanged, which is why the original
   `parentElement.parentElement.querySelector("button")` assertions still hold.
6. **P3a caught a shipped-but-unshipped bug**: `applyThemeClass` added the raw theme name
   (`sunrise`) instead of the class name (`theme-sunrise`) — both colour themes would have
   silently stopped applying. Ported tests, not the hook, caught it.
7. **The mobile nav sheet stayed open over Settings (real bug, now fixed).** "New Chat"
   called `onNewChat()` *and* `onSheetClose?.()`; Settings called only `onApiKeyClick`, so
   tapping it at mobile width left the sheet stacked under the dialog — two competing
   `[role="dialog"]` layers, which is how the smoke script first noticed. Now closes like
   every other sidebar action. Regression test: `ChatLayout.test.jsx` →
   *"closes the mobile nav sheet when Settings is opened"*. **Consequence for the smoke:**
   never query a bare `[role="dialog"]` — resolve the one that contains `Save and Connect`.

## Findings from P1 — read before writing components

1. **Two primitive layers coexist.** New code imports `@/components/primitives` (React Aria). The old `@/components/ui` (Radix) stays untouched until P9 — replacing it early breaks the still-Radix tree.
2. **RAC popovers are modal in v1.21.1.** Opening a menu/select `aria-hidden`s the app container (there is no `isNonModal` prop in this version). Consequences:
   - While a popover is open, query the trigger with `getByRole(..., { hidden: true })`.
   - Covered by the test *"restores the trigger to the accessibility tree after closing"* — if that ever fails, the app is permanently hidden from assistive technology.
3. **`SelectionIndicator` requires a `SharedElementTransition` scope.** `Select` wraps its subtree in one (pure context provider, no DOM node). Without it, rendering a selected value throws.
4. **`SelectItem` needs `textValue`** when children aren't a plain string. The wrapper auto-derives it for string children; pass `textValue` explicitly otherwise (RAC warns otherwise).
5. **Radix's `data-open:animate-in` never fires on RAC modals** — RAC does not set `data-open` on `Modal`/`ModalOverlay`. Primitives use unconditional `animate-in fade-in-0` (opacity only, no zoom/slide).
6. **jsdom lacks `Element.prototype.getAnimations`** — polyfilled in `vitest.setup.jsx` next to the existing Radix polyfills.
7. **`MenuItem` owns its own `onAction`** (no key argument) — `MenuContent` also accepts `onAction`/`disabledKeys`/`ariaLabel` and forwards them to `Menu`.
8. **Hover highlight moved from `focus:` to `data-hovered:`** — RAC does not move DOM focus on mouse hover the way Radix does. Both are set on items so either mechanism lights up the accent colour.

## How to work

1. `git fetch origin` → review `git log <sync-sha>..origin/main -- <files I own>`.
2. Work **one phase**. Everything touched by that phase is finished before moving on.
3. `npm test`, `npm run lint`, `npm run build` all green.
4. Run the smoke script: `npm run dev` on :3000, then `node scripts/smoke.mjs`.
5. Commit (one commit per phase, revertable on its own) and push.
6. Record the new origin sync SHA.

**Definition of green** — all four must hold at every commit:

- `npm test` — full suite passes (baseline 385).
- `npm run lint` && `npm run build` — no errors.
- Smoke script: `node scripts/smoke.mjs` — see **Smoke** below.
- `git diff <phase-start> --stat` touches only files assigned to that phase.

**Kill criterion:** if a phase runs past ~2× its estimate, stop at the seam, commit what's green, and re-scope rather than pushing through.

## Smoke — `scripts/smoke.mjs`

Drives Chromium over CDP (Node ≥ 22 ships a global `WebSocket`, so there is no
browser-automation dependency to install). Needs `npm run dev` on :3000.

```
node scripts/smoke.mjs        # exits non-zero only on FAIL, never on SKIP
```

| # | Check | Verifies |
|---|---|---|
| 1 | app loads with header and controls | shell renders |
| 2 | smoke credentials seeded | live turn is a real assertion, not a SKIP; **length only, value never printed** |
| 3 | selecting Sunrise adds `theme-sunrise` to `<html>` | `setSetting` applies the class live |
| 4 | `theme-sunrise` survives a reload | **`hydrateSettings` reads storage on mount** |
| 5 | dark mode survives a reload | next-themes FOUC path |
| 6 | Save/Cancel reachable at 360×640 | **the P3b scroll fix — measures real overflow** |
| 7 | composer accepts input | `ChatInput` accepts typing |
| 8 | user message is sent | Enter submit |
| 9 | assistant reply streams back | live model turn + `ResponseMetrics` |
| 10 | sent message survives reload | IndexedDB persistence |

**Credentials.** Check 2 seeds the Hack Club key from `SMOKE_API_KEY` or the gitignored
`.smoke-key`, then reloads so the settings store hydrates from it. The value is never echoed
and never written to the repo (`.gitignore` rule landed *before* the file did — verify with
`git check-ignore -v .smoke-key`). Without a key, check 9 is `SKIP`, not FAIL: a missing
credential is a prerequisite, not a regression. **Current: 10 ok / 0 skipped / 0 failed.**

**Profile isolation.** Each run gets `/tmp/opencode/hcai-smoke-<pid>` and a freshly allocated
debug port, both cleaned up afterwards. A shared profile once let the previous run's
`API Error` transcript be read as this run's result, and a crashed run's orphan Chromium once
held the fixed port so every later run died at launch.

**Five traps this script encodes (each one produced a false alarm first):**

- **Do not assert hydration state at fixed delay.** The theme class lands ~1.5s after load;
  assert with `waitFor`, never once after `sleep`.
- **Do not match your own probe text.** The composer message contains `PONG`, so a naive
  `transcript.includes("PONG")` passes even when the model errored. Look for `API Error` first.
- **Do not reuse a browser profile between runs.** Persisted conversations from the last run
  land in the transcript and get read as this run's outcome.
- **Do not query a bare `[role="dialog"]`.** On mobile the nav sheet is also a dialog; anchor
  on the one containing `Save and Connect`.
- **Do not diff against pre-send text, and do not wait on text alone.** The empty-state
  heading disappears when the message is sent (so the page can shrink when a reply arrives),
  and the thinking block shows a static `Thinking` label with no changing text for as long as
  the model reasons. Baseline after send, completion signal = the bouncing
  `output[aria-label="Thinking"]` disappearing.

---

## Phases

| Phase | Deliverable | Revert point |
|---|---|---|
| **P0** | Baseline, invariant checklist, file→phase inventory, sync SHA | ✔ |
| **P1** ✅ | Foundations, ships nothing: `createStore` (15 tests) + `src/components/primitives/*` (23 tests) | ✔ |
| **P2** ✅ | **Mechanical decomposition, zero behavior change:** `page.js` → `ChatApp` + thin shell; `ChatLayout` → `SidebarContent` / `Header`. 17 characterization tests added. | ✔ |
| **P3** ✅ | Settings: `src/stores/settings.js` + dialog decomposed into `src/components/settings/*`; `hooks/use-settings.js` deleted (single-writer rule begins). 12 store tests + 4 switch tests. | ✔ |
| **P4** | Models: store + `ModelPicker` (Aria `Select` vs nested `Menu` decided in P1) + `ContextUsage` | ✔ |
| **P5** | Conversations: store + `Sidebar` + import/export + IDB migration test with seeded old records | ✔ |
| **P6** | Turn: `turn` store, `useChatTurn`, rAF delta coalescing; port SSE/attribution invariants | ✔ |
| **P7** | Thread: message parts + scroll manager (keyboard-reachable) | ✔ |
| **P8** | Composer + ArtifactPanel (CSS transitions replace framer-motion) | ✔ |
| **P9** | Delete legacy: old components/hooks, `radix-ui`, `framer-motion`, `tw-animate-css`, `shadcn`, all adapters | ✔ |
| **P10** | Verify: CLS vs baseline, smoke, lint/build, origin sync, AGENTS.md | ✔ |

**Single-writer rule:** an old hook is deleted in the same commit that lands its store. They never coexist. Legacy components that still need the data read it through a one-way adapter, enumerated here and deleted in P9.

**Adapters in use (delete in P9):** _none yet._

---

## Invariants — bugs that were fixed once and must not come back

Mined from `git log`. Every row must have a test or an explicit acceptance check before the rewrite can claim parity. Checked = covered by a test that runs in CI.

### Streaming & turns

- [ ] Stream renders **only** for the conversation that initiated it — never for the one you switched to. (`8aa44a6`)
- [ ] No stale streaming tail after the assistant message persists, or after an error. (`8aa44a6`)
- [ ] SSE fallback to non-streaming does **not** duplicate the response; partial accumulators are cleared first. (`74b8ad3`)
- [ ] A clean EOF that delivered nothing retries **exactly once**; server-side tool results and error frames count as delivered and never retry. (`74b8ad3`, `a957c70`)
- [ ] The response is not truncated and prior conversation context is not lost across turns. (`970d4da`)
- [ ] `messagesRef` is cleared when switching or creating a conversation. (`0abc78b`)
- [ ] Errors surface to the user — no silent swallow leaving a permanent "Running" state. (`dd0cc99`)
- [ ] Stream errors are shown and reasoning/thinking survives into the next turn. (`6afb9c9`, `57ec86f`)
- [ ] `streamChatCompletion` is awaited by every caller. (`a957c70`)
- [ ] Scrolling stays possible **while** streaming. (`fa45ae0`)
- [ ] Error placeholders are stripped from history sent to the model. (`be48b7f`)

### Context usage & cost

- [ ] Context usage restores on load, attributes to the **initiating** conversation, and fills incrementally while streaming. (`5ca90d2`)
- [ ] Resets on new chat; stale values don't leak on conversation switch. (`dc4c323`)
- [ ] Total chat cost appears in the context tooltip. (`5c0818c`)
- [ ] Ring turns yellow at 75%, red at 90%.

### Features & gating

- [ ] Artifacts are parsed and the panel opens **only** when the artifacts toggle is on. (`f3f3e4d`)
- [ ] Web search + artifacts can be enabled **at the same time**. (`a2e4c60`)
- [ ] Web search, agent mode and calculator are disabled for models without tool support. (`396a4f3`)
- [ ] Import/export buttons live in Settings only, not the sidebar. (`1511ff4`)
- [ ] LibreAssistant exports import; incompatible settings are skipped rather than crashing. (`f5ba29e`)
- [ ] Balance outage dialog offers the `openrouter/free` fallback. (`1f001b3`, `8e4489b`)

### Persistence & hydration

- [ ] localStorage keys unchanged — users keep their settings. `hack_club_ai_key`, `e2b_api_key`, `color-mode`, `show_sandbox_code`, `show_sandbox_output`, `show_thinking`, `show_metrics`, `thinking_enabled`, `agent_mode_enabled`, `theme`, `model`, …
- [ ] IDB store name, key path and record shape unchanged — existing conversations load. Migration test seeds pre-existing records.
- [ ] Values read from localStorage hydrate in a mount effect, never during render (hydration mismatch). (AGENTS.md, `hasE2bKey` bug)

### Security & sandbox

- [ ] Sandbox file downloads use the two-step token flow — the E2B key never appears in a URL. (`28787a7`)
- [ ] Sandbox tool output stays gated behind the show-input / show-output settings.

### Layout & responsiveness

- [ ] No horizontal overflow on mobile; `min-w-0` on flex wrappers. (`10130e7`, `47f19f8`)
- [ ] CLS measured against the P0 baseline; target ≈ 0.

### Build

- [ ] mermaid loads lazily from CDN; `next build` does not OOM. (`cbcf214`, `abf3309`)
- [ ] `page.js` still exports the component `search/page.js` renders with `initialQuery` / `initialSearchEnabled`.

---

## File → phase inventory

Nothing may be deleted except by the phase listed here.

### Server — untouched (imported by API routes)

`api/*/route.js` · `lib/tools.js` · `lib/sandbox.js` · `lib/sandbox-executor.js` · `lib/tool-stream.mjs` · `lib/model-pricing.js` · `lib/artifacts.js` (instructions) · `lib/messages.js` (`sanitizeMessages`)

### Keep — declarative leaves, shared, or pure config

| File | Lines | Why it stays |
|---|---|---|
| `lib/settings.js` | 189 | Declarative registry of every persisted key + import validation. Single source of truth shared with `import-export`. Rewriting re-derives `f5ba29e`. |
| `lib/utils.js` | 6 | `cn()` |
| `lib/pricing.js` | 32 | `formatPrice` |
| `lib/latex.js` | 41 | Delimiter normalization |
| `lib/streamdown.js` | 14 | Plugin config for a third-party lib |
| `lib/bucky.js` | 25 | Upload transport |
| `lib/model-pricing.js` | 33 | Imported by the chat route — shared |
| `lib/artifacts.js` | 85 | Shared: route instructions + client extraction |
| `lib/messages.js` | 96 | Shared: route sanitization + client rendering helpers |

### Rewrite — the tangle

| File | Lines | Phase | Notes |
|---|---|---|---|
| `app/page.js` | 15 | P2 ✅ | Now a thin re-export; the body moved to `ChatApp.jsx`. |
| `components/chat/ChatApp.jsx` | 389 | P2 ✅ | The former `page.js` body. Thinned progressively in P3–P8. |
| `components/chat/ChatLayout.jsx` | 171 | P2 ✅ | Shell only. Split out `layout/SidebarContent.jsx` and `layout/Header.jsx`. |
| `layout/SidebarContent.jsx` | 270 | P2 ✅ | **P5** rewrites it with the conversations store. |
| `layout/Header.jsx` | 224 | P2 ✅ | **P4** rewrites its ModelPicker/ContextUsage wiring. |
| `components/settings/*` | 741 | P3 ✅ | Replaces `components/chat/SettingsModal.jsx` (661): shell + 6 sections + shared chrome. **P4** rewrites `ModelsSection`/`AppearanceSection` wiring. |
| `components/chat/ImportDialog.jsx` | 240 | P5 | |
| `lib/import-export.js` | 574 | P5 | Largest client lib file; keep `lib/settings.js` registry as input. |
| `components/chat/ModelPicker.jsx` | 124 | P4 | Aria primitive decision in P1. |
| `components/chat/ContextUsage.jsx` | 104 | P4 | |
| `hooks/use-models.js` | 82 | P4 | |
| `hooks/use-conversations.js` | 211 | P5 | |
| `lib/db.js` | 68 | P5 | Same schema; migration test with seeded records. |
| `hooks/use-chat-stream.js` | 579 | P6 | Port its 106 lines of test assertions first. |
| `lib/api-client.js` | 371 | P6 | Empty-EOF retry semantics; assertions port first. |
| `components/chat/MessageList.jsx` | 227 | P7 | |
| `components/chat/message/*` | 1093 | P7 | Message, StreamingMessage, MessageRow, MessageParts, ThinkingBlock, SourcesBlock, StreamingSandboxBlock, SandboxFiles, sandbox-files-client, ErrorMessage, EmptyState |
| `components/chat/ChatInput.jsx` | 342 | P8 | |
| `components/chat/ArtifactPanel.jsx` | 424 | P8 | framer-motion → CSS |
| `components/chat/ResponseMetrics.jsx` | 103 | P7 | |
| `components/chat/CustomLink.jsx` | 69 | P7 | |
| `components/chat/ThinkingIndicator.jsx` | 31 | P7 | |
| `hooks/use-settings.js` | — | P3 ✅ | **Deleted** — replaced by `src/stores/settings.js` (single-writer rule). |
| `hooks/use-media-query.js` | 30 | P1 | Trivial; re-home under `hooks/`. |
| `components/layout/AppWrapper.jsx` | 18 | P2 | Becomes the provider root. |
| `components/ui/*` (Radix) | 904 | **P9** | Stays untouched until P9 — new components read `components/primitives/*` instead. Deleting early breaks the still-Radix old tree. |
| `components/primitives/*` (Aria) | — | **P1** | New. Lives on a separate path so both layers can coexist. |

---

## Anti-jank checklist — built into the phase that owns it, verified in P10

| # | Fix | Phase |
|---|---|---|
| 1 | Plain `overflow-y-auto` + `scrollbar-gutter: stable` (replaces Radix `ScrollArea`) | P7 |
| 2 | rAF-coalesced streaming deltas — one DOM update per frame | P6 |
| 3 | Opacity-only transitions; no `animate-in` slide/zoom, no framer-motion | P8 / P9 |
| 4 | Reserve space before content arrives (image aspect-ratio, code-block min-height) | P7 / P8 |
| 5 | Panel width as one `grid-template-columns` transition, not stepwise reflow | P8 |
| 6 | `setPointerCapture` on all drag handles, clamped and persisted | P8 |

Baseline CLS/scroll-jank measurement: **not yet recorded** — capture before P7 replaces the scroll container.
