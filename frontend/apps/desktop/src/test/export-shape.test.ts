import { describe, expect, test } from "vitest";
import { coreExportName } from "../../../../packages/app/src/lib/coreExport";
import { environmentExportName, serializeEnvironment } from "../../../../packages/app/src/lib/environmentExport";
import { formsExportName } from "../../../../packages/app/src/lib/formsExport";
import { usageExportName, serializeUsage } from "../../../../packages/app/src/lib/usageExport";
import { webSearchExportName } from "../../../../packages/app/src/lib/webSearchExport";
import { searchEventsExportName } from "../../../../packages/app/src/lib/searchEventsExport";
import { pairingExportName, serializePairing } from "../../../../packages/app/src/lib/pairingExport";
import { worktreesExportName } from "../../../../packages/app/src/lib/worktreesExport";
import { mediaExportName } from "../../../../packages/app/src/lib/mediaExport";
import { oauthExportName } from "../../../../packages/app/src/lib/oauthExport";

const at = new Date(2026, 10, 13, 21, 5, 0);

// Expected values were produced by the pre-refactor template-string helpers.
describe("export filenames keep their exact shape", () => {
  test("workspace-scoped names keep the last path segment", () => {
    expect(coreExportName("/a/b/ws", at)).toBe("ws-core-20261113-2105.json");
    expect(coreExportName("C:\\a\\b\\ws", at)).toBe("ws-core-20261113-2105.json");
    expect(oauthExportName("/a/b/ws", 2, at)).toBe("ws-oauth-2-20261113-2105.json");
    expect(worktreesExportName("/a/b/repo", 5, at)).toBe("repo-worktrees-5-20261113-2105.json");
  });

  test("session-scoped names keep the id and count", () => {
    expect(environmentExportName("ses_1", at)).toBe("ses_1-environment-20261113-2105.json");
    expect(formsExportName("ses_1", 3, at)).toBe("ses_1-forms-3-20261113-2105.json");
    expect(usageExportName("ses_1", at)).toBe("ses_1-usage-20261113-2105.json");
    expect(mediaExportName("ses_1", 7, at)).toBe("ses_1-media-7-20261113-2105.json");
    expect(pairingExportName("AB-12", at)).toBe("AB-12-pairing-20261113-2105.json");
  });

  test("query names slug, plain names sanitize", () => {
    expect(webSearchExportName("hello world!", 4, at)).toBe("hello-world-websearch-4-20261113-2105.json");
    expect(searchEventsExportName("Hello World", 2, at)).toBe("hello-world-event-search-2-20261113-2105.json");
  });
});

describe("export documents keep their field order", () => {
  test("pairing", () => {
    const json = JSON.parse(
      serializePairing({ pairing: { code: "AB", sessionId: "s1", expiresAt: "t", expiresIn: 60 }, date: at }),
    );
    expect(Object.keys(json)).toEqual(["code", "sessionId", "expiresAt", "expiresIn", "exportedAt"]);
  });

  test("usage", () => {
    const json = JSON.parse(
      serializeUsage({
        stats: {
          sessionId: "s1", calls: 1, input: 2, output: 3, cacheRead: 4, cacheWrite: 5, total: 14,
        },
        date: at,
      }),
    );
    expect(Object.keys(json)).toEqual([
      "sessionId", "calls", "input", "output", "cacheRead", "cacheWrite", "total", "last", "lastAt", "exportedAt",
    ]);
  });

  test("environment", () => {
    const json = JSON.parse(
      serializeEnvironment({
        environment: {
          id: "e1", workdir: "/w", shell: ["sh"], running: true, provider: "p", model: "m",
          agent: "a", os: "win32", arch: "amd64",
        },
        date: at,
      }),
    );
    expect(Object.keys(json)).toEqual([
      "id", "workdir", "shell", "running", "provider", "model", "agent", "os", "arch", "exportedAt",
    ]);
  });
});
