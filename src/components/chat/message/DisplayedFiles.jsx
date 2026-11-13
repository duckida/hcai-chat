"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { downloadSandboxFile } from "./sandbox-files-client";

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The files the model chose to hand over with `display_file_to_user`, each a
 * click-to-download card. This is deliberately *not* a listing of the sandbox:
 * scratch files, installed packages and uploads stay out of sight, and only
 * what the model named appears.
 */
export default function DisplayedFiles({ files }) {
  const [error, setError] = useState(null);

  if (!files || files.length === 0) return null;

  const handleDownload = (file) => {
    setError(null);
    return downloadSandboxFile(file.conversationId, file, file.sandboxId).catch(
      (err) => setError(err.message),
    );
  };

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          onClick={() => handleDownload(file)}
          aria-label={`Download ${file.name}`}
          className="inline-flex items-center gap-2.5 bg-background border border-border rounded-xl px-3.5 py-2.5 shadow-sm text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
            <FileText
              className="w-5 h-5 text-blue-600 dark:text-blue-400"
              aria-hidden="true"
            />
          </span>
          <span className="min-w-0 max-w-[200px]">
            <span className="block text-sm font-medium text-foreground truncate">
              {file.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {formatSize(file.size)}
            </span>
          </span>
          <Download
            className="w-4 h-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      ))}
      {error && (
        <p role="alert" className="basis-full text-[11px] text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
