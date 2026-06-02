export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const buckyForm = new FormData();
    buckyForm.append("file", file);

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
    return Response.json({ error: error.message }, { status: 500 });
  }
}
