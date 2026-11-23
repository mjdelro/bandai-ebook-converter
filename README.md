<p align="center">
  <img src="assets/icon.svg" alt="Bandai Ebook Converter Icon" width="104" height="104" />
</p>

<h1 align="center">Bandai Ebook Converter</h1>

<p align="center">Browser-only PDF to fixed-layout EPUB converter for Bandai manuals on KOReader.</p>

<p align="center">
  <a href="https://mjdelro.github.io/bandai-ebook-converter/"><img src="https://img.shields.io/badge/live-GitHub%20Pages-ea580c?style=flat-square&logo=githubpages&logoColor=white" alt="" /></a>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="" />
  <img src="https://img.shields.io/badge/Vite-Client--Only-646CFF?style=flat-square&logo=vite&logoColor=white" alt="" />
</p>

---

A browser-only converter that turns Bandai instruction-manual PDFs into fixed-layout EPUBs for KOReader. Files stay on the device.

## Supported layouts

- Five-fold accordion manuals (10 EPUB pages)
- Six-fold accordion manuals (12 EPUB pages)
- Booklet spreads (two EPUB pages per PDF page)

The app detects likely layouts, presents panel previews, requires the user to identify the front-cover fold for accordion manuals, and asks for confirmation before conversion. PDFs are processed locally in the browser and are never uploaded.

## Development

```bash
npm install
npm run dev
```

Run tests and create a production build:

```bash
npm test
npm run build
```

## Deployment

Pushes to `main` run the GitHub Pages workflow in `.github/workflows/pages.yml`.
