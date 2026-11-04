"use client";

import { useMemo } from "react";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { extractInlineViews } from "@/lib/inline-views";
import { normalizeLatexDelimiters } from "@/lib/latex";

/**
 * Turn a message's raw text into what actually gets rendered.
 *
 * Inline views are parsed out first so their position in the reply survives:
 * a view between two paragraphs stays between them, unlike an artifact, which
 * moves to the side panel. Artifact blocks are then pulled out of each text
 * segment. With a feature off its blocks are not rendered, but they are still
 * removed from the prose — raw HTML in the thread is worse than a missing
 * visual, and the model only emits either format when the matching prompt is
 * enabled.
 *
 * The streaming row and the committed row both go through here so they cannot
 * disagree: an answer that reinterprets its own math or hides its fences at
 * the moment it is saved reads as a different answer.
 */
export default function useMessageText(
  text,
  { artifactsEnabled, inlineViewsEnabled = false },
) {
  return useMemo(() => {
    const { parts: rawParts, streamingView } = extractInlineViews(text);
    const parts = [];
    const artifacts = [];
    let streamingArtifact = null;
    let hiddenInlineViews = 0;
    let partId = 0;

    // Keys are assigned here, where the list is built, so the renderer never
    // has to use an array index as a React key.
    const addPart = (part) =>
      parts.push({ ...part, key: `${part.type}-${partId++}` });

    for (const part of rawParts) {
      if (part.type === "inline") {
        if (inlineViewsEnabled) addPart(part);
        else hiddenInlineViews += 1;
        continue;
      }

      if (artifactsEnabled) {
        const result = extractHtmlArtifacts(part.text);
        artifacts.push(...result.artifacts);
        if (result.streamingArtifact) {
          streamingArtifact = result.streamingArtifact;
        }
        const cleaned = normalizeLatexDelimiters(result.cleanedText);
        if (cleaned.trim() !== "") addPart({ type: "text", text: cleaned });
      } else {
        const cleaned = normalizeLatexDelimiters(part.text);
        if (cleaned.trim() !== "") addPart({ type: "text", text: cleaned });
      }
    }

    if (!inlineViewsEnabled && streamingView) hiddenInlineViews += 1;

    return {
      parts,
      artifacts,
      streamingArtifact,
      inlineViews: inlineViewsEnabled
        ? parts.filter((part) => part.type === "inline")
        : [],
      streamingView: inlineViewsEnabled ? streamingView : null,
      hiddenInlineViews,
    };
  }, [text, artifactsEnabled, inlineViewsEnabled]);
}
