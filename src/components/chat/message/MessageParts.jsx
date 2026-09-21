"use client";

import { Cloud, FileText, Globe, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import ThinkingIndicator from "../ThinkingIndicator";

export default function ImageAttachment({ src, alt }) {
  const [loaded, setLoaded] = useState(false);
  const content = (
    <div className="relative rounded-xl overflow-hidden border border-border bg-muted max-w-md cursor-pointer transition-shadow hover:shadow-md">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
        </div>
      )}
      <Image
        src={src}
        alt={alt || "Image attachment"}
        width={800}
        height={600}
        unoptimized
        style={{ width: "100%", height: "auto" }}
        onLoad={() => setLoaded(true)}
        className={`max-h-80 object-contain ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );

  if (src?.startsWith("http")) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}

export function FileBubble({ file }) {
  const content = (
    <div className="inline-flex items-center gap-2.5 bg-background border border-border rounded-xl px-3.5 py-2.5 shadow-sm cursor-default transition-shadow hover:shadow-md">
      <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="min-w-0 max-w-[200px]">
        <p className="text-sm font-medium text-foreground truncate">
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {file.size < 1024 * 1024
            ? `${Math.round(file.size / 1024)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
        </p>
      </div>
    </div>
  );

  if (file.url) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}

export function WebSearchIndicator({ isSearching = false }) {
  if (!isSearching) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
      <Globe className="w-4 h-4 animate-pulse" />
      <span>Searching the web</span>
      <ThinkingIndicator size="md" className="text-muted-foreground" />
    </div>
  );
}

export function AgentIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
      <Cloud className="w-4 h-4 text-sky-500 dark:text-sky-400 animate-pulse" />
      <span className="text-sky-500 dark:text-sky-400 font-medium">
        Running code in sandbox
      </span>
      <ThinkingIndicator size="sm" className="text-muted-foreground" />
    </div>
  );
}
