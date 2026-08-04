import path from "node:path";

const sandboxes = new Map();
const creating = new Map();

const MAX_SANDBOXES = 3;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 min
const SANDBOX_TIMEOUT = 10 * 60 * 1000; // E2B sandbox lifetime, extended on each use
const EXECUTE_TIMEOUT = 30_000;
const COMMAND_TIMEOUT = 120_000;
const REQUEST_TIMEOUT_BUFFER = 15_000;
const OUTPUT_LIMIT = 100_000;
const WORKSPACE = "/workspace";

const E2B_MISSING_KEY_MSG =
  "E2B API key is not set. Add it in Settings to use cloud sandbox.";
const EXEC_TIMEOUT_MSG = "Sandbox execution timed out (CPU limit exceeded)";
const COMMAND_TIMEOUT_MSG = "Sandbox command timed out (CPU limit exceeded)";

let Sandbox;

async function ensureLoaded() {
  if (Sandbox) return;
  const mod = await import("e2b");
  Sandbox = mod.Sandbox;
}

function truncate(text) {
  if (typeof text !== "string" || text.length <= OUTPUT_LIMIT) return text;
  return `${text.slice(0, OUTPUT_LIMIT)}\n… (output truncated at ${OUTPUT_LIMIT} chars)`;
}

function resolveWorkspacePath(relativePath) {
  const resolved = path.posix.resolve(WORKSPACE, relativePath);
  if (resolved !== WORKSPACE && !resolved.startsWith(`${WORKSPACE}/`)) {
    throw new Error(
      `Invalid path: "${relativePath}" is outside the sandbox workspace`,
    );
  }
  return resolved;
}

function refreshTimeout(client) {
  client.setTimeout(SANDBOX_TIMEOUT).catch(() => {});
}

async function ensureWorkspace(client) {
  await client.files.makeDir(WORKSPACE).catch(() => {});
}

let cleanupTimer;

function startIdleCleanup() {
  if (cleanupTimer) return;
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

function evictOldestIfNeeded() {
  if (sandboxes.size < MAX_SANDBOXES) return;
  const entries = Array.from(sandboxes.entries()).sort(
    (a, b) => (a[1].lastUsedAt ?? 0) - (b[1].lastUsedAt ?? 0),
  );
  const [id] = entries[0];
  if (id) {
    console.warn(
      `[sandbox] evicting idle sandbox ${id} (limit ${MAX_SANDBOXES})`,
    );
    destroySandbox(id).catch(() => {});
  }
}

async function createSandbox(conversationId, apiKey) {
  const client = await Sandbox.create({
    apiKey,
    timeoutMs: SANDBOX_TIMEOUT,
    metadata: { conversationId, app: "hcai-chat" },
  });
  await ensureWorkspace(client);
  const sandboxId = client.sandboxId;
  sandboxes.set(conversationId, {
    client,
    sandboxId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  console.log(
    `[sandbox] created sandbox ${sandboxId} for conversation ${conversationId}`,
  );
  return { client, sandboxId };
}

async function connectSandbox(conversationId, sandboxId, apiKey) {
  const client = await Sandbox.connect(sandboxId, { apiKey });
  await ensureWorkspace(client);
  sandboxes.set(conversationId, {
    client,
    sandboxId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  return { client, sandboxId };
}

export async function getOrCreateSandbox(conversationId, options = {}) {
  const { apiKey, sandboxId: requestedSandboxId } = options;
  if (!apiKey) throw new Error(E2B_MISSING_KEY_MSG);

  await ensureLoaded();
  startIdleCleanup();

  if (sandboxes.has(conversationId)) {
    const entry = sandboxes.get(conversationId);
    entry.lastUsedAt = Date.now();
    refreshTimeout(entry.client);
    return { client: entry.client, sandboxId: entry.sandboxId };
  }

  const inFlight = creating.get(conversationId);
  if (inFlight) return inFlight;

  const pending = (async () => {
    evictOldestIfNeeded();
    try {
      if (requestedSandboxId) {
        try {
          return await connectSandbox(
            conversationId,
            requestedSandboxId,
            apiKey,
          );
        } catch (err) {
          console.warn(
            `[sandbox] connect to ${requestedSandboxId} failed, creating new sandbox: ${err.message}`,
          );
        }
      }
      return await createSandbox(conversationId, apiKey);
    } finally {
      creating.delete(conversationId);
    }
  })();

  creating.set(conversationId, pending);
  return pending;
}

function isSandboxGoneError(err) {
  if (!err?.message) return false;
  const msg = String(err.message);
  return (
    err?.name === "SandboxNotFoundError" ||
    msg.includes("sandbox was killed") ||
    msg.includes("reached its end of life") ||
    msg.includes("sandbox not found")
  );
}

async function runOnce(client, cmd, limit, label) {
  const handle = await client.commands.run(cmd, {
    cwd: WORKSPACE,
    background: true,
    timeoutMs: limit + 5_000,
    requestTimeoutMs: limit + REQUEST_TIMEOUT_BUFFER + 5_000,
  });

  let timeoutId;
  const watchdog = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      handle.kill().catch(() => {});
      const timedOut = new Error(
        label === "command" ? COMMAND_TIMEOUT_MSG : EXEC_TIMEOUT_MSG,
      );
      timedOut.timedOut = true;
      reject(timedOut);
    }, limit);
  });

  try {
    const result = await Promise.race([handle.wait(), watchdog]);
    return {
      stdout: truncate(result.stdout || ""),
      stderr: truncate(result.stderr || ""),
      exitCode: result.exitCode,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function execInSandbox(conversationId, cmd, options = {}) {
  const { timeoutMs, label, setup, teardown } = options;
  const limit = timeoutMs ?? EXECUTE_TIMEOUT;

  for (let attempt = 1; ; attempt += 1) {
    const { client, sandboxId } = await getOrCreateSandbox(
      conversationId,
      options,
    );
    try {
      if (setup) await setup(client);
      const result = await runOnce(client, cmd, limit, label);
      return { ...result, sandboxId };
    } catch (err) {
      if (err?.exitCode !== undefined) {
        return {
          stdout: truncate(err.stdout || ""),
          stderr: truncate(err.stderr || ""),
          exitCode: err.exitCode,
          sandboxId,
        };
      }
      if (err?.timedOut === true) {
        throw err;
      }
      if (isSandboxGoneError(err) && attempt === 1) {
        console.warn(
          `[sandbox] sandbox for ${conversationId} is gone (${err.message}), retrying with a fresh sandbox`,
        );
        sandboxes.delete(conversationId);
        continue;
      }
      throw err;
    } finally {
      if (teardown) await teardown(client).catch(() => {});
    }
  }
}

export async function executeCode(conversationId, code, options = {}) {
  const { apiKey } = options;
  if (!apiKey) throw new Error(E2B_MISSING_KEY_MSG);

  const scriptPath = `${WORKSPACE}/.hcai-run-${crypto.randomUUID()}.mjs`;

  return execInSandbox(conversationId, `node "${scriptPath}"`, {
    ...options,
    label: "execute",
    timeoutMs: options.timeoutMs ?? EXECUTE_TIMEOUT,
    setup: (client) => client.files.write(scriptPath, code),
    teardown: (client) => client.files.remove(scriptPath),
  });
}

export async function runCommand(conversationId, command, options = {}) {
  return execInSandbox(conversationId, command, {
    ...options,
    label: "command",
    timeoutMs: options.timeoutMs ?? COMMAND_TIMEOUT,
  });
}

export async function destroySandbox(conversationId, options = {}) {
  const entry = sandboxes.get(conversationId);
  if (entry) {
    sandboxes.delete(conversationId);
    try {
      await entry.client.kill();
      console.log(`[sandbox] destroyed sandbox ${entry.sandboxId}`);
    } catch (err) {
      console.warn(
        `[sandbox] destroy failed for ${entry.sandboxId}: ${err.message}`,
      );
    }
    return;
  }
  const { apiKey, sandboxId } = options;
  if (!sandboxId || !apiKey) return;
  try {
    await ensureLoaded();
    await Sandbox.kill(sandboxId);
    console.log(`[sandbox] destroyed remote sandbox ${sandboxId}`);
  } catch (err) {
    console.warn(
      `[sandbox] remote destroy failed for ${sandboxId}: ${err.message}`,
    );
  }
}

export async function destroyAllSandboxes() {
  for (const id of Array.from(sandboxes.keys())) {
    await destroySandbox(id);
  }
}

export function getSandboxCount() {
  return sandboxes.size;
}

export function listSandboxes() {
  return Array.from(sandboxes.entries()).map(([id, entry]) => ({
    conversationId: id,
    sandboxId: entry.sandboxId,
    createdAt: entry.createdAt,
    age: Date.now() - entry.createdAt,
    idle: Date.now() - (entry.lastUsedAt ?? entry.createdAt),
  }));
}

async function getSandboxClient(conversationId, options) {
  const { apiKey } = options;
  if (!apiKey) throw new Error(E2B_MISSING_KEY_MSG);
  const { client } = await getOrCreateSandbox(conversationId, options);
  return client;
}

export async function listFiles(conversationId, options = {}) {
  const client = await getSandboxClient(conversationId, options);
  try {
    const entries = await client.files.list(WORKSPACE, { depth: 3 });
    return entries
      .filter((entry) => {
        const name = entry.name;
        if (name.startsWith(".")) return false;
        if (name === "node_modules" || name === ".git") return false;
        return entry.type === "file";
      })
      .map((entry) => ({
        name: entry.name,
        path: entry.path.replace(`${WORKSPACE}/`, ""),
        size: entry.size,
        modifiedAt: entry.modifiedTime?.getTime?.() ?? Date.now(),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  } catch (err) {
    console.warn(
      `[sandbox] listFiles failed for ${conversationId}: ${err.message}`,
    );
    return [];
  }
}

export async function readFile(conversationId, relativePath, options = {}) {
  const client = await getSandboxClient(conversationId, options);
  const absolutePath = resolveWorkspacePath(relativePath);
  const data = await client.files.read(absolutePath, { format: "bytes" });
  return Buffer.from(data);
}

export { WORKSPACE };
