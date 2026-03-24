import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider-v2";

export function getModel() {
  if (process.env.USE_LOCAL_MODEL === "true") {
    const ollama = createOllama({
      baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api",
    });
    return ollama(process.env.LOCAL_MODEL_NAME ?? "llama3");
  }

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  return openrouter(
    process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-preview"
  );
}
