export function getToolOutput(part) {
  if (!part) return undefined;

  if (Object.hasOwn(part, "output")) {
    if (part.output !== undefined) return part.output;
  }

  if (Object.hasOwn(part, "result")) {
    if (part.result !== undefined) return part.result;
  }

  if (Object.hasOwn(part, "error")) {
    if (part.error !== undefined) return { error: part.error };
  }

  return undefined;
}
