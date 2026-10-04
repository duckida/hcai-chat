# Frontend Rewrite — Working Tracker

## Status

| | |
|---|---|
| **Phase** | **P10 complete** — `AGENTS.md` rewritten, storage contracts pinned, the last Radix import removed, the inert motion system fixed, all 30 invariants closed, anti-jank 5 done, title generation fixed. One item is unrecoverable rather than open: the CLS *baseline* was never captured at P0, so only current values can be measured. |
| **Baseline commit** | `8aa44a6` fix(chat): scope stream rendering per conversation and drop stale UI state |
| **Baseline test suite** | 29 files / **385 tests passing**, 22.1s (`npm test`) |
| **Current test suite** | 45 files / **646 tests passing** — lint, format and `next build` all clean · smoke **29/29** |
| **Origin sync SHA** | `8aa44a6` — every phase starts with a sync against this |
| **Stack** | Next.js App Router · React · Tailwind v4 (existing tokens/themes unchanged) · React Aria Components · Vitest + RTL |

## Feature C — client-side agent loop (Libre-style short streams)

**Why:** production cutoffs are markerless EOFs at the browser. Probes proved the
server→upstream leg cannot produce one — every upstream failure ends in `[DONE]`
or an error frame — so the cut is on the browser↔Next leg, and our chat
connection spans the *whole* turn (`stepCountIs(100)` + in-stream E2B/search,
measured 8m28s). Libre-Assistant's streams survive because its agent loop runs
client-side: one short request per model round, tools (a browser Web Worker
sandbox, not cloud) executed *between* requests. Connection lifetime ∝ one
round, not the whole turn.

**C1 — landed:** `singleRound` mode in `src/app/api/chat/route.js`. Schema-only
tools (no `execute` closure — `stepCountIs(1)` alone does *not* prevent
execution, probed) + `stopWhen: stepCountIs(1)`; the round ends with
`finishReason=tool-calls` and the existing `tool_calls` frames. Tool execution
moves to the existing on-demand endpoints (`/api/tools`, `/api/sandbox`) in C2.
Also landed: `[stream start]` / `[stream end]` terminal logging (finishReason,
duration, steps, usage) to correlate with the client's markerless-EOF warning.

**C2 — landed:** the client-side agent loop in `use-chat-turn.js`. Each round
streams with `singleRound: true`; a round ending in tool calls runs the calls
via `executeClientTool` (`/api/sandbox` for E2B, `/api/tools` otherwise —
keys stay server-side), then commits the assistant message (with `tool_calls`
and any chips the tools filled) together with the tool-result messages, and
sends the next round. Tools run *before* the commit so a search's chip
carries its sources. Usage is summed across rounds (`sumMetricsFrames`) into
the final message. Unlimited rounds by default (Libre's `tool_max_iterations`
pattern). The three existing tool-call tests were updated to the two-round
flow; four new tests cover the wire protocol, tool errors, sandbox synthesis,
and usage summing.

**Cut detection — landed:** the route's `onEnd` closes **markerless** when
`finishReason === "other"` (a clean upstream cut — no upstream finish_reason
ever arrived; probed) instead of writing `[DONE]`, so the client's continue
logic resumes the answer rather than committing the truncation. This closes
the one blind spot Libre has too. Two new tests, negative-controlled.

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

## Findings from P10 — read before touching verification, hydration or the API route

1. **A test that cannot fail is worse than no test, because it reads as coverage.** Two
   arrived in this phase and both had to be rebuilt. The hydration test first compared the
   server HTML against a run with empty storage — that catches a read whose value the markup
   depends on, and nothing else; a read of a setting nothing currently renders leaves the
   markup byte-identical and the test green, which is exactly the read that becomes a bug the
   day someone starts rendering that setting. It now spies on `Storage.prototype.getItem` across
   a `renderToString` and asserts zero reads, which named the offender on the first run. The
   title-generation smoke check first scraped the sidebar for a non-default title and passed on
   **`"Settings"`** — a navigation button. Both were found by asking what the assertion would
   report if the thing it names were wrong, not by whether it was green. **Every check in this
   phase was negative-controlled: break the thing, confirm the check fails, restore.** The
   `streamChatCompletion` await check reports `file:line`; the sandbox-output gates fail when
   the gate is forced on; the route's system-message hoist fails when the filter is removed; the
   title check fails with the truncated fallback.

2. **A React Aria tooltip cannot open under jsdom when its trigger contains element
   children — and this is not a jsdom bug to work around, it is a coverage split.** Text
   children open; `<span>`, `<svg>`, an icon plus a value — every trigger in this app — do
   not. So the unit tests drive **focus**, which does work and is the more important half of the
   contract anyway (it is what a keyboard user gets), and the hover half moved to smoke check
   11 with a real `Input.dispatchMouseEvent`. That check needed **two** moves, not one: a single
   `mouseMoved` from the pointer's existing position does not reliably produce an enter event,
   which is what RAC's hover is built on. An `el.click()`-based helper could never have caught
   any of this — a synthetic click does not open a pointer-driven tooltip.

3. **`isOpen` on a RAC `TooltipTrigger` makes it inert.** It is uncontrolled-only in this
   version: a controlled `false` means hover can never open it and `onOpenChange` is never
   called. The context ring's click-to-pin was built on that assumption and had to go. It was
   never asked for — the brief was "hover, but delayed and offset", which is what it does.

4. **A `useState` initialiser runs on the server.** `ChatLayout` read the sidebar width there,
   guarded by `typeof window === "undefined"` — which is exactly the guard that makes the bug
   invisible: the *server* was safe and the first *client* paint disagreed with the server's
   HTML, so a resized sidebar jumped on every load. Reading storage in a mount effect fixes it,
   and the write effect then has to be gated on the read having happened or it persists the
   default over the saved value on the way past. **The hydration invariant was not just untested
   — it was false.**

5. **A streamed turn whose whole output is a tool call rendered nothing.** `MessageList` showed
   the streaming row only for text or thinking, so code written and run before the model said
   anything left the thread blank — the run was invisible until the reply arrived, which is the
   entire reason to watch one. Sandbox tools now count as content.

6. **The model SDK rejects a system-role message in `messages`** —
   `AI_InvalidPromptError: System messages are not allowed in the prompt or messages fields` —
   so every title request was a 500, and the client's fallback (a truncated copy of the first
   message) looks exactly like a title. Fixed in the route, not the client: the route is the
   layer that knows the SDK's constraint, and `sanitizeMessages` still admits the `system` role,
   so fixing the caller would have left a stored system message able to 500 the same way.

7. **A captured DOM node goes stale the moment React replaces it.** The header-gating test
   captured the web-search button once React replaced it on the catalog load and asserted on a
   detached node, which reports neither disabled nor enabled — so the test would have passed
   against a live, enabled button. The same test was also seeding `toolsSupported` directly,
   which `loadModels()` overwrites a tick later. Both fixed by driving the *catalog* and
   re-querying inside the assertion.

8. ~~**Conversation titles can be stuck on "New Chat" forever.**~~ — **fixed in P10.** Two
   causes, one already recorded above and one not. The second: `makeOnComplete` gated title
   generation on `currentConversation.title === "New Chat" && finalMessages.length === 2`.
   The message-count half made a single failed attempt *permanent* — an empty/errored first
   turn returns before the title request ever runs, and from then on every turn has four
   messages instead of two, so the condition can never be true again. The count is also
   redundant: `title === "New Chat"` is the whole condition that matters. The guard is gone,
   and the text now comes from the conversation's **first** user message rather than the one
   just sent, since this can now fire on turn 3+. Two tests in `hooks/__tests__` — the happy
   path, and the recovery — with the old guard restored to confirm the second one fails
   (`expected 2 times, but got 1`).
   The harness taught a trap worth keeping: a `mockResolvedValue(makeStreamResponse(...))`
   hands *one* reader to every turn, so turn 2 sees an empty stream and takes the error path —
   the test then failed for a reason that had nothing to do with the bug. It has to be
   `mockImplementation(() => makeStreamResponse(...))`.
9. ~~**Sidebar titles sat 46px in from the edge of a 260px sidebar.**~~ — **fixed in P10.**
   `globals.css` styles lists "for Streamdown-rendered markdown" with
   `ul:not([class*="list-none"]) { padding-left: 1.5em }`. The selector is global, so it also
   hit the sidebar's `<ul>` — 12px of container `px-3` + 24px of prose indentation + 10px of
   `pl-2.5`. The rule ships its own opt-out, so the list now carries `list-none`; smoke check
   16 measures the title's distance from the sidebar's own left edge (22px) and fails at 46px.
   The general form: **a rule written for one renderer, gated on a class it assumes the caller
   opted into, is a rule that quietly styles everything else too.**
10. ~~**The artifact panel could not be closed, paid 480px for nothing, and blanked when
    artifacts were switched off.**~~ — **fixed.** Three reports, two root causes.
    **A: an effect wrote the state the Close button writes.** `ChatApp` opened the panel
    whenever `artifactsEnabled && isDesktop && !open`, with `artifactPanelOpen` in its own
    dependency list — so the click flipped it and the effect flipped it straight back in the
    same commit. Closing was impossible while the toggle was on. **B: open-state was
    remembered, the thing it referred to was not.** `artifactPanelOpen` lived on the
    conversation while what the panel could show was re-derived and gated on the global
    toggle, so the two disagreed: New Chat wrote `artifactsEnabled && isDesktop` into the
    conversation (480px track, `ArtifactPanel` returns `null` with no artifacts — an empty
    column), and an existing artifact chat with the toggle off showed nothing at all.
    The fix is to derive rather than remember: `open = hasArtifact && !dismissed`, where
    `dismissed` is component state that forgets itself when the conversation changes. Nothing
    persists, which is what makes "come back to an artifact chat and it is open" work, and
    a chat with nothing to show cannot reach a non-zero track by construction.
    `artifactPanelOpen` is gone from the store, `newConversation` and `use-chat-turn`.
    What did **not** change: the *message body* still follows the toggle (a pinned test), so
    with artifacts off you see the source in the thread and the rendering in the panel — the
    request was about the panel opening, and the body's behaviour was already deliberate.
    Five tests in `components/chat/__tests__/ArtifactPanelVisibility.test.jsx`, each
    negative-controlled: auto-open restored → `expected 480 to be +0`; open-on-toggle → two
    phantom-track failures; toggle gate restored → `expected +0 to be 480`. Two traps from
    writing them. **A green negative control is not automatically evidence** — the first two
    I wrote passed anyway, one because its dependency array threw before the assertion could
    run and one because its condition was `!dismissed`, a tautology once dismissed. It has to
    key off the *derived* open state, exactly as the shipped effect did. And **jsdom matches
    no media query**, so `isDesktop` is false in every test: the track is 0 in all five cases
    and the phantom check could not have failed. The file pins `matchMedia` to a desktop
    viewport, which is the only thing giving those assertions something to be wrong about.
11. ~~**Streaming a long answer filled the page, the chat bar disappeared, and nothing would
    scroll.**~~ — **fixed.** One missing class. The thread column is a *grid item*
    (`ChatLayout`'s `col-start-2` div), and a grid item's `min-height` defaults to `auto`:
    its content-based minimum. So the answer's own height became the row's minimum — the row
    grew to 5664px inside an `h-screen overflow-hidden` grid, `main` grew with it (5608px),
    the thread's scroll box measured `clientHeight === scrollHeight` (5452 — it did not
    think it was overflowing, because it had *grown* instead), and the composer sat at
    `bottom: 5664`, below a viewport that has no scrollbar to reach it. Both reported
    symptoms have that one cause: you cannot scroll because neither the page nor the thread
    believes there is anything to scroll to. `min-h-0` on that div, with a comment saying
    why, is the whole fix: the item's minimum contribution becomes 0, the track fills the
    viewport instead of the content, and the thread scrolls inside it — 588px box over
    5796px of content, composer pinned at `bottom: 800` through a 45s stream while the tail
    follows. The artifact panel was checked for the same flaw and is safe: its content
    region is `overflow-hidden`, which zeroes the automatic minimum. **No unit test can ever
    catch this** — jsdom has no layout engine, every box measures 0 with or without the
    class — so the check is smoke 17: seed a 12,870px conversation, assert the composer's
    bottom is inside the viewport, the thread actually scrolls, and the page does not.
    Negative-controlled by dropping the class: `composerBottom: 13016` against a 900px
    viewport, `clientH === scrollH`, `scrolled: 0`.

12. ~~**Sandbox commands were inline blocks in the thread; they are now a terminal in the
    right panel — and every gate around the panel had to learn there are two content
    kinds.**~~ — **done** (user's sketch: a `Cloud sandbox` side showing `/workspace $ ls`
    entries). The panel's open state stayed a derivation, never a store field:
    `open = (hasArtifact || streamingArtifact || hasSandboxRuns) && !dismissed`, so a chat
    whose *only* content is commands pays exactly one track, a new chat still pays none, and
    `ArtifactPanelVisibility` pins both directions. Three traps fell out:
    - **The live and persisted runs are the same runs.** `streamingSandboxTools` is still in
      the store after the turn ends (the generated-files pills read it there), and
      `makeOnComplete` commits `sandboxResults` to the message in the same batch — so the
      terminal's live list is gated on `isLoading && streamingConversationId === active`.
      Drop either half: the first prints every command twice after each turn, the second
      opens the panel for another conversation's stream. Both are negative-controlled.
    - **The panel follows the conversation; the tab follows the turn.** Tab state lives in
      `ChatApp` (so the fullscreen remount keeps it), resets per conversation, and the first
      run of a turn switches it to `sandbox` *unless a streaming artifact is arriving* —
      with the same one-transition-per-turn ref the artifact reopen rule uses, so a
      dismissed panel comes back for the next turn's first command without nagging
      within one.
    - **A panel that hosts two things may not be named after one.** The collapsed/open
      affordances are now `Open side panel` / `Resize side panel` (smoke's two selectors
      moved with them), the mobile pill says what it will actually open, and the preview/code
      controls render only on the artifact side — a copy button for source that is not there
      is a lie. `showSandboxCode` / `showSandboxOutput` kept their meaning and moved with the
      content they gate: they now read inside `SandboxTerminal` from the store, exactly as
      `Message` reads its own display flags. The inline `StreamingSandboxBlock` is deleted;
      the thread keeps only row visibility during a quiet run and the generated-files pills.
      Smoke 18 is the browser half: one handle, one track, prompt + stdout + `exit 0` painted
      beside the thread — negative-controlled by dropping `sandboxRuns` from the gate
      (20/21, check 18 red).

13. ~~**Closing the panel was a one-way door: the "Open side panel" button
    existed, passed every test, and could not be clicked by anyone.**~~ —
    **fixed.** The button rendered *inside* the panel's own grid track, and
    that track is `0px` wide when the panel is closed — a strip at the right
    edge of the viewport, so the button's rect came out at `left: 1280` on a
    1280px window: `visibility: visible`, `display: flex`, entirely off-screen,
    `elementFromPoint` → `null`. jsdom found it with `queryByLabelText` and
    every unit test stayed green; only a real layout engine can see that an
    element exists and is still unreachable. The geometry predates the sandbox
    panel — the Close button and the dismissed state arrived in `b1271bd`
    (finding 10), and `scripts/smoke.mjs` had never once clicked Close, so
    nothing ever exercised the way back.
    - **Fix mirrors the sidebar, which had the same problem and the same
      answer.** A collapsed sidebar cannot host its reopen either; it has
      `Expand sidebar` in the Header. The panel now has `Open side panel`
      there too, gated on `panelAvailable && !panelOpen` — availability kept
      separate from openness so a chat with nothing to show never advertises
      a button that cannot do anything. `ArtifactPanel`'s in-track desktop
      toggle is deleted; the mobile pill stays, because it is `position:
      fixed` and never depended on the track.
    - **Tests had to learn geometry's half of the story.** The two dismiss
      tests now *click* the collapsed affordance and demand the track come
      back (the reported path), the artifact one also demands the button be
      absent while open, and smoke 19 measures what jsdom cannot: the rect
      inside the viewport, `elementFromPoint` hitting the button, then the
      click restoring the track and terminal. Negative-controlled four ways:
      dropping `!panelOpen` (open-state assertion red), dropping
      `panelAvailable` (dead button on a fresh chat, red), an inert
      `onTogglePanel` (reported path red), and a gate that never renders
      (smoke 21/22, check 19 red with `found: false`).

14. ~~**Tool calls were a separate list below the thinking; they now sit inside the
    reasoning where they happened.**~~ — **done** (user's sketch: `reddit.com`,
    `txt.com`, `5+5` pills interleaved with the reasoning). A chip records
    `at = <thinking buffer length at the moment the call arrived>` — the *buffer*, not
    the rendered mirror, because that is what the commit reads — and `splitThinking`
    turns offsets into event positions: sorted by arrival, clamped to the text, keyed
    `t<cursor>` / `c<at>-<order>` so a growing tail never renumbers an earlier pill.
    - **Capture sits before the agent guard, and sandbox tools are excluded.**
      Web search and the calculator run in ordinary chats, where the guard would
      swallow their calls; `execute_code`/`run_command` are excluded because their
      transcript *is* the side panel — no command belongs in the thread
      (`appendTurnChipArgs` also no-ops for indexes that never got a chip, so a
      sandbox tool's argument deltas land nowhere).
    - **Labels promote, sources fill in call order.** Argument fragments accumulate
      and parse into `expression`/`query` when they form JSON (half a document keeps
      the previous label); search results fill the *oldest unfilled* `web_search`
      chip, one pill per site — the first result for a domain owns the link — with
      `www.` stripped, duplicates collapsed and free text dropped. A source is stored
      as `{ domain, href }`: the pill is *labelled* by the bare domain (a path makes
      pills unusably wide) and *links to the full result URL* (a domain-only target
      throws away what the search returned). Legacy persisted chips are bare domain
      strings and still render, with `https://<domain>` as their target. The
      commit persists `{tool, at, label, sources}` only when there is at least one
      chip — a legacy message carries no field at all. `hasRenderableContent` and
      `hasVisibleBody` learned chips (a turn that spent itself on tool calls before
      its first reasoned word still has something to draw); `hasSendableContent`
      deliberately did not, so an empty assistant turn is never sent upstream.
    - **Two bugs caught before shipping, by writing the tests first.** The rewrite
      of `ThinkingBlock` called `i` that the `map` callback never bound — every
      existing test stayed green because nothing rendered the expanded body; the
      component tests found it immediately. And the first version of the offset
      test asserted against `readTurnDeltas()` when it meant the mirror — the
      buffer *is* `readTurnDeltas()` (AGENTS said so; the test read it backwards).
    - **Verified:** 615 unit tests (27 new: buffer pinning, label promotion,
      oldest-unfilled fill, split/clamp/key order, interleaved DOM order, stream
      gating, chips-only gates) against eight negative controls — mirror `at`,
      fill-last, unfiltered sandbox chips, dropped persistence, dropped sort,
      dropped placeholder gate, dropped conversation gate, and each half of the
      render gate (predicate and row) — plus smoke 20, which expands the block in
      a real browser and measures the pill order and the deep links.

15. ~~**Responses silently cut off when a connection died mid-answer.**~~ —
    **fixed.** The server closes every success with `data: [DONE]` (route.js,
    after the usage frame) and writes a keepalive comment every 5s — the
    protocol was already complete. The client threw the completion marker away
    (`parseSseFrame` returned null for `[DONE]`) and then decided "finished"
    from the fact that the bytes stopped, so a clean early close after *any*
    delivered content committed silently as a complete response: no error, no
    retry, an answer that just ends. Every `api-client` fixture ended with
    `[DONE]`, so the partial-then-EOF-no-marker case was never tested.
    - **Completion is what the server said, not what the bytes did.**
      `sse-parser` now dispatches `[DONE]` as `SSE_DONE`; `streamOnce` decides
      EOF in precedence order: empty → replay (the oldest retry invariant,
      marker or not); marker → complete; a delivered error frame or tool/search
      result → complete, *never* replayed over (their work already happened);
      content without the marker → a truncation, routed into the same
      one-time replay a transport failure already used (now itself streamed —
      finding 16).
    - **A failed turn keeps what it wrote.** `onFallbackStart` used to wipe the
      partial *before* the replay started, and a failed replay committed
      `content: ""` — a double failure destroyed text the user had already
      read. The wipe moved to the first replay *chunk* (the buffers hold the
      partial until real replacement text exists), and `makeOnError`/the outer
      `catch` commit the partial alongside the error; `MessageList` renders
      that body above the error card instead of hiding it. An error message
      still carries the `error` field, so `hasSendableContent` keeps the
      truncated record out of later requests.
    - **A wedged connection recovers instead of spinning.** A pending
      `reader.read()` never settles on its own and a background tab may never
      be scheduled again; the read loop arms a 15s silence timer (keepalives
      are 5s, so silence is a dead connection, not a slow model) and checks
      staleness on `visibilitychange` — because tab timers are throttled to
      once a minute or worse. Either path cancels the reader, which surfaces
      as an EOF and lands in the truncation check.
    - **Verified:** 40 `api-client` tests (+6: truncation replay, marker
      completion, both precedence branches, fake-timer stall, visibility
      recovery), `sse-parser` `SSE_DONE` dispatch, `use-chat-turn` partial
      preservation (+2), `MessageList` partial-plus-card (+1) — eight negative
      controls, each break-verified (marker dropped, precedence disabled,
      eager wipe, disabled lazy clear, empty-box error, neutered timer,
      removed visibility listener, dropped body render) — plus smoke 21,
      which patches `fetch` in a real browser to cut the first streamed
      response after one delta with no marker and asserts the console warn
      fired and the cut prefix was replaced by the replayed answer.

16. ~~**An 8-minute answer died on the way back, and the user saw a JSON parse
    error.**~~ — fixed, in two parts. The chain: a connection was cut early
    (finding 15's case) and the one-time retry was a **non-streaming** request,
    which sends *zero bytes* for the whole regeneration — exactly what a proxy
    read-timeout kills. The provider completed the answer (44,017 tokens, 8m28s)
    and it was billed; the proxy answered the silent leg with a plain-text
    `502 Bad Gateway`. `postChat`'s unguarded `response.json()` then threw
    `Unexpected token 'B', "Bad Gateway" is not valid JSON`, and that SyntaxError
    *became* the user-facing error. The answer was unrecoverable, and the context
    indicator froze at 887 tokens because the truncated turn never carried a
    `usage` frame.
    - **Error bodies are not JSON by contract.** A proxy answers a dead upstream
      with whatever it has — plain text, HTML. `postChat` reads the body as
      `text()` first and parses JSON only if it yields an object; otherwise it
      surfaces `Chat API Error (502) using model "…" — Bad Gateway` (HTML bodies
      skipped, `statusText` fallback).
    - **The retry streams too.** Keepalives keep bytes flowing, so no proxy can
      idle-timeout a long regeneration, and the `usage` frame arrives with the
      answer — the context ring heals instead of freezing. The retry keeps a
      fresh frame router so its ending is judged on its own evidence, and the
      exactly-one-retry invariant is unchanged: never a third attempt. (Finding
      17 later replaced this replay *for cuts that delivered content* — those
      continue instead — but the mapping below still governs the one replay of
      an empty/thinking-only ending and its own failures.) Outcome
      mapping: delivered → the router's normal completion; cut again →
      `onError(… cut off before it finished)`; empty →
      `onError(No response received from model "…")` — never `onComplete`,
      which with the original partial still buffered would silently commit a
      truncated answer as if it were whole (a pre-existing hole this closes).
      `route.js`'s non-streaming branch now only serves `generateTitle`.
    - **Known limitation, deliberately not fixed:** a client-side cut does not
      abort the server-side generation — the orphaned run still bills.
    - **Verified:** 631 unit tests — `api-client` at 44 (+2: the retry being cut
      again errors without a third attempt; the empty retry errors with the
      model named), six existing tests rewritten to the streamed retry, four
      `use-chat-turn` mocks rewritten — against three negative controls, each
      break-verified by grep first: `stream: false` in `postChat` (the five
      `stream === true` assertions went red), the outcome mapping removed
      (exactly the two new tests red), the lazy replay-clear dropped (both
      duplication tests red) — plus smoke 22, which patches `fetch` in-page so
      *both* streamed probe attempts answer with a plain-text `502` and asserts
      the error card carries `502 … Bad Gateway`, not `Unexpected token`.

17. **A full replay reproduces the very cut that killed the answer.** Cut
    symptoms kept arriving from production ("ends with a retry failed") on a
    deployment running the latest build — so finding 16's streamed retry was
    not the whole story. Two independent attempts dying at the same point in
    the same answer is not flakiness: a deterministic killer in front of the
    app (a duration/size cap, not the model) ends any request that outlives
    it, and a replay that regenerates the identical answer reaches the
    identical length and dies at the identical place. Search/sandbox turns had
    the same cut arrive with nothing to retry *over* — a delivered
    `serverEvent` forced a silent completion, truncating the answer invisibly
    (the hole finding 15 had exempted for side-effect reasons).
    - **Continue instead of regenerate.** On a cut that delivered content or a
      tool/search result, `api-client` now sends a continuation: the same body
      plus the partial as an `assistant` turn and a short "continue exactly
      where it stopped" user message — only the remainder is generated, so
      each leg is shorter than the original and a length cap cannot reproduce
      the cut. The continuation appends through the same `onChunk` path (no
      `onFallbackStart`, nothing cleared: sources and the partial stay put),
      and because it never re-runs search or tool work, the duplication
      concern behind finding 15's "never replay over a tool result" no longer
      applies — a search cut now continues visibly instead of completing
      silently. The replay still exists for endings with nothing to continue
      from (empty or thinking-only: no partial to anchor to) and still streams
      (finding 16), and a replay that is itself cut hands its own partial to
      the continuation instead of regenerating a third time.
    - **Seams and loops are bounded.** A model that ignores the instruction
      and repeats the sentence it was shown loses the repeat: a leg's first
      ~160 chars are held against the partial's last 240 and the matched
      overlap is trimmed once at the seam (matches under 12 chars are left
      alone — at that length a match is as likely to be a real word as a
      restart). Budgets: `MAX_CONTINUE_LEGS` (3) legs in total and
      `MAX_EMPTY_LEGS` (2) consecutive legs that deliver nothing — an empty
      leg is continued again per the product decision, never spun on. An
      exhausted budget maps to the replay's two error texts (cut off / no
      response), so the partial still commits alongside them; a leg that
      threw surfaces its own message when its budget runs out.
    - **Known limitations:** turn metrics reflect the last leg only (no usage
      frame ever arrives for a cut leg); a client-side cut still does not
      abort the server-side generation; and `finish_reason` is never
      forwarded, so a length-cap stop remains indistinguishable from a
      natural stop.
    - **Verified:** 636 unit tests — `api-client` at 49 (+5: continuation
      body, leg budget, empty-continued-again budget, seam trim,
      replay-chains-into-continue; four rewritten from replay semantics:
      mid-stream reset, content cut, tool-result cut, repeatedly-cut budget;
      plus a new thinking-only-dispatch pin) and three `use-chat-turn`
      rewrites — against six negative controls, each break-verified by grep
      first: dispatch `continue → retry` (the eight continue tests red), trim
      neutered (only the trim test red), leg budget `99` (budget test red at
      100 calls), `onFallbackStart` invoked on a continue (both files red),
      empty budget `99` (both empty-budget tests red at 4 calls),
      thinking-only dispatched to continue (only that test red) — plus smoke
      21, which now scripts *both* probe requests: the first cuts after one
      delta, and the second is only reached if the client's follow-up carries
      the partial (`"role":"assistant"`) and the continue instruction, which
      it answers with `SMOKEREPLAYOK`. The turn must end with the cut prefix
      *kept* and the continuation appended — either half missing fails the
      row, and an error card now fails it instead of skipping.

---

## Findings from P9 — read before touching the component layer

1. **RAC's `Tooltip` was never broken — I proved it was with the wrong probe.** I composed
   `<Tooltip><Button/><Tooltip>content</Tooltip></Tooltip>`, got an empty container, and
   concluded from that one shape that the primitive was unusable; a documented exception and a
   retained `radix-ui` dependency followed from it. `primitives/tooltip.jsx` already had a
   **passing test** the whole time, using `TooltipTrigger` wrapping both the trigger and the
   content. **Before declaring something impossible, look for a test of it.** The real findings
   from that area stand and are worth keeping: RAC has no `TooltipProvider` export in this
   version, it wires `aria-labelledby` to a heading only when the heading declares
   `slot="title"`, and a component cannot play both the stateful `Tooltip` and the content
   `Tooltip` or the trigger renders as nothing.

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
| 5b | no horizontal overflow at 360px | `scrollWidth` vs viewport; names the three widest offenders |
| 7 | composer accepts input | `ChatInput` accepts typing |
| 8 | user message is sent | Enter submit |
| 9 | assistant reply streams back | live model turn + `ResponseMetrics` |
| 10 | sent message survives reload | IndexedDB persistence |
| 11 | context ring tooltip opens on hover | **the tooltip migration, in a real browser** — a real `Input.dispatchMouseEvent`, since `el.click()` cannot open a pointer-driven tooltip |
| 12 | CLS under 0.1 | buffered `layout-shift` observer on a conversation restored from IndexedDB. **Current: 0.0002** |
| 13 | artifact panel at three widths | the grid track: a real drag moves it 480 → 720 with `panelLeft === threadRight`; full-bleed + zero track at 390px |
| 14 | conversation titled by the model | title read from **IndexedDB**, not the sidebar — see the trap below |
| 15 | no React errors or warnings in the console | console captured from **first paint** (`Runtime.consoleAPICalled` + `Log.entryAdded`), not polled. Aimed at what React 19 actually says — not the `onError listener` string React 18 said and 19 does not, which is why an earlier version of this check could never fail. Excludes Simple Analytics, the dev font-preload hint and Chromium's own `verbose` DOM advice, each with a reason |
| 16 | sidebar titles sit close to the edge | the prose `ul` rule above: title text measured from the sidebar's own left edge, so a collapsed sidebar cannot pass it by accident. **Current: 22px (was 46px)** |
| 17 | a tall thread scrolls while the composer stays on screen | a seeded 12,870px conversation: composer bottom inside the viewport, `scrollHeight > clientHeight` with a real `scrollTop` change, page itself not scrollable. **P10 finding 11 — the one class of layout bug no jsdom test can see** |
| 18 | a conversation that ran commands opens the Cloud sandbox panel | a seeded `sandboxResults` conversation with no artifacts: one track, one resize handle, terminal painted at the `/workspace $` prompt with stdout and `exit 0`, `panelLeft === threadRight`. **P10 finding 12** |
| 19 | a dismissed panel reopens from the Header | closes check 18's panel, then measures the reopen button: rect inside the viewport, `elementFromPoint` hits it, click restores track and terminal — the geometry unit tests structurally cannot see. **P10 finding 13** |
| 20 | thinking chips render in order, as links, inside the reasoning | a seeded conversation with pinned offsets: expand Thinking, assert reasoning-before < `5 + 5` < reasoning-between < reasoning-after, the query pill replaced by two links labelled by domain but targeting the full result URL, no leftover query. **P10 finding 14** |
| 21 | a stream cut before `[DONE]` is continued, not committed | two gating sub-checks (probe armed, probe message sent) then: patches `fetch` in-page so the first *streamed* `/api/chat` carrying the probe returns one delta and closes with no marker — a connection cut mid-answer — and answers the *second* streamed probe call with a scripted `SMOKEREPLAYOK`. Every probe call's body is recorded, so the check asserts the follow-up carried the partial (`"role":"assistant"`) *and* the continue instruction, the truncation console warn fired, and the turn ended with the cut prefix **kept** and the continuation appended — one half missing is a silent commit or a replay that discarded the partial. The prefix's first render is latched by a `MutationObserver`; an error card fails the row instead of skipping it. **Finding 17 — the continue fix, over finding 15's detection** |
| 22 | a proxy's plain-text `502` surfaces as an HTTP error, not a parse crash | two gating sub-checks (probe armed, probe message sent) then: patches `fetch` in-page so *every* streamed request carrying the probe — retry included, no latch — answers with a plain-text `502 Bad Gateway` (route.js only ever returns JSON, so this is a proxy answering for a dead upstream). Asserts the error card carries `502 … Bad Gateway` and never `Unexpected token` / `not valid JSON`. **Finding 16 — the production incident** |

**Credentials.** Check 2 seeds the Hack Club key from `SMOKE_API_KEY` or the gitignored
`.smoke-key`, then reloads so the settings store hydrates from it. The value is never echoed
and never written to the repo (`.gitignore` rule landed *before* the file did — verify with
`git check-ignore -v .smoke-key`). Without a key, check 9 is `SKIP`, not FAIL: a missing
credential is a prerequisite, not a regression. **Current: 29 ok / 0 skipped / 0 failed.**

**Profile isolation.** Each run gets `/tmp/opencode/hcai-smoke-<pid>` and a freshly allocated
debug port, both cleaned up afterwards. A shared profile once let the previous run's
`API Error` transcript be read as this run's result, and a crashed run's orphan Chromium once
held the fixed port so every later run died at launch.

**Traps this script encodes (each one produced a false alarm first):**

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
- **Do not scrape the UI for a value the app stores.** The title check read the sidebar for a
  non-default title and passed on `"Settings"` — a navigation button. Conversation titles live
  in IndexedDB; read them there. A check that can match the wrong element will, given time.
- **Do not click a toggle to put the app in a state you can seed.** The label reads "Toggle
  artifacts **off**" precisely because artifacts are already on, so the click disabled them and
  the panel rendered nothing while the track stayed reserved. Seed `localStorage`, then assert
  the toggle is already in the expected state.
- **A single `mouseMoved` does not produce an enter event.** Chromium needs the pointer to
  approach from somewhere: two moves, a nearby point then the target. `scripts/smoke.mjs`
  encodes this, and any new hover check needs it too.
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
- **A "message sent" check can pass against text that was never sent.** `ChatInput.handleSend`
  silently ignores Enter while the previous turn streams, and a textarea's `value` setter writes
  a real child text node — so `pageText` sees the typed probe in the composer and the check
  passes while no request was ever made (row 22's probe failed exactly this way for three
  runs: `seen:0, hits:0`, no error card). Probe sends now wait for the send button to be enabled
  and accept only "composer emptied **and** message in the thread" as sent — and note the
  fallback button click must be broken *alongside* Enter in a negative control, or it rescues
  the send and the control passes.

---

## Out-of-scope defects observed

Both surfaced in the P4 smoke run. `src/app/api/*` and the root layout were declared outside this
rewrite's charter (frontend only), so they were recorded here instead of patched mid-phase — and both
ended up fixed in P10 anyway, because a client that calls the endpoint, and a console that errors on
every load, are not things a rewrite can honestly leave behind while documenting that it did.

1. ~~**Conversation titles never generate — every new chat is titled "New Chat".**~~ —
   **fixed in P10** (`3d4344a`). It was listed because the charter was frontend-only, but a
   client that calls the endpoint is not a client that cannot care: the fix is a hoisting step
   in the route, and leaving it would have meant shipping a known-broken feature while
   documenting that choice. The route now moves system-role content into `instructions`, which
   is what the model SDK requires, and never passes it through as a message.
   `generateTitle` (`src/lib/api-client.js`) sends a `role: "system"` message, which survived
   sanitization into `processedMessages`, and the AI SDK rejected it with
   `AI_InvalidPromptError: System messages are not allowed in the prompt or messages fields`
   → `POST /api/chat` **500** on every title request. The client's fallback is a truncated copy
   of the first message, which looks like a title, so the failure was invisible. Reproduced on
   every live smoke run; smoke check 14 now fails on the reintroduced bug.
2. ~~**`src/app/layout.js` passed a *string* to React's `onError`.**~~ — **fixed in P10**, but
   the original diagnosis was wrong and the correction matters more than the fix.
   `onError="this.onerror=null;this.remove();"` on the Simple Analytics `<script>` was recorded
   as "logs `Expected onError listener to be a function` on every page load". **It does not:**
   smoke now captures the console from first paint (check 15) and React 19 never emits that
   string — it was React 18 behaviour, and the claim had simply never been checked. What was
   true is that the handler never ran, so the fallback that removes a blocked script tag never
   fired either. The handler is now a function, which means it lives in its own client
   component (`components/layout/AnalyticsScript.jsx`): `layout.js` is a server component, and
   putting the function there fails the static prerender with `Event handlers cannot be passed
   to Client Component props`. Verified rather than asserted — smoke 15 is negative-controlled
   on a React Aria label warning, which is a thing 19 actually says.

---

## Phases

| Phase | Deliverable | Revert point |
|---|---|---|
| **P0** ✅ | Baseline, invariant checklist, file→phase inventory, sync SHA. **One gap, recorded not hidden:** the CLS baseline was never captured, so there is nothing to compare against. | ✔ |
| **P1** ✅ | Foundations, ships nothing: `createStore` (15 tests) + `src/components/primitives/*` (23 tests) | ✔ |
| **P2** ✅ | **Mechanical decomposition, zero behavior change:** `page.js` → `ChatApp` + thin shell; `ChatLayout` → `SidebarContent` / `Header`. 17 characterization tests added. | ✔ |
| **P3** ✅ | Settings: `src/stores/settings.js` + dialog decomposed into `src/components/settings/*`; `hooks/use-settings.js` deleted (single-writer rule begins). 12 store tests + 4 switch tests. | ✔ |
| **P4** ✅ | Models: `src/stores/models.js` + `hooks/use-models.js` **deleted**; `ModelPicker` on the Aria `Menu` (one markup path, provider groups, typeahead); `ContextUsage` resolves its own window. `groupedModels`/`contextWindowMap` leave the ChatApp→ChatLayout→Header chain. +35 tests. | ✔ |
| **P5** ✅ | Conversations: `src/stores/conversations.js` + `hooks/use-conversations.js` **deleted**; `SidebarContent` off `ui/scroll-area`; `db.js` caches one connection with seeded-record migration tests. **Import/export removed rather than rewritten** (−814 lines, −29 tests). +27 / −43 tests → **468 / 34 files**. | ✔ |
| **P6** ✅ | Turn: `src/stores/turn.js` + `hooks/use-chat-stream.js` → **`hooks/use-chat-turn.js`** (`useChatStream` **deleted**); `lib/sse-parser.js` extracted so the parser test stops testing a copy of itself; `api-client.js` de-nested with the `doStream`↔`doFallback` recursion removed; rAF-coalesced deltas. 5 conversation props dropped from the hook, `setContextUsage` dropped from its return. 468 → **488 tests / 36 files**. | ✔ |
| **P7** ✅ | Thread: `useThreadScroll` + plain `overflow-y-auto` container; **`ui/scroll-area.jsx` deleted** (its only consumer); `MessageList` 16 props → 2 (turn + settings stores); one `Markdown` + one `useMessageText` replacing three copies; `ResponseMetrics` deduped and NaN-guarded; `aria-expanded` on four disclosures. 488 → **501 tests / 37 files**. | ✔ |
| **P8** ✅ | Composer + ArtifactPanel: **framer-motion deleted** (app's only use) behind a project-owned opacity-fade token; panel reuses `Markdown`; artifact read/parse failures no longer hang; both drag handles on pointer events with capture and unconditional release; `aria-label` on the composer's icon buttons. 501 → **518 tests / 38 files**. Anti-jank 3 (app code), 4 (images) and 6 done; **item 5 deferred with reasons**. | ✔ |
| **P9** ✅ | Delete legacy. `button`, `input`, `label`, `select`, `dialog`, `sheet` on Aria; six orphaned `ui/` files deleted; `shadcn` CLI + `components.json` gone; `framer-motion` and `tw-animate-css` dropped. `ui/tooltip.jsx` + `radix-ui` are the **only** holdouts left, and they are not blocked — see the P9 finding: the Aria tooltip works, my earlier probe used the wrong composition. | ✔ |
| **P10** ✅ | Verify. `AGENTS.md` rewritten (it documented six `api-client` exports that do not exist, an AI SDK major two behind, and a deleted `components.json`); storage-key / IndexedDB-schema / credential-URL contracts pinned; the import/export orphan deleted; the inert motion system found and fixed; **the last Radix file and the `radix-ui` dependency removed**; **all 30 invariants closed**; **anti-jank 5 done**; **title generation fixed**. 520 → **562 tests / 41 files**, deps 25 → 20. Smoke 10 → **17**. Three real bugs fell out of writing the tests — see the P10 findings. **The one thing not recoverable is the CLS *baseline***: never captured at P0, so the check asserts the published 0.1 threshold rather than a diff. Current value **0.0002**. | ✔ |

**Single-writer rule:** an old hook is deleted in the same commit that lands its store. They never coexist. Legacy components that still need the data read it through a one-way adapter, enumerated here and deleted in P9.

**Adapters in use (delete in P9):** _none yet._

---

## Invariants — bugs that were fixed once and must not come back

Mined from `git log`. Every row must have a test or an explicit acceptance check before the rewrite can claim parity. Checked = covered by a test that runs in CI.

### Streaming & turns

- [x] Stream renders **only** for the conversation that initiated it — never for the one you switched to. (`8aa44a6`) — `use-chat-turn` "scopes the stream to its conversation and clears it on reset"; `MessageList` "hides the stream, its text, and its placeholder when they belong to another conversation"
- [x] No stale streaming tail after the assistant message persists, or after an error. (`8aa44a6`) — `MessageList` "does not render a stale streaming tail once the turn is persisted" / "...beside an error card"; turn store "cancels the pending frame when the turn is cleared"
- [x] SSE fallback does **not** duplicate the response: the one whole-answer replay clears the partial accumulators on its first chunk, not before — and a continuation never clears at all, it appends to what it already sent. (`74b8ad3`, finding 17) — `use-chat-turn` "does not duplicate the response when a dropped stream continues" / "appends the continuation to the partial when the stream is cut"; `api-client` "continues from the partial after a mid-stream reset, with no replay clear"
- [x] A clean EOF that delivered nothing replays **exactly once**; server-side tool results and error frames count as delivered and are never replayed over — a tool-result cut continues (the client never re-runs the tool), an error frame completes as already surfaced. (`74b8ad3`, `a957c70`, finding 17) — `api-client` "retries with a fresh streamed request when nothing was delivered" / "does not retry a stream that delivered thinking" / "does not retry after a server error event that arrived without [DONE]" / "continues after a tool result that arrived without [DONE]"
- [x] A clean EOF after delivered content **without the server's `[DONE]` marker is a truncation, not a completion**, and continues under leg budgets — never completes silently, never regenerates the answer; an EOF after the marker completes. A failed turn commits the partial text it had alongside the error, never `content: ""`, and a silent connection past 15s is cancelled into that same path. — findings 15 + 17: `sse-parser` `SSE_DONE` tests, `api-client` truncation / precedence / stall / visibility / continuation tests, `use-chat-turn` partial-preservation tests, `MessageList` partial-plus-card test, smoke 21
- [x] The one replay is **streamed** and judged on its own evidence; a cut that delivered text is **continued** instead (bounded legs, seam trim, empty-continued-again) — both endings commit an error with the partial, never `onComplete` for a truncated answer, never a regeneration loop — and a proxy's non-JSON error body surfaces as an HTTP error, not a JSON parse crash. — findings 16 + 17: `api-client` "uses the sanitized messages for the streamed retry too" / "retries with a fresh streamed request when nothing was delivered" / "keeps continuing a repeatedly cut stream only up to the leg budget" / "continues an empty leg again, then reports no response" / "surfaces a plain-text proxy error instead of a JSON parse crash", `use-chat-turn` "stores an error placeholder when the response is empty", smoke 22
- [x] The response is not truncated and prior conversation context is not lost across turns. (`970d4da`) — truncation: `use-chat-turn` "commits the final deltas even if a chunk has not re-rendered". Across turns: "sends the whole conversation, not just the newest message" asserts the second request's `messages` are `["first question", "ok", "and then?"]`
- [x] `messagesRef` is cleared when switching or creating a conversation. (`0abc78b`) — conversations store "assigns messagesRef synchronously on creation" / "selects a conversation and syncs its messages"
- [x] Errors surface to the user — no silent swallow leaving a permanent "Running" state. (`dd0cc99`) — `use-chat-turn` "surfaces a server error event as an error message" / "stores an error placeholder when the response is empty"; `send()`'s `catch`/`finally` clears `isLoading`
- [x] Stream errors are shown and reasoning/thinking survives into the next turn. (`6afb9c9`, `57ec86f`) — errors shown; thinking-only turn commits; `use-chat-turn` "carries a turn's reasoning into the next request" asserts `thinking` survives both the commit and the next request body
- [x] `streamChatCompletion` is awaited by every caller. (`a957c70`) — `source-contracts.test.js` "finds no floating call" walks every source file and reports `file:line`. Negative-controlled by deleting an `await`: it fails and names `src/hooks/use-chat-turn.js:466`
- [x] Scrolling stays possible **while** streaming. (`fa45ae0`) — `useThreadScroll` "stops following once the user scrolls away from the bottom" / "keeps following for a movement that stays within the threshold" / "hands scrolling back when a turn ends"; the container is also focusable and labelled
- [x] Error placeholders are stripped from history sent to the model. (`be48b7f`) — `api-client` "strips error placeholders and empty assistant records from the POSTed messages"

### Context usage & cost

- [x] Context usage restores on load, attributes to the **initiating** conversation, and fills incrementally while streaming. (`5ca90d2`) — `use-chat-turn` "attributes usage to the conversation that started the request"; "restores context usage for the conversation it is reset to"; turn store "coalesces a burst of deltas into a single frame notification" (publishes the predicted total)
- [x] Resets on new chat; stale values don't leak on conversation switch. (`dc4c323`) — turn store `beginTurn` asserts `contextUsage: 0`; `resetForConversation(null)` clears it
- [x] Total chat cost appears in the context tooltip. (`5c0818c`) — `ContextUsage` "shows the cost only when there is one"
- [x] Ring turns yellow at 75%, red at 90%. — `ContextUsage` "turns the ring amber at 75% and red at 90%"

### Features & gating

- [x] Artifacts are parsed and the **message body** follows the toggle; the **panel** follows the conversation. (`f3f3e4d`, P10 finding 10) — The body half: `MessageList` "renders an assistant message containing HTML artifacts" / "does not strip HTML fences when artifacts are disabled" / "shows the generating artifact state only when artifacts are enabled" / "renders streaming content with HTML fences as plain text when artifacts are disabled". The panel half changed on request: a chat that already owns an artifact opens it even with the toggle off, because switching artifacts off for the next chat used to blank it when you came back (`ArtifactPanelVisibility` "keeps the panel available after artifacts are switched off"). What the panel never does is spend a track on nothing (`ArtifactPanelVisibility` "closes when dismissed, and does not reopen behind the user" / "leaves the track collapsed when a new chat has nothing to show" / "does not reserve the track for a conversation with nothing to show") — all five negative-controlled, and they pin `matchMedia` to a desktop viewport because jsdom otherwise reports a 0px track in every case
- [x] Sandbox commands render only in the Cloud sandbox side panel — never as inline thread blocks — and the one panel track is never paid for nothing. (`9335806`, P10 finding 12) — `SandboxTerminal` "hides stdout when the setting is off" / "hides stderr too, so a failing command cannot leak through" / "hides the command without hiding its output" (the two display settings stay independent); `ArtifactPanel` "shows the terminal instead of the preview when its tab is active" / "offers both tabs only when the conversation has both" / "falls back rather than rendering a panel with nothing to show"; `ArtifactPanelVisibility` "opens the terminal for a conversation that ran commands" / "opens the terminal for a run happening right now" / "ignores a run that belongs to another conversation" / "reopens for the next turn's first run after being dismissed" / "brings its own side of the panel when a run starts" / "spends one track on a conversation that has both sides"; smoke 18 in a real browser. All negative-controlled (gate, conversation gate, reopen, tab switch, tabs, fallback, both settings gates, status rendering, smoke gate)
- [x] A dismissed side panel can always be opened again from the Header. (`16e8301`, P10 finding 13) — The closed panel's own grid track is zero pixels wide at the viewport's right edge, so the old in-track toggle was laid out off-screen: present for `queryByLabelText`, hittable by nothing. The reopen lives in the Header now, gated on `panelAvailable && !panelOpen`; both dismiss tests click it back open and smoke 19 measures the geometry (rect inside the viewport, `elementFromPoint` hitting it) — negative-controlled four ways (open-state assertion, dead-button-on-fresh-chat, inert handler, gate that never renders)
- [x] Tool calls render as chips **inside** the thinking block at the exact offset they arrived, and sandbox commands never chip. (`b2950f5`, P10 finding 14) — `turn store` "pins a chip to the thinking buffer, not the rendered mirror" / "lets argument fragments for an index with no chip land nowhere" / "fills search chips in call order, keeping only real sites"; `use-chat-turn` "commits a calculator chip pinned where the reasoning was interrupted" / "fills a search chip with domains once the results arrive" / "never chips a sandbox tool — its commands belong to the side panel"; `ThinkingBlock` split/sort/clamp/key tests plus the interleaved DOM order; `MessageList` "hides live chips that belong to another conversation" / "shows a chips-only stream without a second thinking placeholder" / "keeps a message whose only content is a chip renderable" (both gates — predicate and row); smoke 20 expands the block in a real browser and measures pill order and `https://` links. Negative-controlled eight ways (mirror `at`, fill-last, unfiltered sandbox chips, dropped persistence, dropped sort, placeholder gate, conversation gate, each render gate) plus the reversed-segments smoke break (22/23, check 20 red)
- [x] Web search + artifacts can be enabled **at the same time**. (`a2e4c60`) — `ChatApp` "keeps both on when both are switched on", and "sends both capabilities to the model for one request" asserts one POST carries `artifacts: true` **and** `web_search` in `tools`. The settings half alone would have passed while the request still dropped one
- [x] Web search, agent mode and calculator are disabled for models without tool support. (`396a4f3`) — `ChatApp` "turns web search and agent mode off when the model cannot call tools" (and off in storage, so it does not return on reload) / "disables the toggles in the header…" (native `disabled`, tooltip explains why). Driven by the **catalog**, not a store write: `loadModels()` on mount overwrites a seeded store, which is how the first version of this test passed against a live, enabled button
- [x] ~~Import/export buttons live in Settings only, not the sidebar.~~ — **moot: feature deleted in P5**
- [x] ~~LibreAssistant exports import; incompatible settings are skipped rather than crashing.~~ — **moot: feature deleted in P5.** The two `lib/settings.js` functions it left behind had no production consumer and were removed in P10, along with the five tests that were the only things referencing them.
- [x] Balance outage dialog offers the `openrouter/free` fallback. (`1f001b3`, `8e4489b`) — `ChatApp` "offers the free fallback and switches to it on request" (asserts the store's `selectedModel` afterwards) / "stays shut when the balance is fine"

### Persistence & hydration

- [x] localStorage keys unchanged — users keep their settings. — `contracts.test.js` pins all 14 `storageKey` strings literally `hack_club_ai_key`, `e2b_api_key`, `color-mode`, `show_sandbox_code`, `show_sandbox_output`, `show_thinking`, `show_metrics`, `thinking_enabled`, `agent_mode_enabled`, `theme`, `model`, …
- [x] IDB store name, key path and record shape unchanged — existing conversations load. — `contracts.test.js` asserts the store name and `keyPath: "id"` against a real opened database Migration test seeds pre-existing records.
- [x] Values read from localStorage hydrate in a mount effect, never during render (hydration mismatch). (AGENTS.md, `hasE2bKey` bug) — `settings.test.js` "starts at SSR-safe defaults before hydration" / "does not read storage during render"; `hydration.test.jsx` spies on `Storage.getItem` across a `renderToString` and asserts **zero** reads while rendering, names the offending key, and asserts hydration still arrives afterwards. **It found a live bug**: `ChatLayout` read the sidebar width in a `useState` initialiser, so a resized sidebar jumped on every load. Reading diffs instead of spying is what found it; diffing the HTML looked equivalent and could not have

### Security & sandbox

- [x] Sandbox file downloads use the two-step token flow — the E2B key never appears in a URL. — `contracts.test.js` asserts the key is in the POST body and absent from the navigating URL (`28787a7`)
- [x] Sandbox tool output stays gated behind the show-input / show-output settings. — `MessageList` "sandbox output gating": committed stdout shown/hidden, stderr hidden too, the code setting unaffected (they are independent), and the live stream gated the same way. Negative-controlled by forcing the gate on: all three hide-assertions fail. Writing them also **fixed a real defect** — the streaming row rendered only for text or thinking, so a turn that ran code before the model spoke showed an empty thread

### Layout & responsiveness

- [x] No horizontal overflow on mobile; `min-w-0` on flex wrappers. (`10130e7`, `47f19f8`) — smoke 5b measures `documentElement.scrollWidth` at a 360×640 viewport and names the three widest offenders when it fails; smoke 13 re-checks it at 390px with the artifact panel open
- [x] CLS measured; target ≈ 0. — smoke 12 measures it with a buffered `layout-shift` observer on the most shift-prone moment there is (a conversation restored from IndexedDB). **Current value 0.0002.** The *comparison* to the P0 baseline is unrecoverable — that number was never captured — so the check asserts the published 0.1 threshold instead of pretending to a diff it cannot make

### Build

- [x] ~~mermaid loads lazily from CDN~~ **corrected, not claimed.** — The CDN loading was reverted upstream by `0c98634` (the AI SDK v7 migration); `src/lib/streamdown.js` is a plain static import again. What survives from `abf3309`/`cbcf214` is the part that actually prevents the OOM, and that is now asserted: `source-contracts.test.js` requires `--max-old-space-size` in the build script, `--webpack` in both build and dev, and the mermaid plugin constructed once at module scope rather than per render. `next build` completes in ~108s
- [x] `page.js` still exports the component `search/page.js` renders with `initialQuery` / `initialSearchEnabled`. — `source-contracts.test.js` asserts both props are accepted **and forwarded to `ChatApp`** (destructuring and dropping them renders a normal home page from `/search`, with no error anywhere), and that `/search` imports that component and plumbs `q` and `search`

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
| 3 | Opacity-only transitions; no `animate-in` slide/zoom, no framer-motion | **P9 ✅** — `tw-animate-css` gone; every entrance is an opacity-only `hcai-fade-*` keyframe. **The utilities were inert until P10b** — see the `@theme inline` finding. |
| 4 | Reserve space before content arrives (image aspect-ratio, code-block min-height) | **P8 ✅ (images)** / P9 (code blocks) |
| 5 | Panel width as one `grid-template-columns` transition, not stepwise reflow | **P10 ✅** — `ChatLayout` owns the width and spends it as the third track; the panel no longer sets an inline width. Verified in a real browser at three widths, which was the stated reason for deferring it. |
| 6 | `setPointerCapture` on all drag handles, clamped and persisted | **P8 ✅** |

**Item 4, precisely:** image attachments already reserved their box through
next/image's `width`/`height` attributes plus a `loaded` placeholder, so that
half needed nothing. Code blocks are Streamdown's output and are still not
reserved — left for P10, and recorded as an open item rather than claimed.

**Item 5, done (P10).** Deferred twice for one reason: neither the unit tests nor the
smoke script could see it, so a three-state layout refactor (desktop track,
mobile fixed, fullscreen overlay) had no way to prove itself. The way out was to
build the missing verification rather than keep citing its absence.

`ChatLayout` owns the row, so it owns the panel width, and spends it as a third
`grid-template-columns` track. The panel lost its inline width — writing one
fought the track and re-laid the thread out a pixel at a time. `rightPanel`
became a function, because the row has to hand the width down and the panel is
built in `ChatApp`. All three states are covered in the unit tests, and smoke 13
covers them for real: it seeds a conversation containing an artifact (the panel
does not exist without one), then checks that a real CDP drag moves the track
480 → 720 with `panelLeft === threadRight` and no overflow, and that at 390px the
panel reports `position: fixed` at `left: 0, right: 390` with a zero track.

The `panelWidth` tests moved to `ChatLayout`, because that is where the state is
now. What stayed in `ArtifactPanel` are prop-contract tests: the panel *reports*
a width and the row *decides* what to do with it.

Baseline CLS/scroll-jank measurement: **the baseline half is unrecoverable.** It was
never captured at P0, so there is nothing to compare against and no honest way to
manufacture one after the fact. What is measured is the current value, on the
shift-prone moment (a conversation restored from IndexedDB): **CLS 0.0002**,
horizontal overflow 0px at both 360px and 390px with the artifact panel open.
Smoke 12 asserts the published 0.1 "good" threshold, and says so in the check name
rather than implying a comparison it does not make.
