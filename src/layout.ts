export type Layout = "accordion-5" | "accordion-6" | "booklet" | "unknown";

export function detectLayout(pageCount: number, width: number, height: number): Layout {
  const ratio = width / height;
  if (pageCount === 2 && ratio >= 3.05 && ratio < 3.34) return "accordion-6";
  if (pageCount === 2 && ratio >= 3.34 && ratio <= 4.1) return "accordion-5";
  if (pageCount >= 2 && ratio >= 1.25 && ratio <= 1.7) return "booklet";
  return "unknown";
}

export function foldCount(layout: Layout): number | null {
  if (layout === "accordion-5") return 5;
  if (layout === "accordion-6") return 6;
  return null;
}
