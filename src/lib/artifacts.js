/**
 * Extracts `<artifact>` blocks from text content. Returns the list of HTML
 * artifacts and the text with those blocks removed.
 *
 * Only the explicit tag counts. An ```html fence is ordinary code the user
 * asked to see — extracting it made a pasted example open the side panel and
 * hide the code that was the actual answer. The tag is the model's signal that
 * a block is a deliverable page.
 *
 * During streaming, if an <artifact> tag is opened but not yet closed,
 * the partial content is returned as `streamingArtifact` and the tag
 * region is stripped from `cleanedText`.
 */
export function extractHtmlArtifacts(text) {
  if (!text) return { artifacts: [], cleanedText: "", streamingArtifact: null };

  const artifacts = [];
  const completeRegex = /<artifact\s*>([\s\S]*?)<\/artifact\s*>/gi;
  let remainingText = text;
  let streamingArtifact = null;
  const openTags = [...text.matchAll(/<artifact\s*>/gi)];
  const lastOpenTag = openTags.at(-1);
  if (lastOpenTag) {
    const bodyStart = lastOpenTag.index + lastOpenTag[0].length;
    const closeTag = /<\/artifact\s*>/i.exec(text.slice(bodyStart));
    if (!closeTag) {
      // The tag ends at the newline the body starts on; that newline is
      // formatting, not document content (the old fence form consumed it too).
      streamingArtifact = text
        .slice(bodyStart)
        .replace(/^\r?\n/, "")
        .trimEnd();
      remainingText = text.slice(0, lastOpenTag.index).trimEnd();
    }
  }
  let match = completeRegex.exec(remainingText);
  while (match) {
    artifacts.push(match[1].trim());
    match = completeRegex.exec(remainingText);
  }
  remainingText = remainingText.replace(completeRegex, "");

  let cleanedText = remainingText.trim();
  cleanedText = cleanedText.replace(/\n{3,}/g, "\n\n");
  return { artifacts, cleanedText, streamingArtifact };
}

export function getArtifactTitle(html, fallback = "Untitled artifact") {
  const match = String(html || "").match(
    /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i,
  );
  return (
    match?.[1]
      ?.replace(/\s+/g, " ")
      .trim()
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'") || fallback
  );
}

export function updateArtifactAt(text, artifactIndex, update) {
  let index = 0;
  const blockRegex = /<artifact\s*>([\s\S]*?)<\/artifact\s*>/gi;
  return String(text || "").replace(blockRegex, (block, html) => {
    const currentIndex = index++;
    if (currentIndex !== artifactIndex) return block;
    const result = update(html.trim());
    if (result == null) return "";
    return `<artifact>${result}</artifact>`;
  });
}

export function renameArtifact(html, title) {
  const safeTitle = String(title || "")
    .trim()
    .replace(/[<>]/g, "");
  if (!safeTitle) return html;
  const escapedTitle = safeTitle
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  if (/<title\b[^>]*>[\s\S]*?<\/title\s*>/i.test(html)) {
    return html.replace(
      /<title\b[^>]*>[\s\S]*?<\/title\s*>/i,
      () => `<title>${escapedTitle}</title>`,
    );
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(
      /<head\b[^>]*>/i,
      (head) => `${head}<title>${escapedTitle}</title>`,
    );
  }
  return html.replace(
    /<html\b[^>]*>/i,
    (openHtml) => `${openHtml}<head><title>${escapedTitle}</title></head>`,
  );
}

/**
 * Returns system-level instructions to append for the LLM when
 * artifacts mode is enabled.
 */
export const ARTIFACT_INSTRUCTIONS = `
## Artifact Mode

When the user asks you to create, design, or generate any content (webpages, components, games, dashboards, visual demos, tools, data visualizations, charts, UI mockups, etc.) — including when they provide an image, screenshot, or design mockup as reference — output the complete, self-contained HTML document inside an \`<artifact>\` block. For example:

<artifact>
<!DOCTYPE html>
<html>
  ...complete, self-contained HTML with inline CSS & JS...
</html>
</artifact>

Rules:
- Use this for any complete, standalone HTML artifact requested by the user, whether prompted by text, an uploaded image, or a screenshot.
- Ensure all CSS and JavaScript are inline (no external dependencies).
- Include a descriptive \`<title>\` of no more than three words in the HTML document; the app uses it as the artifact's gallery title.
- Do NOT wrap simple code snippets or non-HTML code in artifact tags.
- Keep explanations brief — the artifact itself is the deliverable.
- Make the artifact responsive — it should work well on both mobile and desktop. Use relative units, flexible layouts, and media queries as needed.
`.trim();

/**
 * Additional instructions appended when both artifacts mode and agent mode
 * are enabled: artifacts should be delivered as text, not written to the sandbox.
 */
export const ARTIFACT_AGENT_MODE_INSTRUCTIONS = `
## Artifact Delivery with Agent Mode

When artifacts mode is enabled together with agent mode, still output the complete HTML artifact inside an \`<artifact>\` block as text in the chat. Do NOT write the artifact to a file in the sandbox (do not use execute_code or run_command to create or save the HTML file). The sandbox is only for computation, data processing, file manipulation the user explicitly asked for, and command execution. If you already wrote an artifact file to the sandbox in an earlier step, still output the final version as a text artifact.
`.trim();
