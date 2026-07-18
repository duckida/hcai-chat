export async function GET() {
  try {
    const response = await fetch("https://ai.hackclub.com/up", {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const data = await response.json();
    return Response.json(data, {
      status: 200,
    });
  } catch (error) {
    return Response.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
