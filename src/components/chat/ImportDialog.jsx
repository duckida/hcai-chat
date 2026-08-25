"use client";

import { FileArchive, Loader2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  importFromZipBuffer,
  parseImportArchive,
  readFileAsBuffer,
} from "@/lib/import-export";

export default function ImportDialog({ isOpen, onClose, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [archive, setArchive] = useState(null);
  const [parseError, setParseError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [chatsMode, setChatsMode] = useState("append");
  const [settingsMode, setSettingsMode] = useState("replace");
  const fileInputRef = useRef(null);

  const hasChats = archive?.chats?.length > 0;
  const hasSettings = !!archive?.settings;
  const canImport =
    file != null &&
    archive != null &&
    (hasChats || hasSettings) &&
    (chatsMode !== "skip" || settingsMode !== "skip");

  const reset = useCallback(() => {
    setFile(null);
    setFileName("");
    setArchive(null);
    setParseError("");
    setChatsMode("append");
    setSettingsMode("replace");
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setParseError("");
    setArchive(null);

    try {
      const buffer = await readFileAsBuffer(selectedFile);
      setArchive(parseImportArchive(new Uint8Array(buffer)));
    } catch (error) {
      setParseError(error.message || "Could not read this file.");
    }
  }, []);

  const onFileChange = useCallback(
    (e) => handleFile(e.target.files?.[0]),
    [handleFile],
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile],
  );

  const handleImport = useCallback(async () => {
    if (isImporting || !canImport) return;
    setIsImporting(true);
    try {
      const buffer = await readFileAsBuffer(file);
      const result = await importFromZipBuffer(new Uint8Array(buffer), {
        chatsMode,
        settingsMode,
      });
      onImportComplete?.(result);
      handleClose();
    } catch (error) {
      setParseError(`Import failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsImporting(false);
    }
  }, [
    file,
    chatsMode,
    settingsMode,
    isImporting,
    canImport,
    onImportComplete,
    handleClose,
  ]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md bg-background border-border rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Import Data</DialogTitle>
          <DialogDescription>
            Import conversations from a zip or JSON file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <button
            type="button"
            className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors w-full ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/50 hover:border-primary/50 hover:bg-muted"
            }`}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.json"
              className="hidden"
              onChange={onFileChange}
              onClick={(e) => {
                e.target.value = "";
              }}
            />
            {file ? (
              <FileArchive className="w-8 h-8 text-primary" />
            ) : (
              <Upload className="w-8 h-8 text-muted-foreground" />
            )}
            <p className="text-sm font-medium text-foreground">
              {file ? fileName : "Drop a zip or JSON file here"}
            </p>
            <p className="text-xs text-muted-foreground">
              {file ? "Click to change file" : "or click to browse"}
            </p>
          </button>

          {parseError && (
            <p className="text-xs text-red-500 font-medium text-center">
              {parseError}
            </p>
          )}

          {archive && (
            <div className="space-y-3">
              {hasChats && (
                <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">Conversations</p>
                    <p className="text-xs text-muted-foreground">
                      {archive.chats.length} conversation
                      {archive.chats.length !== 1 ? "s" : ""} found
                    </p>
                  </div>
                  <select
                    value={chatsMode}
                    onChange={(e) => setChatsMode(e.target.value)}
                    className="text-sm border border-border rounded-lg px-2 py-1 bg-background"
                  >
                    <option value="append">Append</option>
                    <option value="skip">Skip</option>
                  </select>
                </div>
              )}

              {hasSettings && (
                <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">Settings</p>
                    <p className="text-xs text-muted-foreground">
                      Preferences found
                    </p>
                  </div>
                  <select
                    value={settingsMode}
                    onChange={(e) => setSettingsMode(e.target.value)}
                    className="text-sm border border-border rounded-lg px-2 py-1 bg-background"
                  >
                    <option value="replace">Replace</option>
                    <option value="skip">Skip</option>
                  </select>
                </div>
              )}

              {!hasChats && !hasSettings && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No importable data found in this file.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!canImport || isImporting}
            className="gap-2"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
