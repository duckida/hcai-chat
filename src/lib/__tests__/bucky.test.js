import { afterEach, describe, expect, it, vi } from "vitest";
import { dataUrlToBlob, uploadFileToBucky } from "../bucky";

describe("uploadFileToBucky", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads a file to the proxy and returns the trimmed URL", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("  https://imgutil.example/abc/file.txt  "),
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = await uploadFileToBucky(file);

    expect(url).toBe("https://imgutil.example/abc/file.txt");
    expect(fetchMock).toHaveBeenCalledWith("/api/upload", {
      method: "POST",
      body: expect.any(FormData),
    });

    const body = fetchMock.mock.calls[0][1].body;
    expect(body.get("file")).toBe(file);
  });

  it("throws an error with the server-provided message when upload fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: () => Promise.resolve({ error: "File too large" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadFileToBucky(new File(["x"], "x.txt"))).rejects.toThrow(
      "File too large",
    );
  });

  it("falls back to status-based error message when the failure body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadFileToBucky(new File(["x"], "x.txt"))).rejects.toThrow(
      "Upload failed (500)",
    );
  });
});

describe("dataUrlToBlob", () => {
  it("decodes a base64 PNG data URL into a Blob with the right mime type", () => {
    // 'hello' base64 = 'aGVsbG8='
    const dataUrl = "data:image/png;base64,aGVsbG8=";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(5);
  });

  it("decodes a base64 JPEG data URL", () => {
    // 'abc' base64 = 'YWJj'
    const dataUrl = "data:image/jpeg;base64,YWJj";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(3);
  });

  it("handles different mime types", () => {
    const dataUrl = "data:text/plain;base64,Zm9v";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe("text/plain");
  });
});
