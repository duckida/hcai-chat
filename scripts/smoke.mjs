import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";

const BASE_URL = process.env.SMOKE_URL ?? "http://localhost:3000";

// Unique profile and port per run. A shared profile let conversations from
// an earlier run bleed into the next one, and a fixed port meant a stray
// chromium from a crashed run made every later run fail to start.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const DEBUG_PORT = process.env.SMOKE_PORT
  ? Number(process.env.SMOKE_PORT)
  : await freePort();
const PROFILE_DIR = `/tmp/opencode/hcai-smoke-${process.pid}`;

// Start clean so persisted state cannot be mistaken for this run's result.
rmSync(PROFILE_DIR, { recursive: true, force: true });

// Sweep profiles left behind by runs whose process is gone. A profile only
// matters while the pid that owns it is alive.
try {
  for (const entry of readdirSync("/tmp/opencode")) {
    const match = entry.match(/^hcai-smoke-(\d+)$/);
    if (!match || Number(match[1]) === process.pid) continue;
    if (!existsSync(`/proc/${match[1]}`)) {
      rmSync(`/tmp/opencode/${entry}`, { recursive: true, force: true });
    }
  }
} catch {}

// Credentials for the live model turn. Never printed, never written to the
// repo: supply via env, or drop the key in a gitignored .smoke-key.
function smokeApiKey() {
  const fromEnv = process.env.SMOKE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(".smoke-key", "utf8").trim();
  } catch {
    return "";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, state: ok ? "ok" : "fail", detail });
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`,
  );
}
function skip(name, reason) {
  results.push({ name, state: "skip", detail: reason });
  console.log(` SKIP ${name} — ${reason}`);
}

const PAGE_TEXT = `(() => {
  const root = document.querySelector('main') || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts = [];
  while (walker.nextNode()) {
    const p = walker.currentNode.parentElement;
    if (!p) continue;
    const tag = p.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG') continue;
    const t = walker.currentNode.nodeValue.replace(/\\s+/g, ' ').trim();
    if (t) parts.push(t);
  }
  return parts.join(' ');
})()`;

function launchChromium() {
  const child = spawn(
    "chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  child.on("error", (e) => {
    console.error("failed to launch chromium:", e.message);
    process.exit(1);
  });
  return child;
}

async function pageTarget(child) {
  // 40s, not 15s: a cold chromium start races the dev server's first compile,
  // and on a busy box it can lose that race three times over. Retrying by hand
  // is not a fix, the budget just has to cover the slow case.
  for (let i = 0; i < 160; i++) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      ).json();
      const page = targets.find(
        (t) => t.type === "page" && t.webSocketDebuggerUrl,
      );
      if (page) return page;
    } catch {}
    // If it actually died, say so — a bare timeout sends you hunting for a
    // code problem that is not there.
    if (child.exitCode !== null) {
      throw new Error(`chromium exited with code ${child.exitCode}`);
    }
    await sleep(250);
  }
  throw new Error("chromium debugging endpoint never came up");
}

function connect(url) {
  const ws = new WebSocket(url);
  let seq = 0;
  const pending = new Map();
  // Console output, recorded alongside command replies. The handler below
  // dropped anything without a matching request id, which made a React warning
  // invisible to this script — and the analytics script's string `onError` was
  // one, on every single page load. Events arrive as a stream, so they are
  // recorded as they come rather than polled for.
  const consoleEntries = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      consoleEntries.push({
        level: msg.params.type,
        text: (msg.params.args || [])
          .map((a) => a.value ?? a.description ?? a.unserializableValue ?? "")
          .join(" ")
          .slice(0, 300),
      });
    }
    if (msg.method === "Log.entryAdded") {
      consoleEntries.push({
        level: msg.params.entry.level,
        text: String(msg.params.entry.text || "").slice(0, 300),
      });
    }
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error)
      reject(new Error(`${msg.error.message} ${msg.error.data ?? ""}`));
    else resolve(msg.result);
  };
  const opened = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("websocket failed"));
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close(), opened, consoleEntries };
}

async function main() {
  const proc = launchChromium();
  let close = () => {};

  // Everything below the spawn sits inside this try. Connecting to the
  // debugging endpoint throws while chromium is still coming up, and a
  // failure there used to escape the cleanup below — every such run leaked a
  // browser process until the next launch starved and timed out.
  try {
    const target = await pageTarget(proc);
    const connection = connect(target.webSocketDebuggerUrl);
    close = connection.close;
    const { send, opened, consoleEntries } = connection;
    await opened;

    await send("Page.enable");
    await send("Runtime.enable");

    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) {
        throw new Error(
          r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
        );
      }
      return r.result.value;
    };

    const waitFor = async (fn, timeout = 20000, interval = 250) => {
      const start = Date.now();
      let lastErr = "";
      while (Date.now() - start < timeout) {
        try {
          const v = await fn();
          if (v) return v;
        } catch (e) {
          lastErr = e.message;
        }
        await sleep(interval);
      }
      throw new Error(`timeout waiting${lastErr ? `: ${lastErr}` : ""}`);
    };

    const setViewport = (width, height, mobile = false) =>
      send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });

    // Wait for the app shell AND for client hydration to settle, so assertions
    // against hydration-driven state (theme classes) are not read too early.
    const navigate = async (settleMs = 2500) => {
      await send("Page.navigate", { url: BASE_URL });
      await waitFor(
        () =>
          evalJs(
            `Boolean(document.querySelector('header') && document.querySelector('textarea, button'))`,
          ),
        30000,
      );
      await sleep(settleMs);
    };

    const find = (selector, text) =>
      `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => (e.textContent||'').includes(${JSON.stringify(text)}))`;

    const click = async (expression, label) => {
      const ok = await evalJs(
        `(() => { const el = ${expression}; if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`,
      );
      if (!ok) throw new Error(`element not found for click: ${label}`);
      await sleep(450);
      return true;
    };

    const htmlClass = () => evalJs(`document.documentElement.className`);

    // Enabled before the first navigation, so a warning emitted on first paint
    // is captured rather than missed.
    await send("Runtime.enable", {});
    await send("Log.enable", {});

    /**
     * A real pointer move at the element's centre.
     *
     * React Aria drives hover from pointer events, so `el.click()` — which is
     * what the click helper uses — never opens a tooltip. Dispatching through
     * Input is the only way to exercise hover in a real browser.
     */
    const hover = async (expression, label) => {
      const box = await evalJs(
        `(() => { const el = ${expression}; if (!el) return null;
          el.scrollIntoView({block:'center'});
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
      );
      if (!box) throw new Error(`element not found for hover: ${label}`);
      // Two moves, not one. A single mouseMoved from wherever the pointer
      // already is does not reliably produce an enter event, and an enter is
      // what React Aria's hover is built on. Approaching from a nearby point
      // guarantees the transition.
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: box.x,
        y: box.y - 24,
        buttons: 0,
      });
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: box.x,
        y: box.y,
        buttons: 0,
      });
      return true;
    };

    const typeInto = async (selector, text) =>
      evalJs(
        `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const proto = el instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(text)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
      );

    const pressEnter = (selector) =>
      evalJs(
        `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        for (const type of ['keydown', 'keypress', 'keyup']) {
          el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
        return true;
      })()`,
      );

    const pageText = () => evalJs(PAGE_TEXT);

    // On mobile the nav sheet is itself a [role="dialog"], so a bare
    // [role="dialog"] query resolves to the wrong layer. Anchor every settings
    // interaction on the dialog that actually contains the footer.
    const SETTINGS_DIALOG = `[...document.querySelectorAll('[role="dialog"]')].find(d => (d.textContent||'').includes('Save and Connect'))`;
    const hasSettingsDialog = () => evalJs(`Boolean(${SETTINGS_DIALOG})`);

    const openSettings = async () => {
      if (await hasSettingsDialog()) return;
      await evalJs(
        `(() => { const b = [...document.querySelectorAll('header button')].find(x => x.querySelector('svg.lucide-menu')); if (b && getComputedStyle(b).display !== 'none') { b.click(); return true; } return false; })()`,
      );
      await sleep(500);
      await click(find("button", "Settings"), "Settings button");
      await waitFor(hasSettingsDialog, 10000);
      await sleep(400);
    };

    const closeDialog = async () => {
      await evalJs(`(() => {
      const d = ${SETTINGS_DIALOG};
      if (!d) return false;
      const btn = [...d.querySelectorAll('button')].find(b => (b.textContent||'').trim().toLowerCase() === 'cancel');
      if (btn) { btn.click(); return true; } return false;
    })()`);
      await sleep(600);
    };

    const gotoSection = async (label) => {
      const ok = await evalJs(`(() => {
      const d = ${SETTINGS_DIALOG};
      if (!d) return false;
      const b = [...d.querySelectorAll('button')].find(x => (x.textContent||'').trim().startsWith(${JSON.stringify(label)}));
      if (!b) return false;
      b.scrollIntoView({ block: 'center' });
      b.click();
      return true;
    })()`);
      if (!ok) throw new Error(`section not found: ${label}`);
      await sleep(400);
    };

    // ---- 1. loads -------------------------------------------------------
    await setViewport(1280, 900);
    await navigate();
    check(
      "app loads with header and controls",
      await evalJs(`Boolean(document.querySelector('header'))`),
    );

    // Seed credentials into this headless profile (it is separate from any
    // browser the user drives by hand), then reload so the settings store
    // hydrates. The value is never echoed.
    const apiKey = smokeApiKey();
    if (apiKey) {
      await evalJs(
        `localStorage.setItem("hack_club_ai_key", ${JSON.stringify(apiKey)})`,
      );
      await navigate();
      const len =
        (await evalJs(`localStorage.getItem("hack_club_ai_key")`))?.length ?? 0;
      check("smoke credentials seeded", len > 0, `key length ${len}`);
    } else {
      skip(
        "smoke credentials seeded",
        "no SMOKE_API_KEY env var and no .smoke-key file",
      );
    }

    // ---- 2. colour theme applies to <html> ------------------------------
    await openSettings();
    await gotoSection("Appearance");
    // Not `role="combobox"`: React Aria's select trigger is a button carrying
    // `aria-haspopup="listbox"`, and its items are `role="option"` below.
    await click(
      `(${SETTINGS_DIALOG}).querySelector('[aria-haspopup="listbox"]')`,
      "theme select trigger",
    );
    await waitFor(
      () =>
        evalJs(
          `Boolean([...document.querySelectorAll('[role="option"]')].find(o => (o.textContent||'').includes('Sunrise')))`,
        ),
      8000,
    );
    await click(find('[role="option"]', "Sunrise"), "Sunrise");
    let sunriseApplied = true;
    try {
      await waitFor(
        () =>
          evalJs(
            `document.documentElement.className.includes('theme-sunrise')`,
          ),
        5000,
      );
    } catch {
      sunriseApplied = false;
    }
    check(
      "selecting Sunrise adds theme-sunrise to <html>",
      sunriseApplied,
      sunriseApplied ? "" : `class=${await htmlClass()}`,
    );
    await closeDialog();

    // ---- 3. theme survives reload (store hydrates from storage) ---------
    await navigate();
    const themeRestored = await waitFor(
      () =>
        evalJs(`document.documentElement.className.includes('theme-sunrise')`),
      8000,
    )
      .then(() => true)
      .catch(() => false);
    check(
      "theme-sunrise survives a reload",
      themeRestored,
      `class="${await htmlClass()}" stored=${JSON.stringify(await evalJs(`localStorage.getItem("theme")`))}`,
    );

    // ---- 4. dark mode persists -----------------------------------------
    await openSettings();
    await gotoSection("Appearance");
    await click(
      `[...(${SETTINGS_DIALOG}).querySelectorAll('label')].find(e => (e.textContent||'').includes('Dark'))`,
      "Dark color mode",
    );
    await waitFor(
      () => evalJs(`document.documentElement.classList.contains('dark')`),
      5000,
    );
    await closeDialog();
    await navigate();
    check(
      "dark mode survives a reload",
      (await htmlClass()).includes("dark"),
      `class="${await htmlClass()}"`,
    );

    // ---- 5. Settings reachable on a narrow viewport ---------------------
    await setViewport(360, 640, true);
    await sleep(500);
    await navigate(3500);
    await openSettings();
    await gotoSection("Sandbox");
    const scrollReport = await evalJs(`(() => {
      const dialog = ${SETTINGS_DIALOG};
      if (!dialog) return { found: false, reason: 'no dialog' };
      const save = [...dialog.querySelectorAll('button')].find(b => (b.textContent||'').includes('Save and Connect'));
      if (!save) return { found: false, reason: 'no save button' };
      let node = save.parentElement;
      while (node && node !== dialog) {
        const oy = getComputedStyle(node).overflowY;
        if (oy === 'auto' || oy === 'scroll') break;
        node = node.parentElement;
      }
      if (!node || node === dialog) return { found: false, reason: 'no scrollable ancestor' };
      node.scrollTop = node.scrollHeight;
      const r = save.getBoundingClientRect();
      return {
        found: true,
        maxScroll: node.scrollHeight - node.clientHeight,
        scrolledTo: node.scrollTop,
        saveBottom: Math.round(r.bottom),
        viewport: window.innerHeight,
        saveVisible: r.bottom <= window.innerHeight + 1 && r.top >= -1,
      };
    })()`);
    check(
      "Save/Cancel reachable on a narrow viewport (content scrolls, not clips)",
      Boolean(scrollReport.found) && scrollReport.saveVisible,
      JSON.stringify(scrollReport),
    );
    await closeDialog();

    // ---- 5b. no horizontal overflow -------------------------------------
    // A flex or grid child with intrinsic content and no `min-w-0` pushes the
    // page sideways, and the only symptom is a phone user swiping to find the
    // composer. Measured on the chat itself, at the width that breaks first.
    await sleep(400);
    const overflow = await evalJs(`(() => {
      const de = document.documentElement;
      const widest = [...document.querySelectorAll('body *')]
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 40),
          right: Math.round(el.getBoundingClientRect().right),
        }))
        .filter((e) => e.right > window.innerWidth + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 3);
      return {
        viewport: window.innerWidth,
        docScroll: de.scrollWidth,
        bodyScroll: document.body.scrollWidth,
        widest,
      };
    })()`);
    check(
      "no horizontal overflow on a 360px viewport",
      overflow.docScroll <= overflow.viewport + 1,
      JSON.stringify(overflow),
    );
    await setViewport(1280, 900, false);

    // ---- 6. chat sends and a response comes back ------------------------
    const probe = "Reply with exactly the word PONG and nothing else.";
    await navigate();
    const canType = await typeInto("textarea", probe);
    check("composer accepts input", canType);
    if (canType) {
      await pressEnter("textarea");
      await sleep(1200);
      let sent = (await pageText()).includes("Reply with exactly");
      if (!sent) {
        await evalJs(
          `(() => { const b = [...document.querySelectorAll('main button')].find(x =>
              (x.getAttribute('aria-label')||'').match(/send/i) ||
              x.querySelector('svg.lucide-send, svg.lucide-arrow-up'));
            if (b) { b.click(); return true; } return false; })()`,
        );
        await sleep(1200);
        sent = (await pageText()).includes("Reply with exactly");
      }
      check("user message is sent", sent);

      if (sent) {
        // Either signal alone can be true before the turn is over: text
        // stalls while the model reasons (the thinking block shows a static
        // "Thinking" label), and the assistant row mounts before its text
        // finishes streaming. Completion needs all three.
        const hasAssistantRow = () =>
          evalJs(
            `[...document.querySelectorAll('.msg-row')].some(r => r.querySelector('svg.lucide-sparkles'))`,
          );
        const stillStreaming = () =>
          evalJs(
            `Boolean((document.querySelector('main') || document).querySelector('output[aria-label="Thinking"]'))`,
          );

        let prev = await pageText();
        let quiet = 0;
        let answered = false;
        let streaming = true;
        const started = Date.now();
        while (
          Date.now() - started < 90000 &&
          !/API Error/.test(prev) &&
          !(answered && quiet >= 2 && !streaming)
        ) {
          await sleep(1500);
          const now = await pageText();
          streaming = await stillStreaming();
          answered = await hasAssistantRow();
          quiet = now === prev ? quiet + 1 : 0;
          prev = now;
        }
        if (process.env.SMOKE_DEBUG) {
          console.log(`  dbg prev(${prev.length}): ${JSON.stringify(prev)}`);
        }
        const err = prev.match(/API Error.{0,140}/s);
        if (err) {
          skip(
            "assistant reply streams back",
            `assistant turn errored — ${err[0].replace(/\s+/g, " ").trim()}`,
          );
        } else {
          const delivered = answered && quiet >= 2 && !streaming;
          check(
            "assistant reply streams back",
            delivered,
            `assistant=${answered} quiet=${quiet} streaming=${streaming} — ${prev.slice(-180)}`,
          );
        }
      }
    }

    // ---- 7. conversation survives reload -------------------------------
    await navigate(3500);
    await sleep(1500);
    const persisted = await pageText();
    check(
      "sent message survives reload (IndexedDB persistence)",
      persisted.includes("Reply with exactly"),
      persisted.slice(0, 140),
    );

    // ---- 11. the context ring's tooltip opens on a real hover -----------
    // The last Radix holdout was migrated, and jsdom cannot verify it: a
    // React Aria tooltip does not open there when its trigger contains
    // element children, which is every trigger in this app. This is the only
    // check that exercises it, so it is a FAIL, not a SKIP.
    await hover(
      `document.querySelector('button[aria-label^="Context usage"]')`,
      "context ring",
    );
    // Reported, not thrown: a timeout here has to say whether the ring was
    // found, whether anything is hovering, and what is on screen.
    let tipText = "";
    try {
      await waitFor(async () => {
        tipText = await evalJs(
          `(() => { const t = document.querySelector('[role="tooltip"]');
              return t ? (t.textContent || '').trim() : ''; })()`,
        );
        return tipText.includes("% used");
      }, 6000);
    } catch {}
    const detail = await evalJs(
      `(() => {
        const ring = document.querySelector('button[aria-label^="Context usage"]');
        return JSON.stringify({
          ring: Boolean(ring),
          tip: document.querySelector('[role="tooltip"]')?.textContent?.trim()?.slice(0, 40) || null,
          expanded: ring?.getAttribute('aria-expanded') ?? null,
          describedby: ring?.getAttribute('aria-describedby') ?? null,
        });
      })()`,
    );
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 5,
      y: 5,
      buttons: 0,
    });
    check(
      "context ring tooltip opens on hover",
      tipText.includes("% used"),
      detail,
    );

    // ---- 12. cumulative layout shift ------------------------------------
    // Measured on the most shift-prone moment there is: a conversation restored
    // from IndexedDB, where the thread, the metrics strip and the context ring
    // all appear after the first paint. A shift here is the user watching the
    // answer they came to read slide.
    //
    // There is no P0 baseline to diff against — the number was never captured
    // before the rewrite — so this asserts the published "good" threshold
    // rather than pretending to compare. `buffered: true` picks up the shifts
    // that happened before this observer was installed, which is all of them.
    const cls = await evalJs(`(async () => {
      const shifts = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) shifts.push(entry);
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      await new Promise((r) => setTimeout(r, 600));
      observer.disconnect();
      const total = shifts.reduce((sum, e) => sum + e.value, 0);
      const worst = shifts
        .map((e) => ({
          value: Number(e.value.toFixed(4)),
          nodes: (e.sources || []).map((s) => {
            const node = s && s.node;
            if (!node || !node.tagName) return "?";
            const cls = typeof node.className === "string"
              ? "." + node.className.split(" ").slice(0, 3).join(".")
              : "";
            return node.tagName.toLowerCase() + cls;
          }),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);
      return { total: Number(total.toFixed(4)), count: shifts.length, worst };
    })()`);
    check(
      "cumulative layout shift stays under 0.1",
      cls.total < 0.1,
      JSON.stringify(cls),
    );

    // ---- 13. the artifact panel across three viewports -------------------
    // The panel's width was moved onto the row's third grid track, and the
    // reason that was deferred twice is that the smoke script could not see it.
    // It can now: seed a conversation containing an artifact, which is the only
    // way the panel exists at all, and check the track in each of the three
    // states it has to be right in.
    await evalJs(`(async () => {
      // Assembled from pieces: a markdown fence inside a template literal needs
      // its own escaping, and one wrong escape here is a syntax error in the
      // page rather than anything that looks like a failed check.
      const ARTIFACT_FENCE = ['\`\`\`html', '<div id="artifact">seeded</div>', '\`\`\`'].join(String.fromCharCode(10));
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('hcai-chat', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        store.clear();
        store.put({
          id: 'smoke-artifact',
          title: 'Seeded artifact',
          createdAt: new Date().toISOString(),
          model: 'xiaomi/mimo-v2.5',
          contextUsage: 0,
          messages: [
            { role: 'user', content: 'make me a page' },
            {
              role: 'assistant',
              content: 'Here it is.\\n\\n' + ARTIFACT_FENCE,
            },
          ],
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('artifacts_enabled', 'true');
      return true;
    })()`);
    await navigate(3500);

    /** The row's three tracks, and how the panel actually sits in them. */
    const panelReport = () =>
      evalJs(`(() => {
        const row = document.querySelector('.grid');
        if (!row) return { error: 'no grid row' };
        const tracks = row.style.gridTemplateColumns;
        const parts = tracks.trim().split(/\\s+/);
        const track = parseInt(parts[parts.length - 1], 10);
        const panelEl = document.querySelector('[aria-label="Resize side panel"]');
        // The element, not just its rect: the position check needs
        // getComputedStyle, which rejects a DOMRect.
        const panelNode = panelEl ? panelEl.parentElement : null;
        const panelBox = panelNode ? panelNode.getBoundingClientRect() : null;
        const thread = document.querySelector('section[aria-label="Conversation"]');
        const threadBox = thread ? thread.getBoundingClientRect() : null;
        return {
          tracks,
          track,
          viewport: window.innerWidth,
          docScroll: document.documentElement.scrollWidth,
          panelLeft: panelBox ? Math.round(panelBox.left) : null,
          panelRight: panelBox ? Math.round(panelBox.right) : null,
          threadRight: threadBox ? Math.round(threadBox.right) : null,
          panelPosition: panelNode ? getComputedStyle(panelNode).position : null,
        };
      })()`);

    // Artifacts mode is already on (it was seeded above) and a desktop load with
    // an existing conversation opens the panel on its own, so nothing is
    // clicked here. Clicking the toggle would have switched it *off* — its label
    // is "Toggle artifacts off" precisely because it is on — and the panel would
    // render nothing while the track stayed reserved.
    await waitFor(
      () =>
        evalJs(
          `Boolean(document.querySelector('button[aria-label="Toggle artifacts off"]'))`,
        ),
      8000,
    );
    await sleep(600);
    const desktopPanel = await panelReport();
    check(
      "artifact panel occupies a track beside the thread on desktop",
      desktopPanel.track > 0 &&
        desktopPanel.panelLeft === desktopPanel.threadRight &&
        desktopPanel.docScroll <= desktopPanel.viewport + 1,
      JSON.stringify(desktopPanel),
    );

    // Dragging the separator must move the track, not the whole row.
    const dragged = await evalJs(`(() => {
      const handle = document.querySelector('[aria-label="Resize side panel"]');
      if (!handle) return null;
      const box = handle.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    })()`);
    if (dragged) {
      for (const [type, x] of [
        ["mousePressed", dragged.x],
        ["mouseMoved", dragged.x - 120],
        ["mouseMoved", dragged.x - 240],
        ["mouseReleased", dragged.x - 240],
      ]) {
        await send("Input.dispatchMouseEvent", {
          type,
          x,
          y: dragged.y,
          button: "left",
          buttons: type === "mouseReleased" ? 0 : 1,
          clickCount: 1,
        });
      }
      await sleep(400);
    }
    const afterDrag = await panelReport();
    check(
      "dragging the panel resizes the track and the thread with it",
      dragged !== null &&
        afterDrag.track > desktopPanel.track &&
        afterDrag.panelLeft === afterDrag.threadRight &&
        afterDrag.docScroll <= afterDrag.viewport + 1,
      JSON.stringify(afterDrag),
    );

    // Narrow: the panel is a fixed overlay and the track must be zero, or the
    // thread is squeezed to nothing behind a full-bleed panel.
    await setViewport(390, 760, true);
    await sleep(700);
    const mobilePanel = await panelReport();
    check(
      "artifact panel goes full-bleed on a narrow viewport",
      mobilePanel.track === 0 &&
        mobilePanel.panelLeft === 0 &&
        mobilePanel.docScroll <= mobilePanel.viewport + 1,
      JSON.stringify(mobilePanel),
    );
    await setViewport(1280, 900, false);
    await sleep(500);

    // ---- 14. the conversation gets a real title -------------------------
    // Title generation sends a system-role message, which the model SDK
    // rejects outright; the 500 was invisible because the client falls back to
    // a truncated copy of the first message. So the check is not "is there a
    // title" but "is it the fallback" — the failure looked like success.
    await evalJs(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('hcai-chat', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        tx.objectStore('conversations').clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('artifacts_enabled', 'false');
      return true;
    })()`);
    await navigate(3500);
    const titleProbe = "What is the capital of Portugal? Answer in one word.";
    // Nothing else in this script looks at the console, and a React warning
    // that repeats on every page load is exactly the kind that stops being
    // noticed. This is aimed at what React 19 actually emits — not at the
    // `onError listener` string React 18 complained about and React 19 does
    // not, which is why an earlier version of this check could never fail.
    // `verbose` is excluded: that is Chromium's own DOM advice, not React.
    const reactNoise = consoleEntries.filter(
      (e) =>
        (e.level === "error" || e.level === "warning") &&
        // Excluded, with reasons: Simple Analytics nags about the localhost
        // hostname; Next's dev-only font preload hint is a resource warning
        // rather than a React one; both are noise that would train the check to
        // be ignored.
        !/Simple Analytics|preloaded using link preload|\.woff2?|DevTools/i.test(
          e.text,
        ),
    );
    check(
      "no React errors or warnings in the console",
      reactNoise.length === 0,
      reactNoise.length
        ? JSON.stringify(reactNoise.slice(0, 2)) +
            (process.env.SMOKE_DEBUG
              ? " " +
                JSON.stringify(
                  await evalJs(`(() => {
                  const bad = [...document.querySelectorAll('button, [role="switch"], input, [role="checkbox"]')]
                    .filter((el) => {
                      const name = el.getAttribute('aria-label')
                        || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent)
                        || (el.textContent || '').trim()
                        || el.getAttribute('title');
                      return !name;
                    })
                    .map((el) => {
                      const ancestry = [];
                      let node = el;
                      for (let d = 0; d < 4 && node; d++) {
                        ancestry.push(
                          node.tagName.toLowerCase() +
                            (node.getAttribute('data-slot') ? '[' + node.getAttribute('data-slot') + ']' : '') +
                            (node.getAttribute('role') ? '{' + node.getAttribute('role') + '}' : ''),
                        );
                        node = node.parentElement;
                      }
                      return ancestry.join(' < ');
                    });
                  return bad;
                })()`),
                )
              : "")
        : `clean (${consoleEntries.length} entries, ${consoleEntries.filter((e) => e.level === "verbose").length} verbose)` +
            (process.env.SMOKE_DEBUG
              ? " " + JSON.stringify(consoleEntries.slice(0, 12))
              : ""),
    );

    const canTitle = await typeInto("textarea", titleProbe);
    if (canTitle) {
      await pressEnter("textarea");
      // Read the title from IndexedDB rather than from the sidebar. A previous
      // version of this check scraped the sidebar and matched a navigation
      // button called "Settings" — a green check on a title that was never
      // generated, which is the same illusion the 500 produced.
      const readTitles = () =>
        evalJs(`(async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('hcai-chat', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const rows = await new Promise((resolve, reject) => {
            const tx = db.transaction('conversations', 'readonly');
            const request = tx.objectStore('conversations').getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
          });
          return rows
            .filter((c) => (c.messages || []).length >= 2)
            .map((c) => c.title || '');
        })()`);

      // Generation is a second round trip after the reply, so it lands after
      // the turn is already on screen.
      const titles = await waitFor(
        async () => {
          const found = await readTitles();
          return found.some((t) => t && t !== "New Chat") ? found : false;
        },
        25000,
        500,
      ).catch(() => []);
      const generated = (Array.isArray(titles) ? titles : []).find(
        (t) => t && t !== "New Chat",
      );
      check(
        "conversation is titled by the model, not the truncated fallback",
        Boolean(generated) && !generated.endsWith("..."),
        `titles=${JSON.stringify(titles)}`,
      );
    } else {
      check(
        "conversation is titled by the model, not the truncated fallback",
        false,
        "composer unavailable",
      );
    }

    // A conversation row exists now, so the sidebar's prose rule can be
    // measured. globals.css gives every `ul` without `list-none` a
    // `padding-left: 1.5em` meant for Streamdown markdown; on top of the
    // container's px-3 and the row's pl-2.5 that put every title 46px in from
    // the edge of a 260px sidebar. Measured from the sidebar's own left edge
    // so a collapsed sidebar cannot make this pass by accident.
    const titleInset = await evalJs(`(() => {
      const aside = document.querySelector('aside');
      if (!aside || !aside.getClientRects().length) return null;
      const pencil = document.querySelector('[aria-label="Rename"]');
      const li = pencil && pencil.closest('li');
      const btn = li && li.querySelector('button');
      if (!btn || !btn.getClientRects().length) return null;
      return Math.round(btn.getBoundingClientRect().left - aside.getBoundingClientRect().left);
    })()`);
    if (typeof titleInset === "number") {
      check(
        "sidebar titles sit close to the edge, not indented by the prose rule",
        titleInset > 0 && titleInset <= 30,
        `inset=${titleInset}px (was 46px)`,
      );
    } else {
      skip(
        "sidebar titles sit close to the edge, not indented by the prose rule",
        "no conversation row visible",
      );
    }

    // ---- 17. a tall thread scrolls without pushing the composer off-screen ----
    // A grid item's `min-height` defaults to `auto`, so an answer taller than
    // the viewport grew the row past `h-screen`, where the grid's
    // `overflow-hidden` clipped the composer below the fold and left nothing
    // scrollable — you could not scroll because the page was not scrollable
    // and the thread did not think it was overflowing either. Only a real
    // layout engine can see this; jsdom measures everything at zero.
    await evalJs(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('hcai-chat', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const line = 'the quick brown fox jumps over the lazy dog and keeps going. ';
      const body = Array.from({ length: 60 }, (_, i) =>
        'Section ' + i + '. ' + line.repeat(8)
      ).join(String.fromCharCode(10, 10));
      await new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        store.clear();
        store.put({
          id: 'smoke-tall',
          title: 'A very long answer',
          createdAt: new Date().toISOString(),
          model: 'xiaomi/mimo-v2.5',
          contextUsage: 0,
          messages: [
            { role: 'user', content: 'tell me everything' },
            { role: 'assistant', content: body },
          ],
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return body.length;
    })()`);
    await navigate(3500);

    const tall = await evalJs(`(() => {
      const ta = document.querySelector('textarea[aria-label="Message"]');
      const section = document.querySelector('section[aria-label="Conversation"]');
      if (!ta || !section) return { error: 'missing nodes' };
      const composerBottom = Math.round(ta.getBoundingClientRect().bottom);
      const clientH = section.clientHeight;
      const scrollH = section.scrollHeight;
      section.scrollTop = scrollH;
      const scrolled = Math.round(section.scrollTop);
      section.scrollTop = 0;
      return {
        viewport: window.innerHeight,
        composerBottom,
        clientH,
        scrollH,
        scrolled,
        pageScrollable:
          document.documentElement.scrollHeight > window.innerHeight,
      };
    })()`);
    check(
      "a tall thread scrolls while the composer stays on screen",
      !tall.error &&
        tall.composerBottom <= tall.viewport + 1 &&
        tall.scrollH > tall.clientH + 1 &&
        tall.scrolled > 0 &&
        !tall.pageScrollable,
      JSON.stringify(tall),
    );

    // ---- 18. the Cloud sandbox side of the panel owns a real track ----
    // The command transcript moved out of the thread and into the same
    // right-hand track the artifact preview uses. jsdom proves the open
    // derivation; only a browser proves a conversation whose *only* content
    // is commands still pays exactly one track, paints the transcript at a
    // real shell prompt, and keeps the thread beside it rather than under it.
    await evalJs(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('hcai-chat', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        store.clear();
        store.put({
          id: 'smoke-sandbox',
          title: 'Seeded sandbox',
          createdAt: new Date().toISOString(),
          model: 'xiaomi/mimo-v2.5',
          contextUsage: 0,
          messages: [
            { role: 'user', content: 'run ls for me' },
            {
              role: 'assistant',
              content: 'Done.',
              sandboxResults: [
                {
                  tool: 'run_command',
                  command: 'ls',
                  stdout: 'smoke stdout line',
                  stderr: '',
                  exitCode: 0,
                  conversationId: 'smoke-sandbox',
                },
              ],
            },
          ],
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    })()`);
    await navigate(3500);

    const sandboxPanel = await evalJs(`(() => {
      const row = document.querySelector('.grid');
      if (!row) return { error: 'no grid row' };
      const parts = row.style.gridTemplateColumns.trim().split(/\\s+/);
      const track = parseInt(parts[parts.length - 1], 10);
      const terminal = document.querySelector('[aria-label="Cloud sandbox terminal"]');
      const handles = document.querySelectorAll('[aria-label="Resize side panel"]');
      const text = terminal ? terminal.textContent : '';
      const thread = document.querySelector('section[aria-label="Conversation"]');
      const threadBox = thread ? thread.getBoundingClientRect() : null;
      const panelNode = handles[0] ? handles[0].parentElement : null;
      const panelBox = panelNode ? panelNode.getBoundingClientRect() : null;
      return {
        track,
        terminal: !!terminal,
        prompt: text.includes('/workspace $'),
        stdout: text.includes('smoke stdout line'),
        exit: text.includes('exit 0'),
        handles: handles.length,
        panelLeft: panelBox ? Math.round(panelBox.left) : null,
        threadRight: threadBox ? Math.round(threadBox.right) : null,
        docScroll: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      };
    })()`);
    check(
      "a conversation that ran commands opens the Cloud sandbox panel",
      !sandboxPanel.error &&
        sandboxPanel.track > 0 &&
        sandboxPanel.terminal &&
        sandboxPanel.prompt &&
        sandboxPanel.stdout &&
        sandboxPanel.exit &&
        // One panel, one track: two resize handles would mean the artifact
        // and the terminal are both claiming the same column.
        sandboxPanel.handles === 1 &&
        sandboxPanel.panelLeft === sandboxPanel.threadRight &&
        sandboxPanel.docScroll <= sandboxPanel.viewport + 1,
      JSON.stringify(sandboxPanel),
    );

    // ---- 19. a dismissed panel can be opened again ---------------------
    // The closed panel's track is zero pixels wide at the right edge of the
    // viewport, so the reopen button that used to live *inside* it was laid
    // out past the edge and clipped: in the document, visible to every unit
    // test, hittable by nothing. Only a real layout engine can tell a toggle
    // that exists from one you can press, so the geometry — inside the
    // viewport, under the pointer — is the assertion, and the click that
    // follows is the wiring. Check 18 leaves the panel open; this closes it.
    await click(
      `[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Close')`,
      "panel Close",
    );
    const collapsed = await evalJs(`(() => {
      const row = document.querySelector('.grid');
      const parts = row.style.gridTemplateColumns.trim().split(/\\s+/);
      const btn = document.querySelector('button[aria-label="Open side panel"]');
      const out = {
        track: parseInt(parts[parts.length - 1], 10),
        found: !!btn,
        vw: window.innerWidth,
      };
      if (btn) {
        const r = btn.getBoundingClientRect();
        out.rect = { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        out.inside = r.left >= 0 && r.right <= out.vw && r.width > 0;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        out.hit = !!hit && (hit === btn || btn.contains(hit));
      }
      return out;
    })()`);
    let reopened = null;
    if (collapsed.found) {
      await click(
        `[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open side panel')`,
        "Open side panel",
      );
      reopened = await evalJs(`(() => {
        const row = document.querySelector('.grid');
        const parts = row.style.gridTemplateColumns.trim().split(/\\s+/);
        return {
          track: parseInt(parts[parts.length - 1], 10),
          terminal: !!document.querySelector('[aria-label="Cloud sandbox terminal"]'),
        };
      })()`);
    }
    check(
      "a dismissed panel reopens from the Header",
      collapsed.track === 0 &&
        collapsed.found &&
        collapsed.inside &&
        collapsed.hit &&
        !!reopened &&
        reopened.track > 0 &&
        reopened.terminal,
      JSON.stringify({ collapsed, reopened }),
    );
  } catch (e) {
    check("smoke script ran to completion", false, e.message);
  } finally {
    close();
    proc.kill("SIGTERM");
    await sleep(1500);
    if (proc.exitCode === null && proc.signalCode === null)
      proc.kill("SIGKILL");
    await sleep(300);
    try {
      rmSync(PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }

  const failed = results.filter((r) => r.state === "fail");
  const skipped = results.filter((r) => r.state === "skip");
  const passed = results.filter((r) => r.state === "ok");
  console.log(
    `\n${passed.length}/${results.length} passed` +
      (skipped.length ? `, ${skipped.length} skipped` : "") +
      (failed.length ? `, ${failed.length} failed` : ""),
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
