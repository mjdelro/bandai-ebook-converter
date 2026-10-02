# Gundam Ebook Converter

A private, browser-only converter for turning Bandai instruction-manual PDFs into fixed-layout EPUBs for KOReader.

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
