import { describe, expect, test } from "vitest";
import { formatExecuteOutput } from "@lingzhu/session-ui/execute-output";

describe("execute output formatting", () => {
  test("indents a JSON result and keeps logs separate", () => {
    const formatted = formatExecuteOutput('{"ok":true,"count":2}\n\nLogs:\nhello');
    expect(formatted.json).toBe('{\n  "ok": true,\n  "count": 2\n}');
    expect(formatted.rest).toBe("Logs:\nhello");
    expect(formatted.text).toContain('"ok": true');
    expect(formatted.text).toContain("Logs:\nhello");
  });

  test("leaves plain text untouched", () => {
    const formatted = formatExecuteOutput("null\n\nLogs:\nhello");
    expect(formatted.json).toBeUndefined();
    expect(formatted.rest).toBe("Logs:\nhello");
    expect(formatted.text).toBe("null\n\nLogs:\nhello");
  });
});
