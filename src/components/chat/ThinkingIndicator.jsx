export default function ThinkingIndicator({
  label,
  size = "sm",
  className = "",
}) {
  const dotClass =
    size === "lg" ? "w-2 h-2" : size === "md" ? "w-1.5 h-1.5" : "w-1 h-1";

  return (
    <output
      className={`inline-flex items-center gap-1.5 ${className}`.trim()}
      aria-live="polite"
      aria-label={label || "Thinking"}
    >
      {label && <span className="font-medium text-current">{label}</span>}
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        <span
          className={`${dotClass} rounded-full bg-current opacity-70 animate-bounce`}
        />
        <span
          className={`${dotClass} rounded-full bg-current opacity-70 animate-bounce`}
          style={{ animationDelay: "0.12s" }}
        />
        <span
          className={`${dotClass} rounded-full bg-current opacity-70 animate-bounce`}
          style={{ animationDelay: "0.24s" }}
        />
      </span>
    </output>
  );
}
