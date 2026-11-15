/**
 * Renders Mermaid fences to inline SVG. The renderer is loaded on demand so a
 * transcript without diagrams never pays for it, and the theme colours come
 * from the same role slots the rest of the timeline uses.
 */
let sequence = 0;

export async function renderMermaidSvg(source: string): Promise<string | undefined> {
  const pele = await import("pele/lazy");

  if (!pele.detectType(source)) return undefined;

  const root = typeof document !== "undefined" ? document.documentElement : undefined;
  const font = root ? getComputedStyle(root).getPropertyValue("--font-sans").trim() : "";

  const result = await pele.renderAsync(source, {
    idPrefix: `markdown-mermaid-${sequence++}-`,
    // Pele sizes boxes from measured label widths, so it must measure the font
    // the surrounding CSS actually applies.
    fontFamily: font || "sans-serif",
    fontSize: 14,
    images: false,
    linkRel: "noopener noreferrer",
  });

  return result.svg;
}
