const API_KEY_STORAGE_KEY = "hack_club_ai_key";

// Helper function to extract error message from API response
export const getErrorMessage = (errorData, defaultMessage) => {
  if (!errorData) return defaultMessage;
  if (errorData.error) {
    if (typeof errorData.error === 'object' && errorData.error.message) {
      return errorData.error.message;
    }
    if (typeof errorData.error === 'string') {
      return errorData.error;
    }
  }
  if (errorData.message) {
    return errorData.message;
  }
  return defaultMessage;
};

export const getStoredApiKey = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

export const setStoredApiKey = (apiKey) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
};

export const streamChatCompletion = async (
  messages,
  model = "gpt-4o-mini",
  onChunk,
  onError,
  onComplete,
  includeThinking = false,
  artifactsEnabled = false,
) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    onError(new Error("API key not found"));
    return;
  }

  try {
    const body = { model, messages, apiKey };
    if (includeThinking) {
      body.think = true;
    }
    // Add artifacts parameter to control what type of content is returned
    body.artifacts = artifactsEnabled;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        getErrorMessage(errorData, `API Error: ${response.status}`),
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onComplete?.();
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || "";
            const thinking = parsed.choices?.[0]?.delta?.thinking || "";
            if (content) onChunk(content, "content");
            if (thinking) onChunk(thinking, "thinking");
          } catch (e) {}
        }
      }
    }
  } catch (error) {
    onError(error);
  }
};

export const generateTitle = async (message, model = "gpt-4o-mini") => {
  const apiKey = getStoredApiKey();
  if (!apiKey) return "New Chat";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates extremely short titles (max 4 words) for chat conversations based on the first message. Return ONLY the title.",
          },
          { role: "user", content: message },
        ],
        apiKey,
        stream: false,
      }),
    });

    if (response.ok) {
      // Since we set stream: false, the API now returns JSON
      const data = await response.json();
      // Extract the title from the response
      const title = data.choices?.[0]?.message?.content || "";
      if (title) {
        return title.trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch (e) {}
  // Fallback: use a truncated version of the user's message
  return message.slice(0, 30) + "...";
};

// Exa API functions
export const exaSearch = async (query, options = {}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("API key not found");
  }

  const body = {
    endpoint: "search",
    apiKey,
    data: {
      query,
      numResults: options.numResults || 10,
      ...options,
    },
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

  return response.json();
};

export const exaFindSimilar = async (url, options = {}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("API key not found");
  }

  const body = {
    endpoint: "findSimilar",
    apiKey,
    data: {
      url,
      numResults: options.numResults || 10,
      ...options,
    },
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

  return response.json();
};

export const exaContents = async (urls, options = {}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("API key not found");
  }

  const body = {
    endpoint: "contents",
    apiKey,
    data: {
      urls: Array.isArray(urls) ? urls : [urls],
      ...options,
    },
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

  return response.json();
};

export const exaAnswer = async (query, options = {}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("API key not found");
  }

  const body = {
    endpoint: "answer",
    apiKey,
    data: {
      query,
      ...options,
    },
    stream: options.stream || false,
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

  return response;
};

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
    const body = {
      endpoint: "answer",
      apiKey,
      data: {
        query,
        ...options,
        stream: true,
      },
      stream: true,
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onComplete?.();
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            // Exa streaming responses might have different structure
            // Handle both direct content and nested structures
            const content =
              parsed.answer ||
              parsed.content ||
              parsed.choices?.[0]?.delta?.content ||
              "";
            if (content) onChunk(content);
          } catch (e) {}
        }
      }
    }
  } catch (error) {
    onError(error);
  }
};
