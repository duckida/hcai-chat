"use client";

import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/primitives/button";
import { getArtifactTitle } from "@/lib/artifacts";

function ArtifactThumbnail({ title, html }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);
  const scale = width / 1280;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative aspect-video overflow-hidden bg-white"
    >
      {width > 0 && (
        <iframe
          title={`${title} thumbnail`}
          srcDoc={html}
          sandbox="allow-scripts"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 border-0"
          style={{
            width: 1280,
            height: 720,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      )}
    </div>
  );
}

export default function ArtifactGallery({ artifacts, open, onOpenChange }) {
  const [selected, setSelected] = useState(null);
  const items = artifacts.map((html, index) => ({
    html,
    title: getArtifactTitle(html),
    key: `${getArtifactTitle(html)}-${index}`,
  }));

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  if (!open) return null;

  return (
    <main className="fixed inset-0 z-[100] flex min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {selected && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to artifact gallery"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {selected ? selected.title : "Artifact gallery"}
            </h1>
            {!selected && (
              <p className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "artifact" : "artifacts"}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to chat"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {selected ? (
        <iframe
          title={`${selected.title} preview`}
          srcDoc={selected.html}
          sandbox="allow-scripts"
          className="min-h-0 w-full flex-1 bg-white"
        />
      ) : items.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelected(item)}
                className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArtifactThumbnail title={item.title} html={item.html} />
                <span className="block truncate px-3 py-3 text-sm font-medium group-hover:text-primary">
                  {item.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Artifacts you create will appear here.
        </div>
      )}
    </main>
  );
}
