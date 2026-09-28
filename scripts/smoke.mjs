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

async function pageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      ).json();
      const page = targets.find(
        (t) => t.type === "page" && t.webSocketDebuggerUrl,
      );
      if (page) return page;
    } catch {}
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
    const target = await pageTarget();
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
    await click(
      `(${SETTINGS_DIALOG}).querySelector('[role="combobox"]')`,
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
