import { expect, it } from "vitest";

import { resolveCodexExecutablePath } from "@/lib/extraction/model";

it("uses the ChatGPT app Codex executable on macOS", () => {
  const executablePath = resolveCodexExecutablePath({
    configuredPath: undefined,
    pathExists: (path) =>
      path === "/Applications/ChatGPT.app/Contents/Resources/codex",
    platform: "darwin",
  });

  expect(executablePath).toBe(
    "/Applications/ChatGPT.app/Contents/Resources/codex"
  );
});
