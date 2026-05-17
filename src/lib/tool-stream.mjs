export function getToolOutput(part) {
  if (!part) return undefined;

  if (Object.prototype.hasOwnProperty.call(part, "output")) {
    if (part.output !== undefined) return part.output;
  }

  if (Object.prototype.hasOwnProperty.call(part, "result")) {
    if (part.result !== undefined) return part.result;
  }

  if (Object.prototype.hasOwnProperty.call(part, "error")) {
    if (part.error !== undefined) return { error: part.error };
  }

  return undefined;
}
