"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Home from "@/app/page";

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  const searchEnabled = searchParams.get("search") === "true";
  return <Home initialQuery={query} initialSearchEnabled={searchEnabled} />;
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}
