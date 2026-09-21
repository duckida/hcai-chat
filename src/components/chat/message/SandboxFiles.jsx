"use client";

import { Download, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { downloadSandboxFile, fetchSandboxFiles } from "./sandbox-files-client";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Generated-file list under a sandbox block, plus the standalone "Generated
 * Files" pill strip shown at the bottom of a completed agent run.
 *
 * The two previous fetchers (SandboxFilePills and SandboxFiles) did the same
 * work with slightly different markup; this is the single implementation.
 *
 * `autoFetch` distinguishes the always-loaded pill strip from the
 * collapsed per-block list (which waits for an explicit "show files" tap).
 */
export default function SandboxFiles({
  conversationId,
  sandboxId,
  autoFetch = false,
}) {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFiles = useCallback(async () => {
    if (autoFetch && files !== null) return;
    setLoading(true);
    setError(null);
    try {
      setFiles(await fetchSandboxFiles(conversationId, sandboxId));
    } catch (err) {
      setError(err.message);
      setFiles([]);
    }
    setLoading(false);
  }, [conversationId, sandboxId, files, autoFetch]);

  useEffect(() => {
    if (autoFetch) fetchFiles();
  }, [fetchFiles, autoFetch]);

  const handleDownload = useCallback(
    (file) =>
      downloadSandboxFile(conversationId, file, sandboxId).catch((err) =>
        setError(err.message),
      ),
    [conversationId, sandboxId],
  );

  if (autoFetch) {
    if (loading || !files || files.length === 0) return null;
    return (
      <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-1">
          Generated Files
        </p>
        {error && <p className="text-[11px] text-red-500 mb-2 pl-1">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => handleDownload(file)}
            >
              <FilePill name={file.name} size={file.size} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (files === null) {
    return (
      <button
        type="button"
        onClick={fetchFiles}
        className="w-full mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
      >
        <Download className="w-3 h-3" />
        Show generated files
      </button>
    );
  }

  if (loading) {
    return (
      <div className="mt-0.5 text-[11px] text-muted-foreground/60 text-center py-1">
        Loading files...
      </div>
    );
  }

  if (files.length === 0) {
    return error ? (
      <div className="mt-0.5 text-[11px] text-red-500/80 text-center py-1">
        {error}
      </div>
    ) : null;
  }

  return (
    <div className="border-t border-border mt-2 pt-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        Generated Files
      </div>
      {error && (
        <div className="text-[11px] text-red-500/80 mb-1.5">{error}</div>
      )}
      <div className="space-y-1">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => handleDownload(file)}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-lg hover:bg-muted/50 text-left"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1 font-mono">{file.path}</span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {formatSize(file.size)}
            </span>
            <Download className="w-3 h-3 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

function FilePill({ name, size }) {
  return (
    <div className="inline-flex items-center gap-2.5 bg-background border border-border rounded-xl px-3.5 py-2.5 shadow-sm cursor-default transition-shadow hover:shadow-md">
      <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="min-w-0 max-w-[200px]">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground">
          {size < 1024 * 1024
            ? `${Math.round(size / 1024)} KB`
            : `${(size / (1024 * 1024)).toFixed(1)} MB`}
        </p>
      </div>
    </div>
  );
}
