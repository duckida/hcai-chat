import "server-only";
import { executeCode, runCommand } from "./sandbox";

export async function executeCodeInSandbox(code, conversationId, options = {}) {
  if (!code || typeof code !== "string") {
    throw new Error("Code must be a non-empty string");
  }

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  const result = await executeCode(conversationId, code, options);

  return {
    code,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.exitCode,
    success: result.exitCode === 0,
    sandboxId: result.sandboxId,
  };
}

export async function executeCommandInSandbox(
  command,
  conversationId,
  options = {},
) {
  if (!command || typeof command !== "string") {
    throw new Error("Command must be a non-empty string");
  }

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  const result = await runCommand(conversationId, command, options);

  return {
    command,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.exitCode,
    success: result.exitCode === 0,
    sandboxId: result.sandboxId,
  };
}
