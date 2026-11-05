const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Any file type is accepted: the composer lets every type attach, and this
    // route is the one place that would otherwise silently turn a rejected
    // upload into "nothing happened". The only gates left are the ones that
    // protect the service — a file has to be there, and it has to fit.
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
        },
        { status: 400 },
      );
    }

    const sanitized = sanitizeFilename(file.name);
    const buckyForm = new FormData();
    const safeFile = new File([file], sanitized, { type: file.type });
    buckyForm.append("file", safeFile);

    const response = await fetch("https://bucky.hackclub.com/", {
      method: "POST",
      body: buckyForm,
    });

    if (!response.ok) {
      return Response.json(
        { error: `Upload failed: ${response.status}` },
        { status: response.status },
      );
    }

    const url = (await response.text()).trim();
    return new Response(url, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return Response.json(
      { error: `Upload failed: ${error.message}` },
      { status: 500 },
    );
  }
}
