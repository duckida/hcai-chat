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
  let match;

  while ((match = completeRegex.exec(remainingText)) !== null) {
    artifacts.push(match[1].trim());
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

When the user asks you to create HTML content (webpages, components, games, dashboards, visual demos, etc.), output the complete, self-contained HTML document inside a fenced code block with the language \`html\`. For example:

\`\`\`html
<!DOCTYPE html>
<html>
  ...complete, self-contained HTML with inline CSS & JS...
</html>
\`\`\`

Rules:
- Only use this for complete, standalone HTML artifacts requested by the user.
- Ensure all CSS and JavaScript are inline (no external dependencies).
- Do NOT wrap simple code snippets or non-HTML code in html blocks.
- Keep explanations brief — the artifact itself is the deliverable.
`.trim();
