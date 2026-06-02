// Exa-specific API client functions
import { getErrorMessage, getStoredApiKey } from "./api-client";

export const streamExaAnswer = async (
  query,
  onChunk,
  onError,
  onComplete,
  options = {},
) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    onError(new Error("API key not found"));
    return;
  }

  try {
    // For web search, use non-streaming first to get sources
    // Then stream the answer
    const body = {
      endpoint: "answer",
      apiKey,
      data: {
        query,
        ...options,
        stream: false, // Get full response first for sources
      },
      stream: false,
    };

    const response = await fetch("/api/exa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        getErrorMessage(errorData, `Exa API Error: ${response.status}`),
      );
    }

    const result = await response.json();
    const answer = result.answer || result.content || "";
    const sources = result.citations || result.sources || [];

    // Stream the answer character by character for visual effect
    let currentIndex = 0;
    const streamInterval = setInterval(() => {
      if (currentIndex < answer.length) {
        const chunk = answer.slice(currentIndex, currentIndex + 3);
        onChunk(chunk);
        currentIndex += 3;
      } else {
        clearInterval(streamInterval);
        // Call onComplete with the full result including sources
        onComplete({ answer, sources });
      }
    }, 20); // 20ms delay for streaming effect
  } catch (error) {
    onError(error);
  }
};
