# Frontend Rewrite — Working Tracker

## Status

| | |
|---|---|
| **Phase** | **P9 in progress** — `ui/` is down to one file. Migrated: button, input, label, select, dialog, sheet, and the whole dead-directory sweep. `shadcn` CLI + `components.json` deleted. **Kept:** `ui/tooltip.jsx` and `radix-ui` (see the RAC tooltip finding). |
| **Baseline commit** | `8aa44a6` fix(chat): scope stream rendering per conversation and drop stale UI state |
| **Baseline test suite** | 29 files / **385 tests passing**, 22.1s (`npm test`) |
| **Current test suite** | 38 files / **522 tests passing** — lint, format and `next build` all clean · smoke **10/10** |
| **Origin sync SHA** | `8aa44a6` — every phase starts with a sync against this |
| **Stack** | Next.js App Router · React · Tailwind v4 (existing tokens/themes unchanged) · React Aria Components · Vitest + RTL |

## P2 decomposition — where everything lives now

| File | Lines | Contents |
|---|---|---|
| `src/app/page.js` | 15 | Thin route: re-exports `Home` → `ChatApp`. **`search/page.js` imports `Home` from here — keep the name.** |
| `src/components/chat/ChatApp.jsx` | 338 | The former `page.js` body, verbatim. All state/effects/handlers. |
| `src/components/chat/ChatLayout.jsx` | 171 | Shell: sidebar width/drag state, `<aside>`, composes `Header` + `main` + panel slot. |
| `src/components/layout/SidebarContent.jsx` | 319 | Conversation list: search filter, rename, delete, long-press. **P5 ✅** |
| `src/components/layout/Header.jsx` | 193 | Collapse button, mobile sheet, 4 feature toggles, `ModelPicker`, `ContextUsage`. **P4 ✅** — model props dropped. |

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

## P4 decomposition — Models

| File | Role |
|---|---|
| `src/stores/models.js` | The catalog. `loadModels()` shares one request and skips a loaded catalog; `normalizeModelCatalog` / `splitModelName` are pure and unit-tested; `getContextWindow(id)` for non-React callers; `resetModels()` for test isolation. State: `grouped`, `contextWindows`, `toolsSupported`, `status` (`idle`/`loading`/`ready`/`error`). |
| `src/components/chat/ModelPicker.jsx` | Aria `Menu` + `MenuGroup`, one provider-grouped list at every breakpoint. Reads `grouped` itself but keeps `value`/`onChange`, because the header and Settings pick *different* models. |
| `src/components/chat/ContextUsage.jsx` | Ring + tooltip. Takes `used`/`modelId`/`totalCost` and resolves the window from the store, so the ring hides itself until the catalog knows that model. |
| `src/components/layout/Header.jsx` | Still owns the collapse button, mobile sheet and 4 toggles; no longer threads model data through the layout. |

---

## P5 decomposition — Conversations

| File | Role |
|---|---|
| `src/stores/conversations.js` (211) | State `conversations` / `activeConversation` / `messages` / `hydrated`, plus `conversationsActions` as module-level stable functions. `commit()` writes state **and** mirrors the three refs in the same call. `hydrateConversations()` is guarded by an in-flight promise *and* the `hydrated` flag so any mount can call it, and performs the one-time localStorage → IndexedDB migration. `resetConversations()` for test isolation. |
| `src/components/layout/SidebarContent.jsx` (319) | New Chat + search header, `ConversationRow`, Settings footer. `ui/scroll-area` → `overflow-y-auto min-h-0`; the list is a real `<ul>`/`<li>` with `aria-current` on the active row. |
| `src/lib/db.js` (119) | Same schema, same four exports — one cached connection and a `withStore()` transaction helper. |
| ~~`hooks/use-conversations.js`~~ | **Deleted** — single-writer: the store landed and the hook left in the same commit. |
| ~~`lib/import-export.js`~~ · ~~`ImportDialog.jsx`~~ · ~~`settings/DataSection.jsx`~~ | **Removed, not rewritten** — see below. |

### Import/export was cut, not ported

The feature never worked, so P5 deleted it instead of rewriting 814 lines: `lib/import-export.js`
(574), `components/chat/ImportDialog.jsx` (240), `components/settings/DataSection.jsx` (66) and
`import-export.test.js` (29 tests), plus the `Data` entry in `settings/sections.js`, the
`onImport` / `onExportAll` prop chain `ChatApp → SettingsModal`, and `replaceConversations` — the
store action that existed only to refresh the list after an import. Nothing else touched those
paths, so no test needed changing. Restoring the feature means re-adding all of it from git
history.

---

## Findings from P9 — read before touching the component layer

1. **RAC's `Tooltip` renders no children.** Not a mistake in the wrapper: `react-aria-components`' own
   `Tooltip`, with its own `TooltipTrigger` and a plain button child, produces an empty container and
   logs no error. This version exports `Tooltip`, `TooltipContext`, `TooltipTrigger`,
   `TooltipTriggerStateContext` — and **no `TooltipProvider`**, so the provider the shadcn-style
   wrapper assumed does not exist. Two more traps in the same area: RAC links `aria-labelledby` to a
   heading **only** when it declares `slot="title"`, and a component that plays both the stateful
   `Tooltip` and the content `Tooltip` renders its trigger as nothing at all. `ui/tooltip.jsx` and
   the `radix-ui` dependency therefore stay, and that is a recorded exception rather than an
   oversight.
2. **A controlled tooltip's `onOpenChange` is not a formality.** The context ring passed
   `onOpenChange={setIsOpen}` and separately tried to delay hover with its own timer — and Radix's
   own hover path called `onOpenChange(true)` straight away, so the ring opened in 85ms and the
   timer was dead code. The delay now lives in one place, the provider's `delayDuration`, and the
   ring only intercepts *when* to open.
3. **Radix keeps a visually-hidden copy of the tooltip for assistive tech, present whether or not
   the tooltip is showing.** So `queryByRole("tooltip")` cannot answer "is it visible" — the
   context-ring tests assert the trigger's `data-state` instead. The earlier tests passed for the
   wrong reason and would not have caught a regression here.
4. **`side="bottom"` on a header control is a bug, not a default.** The context ring is at the top of
   the screen; a bottom-anchored panel lands on the first message the user came to read. It is
   `side="left"` with a `sideOffset` now, and a test asserts `data-side`.
5. **A vestigial devDependency is still shipping.** `framer-motion` had zero source references from
   P8a but stayed in `dependencies` — every visitor was downloading an animation library the app
   never called. Dependencies are not removed by deleting the last import; check the list.

---

## Findings from P8 — read before touching the composer or the panel

1. **framer-motion had exactly one user.** The whole dependency existed to animate two
   conditional branches of the artifact panel. It is now gone from `src/`, and the replacement
   is a project-owned `@keyframes` behind a Tailwind `--animate-*` token. The token is prefixed
   `hcai-` specifically so it cannot collide with the `tw-animate-css` enter keyframes that P9
   deletes. **Both the utility and the keyframe were grepped out of the built CSS** — Tailwind 4.2
   silently ignores theme keys it does not recognise, and the P7 `scrollbar-gutter` finding is
   the same trap: verify the CSS, do not assume the class works.
2. **The panel's local `CustomLink` was dead code, and I nearly wrote up a security fix that
   did not exist.** I was going to claim artifacts bypassed the external-link dialog. The code view
   fences the source, so Streamdown never parsed a link out of it — there was never a link there
   to make safe. The test I wrote instead pins the markup as inert, which is the true invariant.
   The live version of that markup is the `sandbox="allow-scripts"` iframe, which has no
   same-origin access. **Check what a duplicated component was actually reached by before
   describing what removing it changes.**
3. **`setPointerCapture` was called before the cursor lock and unguarded.** In any environment
   without it the call throws, the rest of the handler never runs, and the drag does nothing. The
   test suite found this: jsdom has no `setPointerCapture`. Capture is an enhancement; the lock
   is not. The same bug would have hit a real browser with capture disabled.
4. **A drag that only ends on `pointerup` never ends at all sometimes.** Both handles locked
   `document.body`'s cursor and `user-select` for the duration. A `pointercancel` — the browser
   taking the gesture over, a scroll starting — or unmounting mid-drag left the page showing a
   resize cursor with no resize running, permanently. `endResize` is now one function reached from
   pointerup, pointercancel, lostpointercapture and unmount, and it **has to be `useCallback`-stable**:
   the unmount effect keys off it, and an unstable version clears the lock mid-drag.
5. **A rejected promise inside an async event handler is a silent hang.** `processFile`'s image
   branch rejected when `resizeImage` failed to decode, inside an `async` FileReader callback that
   nothing held. The outer promise never settled, so `Promise.all` over the batch never returned
   and the drop vanished with no UI and no caught error. Both read branches now resolve, because
   every file the caller awaits must settle.
6. **`44px` was a phone's number living in desktop code.** The composer's textarea resets to a
   hardcoded height before measuring, but its resting height is a breakpoint — 44px small, 52px
   `sm:`. Every send on a wide window fought its own min-height. `auto` lets the breakpoint win.
   The reset before measuring is still required and now says why: `scrollHeight` never reports
   less than the box's own height.
7. **A hardcoded px value is not a responsive value.** Same shape as the `maxWidth` trap in the
   panel: `Math.min(vw * 0.85, …)` is `0` before the first resize event, which would clamp a stored
   width to nothing. Both now have a fallback that cannot clamp.

---

## Findings from P7 — read before touching the thread

1. **`ui/scroll-area` had exactly one consumer.** Nothing imported `ScrollBar`, so replacing
   `MessageList`'s container let the whole Radix file be deleted rather than left as dead
   scaffolding for P9. Check the consumer count before assuming a primitive is load-bearing.
2. **The scroll container was not keyboard-reachable.** Radix's viewport is not focusable, so the
   thread could not be moved with arrow keys. It is now a labelled `<section tabIndex={0}>`.
   Biome rejects both the role on a `div` and the `tabIndex`; the suppression has to be a
   **single-line** `biome-ignore-start`/`-end` pair wrapping the element — a multi-line one parses
   as a no-op and Biome then reports `suppressions/unused` instead of applying it.
3. **Tail-following had a seven-entry dependency list.** messages, both deferred values, the
   error, the tool array, `isLoading`, and the flag. Forgetting one silently stopped the stream
   from scrolling. It now runs after every render, which is what "whenever this list changes"
   actually means, and which is also what removed the need to reason about `useDeferredValue`:
   P6c already caps the store at one update per frame, so the deferred value was a second lag
   layer doing nothing.
4. **`Message`'s `isStreaming` prop was dead.** `MessageList` passed `false` on every path and the
   only use inside was `message.webSearch && !isStreaming`, so the branch could never be anything
   but true. Found by grepping call sites, not by reading — it looked load-bearing.
5. **Three copies of the Streamdown setup, two of the body class.** `Markdown.jsx` and
   `useMessageText` now own them. The two text-preparation versions agreed only by accident:
   one folded `normalizeLatexDelimiters` into both branches of its memo, the other normalised
   after the branch. Same result today, and one edit away from a saved answer rendering
   differently from the stream that produced it.
6. **Two NaN bugs in the metrics strip, both untested.** A missing `duration` rendered
   `NaNm NaNs` and a missing token count rendered `NaN tokens`; nothing caught either because
   every test supplied complete usage. Both now have tests.
7. **The store is not free.** Turning the thread onto the stores meant `settings` needed a
   `resetSettings()` for test isolation, same trap as `resetConversations` and `resetTurn`. Note
   the store defaults (`thinking_enabled: true`, `show_metrics: true`, …) happen to match the old
   prop defaults exactly — check that before swapping a default for a lookup, or every test that
   relied on a prop default silently changes meaning.

---

## Findings from P6 — read before touching the stream

1. **`sse-parser.test.js` tested a copy of itself.** There was no `src/lib/sse-parser.js`; the
   test pasted its own `dispatchFrame`/`flushFrames` and asserted against *those*, so it could not
   have caught a regression in the parser `api-client` actually runs. It is now a module that
   `api-client` imports, and the test exercises the real thing. (The real parser was still covered
   indirectly by `api-client.test.js`'s mocked streams — the defect was the duplicated test, not
   an untested parser.)
2. **That copy hid a dormant CRLF bug.** The scanner matched only `"\n\n"` while its own comment
   claimed `"\r\n\r\n"` support. One trailing CRLF frame survived by luck — it was dispatched from
   the leftover buffer at EOF — but several frames in one buffer decoded to an empty conversation.
   Verified by running the old implementation against the input. The extracted parser splits on
   `\r\n\r\n`, `\n\n` and `\r\r`.
3. **I was sure a second bug existed and it did not.** I reasoned that a complete frame ahead of a
   truncated one was lost at EOF, wrote it up, then ran the old parser: it passes, because
   `flushFrames` runs on every read. The case is pinned as a regression test and is *not* claimed
   as a fix. **Prove a bug by failing a test against the old code, not by reasoning about it.**
4. **`send()` kept two copies of every response.** `fullResponse`/`fullThinking` existed only
   because React state lags a render. The turn store's buffers are now the single copy and the
   commit reads them directly, so "use the live accumulators, not a render snapshot" is enforced
   structurally instead of by discipline.
5. **Dropping the `activeConversation` prop nearly broke `/search`.** `send()` used to resolve its
   target from the prop captured at render time, and ChatApp's auto-send effect captures `stream`
   on mount — before hydration resolves — so it always opened a new chat. Reading the store at
   call time instead made it append to whichever conversation hydration restored, putting an
   unrelated search query into the user's most recent chat. Fixed by claiming the conversation
   explicitly in ChatApp (which is what the old behavior amounted to); `ChatApp.test.jsx`
   reproduces the race — hydration resolves in a microtask, well inside the 200 ms timer — and
   fails if the call is removed. **Any prop a stale closure was accidentally relying on needs an
   explicit replacement, not just a store read.**
6. **Turn state is module-level now, so tests need `resetTurn()` in `beforeEach`** — the same rule
   as the conversations store (P5 finding 2). A committed error or a stuck `isLoading` otherwise
   leaks into the next test.
7. **Test files are never linted or formatted.** `biome.json` excludes `**/__tests__` and
   `**/*.test.*`, so `npm run lint` and `npm run format` skip all 36 test files — `biome check
   <test file>` reports "No files were processed". Pre-existing config; left alone, but it means
   the format gate only covers source.
8. **`predictContextUsage` and `setContextUsage` are separate functions on purpose.** A predicted
   total is coalesced onto the frame; a server-reported one is written immediately and drops the
   buffered prediction first, so a flush scheduled during the last chunk cannot overwrite the real
   number with the estimate.

---

## Findings from P5 — read before touching conversations

1. **The refs are module-level and mirrored synchronously.** `messagesRef.current` is read by the
   stream loop in the same tick it mutates state, so syncing after render is too late. `commit()`
   assigns `conversationsRef` / `messagesRef` / `activeConversationRef` from the state it just
   wrote. `setMessages` takes a value or an updater but always resolves the new array *outside*
   the updater — React 19 may defer or re-run updaters, and a write must never depend on an
   assignment made inside one.
2. **The active id must always reference a conversation that exists.** Two paths break this if
   ported naively: deleting a *background* row used to switch the view to `filtered[0]`, and a
   refresh that dropped the conversation on screen used to leave a dangling id. The first is fixed
   and tested; the second's only caller left with the import feature, so the rule now lives in
   `deleteConversation` alone. Because the store is module-global, every test file touching it
   needs `resetConversations()` in `beforeEach` or state leaks between tests.
3. **`db.js` opened a new connection per call**, and `putConversation` runs on every streamed
   token — that was a handshake per patch. It now caches one connection, invalidated by
   `versionchange` / `close` and by a transaction that cannot even be created. **The test counts
   `open()` calls through a stand-in factory**: `vi.spyOn(globalThis.indexedDB, "open")` does not
   intercept fake-indexeddb, so a spy-based version of that test passes against the old
   implementation too. Verified both ways — reverted, it reports 3; current code reports 1.
4. **Adopt the parsed migration payload before any side effect.** `convs = JSON.parse(...)` has to
   run before `removeItem` / `saveAllConversations`, or a throw in either discards conversations
   already read. The original hid this: its bare `catch {}` swallowed the failure while keeping
   the parsed array, so a later defensive `catch { convs = [] }` regressed it.
5. **The sidebar's scroll container needed `min-h-0`.** Radix's `ScrollArea` root had none, so
   `min-height: auto` refused to shrink and a long history could push the Settings button out of
   view. The plain `overflow-y-auto min-h-0` div fixes it — same class of bug as P3 finding #3.
6. **Conversation rows are `<li>`, not `<div>`.** `rowFor()` in `ChatLayout.test.jsx` is
   `.closest("li")`. The active row carries `aria-current="true"`; the rename editor has labelled
   save/cancel buttons; selecting another conversation cancels an in-flight rename; and an empty
   search or empty history renders a message instead of a bare heading.

---

## Findings from P4 — read before touching the model catalog

1. **The catalog left the prop chain.** `groupedModels` and `contextWindowMap` no longer travel
   `ChatApp → ChatLayout → Header → ModelPicker/ContextUsage`; both components read
   `@/stores/models` directly. `toolsSupported` **stays** a ChatApp-owned prop — it gates the
   header toggles, which is app logic rather than catalog data.
2. **An Aria trigger must be an Aria button.** `MenuTrigger` hands its trigger `onPress` and a
   ref; a raw `<button>` silently ignores `onPress` and the menu never opens (it surfaced as
   `Unable to find role="menu"`, not as a click failure). `ModelPicker`'s trigger is now the
   primitives `Button`.
3. **`ModelPicker` is one markup path.** The desktop submenu and the tap-to-expand mobile
   accordion are gone, replaced by a single provider-grouped list that typeaheads at every
   breakpoint. **`components/ui/dropdown-menu` now has zero consumers** — it dies in P9.
4. **Catalog dedupe keeps the first record for an id.** The old `new Map(...)` kept the *last*,
   so a partial duplicate overwrote `supported_parameters` and silently flipped tool support
   off. First-wins is the safer default; a test pins it.
5. **Radix tooltips render twice** — the visible bubble plus a visually-hidden
   `role="tooltip"` duplicate — so `getByText` reports two matches. Assert with
   `within(screen.getByRole("tooltip"))`.
6. **`ContextUsage` resolves its own window.** It takes `modelId`, not `max`; an unknown model
   still renders nothing, matching the old `contextWindowMap[id] || 0` behaviour.
7. **`SettingsModal` still originates the catalog fetch** (P3 finding #2 preserved), now by
   calling `loadModels()` in a mount effect. Because the store is module-global, any test that
   asserts `fetch("/api/models")` must call `resetModels()` first or the store is already
   `ready` and skips the request.

---

## Findings from P3 — read before touching dialogs

1. **The `Dialog` primitive cannot place its title.** RAC `Dialog` takes `title` as a prop and
   renders a fixed header; Settings puts its `DialogTitle` *inside* the sidebar nav
   (`hidden sm:flex`), and the test pins exactly one `getByText(/^Settings$/)`.
   **→ the Radix→Aria dialog swap is deferred to P9**, where all four consumers
   (`SettingsModal`, `ChatApp`, `CustomLink`) move together. The primitive
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
4. **`ui/scroll-area` has one consumer left** — `MessageList`, which dies in P7.
   `SidebarContent` left it in P5.
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
- **Do not measure the reply by text growth, and do not wait on text alone.** The empty-state
  heading disappears when the message is sent (so the page can *shrink* when a reply arrives),
  and a reply can land faster than the baseline snapshot. The thinking block also shows a
  static `Thinking` label with no changing text for as long as the model reasons, so a
  "transcript stopped changing" wait fires mid-thought. Completion requires **all three**:
  an assistant row exists (`.msg-row` containing `svg.lucide-sparkles` — `EmptyState` uses the
  same icon but is not a `.msg-row`), the transcript is quiet for 2 reads, and no
  `output[aria-label="Thinking"]` is present. Early-exit on `API Error` so failures do not
  burn the full 90s budget.
- **Clean up Chromium outside the `try` that can throw.** The debugging-endpoint poll runs
  before any `try`, so a slow start used to escape `finally` and leak a browser; leaked
  browsers then starved the next launch until it timed out. Cleanup now wraps the spawn, with a
  `SIGKILL` fallback and a sweep of profiles whose owning pid is gone.
- **Do not read a Chromium launch timeout as a code failure.** The 15s budget raced the dev
  server's first compile and three consecutive runs failed with the identical
  `chromium debugging endpoint never came up` while the app was completely fine — verified by
  launching Chromium by hand on the same flags. Budget is now 40s and a child that actually died
  reports its exit code, so the two cases are distinguishable instead of looking the same.
- **Do not run `npm test` with the dev server up.** This box has 4 cores; a warm `next-server`
  sat at 42% CPU and 62% RSS and pushed the load average to 8.6. `ChatLayout` and `ModelPicker`
  then failed on 12–24s timeouts in files untouched by the change under test, and got *worse* on
  each retry — the signature of starvation, not a regression. Stop the server before the test
  gate and start it only for smoke. Check `uptime` and `ps -eo pcpu,pmem,comm` before believing a
  timing failure.

---

## Out-of-scope defects observed — reported, deliberately not fixed

Both surfaced in the P4 smoke run. `src/app/api/*` and the root layout are outside this
rewrite's charter (frontend only), and upstream owns those files — so they are recorded here
instead of patched mid-phase.

1. **Conversation titles never generate — every new chat is titled "New Chat".**
   `src/app/api/chat/route.js` passes both `instructions: systemPrompt` and
   `messages: processedMessages` on the non-stream path. `generateTitle` (`src/lib/api-client.js`)
   sends a `role: "system"` message, which survives sanitization into `processedMessages`, and
   the AI SDK rejects it: `AI_InvalidPromptError: System messages are not allowed in the prompt
   or messages fields. Use the instructions option instead.` → `POST /api/chat` **500** on every
   title request (the streaming turn itself is unaffected). Reproduced on every live smoke run.
2. **`src/app/layout.js:36` passes a *string* to React's `onError`.**
   `onError="this.onerror=null;this.remove();"` on the Simple Analytics `<script>`. React expects
   a function, so every page load logs `Expected onError listener to be a function, instead got a
   value of `string` type` — and the fallback that removes a failed script tag never runs.

---

## Phases

| Phase | Deliverable | Revert point |
|---|---|---|
| **P0** | Baseline, invariant checklist, file→phase inventory, sync SHA | ✔ |
| **P1** ✅ | Foundations, ships nothing: `createStore` (15 tests) + `src/components/primitives/*` (23 tests) | ✔ |
| **P2** ✅ | **Mechanical decomposition, zero behavior change:** `page.js` → `ChatApp` + thin shell; `ChatLayout` → `SidebarContent` / `Header`. 17 characterization tests added. | ✔ |
| **P3** ✅ | Settings: `src/stores/settings.js` + dialog decomposed into `src/components/settings/*`; `hooks/use-settings.js` deleted (single-writer rule begins). 12 store tests + 4 switch tests. | ✔ |
| **P4** ✅ | Models: `src/stores/models.js` + `hooks/use-models.js` **deleted**; `ModelPicker` on the Aria `Menu` (one markup path, provider groups, typeahead); `ContextUsage` resolves its own window. `groupedModels`/`contextWindowMap` leave the ChatApp→ChatLayout→Header chain. +35 tests. | ✔ |
| **P5** ✅ | Conversations: `src/stores/conversations.js` + `hooks/use-conversations.js` **deleted**; `SidebarContent` off `ui/scroll-area`; `db.js` caches one connection with seeded-record migration tests. **Import/export removed rather than rewritten** (−814 lines, −29 tests). +27 / −43 tests → **468 / 34 files**. | ✔ |
| **P6** ✅ | Turn: `src/stores/turn.js` + `hooks/use-chat-stream.js` → **`hooks/use-chat-turn.js`** (`useChatStream` **deleted**); `lib/sse-parser.js` extracted so the parser test stops testing a copy of itself; `api-client.js` de-nested with the `doStream`↔`doFallback` recursion removed; rAF-coalesced deltas. 5 conversation props dropped from the hook, `setContextUsage` dropped from its return. 468 → **488 tests / 36 files**. | ✔ |
| **P7** ✅ | Thread: `useThreadScroll` + plain `overflow-y-auto` container; **`ui/scroll-area.jsx` deleted** (its only consumer); `MessageList` 16 props → 2 (turn + settings stores); one `Markdown` + one `useMessageText` replacing three copies; `ResponseMetrics` deduped and NaN-guarded; `aria-expanded` on four disclosures. 488 → **501 tests / 37 files**. | ✔ |
| **P8** ✅ | Composer + ArtifactPanel: **framer-motion deleted** (app's only use) behind a project-owned opacity-fade token; panel reuses `Markdown`; artifact read/parse failures no longer hang; both drag handles on pointer events with capture and unconditional release; `aria-label` on the composer's icon buttons. 501 → **518 tests / 38 files**. Anti-jank 3 (app code), 4 (images) and 6 done; **item 5 deferred with reasons**. | ✔ |
| **P9** ✅ | Delete legacy. `button`, `input`, `label`, `select`, `dialog`, `sheet` on Aria; six orphaned `ui/` files deleted; `shadcn` CLI + `components.json` gone; `framer-motion` and `tw-animate-css` dropped. **Documented exception: `tooltip`** — RAC's `Tooltip` renders no children here, verified against the raw component, so `ui/tooltip.jsx` and `radix-ui` stay. Tooltip *behaviour* (450ms delay, sideways anchor) is done on Radix. | ✔ |
| **P10** | Verify: CLS vs baseline, smoke, lint/build, origin sync, AGENTS.md | ✔ |

**Single-writer rule:** an old hook is deleted in the same commit that lands its store. They never coexist. Legacy components that still need the data read it through a one-way adapter, enumerated here and deleted in P9.

**Adapters in use (delete in P9):** _none yet._

---

## Invariants — bugs that were fixed once and must not come back

Mined from `git log`. Every row must have a test or an explicit acceptance check before the rewrite can claim parity. Checked = covered by a test that runs in CI.

### Streaming & turns

- [x] Stream renders **only** for the conversation that initiated it — never for the one you switched to. (`8aa44a6`) — `use-chat-turn` "scopes the stream to its conversation and clears it on reset"; `MessageList` "hides the stream, its text, and its placeholder when they belong to another conversation"
- [x] No stale streaming tail after the assistant message persists, or after an error. (`8aa44a6`) — `MessageList` "does not render a stale streaming tail once the turn is persisted" / "...beside an error card"; turn store "cancels the pending frame when the turn is cleared"
- [x] SSE fallback to non-streaming does **not** duplicate the response; partial accumulators are cleared first. (`74b8ad3`) — `use-chat-turn` "does not duplicate the response when a dropped stream triggers the non-streaming fallback"; `api-client` "fires onFallbackStart before replaying the regenerated text"
- [x] A clean EOF that delivered nothing retries **exactly once**; server-side tool results and error frames count as delivered and never retry. (`74b8ad3`, `a957c70`) — four `api-client` tests (retry / no retry on thinking / on error event / on tool result)
- [ ] The response is not truncated and prior conversation context is not lost across turns. (`970d4da`) — truncation half covered ("commits the final deltas even if a chunk has not re-rendered"); **the across-turns context half has no test yet**
- [x] `messagesRef` is cleared when switching or creating a conversation. (`0abc78b`) — conversations store "assigns messagesRef synchronously on creation" / "selects a conversation and syncs its messages"
- [x] Errors surface to the user — no silent swallow leaving a permanent "Running" state. (`dd0cc99`) — `use-chat-turn` "surfaces a server error event as an error message" / "stores an error placeholder when the response is empty"; `send()`'s `catch`/`finally` clears `isLoading`
- [ ] Stream errors are shown and reasoning/thinking survives into the next turn. (`6afb9c9`, `57ec86f`) — errors shown, and a thinking-only turn commits; **"into the next turn" is not directly asserted**
- [ ] `streamChatCompletion` is awaited by every caller. (`a957c70`) — structurally true (one caller, `await`ed); **not a test**
- [x] Scrolling stays possible **while** streaming. (`fa45ae0`) — `useThreadScroll` "stops following once the user scrolls away from the bottom" / "keeps following for a movement that stays within the threshold" / "hands scrolling back when a turn ends"; the container is also focusable and labelled
- [x] Error placeholders are stripped from history sent to the model. (`be48b7f`) — `api-client` "strips error placeholders and empty assistant records from the POSTed messages" (and the non-streaming fallback variant)

### Context usage & cost

- [x] Context usage restores on load, attributes to the **initiating** conversation, and fills incrementally while streaming. (`5ca90d2`) — `use-chat-turn` "attributes usage to the conversation that started the request"; "restores context usage for the conversation it is reset to"; turn store "coalesces a burst of deltas into a single frame notification" (publishes the predicted total)
- [x] Resets on new chat; stale values don't leak on conversation switch. (`dc4c323`) — turn store `beginTurn` asserts `contextUsage: 0`; `resetForConversation(null)` clears it
- [x] Total chat cost appears in the context tooltip. (`5c0818c`) — `ContextUsage` "shows the cost only when there is one"
- [x] Ring turns yellow at 75%, red at 90%. — `ContextUsage` "turns the ring amber at 75% and red at 90%"

### Features & gating

- [ ] Artifacts are parsed and the panel opens **only** when the artifacts toggle is on. (`f3f3e4d`)
- [ ] Web search + artifacts can be enabled **at the same time**. (`a2e4c60`)
- [ ] Web search, agent mode and calculator are disabled for models without tool support. (`396a4f3`)
- [x] ~~Import/export buttons live in Settings only, not the sidebar.~~ — **moot: feature deleted in P5**
- [x] ~~LibreAssistant exports import; incompatible settings are skipped rather than crashing.~~ — **moot: feature deleted in P5.** The two `lib/settings.js` functions it left behind had no production consumer and were removed in P10, along with the five tests that were the only things referencing them.
- [ ] Balance outage dialog offers the `openrouter/free` fallback. (`1f001b3`, `8e4489b`)

### Persistence & hydration

- [x] localStorage keys unchanged — users keep their settings. — `contracts.test.js` pins all 14 `storageKey` strings literally `hack_club_ai_key`, `e2b_api_key`, `color-mode`, `show_sandbox_code`, `show_sandbox_output`, `show_thinking`, `show_metrics`, `thinking_enabled`, `agent_mode_enabled`, `theme`, `model`, …
- [x] IDB store name, key path and record shape unchanged — existing conversations load. — `contracts.test.js` asserts the store name and `keyPath: "id"` against a real opened database Migration test seeds pre-existing records.
- [ ] Values read from localStorage hydrate in a mount effect, never during render (hydration mismatch). (AGENTS.md, `hasE2bKey` bug)

### Security & sandbox

- [x] Sandbox file downloads use the two-step token flow — the E2B key never appears in a URL. — `contracts.test.js` asserts the key is in the POST body and absent from the navigating URL (`28787a7`)
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
| `lib/settings.js` | 189 | Declarative registry of every persisted key. Single source of truth. Rewriting re-derives `f5ba29e`. |
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
| `components/chat/ChatApp.jsx` | 338 | P2 ✅ | The former `page.js` body. Thinned progressively in P3–P8 (P5: import/export props/handlers gone). |
| `components/chat/ChatLayout.jsx` | 171 | P2 ✅ | Shell only. Split out `layout/SidebarContent.jsx` and `layout/Header.jsx`. |
| `layout/SidebarContent.jsx` | 319 | P2 ✅ / **P5 ✅** | Conversations store, no `ui/scroll-area`, `ConversationRow` extracted, `<ul>`/`<li>` + `aria-current` + empty states. |
| `layout/Header.jsx` | 193 | P2 ✅ | **P4 ✅** ModelPicker/ContextUsage read the store; `groupedModels`/`contextWindowMap` props gone. |
| `components/settings/*` | 720 | P3 ✅ | Replaces `components/chat/SettingsModal.jsx` (661): shell + 6 sections + shared chrome. **P4 ✅** `ModelsSection` takes no `groupedModels`; Settings calls `loadModels()` itself. **P5 ✅** `DataSection.jsx` removed with the import/export feature (5 sections now). |
| `components/chat/ImportDialog.jsx` | — | **Removed P5** | Feature never worked; deleted instead of rewritten. |
| `lib/import-export.js` | — | **Removed P5** | Feature never worked; deleted instead of rewritten. |
| `components/settings/DataSection.jsx` | — | **Removed P5** | Settings "Data" section (import/export buttons) — removed with the feature. |
| `components/chat/ModelPicker.jsx` | 77 | P4 ✅ | Aria `Menu` + `MenuGroup`; one markup path for both breakpoints. |
| `components/chat/ContextUsage.jsx` | 105 | P4 ✅ | `max` prop → `modelId`; window comes from the store. Tooltip swap to `primitives/` is still P9. |
| `hooks/use-models.js` | — | P4 ✅ | **Deleted** — replaced by `src/stores/models.js` (single-writer rule). |
| `hooks/use-conversations.js` | 211 | P5 ✅ | **Deleted** — replaced by `src/stores/conversations.js` (single-writer rule). |
| `lib/db.js` | 68 | P5 | Same schema; migration test with seeded records. |
| `hooks/use-chat-stream.js` | 579 | **P6 ✅** | **Replaced** by `hooks/use-chat-turn.js` (`useChatStream` deleted). The `fullResponse`/`fullThinking` twin accumulators collapsed into the store's buffers; 5 conversation props and the unused `setContextUsage` dropped from its surface. Test file renamed, all 15 tests ported unchanged. |
| `hooks/use-chat-turn.js` | 563 | **P6 ✅** | New. Reads the conversations store directly instead of taking it as props. |
| `stores/turn.js` | 134 | **P6 ✅** | New. Live buffers + exactly one store notification per animation frame. 11 tests. |
| `lib/sse-parser.js` | 66 | **P6 ✅** | New — existed only as a copy pasted inside its own test. |
| `lib/api-client.js` | 371 | **P6 ✅** | De-nested into `buildRequestBody` / `postChat` / `createFrameRouter` / `streamOnce` / `replayOnce`; the `doStream`↔`doFallback` recursion is gone. Every export and the empty-EOF retry semantics unchanged — its 34 tests were never edited. |
| `components/chat/MessageList.jsx` | 227 | **P7 ✅** | 16 props → 2. Plain `overflow-y-auto` `<section>`; `useThreadScroll` owns the tail-following. |
| `components/chat/message/*` | 1093 | **P7 ✅** | `Markdown.jsx` + `useMessageText.js` replace three Streamdown copies and two body-class copies; `Message`/`StreamingMessage` read their own settings; `aria-expanded` on four disclosures. `SandboxFiles`, `MessageParts`, `MessageRow`, `SourcesBlock`, `ErrorMessage`, `EmptyState` reviewed and left alone. |
| `components/chat/ResponseMetrics.jsx` | 103 | **P7 ✅** | Four tooltip blocks → one `Metric`; `formatDuration` hoisted and NaN-guarded. |
| `components/chat/CustomLink.jsx` | 69 | P7 ✅ / **P9** | Reviewed, unchanged. One of the three consumers of the Dialog swap. |
| `components/chat/ThinkingIndicator.jsx` | 31 | **P7 ✅** | Reviewed, unchanged. |
| `hooks/use-thread-scroll.js` | — | **P7 ✅** | New. 7 tests. |
| `components/ui/scroll-area.jsx` | 76 | **Deleted P7 ✅** | Radix `ScrollArea` + `ScrollBar`; `MessageList` was the only consumer. |
| `components/chat/ChatInput.jsx` | 342 | **P8 ✅** | File-read failures can no longer hang a drop; labelled controls; `auto` height reset instead of a hardcoded 44px. |
| `components/chat/ArtifactPanel.jsx` | 424 | **P8 ✅** | **framer-motion deleted** (the app's only use). Reuses `Markdown`; drop is a project-owned opacity fade; resize releases on cancel/unmount; 12 tests where there were none. |
| `components/chat/ChatLayout.jsx` | 171 | P2 ✅ / **P8 ✅** | Sidebar drag moved to pointer events with capture, matching the panel. Document-level mousemove/mouseup listeners gone. |
| `app/globals.css` | — | **P8 ✅** | One addition: `--animate-hcai-fade-in` + keyframe. Opacity only, `hcai-` prefixed so it cannot collide with the `tw-animate-css` enter keyframes P9 removes. No palette or token values touched. |
| `hooks/use-settings.js` | — | P3 ✅ | **Deleted** — replaced by `src/stores/settings.js` (single-writer rule). |
| `hooks/use-media-query.js` | 30 | P1 | Trivial; re-home under `hooks/`. |
| `components/layout/AppWrapper.jsx` | 18 | P2 | Becomes the provider root. |
| `components/ui/*` (Radix) | 904 | **P9** | Stays untouched until P9 — new components read `components/primitives/*` instead. Deleting early breaks the still-Radix old tree. |
| `components/primitives/*` (Aria) | — | **P1** | New. Lives on a separate path so both layers can coexist. |

---

## Anti-jank checklist — built into the phase that owns it, verified in P10

| # | Fix | Phase |
|---|---|---|
| 1 | Plain `overflow-y-auto` + `scrollbar-gutter: stable` (replaces Radix `ScrollArea`) | **P7 ✅** |
| 2 | rAF-coalesced streaming deltas — one DOM update per frame | **P6 ✅** |
| 3 | Opacity-only transitions; no `animate-in` slide/zoom, no framer-motion | **P9 ✅** — `tw-animate-css` gone; every entrance is an opacity-only `hcai-fade-*` keyframe |
| 4 | Reserve space before content arrives (image aspect-ratio, code-block min-height) | **P8 ✅ (images)** / P9 (code blocks) |
| 5 | Panel width as one `grid-template-columns` transition, not stepwise reflow | **Deferred — see below** |
| 6 | `setPointerCapture` on all drag handles, clamped and persisted | **P8 ✅** |

**Item 4, precisely:** image attachments already reserved their box through
next/image's `width`/`height` attributes plus a `loaded` placeholder, so that
half needed nothing. Code blocks are Streamdown's output and are still not
reserved — left for P10, and recorded as an open item rather than claimed.

**Item 5, still deferred (P10).** Moving the panel width out of the panel and
onto a `grid-template-columns` track means lifting that state from
`ArtifactPanel` into `ChatLayout`, which owns the row, and re-deciding the track
in three states the panel currently handles entirely on its own: desktop,
mobile (where the panel is `position: fixed` and must contribute a zero track),
and fullscreen (where it is a fixed overlay). That is a layout refactor across
three components with a real chance of a regression that neither the unit tests
nor the smoke script can see — the smoke script measures the settings dialog at
360×640, not the artifact panel at three widths.

The cheaper half of the same problem is done: resizing no longer runs through
per-element width writes, and the transition is suppressed during a drag so
the thread does not reflow behind a moving edge. What remains is the row
itself, and that belongs with P9, where the layout-affecting deletions land and
the diff is expected to be large enough to review as a unit.

Baseline CLS/scroll-jank measurement: **still not recorded** — P10, and it has to
be captured against the `8aa44a6` baseline, not against P7's container.
