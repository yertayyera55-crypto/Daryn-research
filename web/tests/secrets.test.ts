import { afterEach, describe, expect, it, vi } from "vitest";
import { redactSecrets } from "@/lib/secrets";

afterEach(() => vi.unstubAllEnvs());

describe("secret masking", () => {
  it("masks configured credentials without changing their stored values", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-private-credential");
    vi.stubEnv("SERVICE_TOKEN", "test-service-token");
    expect(redactSecrets("Failed: test-private-credential / test-service-token"))
      .toBe("Failed: [REDACTED] / [REDACTED]");
    expect(process.env.GEMINI_API_KEY).toBe("test-private-credential");
  });

  it("masks recognizable keys even when they are not configured locally", () => {
    expect(redactSecrets(`Key: AIza${"a".repeat(35)}`)).toBe("Key: [REDACTED]");
    expect(redactSecrets("Normal feedback on writing.")).toBe("Normal feedback on writing.");
  });
});
