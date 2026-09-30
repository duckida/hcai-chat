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
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
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
  return { send, close: () => ws.close(), opened };
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
    const { send, opened } = connection;
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
