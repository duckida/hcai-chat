function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBareMathEnvironment(text, environment) {
  const pattern = new RegExp(
    String.raw`\\begin\{${escapeRegex(environment)}\}([\s\S]*?)\\end\{${escapeRegex(environment)}\}`,
    "g",
  );

  return text.replace(pattern, (_match, content) => {
    return `$$\n\\begin{${environment}}${content}\\end{${environment}}\n$$`;
  });
}

export function normalizeLatexDelimiters(text) {
  if (!text || typeof text !== "string") return text;

  let normalized = text;

  normalized = normalized.replace(
    /(?:\\\[|\[)\s*(\\begin\{(?:aligned|align\*?|gather\*?)\}[\s\S]*?\\end\{(?:aligned|align\*?|gather\*?)\})\s*(?:\\\]|\])/g,
    (_match, content) => {
      return `$$\n${content.trim()}\n$$`;
    },
  );

  normalized = normalized.replace(/\\\[([\s\S]*?)\\\]/g, (_match, content) => {
    return `$$\n${content.trim()}\n$$`;
  });

  normalized = normalized.replace(/\\\(([^\n]+?)\\\)/g, (_match, content) => {
    return `$$${content.trim()}$$`;
  });

  normalized = normalizeBareMathEnvironment(normalized, "aligned");
  normalized = normalizeBareMathEnvironment(normalized, "align");
  normalized = normalizeBareMathEnvironment(normalized, "align*");

  return normalized;
}
