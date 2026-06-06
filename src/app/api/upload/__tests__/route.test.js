import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

const makeFormReq = (file) => {
  const form = new FormData();
  if (file) form.append("file", file);
  return { formData: () => Promise.resolve(form) };
};

describe("/api/upload POST", () => {
  it("returns 400 when no file is provided", async () => {
    const res = await POST(makeFormReq(null));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No file provided");
  });

  it("uploads to bucky and returns the URL as text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("https://imgutil.example/abc/file.png"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["data"], "file.png", { type: "image/png" });
    const res = await POST(makeFormReq(file));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    const text = await res.text();
    expect(text).toBe("https://imgutil.example/abc/file.png");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bucky.hackclub.com/",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns the upstream status code on bucky failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeFormReq(new File(["x"], "x.txt")));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toBe("Upload failed: 413");
  });

  it("returns 500 if the request body cannot be parsed", async () => {
    const res = await POST({ formData: () => Promise.reject(new Error("oops")) });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("oops");
  });

  it("trims whitespace from the returned URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("  https://imgutil.example/x.png\n  "),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(makeFormReq(new File(["x"], "x.png")));
    const text = await res.text();
    expect(text).toBe("https://imgutil.example/x.png");
  });
});
