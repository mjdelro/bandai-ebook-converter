import "./style.css";
import "@fontsource/atkinson-hyperlegible-next/latin-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-600.css";
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import {
  analyzePdf,
  convertManual,
  disposeManual,
  foldCount,
  outputName,
  outputPageCount,
  type Layout,
  type ManualAnalysis,
} from "./converter";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("App root is missing.");

let manuals: ManualAnalysis[] = [];
let isConverting = false;

app.innerHTML = `
  <header class="hero">
    <nav class="nav shell" aria-label="Primary navigation">
      <a class="brand" href="./" aria-label="Bandai Ebook Converter home">
        <span class="brand-mark">BE</span>
        <span>Bandai Ebook Converter</span>
      </a>
      <div class="nav-actions">
        <a class="github-link" href="https://github.com/mjdelro/bandai-ebook-converter" target="_blank" rel="noreferrer">Source ↗</a>
        <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch to dark mode" title="Switch to dark mode">
          <svg class="theme-icon moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 14.1A8.2 8.2 0 0 1 9.9 3.3 9 9 0 1 0 20.7 14.1Z"></path></svg>
          <svg class="theme-icon sun-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>
        </button>
      </div>
    </nav>
    <div class="hero-content shell">
      <p class="eyebrow">KOReader-ready, without the cleanup</p>
      <h1>Turn folded manuals into readable EPUBs.</h1>
      <p class="lede">Drop Bandai manual PDFs. Review the detected folds and page order. Download crisp, fixed-layout EPUBs—processed entirely on your device.</p>
      <div class="privacy-pill"><span></span>Your PDFs never leave this browser</div>
    </div>
  </header>

  <section class="workspace shell" aria-labelledby="workspace-title">
    <div class="section-heading">
      <div>
        <p class="step-label">Step 1</p>
        <h2 id="workspace-title">Choose manuals</h2>
      </div>
      <p>Supports five-fold, six-fold, and booklet-style Bandai manuals.</p>
    </div>

    <label class="drop-zone" id="drop-zone">
      <input id="file-input" type="file" accept="application/pdf,.pdf" multiple />
      <span class="upload-icon" aria-hidden="true">↑</span>
      <strong>Drop PDF manuals here</strong>
      <span>or click to choose files</span>
    </label>

    <div id="analysis-status" class="analysis-status" role="status" aria-live="polite"></div>
    <div id="manual-list" class="manual-list"></div>

    <section id="convert-panel" class="convert-panel hidden" aria-labelledby="convert-title">
      <div>
        <p class="step-label">Step 3</p>
        <h2 id="convert-title">Confirm and convert</h2>
        <p id="plan-summary">Review every detected layout and cover position before continuing.</p>
      </div>
      <div class="conversion-controls">
        <label>
          Render quality
          <select id="dpi-select">
            <option value="200">200 DPI — compact</option>
            <option value="240">240 DPI — balanced</option>
            <option value="300" selected>300 DPI — maximum</option>
          </select>
        </label>
        <label class="review-check">
          <input id="review-confirm" type="checkbox" />
          <span>I reviewed the page order</span>
        </label>
        <button id="convert-button" class="primary-button" disabled>Convert manuals</button>
      </div>
      <div id="progress-area" class="progress-area" aria-live="polite"></div>
      <div id="download-area" class="download-area" aria-live="polite"></div>
    </section>
  </section>

  <footer class="footer shell">
    <p>Built for model builders. No uploads, accounts, or tracking.</p>
    <p>Manual artwork remains the property of its respective owner.</p>
  </footer>
`;

const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const dropZone = document.querySelector<HTMLElement>("#drop-zone")!;
const list = document.querySelector<HTMLElement>("#manual-list")!;
const status = document.querySelector<HTMLElement>("#analysis-status")!;
const convertPanel = document.querySelector<HTMLElement>("#convert-panel")!;
const reviewConfirm = document.querySelector<HTMLInputElement>("#review-confirm")!;
const convertButton = document.querySelector<HTMLButtonElement>("#convert-button")!;
const dpiSelect = document.querySelector<HTMLSelectElement>("#dpi-select")!;
const progressArea = document.querySelector<HTMLElement>("#progress-area")!;
const downloadArea = document.querySelector<HTMLElement>("#download-area")!;
const themeToggle = document.querySelector<HTMLButtonElement>("#theme-toggle")!;

function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function updateThemeControl(): void {
  const next = currentTheme() === "dark" ? "light" : "dark";
  themeToggle.setAttribute("aria-label", `Switch to ${next} mode`);
  themeToggle.title = `Switch to ${next} mode`;
}

themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  document.querySelector<HTMLMetaElement>("#theme-color-meta")?.setAttribute("content", next === "dark" ? "#111111" : "#f5f6f4");
  try { localStorage.setItem("bandai-ebook-color-scheme", next); } catch { /* Storage may be disabled. */ }
  updateThemeControl();
});
updateThemeControl();

fileInput.addEventListener("change", () => void addFiles(fileInput.files));
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  void addFiles(event.dataTransfer?.files ?? null);
});
reviewConfirm.addEventListener("change", updateConvertState);
convertButton.addEventListener("click", () => void convertAll());

async function addFiles(files: FileList | null): Promise<void> {
  if (!files || isConverting) return;
  const pdfs = [...files].filter(
    (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
  );
  if (!pdfs.length) {
    status.textContent = "Choose one or more PDF files.";
    return;
  }
  status.textContent = `Analyzing ${pdfs.length} manual${pdfs.length === 1 ? "" : "s"}…`;
  for (const file of pdfs) {
    try {
      const duplicate = manuals.find((manual) => manual.file.name === file.name && manual.file.size === file.size);
      if (duplicate) continue;
      manuals.push(await analyzePdf(file));
      renderManuals();
    } catch (error) {
      status.textContent = `Could not read ${file.name}: ${errorMessage(error)}`;
    }
  }
  status.textContent = manuals.length
    ? `${manuals.length} manual${manuals.length === 1 ? "" : "s"} ready for review.`
    : "No readable PDFs were added.";
  fileInput.value = "";
  renderManuals();
}

function layoutLabel(layout: Layout): string {
  if (layout === "accordion-5") return "Five-fold accordion";
  if (layout === "accordion-6") return "Six-fold accordion";
  if (layout === "booklet") return "Booklet spreads";
  return "Needs review";
}

function layoutOptions(selected: Layout): string {
  const layouts: [Layout, string][] = [
    ["unknown", "Choose layout…"],
    ["accordion-5", "Five-fold accordion"],
    ["accordion-6", "Six-fold accordion"],
    ["booklet", "Booklet spreads"],
  ];
  return layouts.map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
}

function panelPicker(manual: ManualAnalysis): string {
  const folds = foldCount(manual.layout);
  if (!folds) return "";
  const buttons = Array.from({ length: folds }, (_, index) => {
    const selected = manual.coverFold === index;
    return `<button class="fold-button${selected ? " selected" : ""}" data-action="cover" data-id="${manual.id}" data-fold="${index}" aria-pressed="${selected}">
      <span class="fold-preview" style="--folds:${folds};--fold:${index};background-image:url('${manual.previewUrl}')"></span>
      <span>Fold ${index + 1}</span>
    </button>`;
  }).join("");
  return `<div class="cover-picker"><p><strong>Which fold is the front cover?</strong> Counted left to right on PDF page 1.</p><div class="fold-grid" style="--count:${folds}">${buttons}</div></div>`;
}

function renderManuals(): void {
  list.innerHTML = manuals.map((manual, index) => {
    const detected = manual.layout === "unknown" ? "Manual selection needed" : `Detected: ${layoutLabel(manual.layout)}`;
    const pages = outputPageCount(manual);
    return `<article class="manual-card${manual.layout === "unknown" ? " warning" : ""}">
      <div class="manual-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="manual-content">
        <div class="manual-header">
          <div>
            <h3>${escapeHtml(manual.file.name)}</h3>
            <p>${manual.pageCount} PDF pages · ${manual.ratio.toFixed(3)}:1 · ${pages || "?"} EPUB pages</p>
          </div>
          <button class="remove-button" data-action="remove" data-id="${manual.id}" aria-label="Remove ${escapeHtml(manual.file.name)}">Remove</button>
        </div>
        <div class="detection-row">
          <span class="detection-badge">${detected}</span>
          <label>Layout <select data-action="layout" data-id="${manual.id}">${layoutOptions(manual.layout)}</select></label>
        </div>
        ${panelPicker(manual)}
        ${manual.status === "error" ? `<p class="error-message">${escapeHtml(manual.error ?? "Conversion failed.")}</p>` : ""}
      </div>
    </article>`;
  }).join("");

  list.querySelectorAll<HTMLElement>("[data-action='remove']").forEach((button) => {
    button.addEventListener("click", () => removeManual(button.dataset.id!));
  });
  list.querySelectorAll<HTMLSelectElement>("[data-action='layout']").forEach((select) => {
    select.addEventListener("change", () => changeLayout(select.dataset.id!, select.value as Layout));
  });
  list.querySelectorAll<HTMLButtonElement>("[data-action='cover']").forEach((button) => {
    button.addEventListener("click", () => chooseCover(button.dataset.id!, Number(button.dataset.fold)));
  });

  convertPanel.classList.toggle("hidden", manuals.length === 0);
  const summary = document.querySelector<HTMLElement>("#plan-summary")!;
  const pages = manuals.reduce((sum, manual) => sum + outputPageCount(manual), 0);
  summary.textContent = `${manuals.length} EPUB${manuals.length === 1 ? "" : "s"}, ${pages} fixed-layout pages total.`;
  renderDownloads();
  updateConvertState();
}

function renderDownloads(): void {
  const completed = manuals.filter(
    (manual): manual is ManualAnalysis & { outputUrl: string } => manual.status === "done" && Boolean(manual.outputUrl),
  );
  if (!completed.length) {
    downloadArea.innerHTML = "";
    return;
  }
  downloadArea.innerHTML = `
    <div class="download-heading">
      <p class="step-label">Downloads</p>
      <h3>Your EPUBs are ready</h3>
    </div>
    <div class="download-list">
      ${completed.map((manual) => `<a class="download-button" href="${manual.outputUrl}" download="${escapeHtml(outputName(manual.file))}">
        <span>Download</span>
        <strong>${escapeHtml(outputName(manual.file))}</strong>
      </a>`).join("")}
    </div>`;
}

function removeManual(id: string): void {
  const manual = manuals.find((item) => item.id === id);
  if (manual) disposeManual(manual);
  manuals = manuals.filter((item) => item.id !== id);
  reviewConfirm.checked = false;
  renderManuals();
}

function changeLayout(id: string, layout: Layout): void {
  const manual = manuals.find((item) => item.id === id);
  if (!manual) return;
  manual.layout = layout;
  manual.coverFold = null;
  manual.status = "ready";
  reviewConfirm.checked = false;
  renderManuals();
}

function chooseCover(id: string, fold: number): void {
  const manual = manuals.find((item) => item.id === id);
  if (!manual) return;
  manual.coverFold = fold;
  reviewConfirm.checked = false;
  renderManuals();
}

function isReady(manual: ManualAnalysis): boolean {
  if (manual.layout === "unknown") return false;
  if (foldCount(manual.layout) && manual.coverFold === null) return false;
  return true;
}

function updateConvertState(): void {
  convertButton.disabled = isConverting || manuals.length === 0 || !manuals.every(isReady) || !reviewConfirm.checked;
}

async function convertAll(): Promise<void> {
  if (!manuals.length || !manuals.every(isReady)) return;
  isConverting = true;
  convertButton.textContent = "Converting…";
  updateConvertState();
  progressArea.innerHTML = "";
  const dpi = Number(dpiSelect.value);

  for (let index = 0; index < manuals.length; index += 1) {
    const manual = manuals[index];
    manual.status = "converting";
    const row = document.createElement("div");
    row.className = "progress-row";
    row.innerHTML = `<div><strong>${escapeHtml(manual.file.name)}</strong><span>Preparing…</span></div><progress max="1" value="0"></progress>`;
    progressArea.append(row);
    const message = row.querySelector("span")!;
    const progress = row.querySelector("progress")!;
    try {
      const blob = await convertManual(manual, dpi, 0.94, ({ fraction, message: nextMessage }) => {
        progress.value = fraction;
        message.textContent = nextMessage;
      });
      if (manual.outputUrl) URL.revokeObjectURL(manual.outputUrl);
      manual.outputBlob = blob;
      manual.outputUrl = URL.createObjectURL(blob);
      manual.status = "done";
      progress.value = 1;
      message.textContent = "Ready to download";
    } catch (error) {
      manual.status = "error";
      manual.error = errorMessage(error);
      message.textContent = manual.error;
      row.classList.add("failed");
    }
  }

  isConverting = false;
  convertButton.textContent = "Convert again";
  reviewConfirm.checked = false;
  renderManuals();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

window.addEventListener("beforeunload", () => manuals.forEach(disposeManual));
