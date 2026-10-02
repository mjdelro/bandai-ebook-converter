import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { detectLayout, foldCount, type Layout } from "./layout";

export { detectLayout, foldCount, type Layout } from "./layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ManualAnalysis {
  id: string;
  file: File;
  pdf: PDFDocumentProxy;
  layout: Layout;
  ratio: number;
  pageCount: number;
  sourceWidth: number;
  sourceHeight: number;
  coverFold: number | null;
  previewUrl: string;
  outputUrl?: string;
  outputBlob?: Blob;
  status: "ready" | "converting" | "done" | "error";
  error?: string;
}

export interface ConversionProgress {
  fraction: number;
  message: string;
}

interface ImagePage {
  blob: Blob;
  width: number;
  height: number;
}

const MAX_RENDER_PIXELS = 24_000_000;

export function outputPageCount(manual: ManualAnalysis): number {
  const folds = foldCount(manual.layout);
  if (folds) return folds * 2;
  if (manual.layout === "booklet") return manual.pageCount * 2;
  return 0;
}

export async function analyzePdf(file: File): Promise<ManualAnalysis> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const firstPage = await pdf.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  const layout = detectLayout(pdf.numPages, viewport.width, viewport.height);
  const previewUrl = await renderPreview(firstPage);
  return {
    id: crypto.randomUUID(),
    file,
    pdf,
    layout,
    ratio: viewport.width / viewport.height,
    pageCount: pdf.numPages,
    sourceWidth: Math.round(viewport.width),
    sourceHeight: Math.round(viewport.height),
    coverFold: null,
    previewUrl,
    status: "ready",
  };
}

async function renderPreview(page: PDFPageProxy): Promise<string> {
  const unscaled = page.getViewport({ scale: 1 });
  const scale = Math.min(1.5, 1200 / unscaled.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  await page.render({ canvas, canvasContext: context, viewport, intent: "display" }).promise;
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
  canvas.width = 1;
  canvas.height = 1;
  return URL.createObjectURL(blob);
}

function renderScale(page: PDFPageProxy, dpi: number): number {
  const viewport = page.getViewport({ scale: 1 });
  const desired = dpi / 72;
  const pixelLimited = Math.sqrt(MAX_RENDER_PIXELS / (viewport.width * viewport.height));
  return Math.min(desired, pixelLimited);
}

async function renderPage(page: PDFPageProxy, dpi: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: renderScale(page, dpi) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  await page.render({ canvas, canvasContext: context, viewport, intent: "print" }).promise;
  return canvas;
}

async function cropCanvas(
  source: HTMLCanvasElement,
  leftFraction: number,
  rightFraction: number,
  quality: number,
): Promise<ImagePage> {
  const left = Math.round(source.width * leftFraction);
  const right = Math.round(source.width * rightFraction);
  const width = Math.max(1, right - left);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.drawImage(source, left, 0, width, source.height, 0, 0, width, source.height);
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  const result = { blob, width, height: source.height };
  canvas.width = 1;
  canvas.height = 1;
  return result;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encoding failed."))),
      type,
      quality,
    );
  });
}

async function renderAccordion(
  manual: ManualAnalysis,
  dpi: number,
  quality: number,
  onProgress: (progress: ConversionProgress) => void,
): Promise<ImagePage[]> {
  const folds = foldCount(manual.layout);
  if (!folds || manual.coverFold === null) throw new Error("Choose the front-cover fold first.");
  if (manual.pdf.numPages !== 2) throw new Error("Accordion manuals must contain two PDF pages.");

  const sheets: ImagePage[][] = [];
  for (let sourceIndex = 0; sourceIndex < 2; sourceIndex += 1) {
    onProgress({ fraction: sourceIndex / 2, message: `Rendering sheet ${sourceIndex + 1} of 2` });
    const page = await manual.pdf.getPage(sourceIndex + 1);
    const canvas = await renderPage(page, dpi);
    const panels: ImagePage[] = [];
    for (let panel = 0; panel < folds; panel += 1) {
      panels.push(await cropCanvas(canvas, panel / folds, (panel + 1) / folds, quality));
    }
    canvas.width = 1;
    canvas.height = 1;
    sheets.push(panels);
  }

  const cover = manual.coverFold;
  return [...sheets[0].slice(cover), ...sheets[1], ...sheets[0].slice(0, cover).reverse()];
}

async function renderBooklet(
  manual: ManualAnalysis,
  dpi: number,
  quality: number,
  onProgress: (progress: ConversionProgress) => void,
): Promise<ImagePage[]> {
  const spreads: [ImagePage, ImagePage][] = [];
  for (let pageIndex = 0; pageIndex < manual.pdf.numPages; pageIndex += 1) {
    onProgress({
      fraction: pageIndex / manual.pdf.numPages,
      message: `Rendering spread ${pageIndex + 1} of ${manual.pdf.numPages}`,
    });
    const page = await manual.pdf.getPage(pageIndex + 1);
    const canvas = await renderPage(page, dpi);
    const left = await cropCanvas(canvas, 0, 0.5, quality);
    const right = await cropCanvas(canvas, 0.5, 1, quality);
    canvas.width = 1;
    canvas.height = 1;
    spreads.push([left, right]);
  }

  const pages: ImagePage[] = [spreads[0][1]];
  for (const [left, right] of spreads.slice(1)) pages.push(left, right);
  pages.push(spreads[0][0]);
  return pages;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function packageEpub(
  manual: ManualAnalysis,
  pages: ImagePage[],
  onProgress: (progress: ConversionProgress) => void,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  zip.file(
    "EPUB/style.css",
    `@page { margin: 0; }
html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: white; }
body { display: flex; align-items: center; justify-content: center; }
img { display: block; width: 100%; height: 100%; object-fit: contain; }`,
  );

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
  ];
  const spine: string[] = [];
  const nav: string[] = [];

  pages.forEach((page, index) => {
    const number = String(index + 1).padStart(3, "0");
    const imageName = `page-${number}.jpg`;
    const pageName = `page-${number}.xhtml`;
    const label = index === 0 ? "Front cover" : index === pages.length - 1 ? "Back cover" : `Manual page ${index}`;
    const safeLabel = escapeXml(label);
    zip.file(`EPUB/images/${imageName}`, page.blob, { compression: "STORE" });
    zip.file(
      `EPUB/pages/${pageName}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>${safeLabel}</title>
  <meta name="viewport" content="width=${page.width}, height=${page.height}"/>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body><img src="../images/${imageName}" alt="${safeLabel}"/></body>
</html>`,
    );
    manifest.push(
      `<item id="image${index + 1}" href="images/${imageName}" media-type="image/jpeg"${index === 0 ? ' properties="cover-image"' : ""}/>`
    );
    manifest.push(
      `<item id="page${index + 1}" href="pages/${pageName}" media-type="application/xhtml+xml"/>`,
    );
    spine.push(`<itemref idref="page${index + 1}"/>`);
    nav.push(`<li><a href="pages/${pageName}">${safeLabel}</a></li>`);
  });

  const title = escapeXml(manual.file.name.replace(/\.pdf$/i, "").replaceAll(/[-_]+/g, " "));
  const identifier = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  zip.file(
    "EPUB/package.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${identifier}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>Bandai Spirits</dc:creator>
    <dc:language>ja</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">portrait</meta>
    <meta property="rendition:spread">none</meta>
  </metadata>
  <manifest>
    ${manifest.join("\n    ")}
  </manifest>
  <spine page-progression-direction="ltr">
    ${spine.join("\n    ")}
  </spine>
</package>`,
  );
  zip.file(
    "EPUB/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>${title} — Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav.join("")}</ol></nav></body>
</html>`,
  );

  onProgress({ fraction: 0.9, message: "Packaging EPUB" });
  const blob = await zip.generateAsync(
    {
      type: "blob",
      mimeType: "application/epub+zip",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    ({ percent }) => onProgress({ fraction: 0.9 + percent / 1000, message: "Packaging EPUB" }),
  );
  const validation = await JSZip.loadAsync(blob);
  const mimetype = await validation.file("mimetype")?.async("string");
  const imageCount = Object.keys(validation.files).filter((name) => /^EPUB\/images\/page-\d+\.jpg$/.test(name)).length;
  if (
    mimetype !== "application/epub+zip" ||
    !validation.file("META-INF/container.xml") ||
    !validation.file("EPUB/package.opf") ||
    imageCount !== pages.length
  ) {
    throw new Error("The generated EPUB did not pass its integrity check.");
  }
  return blob;
}

export async function convertManual(
  manual: ManualAnalysis,
  dpi: number,
  quality: number,
  onProgress: (progress: ConversionProgress) => void,
): Promise<Blob> {
  let pages: ImagePage[];
  if (manual.layout === "accordion-5" || manual.layout === "accordion-6") {
    pages = await renderAccordion(manual, dpi, quality, onProgress);
  } else if (manual.layout === "booklet") {
    pages = await renderBooklet(manual, dpi, quality, onProgress);
  } else {
    throw new Error("Choose a supported layout before converting.");
  }
  return packageEpub(manual, pages, onProgress);
}

export function outputName(file: File): string {
  return file.name.replace(/\.pdf$/i, "") + ".epub";
}

export function disposeManual(manual: ManualAnalysis): void {
  URL.revokeObjectURL(manual.previewUrl);
  if (manual.outputUrl) URL.revokeObjectURL(manual.outputUrl);
  void manual.pdf.cleanup();
}
