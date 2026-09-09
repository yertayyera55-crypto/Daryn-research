import { readFile } from "node:fs/promises";
import path from "node:path";
import { AIBackendError, createStructuredTutorProvider, type RunCommand } from "@/lib/ai/codex-cli-provider";
import { AIProvider } from "@/lib/ai/types";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_FAST_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_SMART_MODEL = "gemini-3.5-flash";
const DEFAULT_FINAL_MODEL = "gemini-3.6-flash";

type GeminiResponse = {
  error?: { message?: string };
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new AIBackendError("Gemini is not configured. Add GEMINI_API_KEY to web/.env.local, then restart the server.");
  }
  return key;
}

function configuredModel(variable: "GEMINI_MODEL_FAST" | "GEMINI_MODEL_SMART" | "GEMINI_MODEL_FINAL" | "GEMINI_MODEL", fallback: string) {
  return process.env[variable]?.trim() || fallback;
}

/** `GEMINI_MODEL` remains a backward-compatible alias for the fast model. */
export function getGeminiFastModel() {
  return configuredModel("GEMINI_MODEL_FAST", configuredModel("GEMINI_MODEL", DEFAULT_FAST_MODEL));
}

export function getGeminiSmartModel() {
  return configuredModel("GEMINI_MODEL_SMART", DEFAULT_SMART_MODEL);
}

export function getGeminiFinalModel() {
  return configuredModel("GEMINI_MODEL_FINAL", DEFAULT_FINAL_MODEL);
}

async function loadSchema(schemaName: string) {
  const source = await readFile(path.join(process.cwd(), "contracts", schemaName), "utf8");
  return JSON.parse(source) as unknown;
}

const unsupportedGeminiSchemaKeys = new Set(["$schema", "additionalProperties", "const", "minItems", "maxItems"]);

/** Gemini accepts a JSON Schema subset; application-side Zod remains the final strict validator. */
export function toGeminiStructuredOutputSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiStructuredOutputSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsupportedGeminiSchemaKeys.has(key))
      .map(([key, item]) => [key, toGeminiStructuredOutputSchema(item)]),
  );
}

function extractOutputText(payload: GeminiResponse) {
  const text = payload.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("")
    .trim();
  if (!text) throw new AIBackendError("Gemini did not return a final response.");
  return text;
}

export function createGeminiRunner(options: { apiKey?: string; model?: string; timeoutMs?: number } = {}): RunCommand {
  const apiKey = options.apiKey;
  const model = options.model ?? getGeminiFastModel();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  return async (prompt, schemaName) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey ?? getGeminiApiKey(),
        },
        body: JSON.stringify({
          model,
          input: prompt,
          store: false,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: toGeminiStructuredOutputSchema(await loadSchema(schemaName)),
          },
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as GeminiResponse;
      if (!response.ok) {
        // Upstream errors can echo credentials; never forward their body to the browser.
        throw new AIBackendError(`Gemini API request failed (${response.status}).`);
      }
      return extractOutputText(payload);
    } catch (error) {
      if (error instanceof AIBackendError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AIBackendError("Gemini request timed out. Please try again.");
      }
      throw new AIBackendError("Gemini API could not be reached. Check your internet connection and API key.");
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createGeminiProvider(): AIProvider {
  return createStructuredTutorProvider({
    fast: createGeminiRunner({ model: getGeminiFastModel() }),
    smart: createGeminiRunner({ model: getGeminiSmartModel() }),
    final: createGeminiRunner({ model: getGeminiFinalModel() }),
  });
}
