import { createCodexCliProvider } from "@/lib/ai/codex-cli-provider";

export function getAIProvider() {
  if ((process.env.AI_PROVIDER ?? "codex") !== "codex") {
    throw new Error("No configured AI provider is available. Set AI_PROVIDER=codex.");
  }
  return createCodexCliProvider();
}
