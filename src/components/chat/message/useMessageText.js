"use client";

import { useMemo } from "react";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { normalizeLatexDelimiters } from "@/lib/latex";

/**
 * Turn a message's raw text into what actually gets rendered.
 *
 * HTML fences become artifacts only when artifacts mode is on — otherwise they
 * are ordinary chat text and stay on screen. LaTeX delimiters are normalised
 * either way.
 *
 * The streaming row and the committed row both go through here so they cannot
 * disagree: an answer that reinterprets its own math or hides its fences at
 * the moment it is saved reads as a different answer.
 */
export default function useMessageText(text, { artifactsEnabled }) {
  return useMemo(() => {
    if (!artifactsEnabled) {
      return {
        text: normalizeLatexDelimiters(text),
        artifacts: [],
        streamingArtifact: null,
      };
    }

    const { cleanedText, artifacts, streamingArtifact } =
      extractHtmlArtifacts(text);
    return {
      text: normalizeLatexDelimiters(cleanedText),
      artifacts,
      streamingArtifact,
    };
  }, [text, artifactsEnabled]);
}
