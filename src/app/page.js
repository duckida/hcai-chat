"use client";

import ChatApp from "@/components/chat/ChatApp";

export default function Home({
  initialQuery = null,
  initialSearchEnabled = false,
} = {}) {
  return (
    <ChatApp
      initialQuery={initialQuery}
      initialSearchEnabled={initialSearchEnabled}
    />
  );
}
