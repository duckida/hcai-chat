import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contracts about the *shape of the source*, not about behaviour.
 *
 * Each of these is a bug that once shipped, and each fails silently: a
 * floating promise loses a response tail with nothing on screen to say so, a
 * reverted build flag only shows up as an OOM on a 2GB server, and a page that
 * stops forwarding its props makes /search quietly start a blank chat. Reading
 * the file is the only honest way to assert them, so that is what this does.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC = path.join(ROOT, "src");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Tests are excluded on purpose: they are allowed to call things without
      // awaiting them, and asserting otherwise would fight the suite.
      if (entry === "__tests__") continue;
      walk(full, out);
    } else if (/\.(js|jsx|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_FILES = walk(SRC);
const rel = (file) => path.relative(ROOT, file);

describe("streamChatCompletion is awaited at every call site", () => {
  it("finds no floating call", () => {
    const callers = SOURCE_FILES.filter((file) =>
      /streamChatCompletion\s*\(/.test(readFileSync(file, "utf8")),
    );

    // If this is ever empty the contract is not being enforced by anything,
    // because a caller that stopped existing cannot be awaited.
    expect(callers.length).toBeGreaterThan(0);

    const floating = [];
    for (const file of callers) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/streamChatCompletion\s*\(/.test(line)) return;
        // A call is awaited when `await` precedes it on the same statement,
        // or when the statement is returned/passed to something that awaits.
        const before = lines[i - 1] ?? "";
        const awaited = /await\s+streamChatCompletion\s*\(/.test(line);
        const returned = /return\s+streamChatCompletion\s*\(/.test(line);
        const chained = /=\s*streamChatCompletion\s*\(/.test(line) &&
          /await|then\s*\(/.test(before);
        if (!awaited && !returned && !chained) {
          floating.push(`${rel(file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    expect(floating).toEqual([]);
  });
});

describe("the build keeps the flags that stop it OOMing", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

  it("caps the heap rather than relying on the default", () => {
    // The mermaid plugin is a multi-megabyte dependency graph. On a 2GB server
    // the default heap loses the build, and a build that dies leaves no error
    // a reader can act on — just a missing deployment.
    expect(pkg.scripts.build).toContain("--max-old-space-size");
  });

  it("builds with webpack, not Turbopack", () => {
    // Turbopack's native graph build is what OOM'd (cbcf214), even with the
    // heap capped. This flag is the actual fix, so it is asserted rather than
    // left as a comment someone may tidy away.
    expect(pkg.scripts.build).toContain("--webpack");
    expect(pkg.scripts.dev).toContain("--webpack");
  });

  it("registers the mermaid plugin once, not per render", () => {
    const source = readFileSync(path.join(SRC, "lib", "streamdown.js"), "utf8");
    // Constructed at module scope, so the plugin is built once per page load
    // rather than on every keystroke that re-renders a message.
    expect(source).toMatch(/const mermaid = createMermaidPlugin\(\)/);
    expect(source).toMatch(/useMemo\(/);
  });
});

describe("the home page still forwards what /search needs", () => {
  it("accepts both search props and passes them to ChatApp", () => {
    const source = readFileSync(path.join(SRC, "app", "page.js"), "utf8");
    expect(source).toMatch(/initialQuery\s*=\s*null/);
    expect(source).toMatch(/initialSearchEnabled\s*=\s*false/);
    // Both must actually reach ChatApp; destructuring them and dropping them
    // renders a normal home page from /search, with no error anywhere.
    expect(source).toMatch(/<ChatApp[\s\S]*initialQuery=\{initialQuery\}/);
    expect(source).toMatch(
      /<ChatApp[\s\S]*initialSearchEnabled=\{initialSearchEnabled\}/,
    );
  });

  it("is the component /search renders, with the query string plumbed", () => {
    const source = readFileSync(path.join(SRC, "app", "search", "page.js"), "utf8");
    expect(source).toMatch(/import Home from "@\/app\/page"/);
    expect(source).toMatch(/searchParams\.get\("q"\)/);
    expect(source).toMatch(/searchParams\.get\("search"\)\s*===\s*"true"/);
  });
});
