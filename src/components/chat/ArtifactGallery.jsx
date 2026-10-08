"use client";

import { useState } from "react";
import { Dialog } from "@/components/primitives/dialog";
import { getArtifactTitle } from "@/lib/artifacts";

export default function ArtifactGallery({ artifacts, open, onOpenChange }) {
  const [selected, setSelected] = useState(null);
  const items = artifacts.map((html, index) => ({
    html,
    title: getArtifactTitle(html),
    key: `${getArtifactTitle(html)}-${index}`,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) setSelected(null);
      }}
      title={selected ? getArtifactTitle(selected.html) : "Artifact gallery"}
      className="w-[min(1100px,calc(100vw-2rem))] max-w-none max-h-[88vh] overflow-y-auto"
    >
      {selected ? (
        <iframe
          title={`${getArtifactTitle(selected.html)} preview`}
          srcDoc={selected.html}
          sandbox="allow-scripts"
          className="w-full h-[70vh] rounded-xl border border-border bg-white"
        />
      ) : items.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelected(item)}
              className="group overflow-hidden rounded-xl border border-border bg-background text-left hover:border-primary/50 transition-colors"
            >
              <iframe
                title={`${item.title} thumbnail`}
                srcDoc={item.html}
                sandbox="allow-scripts"
                tabIndex={-1}
                className="pointer-events-none w-full h-48 bg-white"
              />
              <span className="block truncate px-3 py-2.5 text-sm font-medium group-hover:text-primary">
                {item.title}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Artifacts you create will appear here.
        </p>
      )}
    </Dialog>
  );
}
