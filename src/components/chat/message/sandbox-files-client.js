"use client";

import { getStoredE2bApiKey } from "@/lib/api-client";

export async function fetchSandboxFiles(conversationId, sandboxId) {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "list",
      conversationId,
      sandboxId: sandboxId || null,
      e2bApiKey: getStoredE2bApiKey(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list files");
  return data.files || [];
}

export async function downloadSandboxFile(conversationId, file, sandboxId) {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "download_token",
      conversationId,
      file: file.path,
      sandboxId: sandboxId || null,
      e2bApiKey: getStoredE2bApiKey(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to start download");
  window.location.href = `/api/sandbox?conversationId=${encodeURIComponent(
    conversationId,
  )}&action=download&token=${encodeURIComponent(data.token)}`;
}
