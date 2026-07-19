import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sandboxes = new Map();
const EXECUTION_TIMEOUT = 25_000;
const MAX_SANDBOXES = 3;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 min
const DISPOSE_TIMEOUT = 5_000;
const KILL_TIMEOUT_ERR = "timed out waiting for sidecar protocol frame for kill_process";

let NodeRuntime;
let cleanupInit;

async function ensureLoaded() {
  if (NodeRuntime) return;
  const [seMod, cpMod] = await Promise.all([
    import("secure-exec"),
    import("node:child_process"),
  ]);
  NodeRuntime = seMod.NodeRuntime;
  const { execSync } = cpMod;

  const getSidecarPids = () => {
    try {
      const out = execSync(
        "ps aux | grep secure-exec-sidecar | grep -v grep | awk '{print $2}'",
        { encoding: "utf-8", timeout: 3000 },
      );
      return out.trim().split("\n").filter(Boolean).map(Number);
    } catch {
      return [];
    }
  };

  const killPids = (pids) => {
    if (pids.length === 0) return;
    try {
      execSync(`kill -9 ${pids.join(" ")} 2>/dev/null`, {
        stdio: "ignore",
        timeout: 3000,
      });
    } catch {}
  };

  // Clean up orphaned sidecars from previous crashes
  const orphanPids = getSidecarPids();
  if (orphanPids.length > 0) {
    console.warn(`[sandbox] cleaning up ${orphanPids.length} orphaned sidecar process(es)`);
    killPids(orphanPids);
  }

  // Update destroySandbox with kill-sidecar fallback
  cleanupInit = { getSidecarPids, killPids };
}

function getSandboxDir(conversationId) {
  return path.join(os.tmpdir(), "hcai-sandbox", conversationId);
}

export function getSandboxPath(conversationId, relativePath) {
  const sandboxDir = getSandboxDir(conversationId);
  const resolved = path.resolve(sandboxDir, relativePath);
  if (!resolved.startsWith(sandboxDir)) {
    throw new Error(
      `Invalid path: "${relativePath}" resolved to "${resolved}" which is outside the sandbox directory`,
    );
  }
  return resolved;
}

export function listFiles(conversationId) {
  const sandboxDir = getSandboxDir(conversationId);
  if (!fs.existsSync(sandboxDir)) return [];
  return listFilesRecursive(sandboxDir, sandboxDir);
}

function listFilesRecursive(dir, rootDir) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...listFilesRecursive(fullPath, rootDir));
    } else if (entry.isFile()) {
      const relativePath = path.relative(rootDir, fullPath);
      const stat = fs.statSync(fullPath);
      entries.push({
        name: entry.name,
        path: relativePath,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      });
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function evictOldestIfNeeded() {
  if (sandboxes.size < MAX_SANDBOXES) return;

  const entries = Array.from(sandboxes.entries()).sort(
    (a, b) => (a[1].lastUsedAt ?? 0) - (b[1].lastUsedAt ?? 0),
  );
  const [id] = entries[0];
  if (id) {
    console.warn(`[sandbox] evicting idle sandbox ${id} (limit ${MAX_SANDBOXES})`);
    destroySandbox(id).catch(() => {});
  }
}

// Periodic cleanup of idle sandboxes — starts lazily on first sandbox creation
let cleanupTimer;

export async function getOrCreateSandbox(conversationId) {
  await ensureLoaded();

  if (!cleanupTimer) {
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of sandboxes) {
        if (now - (entry.lastUsedAt ?? entry.createdAt) > IDLE_TIMEOUT) {
          console.warn(`[sandbox] cleaning up idle sandbox ${id}`);
          destroySandbox(id).catch(() => {});
        }
      }
    }, 60_000);
  }

  if (sandboxes.has(conversationId)) {
    const entry = sandboxes.get(conversationId);
    entry.lastUsedAt = Date.now();
    return entry.runtime;
  }

  evictOldestIfNeeded();

  const sandboxDir = getSandboxDir(conversationId);
  fs.mkdirSync(sandboxDir, { recursive: true });

  let runtime;
  try {
    runtime = await NodeRuntime.create({
      permissions: {
        fs: "allow",
        childProcess: "allow",
        network: "allow",
        env: "deny",
      },
      cwd: "/workspace",
      mounts: [
        {
          guestPath: "/workspace",
          hostPath: sandboxDir,
          readOnly: false,
        },
      ],
    });
  } catch (err) {
    console.error("[sandbox] NodeRuntime.create failed:", err);
    throw err;
  }

  sandboxes.set(conversationId, {
    runtime,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });

  return runtime;
}

export async function executeCode(conversationId, code, options = {}) {
  const runtime = await getOrCreateSandbox(conversationId);
  try {
    return await runtime.exec(code, {
      timeout: options.timeout ?? EXECUTION_TIMEOUT,
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[sandbox] executeCode failed:", msg);
    if (msg.includes(KILL_TIMEOUT_ERR)) {
      await destroySandbox(conversationId);
      throw new Error("Sandbox execution timed out (CPU limit exceeded)");
    }
    throw err;
  }
}

export async function runCommand(conversationId, command, options = {}) {
  const runtime = await getOrCreateSandbox(conversationId);
  const wrapped = `
const { execSync } = require("child_process");
try {
  const stdout = execSync(${JSON.stringify(command)}, {
    encoding: "utf-8",
    timeout: ${options.timeout ?? EXECUTION_TIMEOUT},
    maxBuffer: 10 * 1024 * 1024,
  });
  console.log(stdout);
} catch (e) {
  if (e.stderr) process.stderr.write(e.stderr);
  process.exit(e.status ?? 1);
}
`;
  try {
    return await runtime.exec(wrapped, {
      timeout: (options.timeout ?? EXECUTION_TIMEOUT) + 5_000,
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[sandbox] runCommand failed:", msg);
    if (msg.includes(KILL_TIMEOUT_ERR)) {
      await destroySandbox(conversationId);
      throw new Error("Sandbox command timed out (CPU limit exceeded)");
    }
    throw err;
  }
}

export async function destroySandbox(conversationId) {
  const entry = sandboxes.get(conversationId);
  if (!entry) return;

  if (!cleanupInit) {
    sandboxes.delete(conversationId);
    return;
  }

  const { getSidecarPids, killPids } = cleanupInit;
  const pidsBefore = getSidecarPids();

  try {
    await Promise.race([
      entry.runtime.dispose(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("dispose timed out")), DISPOSE_TIMEOUT),
      ),
    ]);
  } catch (err) {
    console.error(`[sandbox] dispose failed for ${conversationId}:`, err.message);
    const newPids = getSidecarPids().filter((p) => !pidsBefore.includes(p));
    if (newPids.length > 0) {
      console.error(`[sandbox] force-killing ${newPids.length} orphaned sidecar PID(s):`, newPids);
      killPids(newPids);
    }
  }

  sandboxes.delete(conversationId);
}

export async function destroyAllSandboxes() {
  for (const [id] of sandboxes) {
    await destroySandbox(id);
  }
}

export function getSandboxCount() {
  return sandboxes.size;
}

export function listSandboxes() {
  return Array.from(sandboxes.entries()).map(([id, entry]) => ({
    conversationId: id,
    createdAt: entry.createdAt,
    age: Date.now() - entry.createdAt,
    idle: Date.now() - (entry.lastUsedAt ?? entry.createdAt),
  }));
}
