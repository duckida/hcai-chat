"use client";

import { Streamdown } from "streamdown";
import { useStreamdownPlugins } from "@/lib/streamdown";
import CustomLink from "../CustomLink";

const streamdownComponents = { a: CustomLink };

/** Word-by-word fade used while text is still arriving. */
export const STREAMDOWN_ANIMATED = {
  animation: "blurIn",
  duration: 200,
  easing: "ease-out",
};

/**
 * The reading column every message body is set in. Streaming and committed
 * text share it on purpose: an answer that rewraps at the moment it is saved
 * reads as a different answer.
 */
export const MESSAGE_BODY_CLASS =
  "max-w-none break-words leading-[1.8] text-foreground text-[15.5px] font-[450] selection:bg-accent overflow-x-auto";

/**
 * Streamdown set up the way this app needs it, in one place.
 *
 * Three call sites each carried their own copy of the plugin set and the
 * custom-link mapping, so a link could quietly stop being safe in one of them
 * and nothing would say so.
 */
export default function Markdown({
  children,
  mode = "static",
  streaming = false,
  caret = "line",
}) {
  const plugins = useStreamdownPlugins();

  return (
    <Streamdown
      mode={mode}
      plugins={plugins}
      components={streamdownComponents}
      {...(streaming
        ? { caret, isAnimating: true, animated: STREAMDOWN_ANIMATED }
        : {})}
    >
      {children}
    </Streamdown>
  );
}
