import { beforeEach, describe, expect, it, vi } from "vitest";

const sandbox = vi.hoisted(() => ({
  destroySandbox: vi.fn(),
  executeCode: vi.fn(),
  getSandboxCount: vi.fn(),
  listFiles: vi.fn(),
  listSandboxes: vi.fn(),
  readFile: vi.fn(),
  runCommand: vi.fn(),
  statFile: vi.fn(),
  uploadFiles: vi.fn(),
}));
vi.mock("@/lib/sandbox", () => sandbox);

import { POST } from "../route";

const formReq = (fields, files = []) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append("files", f, f.name);
  // A stub request, as the upload route's tests do: jsdom's FormData is not
  // one the Node Request can serialise.
  return {
    headers: new Headers({ "content-type": "multipart/form-data; boundary=x" }),
    formData: () => Promise.resolve(form),
  };
};

const jsonReq = (body) => ({
  headers: new Headers({ "content-type": "application/json" }),
  json: () => Promise.resolve(body),
});

beforeEach(() => vi.clearAllMocks());

describe("/api/sandbox multipart upload", () => {
  it("hands the bytes to uploadFiles and returns results in order", async () => {
    sandbox.uploadFiles.mockResolvedValue({
      sandboxId: "sbx-1",
      files: [
        { name: "a.txt", path: "/workspace/uploads/a.txt", size: 1 },
        { name: "b.txt", path: "/workspace/uploads/b.txt", size: 1 },
      ],
    });
    const res = await POST(
      formReq({ conversationId: "c1", e2bApiKey: "k" }, [
        new File(["a"], "a.txt"),
        new File(["b"], "b.txt"),
      ]),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(sandbox.uploadFiles).toHaveBeenCalledWith(
      "c1",
      [
        { name: "a.txt", data: expect.anything() },
        { name: "b.txt", data: expect.anything() },
      ],
      { apiKey: "k", sandboxId: undefined },
    );
    expect(data.sandboxId).toBe("sbx-1");
    expect(data.files.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
  });

  it("requires an E2B key and a conversation", async () => {
    const noKey = await POST(
      formReq({ conversationId: "c1" }, [new File(["a"], "a.txt")]),
    );
    expect(noKey.status).toBe(400);
    const noConv = await POST(
      formReq({ e2bApiKey: "k" }, [new File(["a"], "a.txt")]),
    );
    expect(noConv.status).toBe(400);
    expect(sandbox.uploadFiles).not.toHaveBeenCalled();
  });

  it("rejects a request with no files", async () => {
    const res = await POST(formReq({ conversationId: "c1", e2bApiKey: "k" }));
    expect(res.status).toBe(400);
  });

  it("surfaces a sandbox failure as a 500 with the message", async () => {
    sandbox.uploadFiles.mockRejectedValue(new Error("e2b down"));
    const res = await POST(
      formReq({ conversationId: "c1", e2bApiKey: "k" }, [
        new File(["a"], "a.txt"),
      ]),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("e2b down");
  });
});

describe("/api/sandbox file_info", () => {
  it("returns the stat for the one named file", async () => {
    sandbox.statFile.mockResolvedValue({
      name: "r.csv",
      path: "out/r.csv",
      size: 9,
      sandboxId: "sbx-1",
    });
    const res = await POST(
      jsonReq({
        action: "file_info",
        conversationId: "c1",
        e2bApiKey: "k",
        file: "out/r.csv",
      }),
    );
    expect(await res.json()).toMatchObject({ path: "out/r.csv", size: 9 });
    expect(sandbox.statFile).toHaveBeenCalledWith("c1", "out/r.csv", {
      apiKey: "k",
      sandboxId: undefined,
    });
  });

  it("requires a key and a file", async () => {
    const noKey = await POST(
      jsonReq({ action: "file_info", conversationId: "c1", file: "x" }),
    );
    expect(noKey.status).toBe(400);
    const noFile = await POST(
      jsonReq({ action: "file_info", conversationId: "c1", e2bApiKey: "k" }),
    );
    expect(noFile.status).toBe(400);
  });

  it("reports a missing file as an error the model can read", async () => {
    sandbox.statFile.mockRejectedValue(new Error("File not found: x"));
    const res = await POST(
      jsonReq({
        action: "file_info",
        conversationId: "c1",
        e2bApiKey: "k",
        file: "x",
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("File not found: x");
  });
});
