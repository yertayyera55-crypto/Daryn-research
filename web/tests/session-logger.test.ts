import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFile } from "node:fs/promises";
import { logResearchEvent } from "@/lib/session-logger";

vi.mock("node:fs/promises", () => ({
  appendFile: vi.fn(),
  mkdir: vi.fn(),
}));

afterEach(() => vi.unstubAllEnvs());

describe("research event logging", () => {
  it("does not write to Vercel's read-only deployment filesystem", async () => {
    vi.stubEnv("VERCEL", "1");
    await logResearchEvent({ sessionId: "test", type: "session_started", payload: {} });
    expect(appendFile).not.toHaveBeenCalled();
  });
});
