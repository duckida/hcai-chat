/**
 * Copy the user's attachments into the conversation's E2B sandbox. Sent as
 * multipart so file bytes are not base64-inflated through JSON; the key rides
 * in a form field, never a URL.
 *
 * Resolves to `{ files: [{ name, path } | { name, error }], sandboxId }` and
 * only throws when the request itself fails — a sandbox that cannot take one
 * file reports it on that entry.
 */
export async function uploadFilesToSandbox({
  conversationId,
  files,
  e2bApiKey,
  sandboxId,
}) {
  const form = new FormData();
  form.append("conversationId", conversationId);
  form.append("e2bApiKey", e2bApiKey);
  if (sandboxId) form.append("sandboxId", sandboxId);
  for (const file of files) form.append("files", file, file.name);

  const res = await fetch("/api/sandbox", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Sandbox upload failed (${res.status})`);
  }
  return { files: data.files || [], sandboxId: data.sandboxId };
}
