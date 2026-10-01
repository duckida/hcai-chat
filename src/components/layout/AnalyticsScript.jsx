"use client";

/**
 * Simple Analytics, loaded asynchronously and out of the way.
 *
 * This is its own client component for one reason: the fallback below is a
 * function, and `src/app/layout.js` is a server component — a function
 * handler there fails the static prerender with "Event handlers cannot be
 * passed to Client Component props". The previous version passed a *string*
 * (`onError="this.onerror=null;this.remove();"`), which React tolerates but
 * warns about on every page load, and which never ran, so the blocked-script
 * cleanup it was written to do never happened either.
 *
 * Clearing the handler before removing is deliberate: `remove()` can itself
 * fail, and without this the script retries on every navigation.
 */
export default function AnalyticsScript() {
  return (
    <script
      async
      src="https://scripts.simpleanalyticscdn.com/latest.js"
      onError={(event) => {
        const script = event.currentTarget;
        script.onerror = null;
        script.remove();
      }}
    />
  );
}
