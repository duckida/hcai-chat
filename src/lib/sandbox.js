import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeRuntime } from "secure-exec";

const sandboxes = new Map();
const EXECUTION_TIMEOUT = 30_000;

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

export async function getOrCreateSandbox(conversationId) {
  if (sandboxes.has(conversationId)) {
    return sandboxes.get(conversationId).runtime;
  }

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

  sandboxes.set(conversationId, { runtime, createdAt: Date.now() });

  return runtime;
}

export async function executeCode(conversationId, code, options = {}) {
  const runtime = await getOrCreateSandbox(conversationId);
  try {
    return await runtime.exec(code, {
      timeout: options.timeout ?? EXECUTION_TIMEOUT,
    });
  } catch (err) {
    console.error("[sandbox] executeCode failed:", err.message);
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
    console.error("[sandbox] runCommand failed:", err.message);
    throw err;
  }
}

export async function destroySandbox(conversationId) {
  const entry = sandboxes.get(conversationId);
  if (!entry) return;

  try {
    await entry.runtime.dispose();
  } catch {}

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
  }));
}
