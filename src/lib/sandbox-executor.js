import "server-only";
import { executeCode, runCommand } from "./sandbox";

export async function executeCodeInSandbox(code, conversationId) {
  if (!code || typeof code !== "string") {
    throw new Error("Code must be a non-empty string");
  }

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  const result = await executeCode(conversationId, code);

  return {
    code,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.exitCode,
    success: result.exitCode === 0,
  };
}

export async function executeCommandInSandbox(command, conversationId) {
  if (!command || typeof command !== "string") {
    throw new Error("Command must be a non-empty string");
  }

  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  const result = await runCommand(conversationId, command);

  return {
    command,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.exitCode,
    success: result.exitCode === 0,
  };
}
