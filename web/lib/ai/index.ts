import { createCodexCliProvider } from "@/lib/ai/codex-cli-provider";
import { createGeminiProvider } from "@/lib/ai/gemini-provider";

export function getAIProvider() {
  const provider = process.env.AI_PROVIDER ?? "codex";
  if (provider === "gemini") return createGeminiProvider();
  if (provider === "codex") return createCodexCliProvider();
  throw new Error("No configured AI provider is available. Set AI_PROVIDER=gemini or AI_PROVIDER=codex.");
}
