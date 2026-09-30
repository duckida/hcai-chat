"use client";

import { ArrowUp, FileText, Paperclip, X } from "lucide-react";
import NextImage from "next/image";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

function resizeImage(dataUrl, maxDim = 2048) {
  return new Promise((resolve, reject) => {
    const img = new globalThis.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(dataUrl);
        return;
      }
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

const SUPPORTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "text/markdown",
];

const TEXT_FILE_TYPES = new Set([
  "text/plain",
  "text/csv",
  "application/json",
  "text/markdown",
]);

const FilePreview = ({ file, onRemove }) => {
  // An image whose data URL could not be read still attaches, via its raw
  // bytes — it just has nothing to show in the thumbnail.
  const isImage = file.type.startsWith("image/") && !!file.dataUrl;

  return (
    <div className="relative group inline-flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 shadow-sm">
      {isImage ? (
        <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-muted">
          <NextImage
            src={file.dataUrl}
            alt={file.name}
            fill
            unoptimized
            className="object-cover"
          />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
      )}
      <div className="min-w-0 max-w-[160px]">
        <p className="text-xs font-medium text-foreground truncate">
          {file.name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {file.size < 1024 * 1024
            ? `${Math.round(file.size / 1024)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        aria-label={`Remove ${file.name}`}
        className="absolute -top-2 -right-2 w-5 h-5 bg-foreground text-background rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-foreground/90"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

export default function ChatInput({ onSend, isLoading }) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  const handleSend = useCallback(() => {
    if ((!input.trim() && files.length === 0) || isLoading) return;
    onSend(input, files);
    setInput("");
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, files, isLoading, onSend]);

  /**
   * Turn a dropped, pasted or picked file into the record the send path
   * understands. Every branch resolves and none may reject: the caller awaits
   * all of them together, so one unsettled promise silently eats the whole
   * drop with nothing to show for it.
   */
  const processFile = async (file) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const base = {
      id,
      name: file.name,
      type: file.type,
      size: file.size,
      rawFile: file,
    };

    if (file.type.startsWith("image/")) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
          // Downscaling is an optimisation, not a requirement. A file that
          // cannot be decoded, or a browser with no 2d canvas, still attaches
          // at its original size.
          let dataUrl = event.target.result;
          try {
            dataUrl = await resizeImage(dataUrl);
          } catch {}
          resolve({ ...base, dataUrl });
        };
        reader.onerror = () => resolve({ ...base, dataUrl: null });
        reader.readAsDataURL(file);
      });
    }

    if (TEXT_FILE_TYPES.has(file.type)) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) =>
          resolve({ ...base, text: event.target.result });
        // An unreadable text file still attaches by raw upload rather than
        // vanishing from the composer.
        reader.onerror = () => resolve(base);
        reader.readAsText(file);
      });
    }

    return base;
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = async (e) => {
    if (
      e.clipboardData?.types?.includes("text/plain") &&
      e.clipboardData.files.length === 0
    ) {
      return;
    }

    const items = e.clipboardData?.items
      ? Array.from(e.clipboardData.items)
      : [];
    const imageItems = items.filter((item) => item.type.startsWith("image/"));

    if (imageItems.length > 0) {
      e.preventDefault();
      const toProcess = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          if (!file.name) {
            const ext = file.type.split("/")[1] || "png";
            toProcess.push(
              new File([file], `pasted-image.${ext}`, { type: file.type }),
            );
          } else {
            toProcess.push(file);
          }
        }
      }
      if (toProcess.length === 0) return;
      const processed = await Promise.all(toProcess.map(processFile));
      setFiles((prev) => [...prev, ...processed]);
      return;
    }

    const fileItems = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      SUPPORTED_TYPES.includes(f.type),
    );
    if (fileItems.length > 0) {
      e.preventDefault();
      const processed = await Promise.all(fileItems.map(processFile));
      setFiles((prev) => [...prev, ...processed]);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((f) => SUPPORTED_TYPES.includes(f.type));
    if (validFiles.length === 0) return;
    const processed = await Promise.all(validFiles.map(processFile));
    setFiles((prev) => [...prev, ...processed]);
  };

  const handleChange = (e) => {
    const el = e.target;
    setInput(el.value);
    // Collapse to the content height before measuring. scrollHeight never
    // reports less than the box's own height, so a textarea that is currently
    // taller than its text could only ever grow. "auto" rather than a pixel
    // value because the resting height is a breakpoint (44px on phones, 52px
    // on desktop) and a hardcoded reset fought the larger one.
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter((f) =>
      SUPPORTED_TYPES.includes(f.type),
    );
    const filesData = await Promise.all(validFiles.map(processFile));
    setFiles((prev) => [...prev, ...filesData]);
    e.target.value = "";
  };

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div
      className={`shrink-0 bg-background/70 backdrop-blur-xl pb-4 sm:pb-8 pt-3 sm:pt-8 z-30 ${isDragging ? "relative" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      role="none"
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 mx-3 sm:mx-4 my-3 sm:my-8 rounded-[28px] border-2 border-dashed border-primary/60 bg-primary/[0.04] backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Paperclip className="w-10 h-10 mx-auto text-primary/60 mb-2" />
            <p className="text-sm font-semibold text-primary/70">
              Drop files here
            </p>
          </div>
        </div>
      )}
      <div className="max-w-[700px] mx-auto px-4 sm:px-6 relative">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {files.map((file) => (
              <FilePreview key={file.id} file={file} onRemove={removeFile} />
            ))}
          </div>
        )}
        <div className="relative flex items-center bg-muted rounded-[28px] border border-transparent focus-within:bg-background focus-within:border-border focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-all overflow-hidden p-[5px]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
            className="shrink-0 ml-1 h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={SUPPORTED_TYPES.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Hack Club AI"
            aria-label="Message"
            className="w-full bg-transparent border-none outline-none shadow-none resize-none py-[12px] sm:py-[15px] px-[10px] sm:px-[12px] min-h-[44px] sm:min-h-[52px] h-[44px] sm:h-[52px] text-[14px] sm:text-[15px] text-foreground placeholder:text-muted-foreground leading-[1.4] overflow-y-auto block font-medium"
            rows={1}
          />
          <div className="flex items-center pr-1">
            <Button
              size="icon"
              aria-label="Send"
              disabled={(!input.trim() && files.length === 0) || isLoading}
              onClick={handleSend}
              className={`h-8.5 w-8.5 rounded-full transition-all ${
                (input.trim() || files.length > 0) && !isLoading
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              <ArrowUp className="w-5 h-5 stroke-[2.5]" />
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-3 text-center">
        <p className="text-[11px] text-muted-foreground/70 font-bold tracking-tight">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
