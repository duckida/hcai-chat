import fs from "node:fs";
import path from "node:path";
import { AGENT_MODE_ENABLED } from "@/lib/config";
import {
  destroySandbox,
  executeCode,
  getSandboxCount,
  getSandboxPath,
  listFiles,
  listSandboxes,
  runCommand,
} from "@/lib/sandbox";

export async function POST(req) {
  if (!AGENT_MODE_ENABLED) {
    return Response.json({ error: "Agent mode is disabled" }, { status: 404 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, conversationId, code, command } = body;

  if (!conversationId) {
    return Response.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  if (!action || !["execute", "run_command", "destroy"].includes(action)) {
    return Response.json(
      { error: "action must be execute, run_command, or destroy" },
      { status: 400 },
    );
  }

  try {
    switch (action) {
      case "execute": {
        if (!code || typeof code !== "string") {
          return Response.json(
            { error: "code is required for execute action" },
            { status: 400 },
          );
        }
        const result = await executeCode(conversationId, code);
        return Response.json({ ...result, action: "execute" });
      }

      case "run_command": {
        if (!command || typeof command !== "string") {
          return Response.json(
            { error: "command is required for run_command action" },
            { status: 400 },
          );
        }
        const result = await runCommand(conversationId, command);
        return Response.json({ ...result, action: "run_command" });
      }

      case "destroy": {
        await destroySandbox(conversationId);
        return Response.json({ ok: true });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return Response.json(
      {
        error: error.message,
        stdout: "",
        stderr: error.stderr || "",
        exitCode: 1,
      },
      { status: 500 },
    );
  }
}

export async function GET(req) {
  if (!AGENT_MODE_ENABLED) {
    return Response.json({ error: "Agent mode is disabled" }, { status: 404 });
  }
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  const file = searchParams.get("file");
  const action = searchParams.get("action") || "list";

  if (!conversationId) {
    return Response.json({
      sandboxes: listSandboxes(),
      count: getSandboxCount(),
    });
  }

  if (action === "download" && file) {
    try {
      const filePath = getSandboxPath(conversationId, file);
      if (!fs.existsSync(filePath)) {
        return Response.json({ error: "File not found" }, { status: 404 });
      }
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath);
      const fileName = path.basename(file);
      return new Response(content, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": String(stat.size),
        },
      });
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
  }

  const files = listFiles(conversationId);
  return Response.json({ files });
}
