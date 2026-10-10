"use client";

import { ArrowLeft, Check, Pencil, Trash2, X } from "lucide-react";
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

export default function ArtifactGallery({
  artifacts,
  open,
  onOpenChange,
  onOpenArtifact,
  onRenameArtifact,
  onDeleteArtifact,
}) {
  const [selected, setSelected] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const items = artifacts.map((artifact, index) => {
    const item = typeof artifact === "string" ? { html: artifact } : artifact;
    const title = item.title || getArtifactTitle(item.html);
    return { ...item, title, key: item.key || `${title}-${index}` };
  });

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setEditingKey(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <section
      aria-label="Artifact gallery"
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
    >
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
        <div className="flex shrink-0 items-center gap-2">
          {selected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenArtifact?.(selected)}
            >
              Open in chat
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to chat"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
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
              <article
                key={item.key}
                className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/50"
              >
                <button
                  type="button"
                  aria-label={`Open ${item.title} in chat`}
                  onClick={() => onOpenArtifact?.(item)}
                  className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <ArtifactThumbnail title={item.title} html={item.html} />
                </button>
                <div className="flex min-h-12 items-center gap-1 px-2">
                  {editingKey === item.key ? (
                    <>
                      <input
                        aria-label="Artifact title"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            onRenameArtifact?.(item, editTitle);
                            setEditingKey(null);
                          }
                          if (event.key === "Escape") setEditingKey(null);
                        }}
                        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Save artifact title"
                        onClick={() => {
                          onRenameArtifact?.(item, editTitle);
                          setEditingKey(null);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="min-w-0 flex-1 truncate px-1 py-2 text-left text-sm font-medium group-hover:text-primary"
                      >
                        {item.title}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Rename ${item.title}`}
                        onClick={() => {
                          setEditingKey(item.key);
                          setEditTitle(item.title);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${item.title}`}
                        onClick={() => onDeleteArtifact?.(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Artifacts you create will appear here.
        </div>
      )}
    </section>
  );
}
