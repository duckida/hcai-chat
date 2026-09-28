import { spawn } from "node:child_process";

const BASE_URL = process.env.SMOKE_URL ?? "http://localhost:3000";
const DEBUG_PORT = Number(process.env.SMOKE_PORT ?? 9333);
const PROFILE_DIR = "/tmp/opencode/hcai-smoke-profile";

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
  const target = await pageTarget();
  const { send, close, opened } = connect(target.webSocketDebuggerUrl);
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

  const openSettings = async () => {
    await evalJs(
      `(() => { const b = [...document.querySelectorAll('header button')].find(x => x.querySelector('svg.lucide-menu')); if (b && getComputedStyle(b).display !== 'none') { b.click(); return true; } return false; })()`,
    );
    await sleep(500);
    await click(find("button", "Settings"), "Settings button");
    await waitFor(() =>
      evalJs(`Boolean(document.querySelector('[role="dialog"]'))`),
    );
    await sleep(400);
  };

  const closeDialog = async () => {
    await evalJs(
      `(() => { const el = document.querySelector('[role="dialog"]'); if (!el) return false;
        const btn = [...el.querySelectorAll('button')].find(b => (b.textContent||'').trim().toLowerCase() === 'cancel');
        if (btn) { btn.click(); return true; } return false; })()`,
    );
    await sleep(600);
  };

  const gotoSection = async (label) => {
    await click(find('nav button, [role="dialog"] button', label), label);
    await sleep(400);
  };

  try {
    // ---- 1. loads -------------------------------------------------------
    await setViewport(1280, 900);
    await navigate();
    check(
      "app loads with header and controls",
      await evalJs(`Boolean(document.querySelector('header'))`),
    );

    // ---- 2. colour theme applies to <html> ------------------------------
    await openSettings();
    await gotoSection("Appearance");
    await click(
      `[...document.querySelectorAll('[role="dialog"] [role="combobox"]')][0]`,
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
    await click(find('[role="dialog"] label', "Dark"), "Dark color mode");
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
      const dialog = document.querySelector('[role="dialog"]');
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
    const baseline = await pageText();
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
        let stable = 0;
        let prev = "";
        const started = Date.now();
        while (Date.now() - started < 60000 && stable < 3) {
          await sleep(1000);
          const now = await pageText();
          stable = now === prev ? stable + 1 : 0;
          prev = now;
        }
        const err = prev.match(/API Error.{0,140}/s);
        if (err) {
          skip(
            "assistant reply streams back",
            `no credentials in this browser profile — ${err[0].replace(/\s+/g, " ").trim()}`,
          );
        } else {
          check(
            "assistant reply streams back",
            prev.length > baseline.length + probe.length,
            prev.slice(baseline.length, baseline.length + 160),
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
