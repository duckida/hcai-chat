import path from "node:path";
import {
  destroySandbox,
  executeCode,
  getSandboxCount,
  listFiles,
  listSandboxes,
  readFile,
  runCommand,
  statFile,
  uploadFiles,
} from "@/lib/sandbox";

const VALID_ACTIONS = [
  "execute",
  "run_command",
  "destroy",
  "list",
  "download_token",
  "file_info",
];
const TOKEN_TTL = 60_000;

const downloadTokens = new Map();

function mintDownloadToken(conversationId, file, apiKey, sandboxId) {
  const token = crypto.randomUUID();
  downloadTokens.set(token, {
    conversationId,
    file,
    apiKey,
    sandboxId,
    expiresAt: Date.now() + TOKEN_TTL,
  });
  return token;
}

function consumeToken(token) {
  const entry = downloadTokens.get(token);
  if (!entry) return null;
  downloadTokens.delete(token);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// Attachments arrive as multipart so the bytes are never base64-inflated
// through JSON. The key travels in a form field, never in a URL.
async function handleUpload(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form body" }, { status: 400 });
  }
  const conversationId = form.get("conversationId");
  const e2bApiKey = form.get("e2bApiKey");
  const sandboxId = form.get("sandboxId") || undefined;
  const files = form.getAll("files").filter((f) => typeof f !== "string");

  if (!conversationId) {
    return Response.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }
  if (!e2bApiKey) {
    return Response.json(
      { error: "E2B API key is required to upload files" },
      { status: 400 },
    );
  }
  if (files.length === 0) {
    return Response.json({ error: "No files provided" }, { status: 400 });
  }

  try {
    // Results stay in the order the files were sent: the client pairs them
    // back to its attachments by position.
    const results = new Array(files.length);
    const accepted = [];
    files.forEach((file, i) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        results[i] = {
          name: file.name,
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size: ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
        };
      } else {
        accepted.push(i);
      }
    });
    let resultSandboxId = sandboxId;
    if (accepted.length > 0) {
      const entries = await Promise.all(
        accepted.map(async (i) => ({
          name: files[i].name,
          data: await files[i].arrayBuffer(),
        })),
      );
      const uploaded = await uploadFiles(conversationId, entries, {
        apiKey: e2bApiKey,
        sandboxId,
      });
      resultSandboxId = uploaded.sandboxId;
      accepted.forEach((fileIndex, n) => {
        results[fileIndex] = uploaded.files[n];
      });
    }
    return Response.json({
      files: results,
      sandboxId: resultSandboxId,
      action: "upload",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return handleUpload(req);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, conversationId, e2bApiKey, sandboxId, code, command, file } =
    body;

  if (!conversationId) {
    return Response.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  if (!action || !VALID_ACTIONS.includes(action)) {
    return Response.json(
      { error: `action must be ${VALID_ACTIONS.join(", ")}` },
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
        const result = await executeCode(conversationId, code, {
          apiKey: e2bApiKey,
          sandboxId,
        });
        return Response.json({ ...result, action: "execute" });
      }

      case "run_command": {
        if (!command || typeof command !== "string") {
          return Response.json(
            { error: "command is required for run_command action" },
            { status: 400 },
          );
        }
        const result = await runCommand(conversationId, command, {
          apiKey: e2bApiKey,
          sandboxId,
        });
        return Response.json({ ...result, action: "run_command" });
      }

      case "destroy": {
        await destroySandbox(conversationId, { apiKey: e2bApiKey, sandboxId });
        return Response.json({ ok: true });
      }

      case "list": {
        if (!e2bApiKey) {
          return Response.json(
            { error: "E2B API key is required to list files" },
            { status: 400 },
          );
        }
        const files = await listFiles(conversationId, {
          apiKey: e2bApiKey,
          sandboxId,
        });
        return Response.json({ files });
      }

      case "download_token": {
        if (!e2bApiKey) {
          return Response.json(
            { error: "E2B API key is required to download files" },
            { status: 400 },
          );
        }
        if (!file || typeof file !== "string") {
          return Response.json(
            { error: "file is required for download_token action" },
            { status: 400 },
          );
        }
        const token = mintDownloadToken(
          conversationId,
          file,
          e2bApiKey,
          sandboxId,
        );
        return Response.json({ token });
      }

      case "file_info": {
        if (!e2bApiKey) {
          return Response.json(
            { error: "E2B API key is required to read files" },
            { status: 400 },
          );
        }
        if (!file || typeof file !== "string") {
          return Response.json(
            { error: "file is required for file_info action" },
            { status: 400 },
          );
        }
        const info = await statFile(conversationId, file, {
          apiKey: e2bApiKey,
          sandboxId,
        });
        return Response.json({ ...info, action: "file_info" });
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
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  const token = searchParams.get("token");
  const action = searchParams.get("action") || "list";

  if (!conversationId) {
    return Response.json({
      sandboxes: listSandboxes(),
      count: getSandboxCount(),
    });
  }

  if (action === "download") {
    if (!token) {
      return Response.json(
        { error: "A download token is required. Mint one via POST" },
        { status: 400 },
      );
    }
    const entry = consumeToken(token);
    if (!entry) {
      return Response.json(
        { error: "Invalid or expired download token" },
        { status: 401 },
      );
    }
    if (entry.conversationId !== conversationId) {
      return Response.json(
        { error: "Token was issued for a different conversation" },
        { status: 401 },
      );
    }
    try {
      const { sandboxId } = entry;
      const content = await readFile(conversationId, entry.file, {
        apiKey: entry.apiKey,
        sandboxId,
      });
      const fileName = path.basename(entry.file);
      return new Response(content, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": String(content.length),
        },
      });
    } catch (error) {
      return Response.json({ error: error.message }, { status: 404 });
    }
  }

  return Response.json(
    { error: "Use POST with action=list to list files" },
    { status: 400 },
  );
}
