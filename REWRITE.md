# Frontend Rewrite — Working Tracker

## Status

| | |
|---|---|
| **Phase** | **P2 complete** → next: P3 (settings store + dialog) |
| **Baseline commit** | `8aa44a6` fix(chat): scope stream rendering per conversation and drop stale UI state |
| **Baseline test suite** | 29 files / **385 tests passing**, 22.1s (`npm test`) |
| **Current test suite** | 32 files / **440 tests passing**, 23.9s — lint, format and `next build` all clean |
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
4. Run the smoke script (below).
5. Commit (one commit per phase, revertable on its own) and push.
6. Record the new origin sync SHA.

**Definition of green** — all four must hold at every commit:

- `npm test` — full suite passes (baseline 385).
- `npm run lint` && `npm run build` — no errors.
- Smoke script: new chat → stream a reply → reload page → conversation persists → switch conversations mid-stream (reply stays on its own conversation) → open Settings → toggle dark mode → reopen page (setting stuck).
- `git diff <phase-start> --stat` touches only files assigned to that phase.

**Kill criterion:** if a phase runs past ~2× its estimate, stop at the seam, commit what's green, and re-scope rather than pushing through.

---

## Phases

| Phase | Deliverable | Revert point |
|---|---|---|
| **P0** | Baseline, invariant checklist, file→phase inventory, sync SHA | ✔ |
| **P1** ✅ | Foundations, ships nothing: `createStore` (15 tests) + `src/components/primitives/*` (23 tests) | ✔ |
| **P2** ✅ | **Mechanical decomposition, zero behavior change:** `page.js` → `ChatApp` + thin shell; `ChatLayout` → `SidebarContent` / `Header`. 17 characterization tests added. | ✔ |
| **P3** | Settings: store + dialog rewrite; delete `use-settings.js`; single-writer rule begins | ✔ |
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
| `components/chat/SettingsModal.jsx` | 661 | P3 | |
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
| `hooks/use-settings.js` | 58 | P3 | |
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
