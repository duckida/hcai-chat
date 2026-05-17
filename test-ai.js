import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

async function test() {
  try {
    const hackclub = createOpenRouter({
      apiKey: "test",
      baseUrl: "https://ai.hackclub.com/proxy/v1",
    });

    const result = await streamText({
      model: hackclub("qwen/qwen3-32b"),
      prompt: "Hello",
    });
    console.log("Result keys:", Object.keys(result));
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
