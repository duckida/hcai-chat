"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import Home from "@/app/page";

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Freeze the params from the first render so clearing the URL cannot blank
  // the query before ChatApp consumes it.
  const [initialQuery] = useState(() => searchParams.get("q"));
  const [initialSearchEnabled] = useState(
    () => searchParams.get("search") === "true",
  );
  const clearedRef = useRef(false);

  useEffect(() => {
    if (clearedRef.current) return;
    clearedRef.current = true;
    if (searchParams.has("q") || searchParams.has("search")) {
      router.replace("/search", { scroll: false });
    }
  }, [router, searchParams]);

  return (
    <Home
      initialQuery={initialQuery}
      initialSearchEnabled={initialSearchEnabled}
      forceNewChat
    />
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}
