/**
 * Extracts HTML code blocks from text content.
 * Returns the list of HTML artifacts and the text with those blocks removed.
 *
 * During streaming, if a ```html fence is opened but not yet closed,
 * the partial content is returned as `streamingArtifact` and the fence
 * region is stripped from `cleanedText`.
 */
export function extractHtmlArtifacts(text) {
  if (!text) return { artifacts: [], cleanedText: "", streamingArtifact: null };

  const artifacts = [];

  // First, check for an unclosed ```html fence (streaming in progress)
  let streamingArtifact = null;
  const openFenceRegex = /```html\s*\n/;
  const openFenceMatch = text.match(openFenceRegex);

  let remainingText = text;

  if (openFenceMatch) {
    const openFenceIdx = openFenceMatch.index;
    const afterFence = text.slice(openFenceIdx + openFenceMatch[0].length);

    // Check if there's a closing ``` after the opening fence
    const closeFenceIdx = afterFence.indexOf("```");

    if (closeFenceIdx === -1) {
      // No closing fence yet - this is a streaming artifact
      streamingArtifact = afterFence.trimEnd();
      remainingText = text.slice(0, openFenceIdx).trimEnd();
    }
  }

  // Now extract complete fenced ```html blocks (case-insensitive, multiline)
  const completeRegex = /```html\s*\n([\s\S]*?)```/gi;
  let match = completeRegex.exec(remainingText);

  while (match !== null) {
    artifacts.push(match[1].trim());
    match = completeRegex.exec(remainingText);
  }

  // Remove all complete ```html``` blocks from the remaining text
  let cleanedText = remainingText.replace(completeRegex, "").trim();

  // Also collapse multiple blank lines
  cleanedText = cleanedText.replace(/\n{3,}/g, "\n\n");

  return { artifacts, cleanedText, streamingArtifact };
}

/**
 * Returns system-level instructions to append for the LLM when
 * artifacts mode is enabled.
 */
export const ARTIFACT_INSTRUCTIONS = `
## Artifact Mode

When the user asks you to create, design, or generate any content (webpages, components, games, dashboards, visual demos, tools, data visualizations, charts, UI mockups, etc.) — including when they provide an image, screenshot, or design mockup as reference — output the complete, self-contained HTML document inside a fenced code block with the language \`html\`. For example:

\`\`\`html
<!DOCTYPE html>
<html>
  ...complete, self-contained HTML with inline CSS & JS...
</html>
\`\`\`

Rules:
- Use this for any complete, standalone HTML artifact requested by the user, whether prompted by text, an uploaded image, or a screenshot.
- Ensure all CSS and JavaScript are inline (no external dependencies).
- Do NOT wrap simple code snippets or non-HTML code in html blocks.
- Keep explanations brief — the artifact itself is the deliverable.
- Make the artifact responsive — it should work well on both mobile and desktop. Use relative units, flexible layouts, and media queries as needed.
`.trim();

/**
 * Additional instructions appended when both artifacts mode and agent mode
 * are enabled: artifacts should be delivered as text, not written to the sandbox.
 */
export const ARTIFACT_AGENT_MODE_INSTRUCTIONS = `
## Artifact Delivery with Agent Mode

When artifacts mode is enabled together with agent mode, still output the complete HTML artifact inside a fenced \`\`\`html code block as text in the chat. Do NOT write the artifact to a file in the sandbox (do not use execute_code or run_command to create or save the HTML file). The sandbox is only for computation, data processing, file manipulation the user explicitly asked for, and command execution. If you already wrote an artifact file to the sandbox in an earlier step, still output the final version as a text artifact.
`.trim();
