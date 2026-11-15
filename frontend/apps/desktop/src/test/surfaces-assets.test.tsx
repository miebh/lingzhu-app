import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Search } from "@lingzhu/ui/icons";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";

describe("icons surfaces", () => {
  test("reference icon artwork renders inside the svg", () => {
    const { container } = render(<Search aria-label="search" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(svg?.innerHTML).toContain("<path");
  });

  test("file type icons resolve by path and mount the shared sprite", () => {
    const { container } = render(<FileTypeIcon path="src/App.tsx" />);
    const use = container.querySelector("use");
    expect(use?.getAttribute("href")).toBe("#lz-file-icon-React_ts");
    expect(document.querySelector("#lz-file-icon-React_ts")).toBeTruthy();
  });
});
