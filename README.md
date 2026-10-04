# PDFWriter

**Edit PDFs privately. Right in your browser.**

PDFWriter is a privacy-first, client-side PDF editor. Upload a PDF, annotate it
with an overlay editing system (text, highlights, whiteout, freehand drawing,
shapes, sticky notes, images, signatures, stamps, handwritten notes), manage
pages (reorder, rotate, delete, duplicate, insert, append), and export a modified
PDF — all without the document ever leaving the device. The last 10 exports are
kept in a local IndexedDB history.

No backend. No accounts. No uploads. Deploys as a static site (Vercel).

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4, Lucide icons
- `pdfjs-dist` — PDF parsing & rendering (bundled worker, no CDN)
- `pdf-lib` — PDF generation / export (runs in a Web Worker)
- `idb` — IndexedDB (history, autosaved projects, image blobs)
- `zustand` — editor state (binary data stays outside the store)
- `@pdf-lib/fontkit` — embedded handwriting fonts (OFL, bundled in `public/fonts`)
- Vitest — coordinate fidelity + storage tests

## Architecture

```
PDF file → ArrayBuffer → pdf.js → rendered pages → editing overlay
   (overlay edits are serializable objects in DISPLAY space: PDF points,
    top-left origin, page already rotated — never DOM pixels)
→ pdf-lib (Web Worker) → modified PDF bytes → download + IndexedDB history
```

Key modules:

- `src/pdf/coordinateMapper.ts` — the single source of truth for
  display ↔ PDF-native coordinate conversion (tested)
- `src/pdf/pdfLoader.ts` — validation + pdf.js loading/rendering
- `src/pdf/exportCore.ts` — worker-safe pdf-lib export pipeline
- `src/pdf/exportService.ts` / `src/workers/export.worker.ts` — worker orchestration
- `src/editor/store.ts` — zustand state, 50-level undo, selection, clipboard
- `src/editor/session.ts` — non-reactive binary holders (PDF bytes, blobs)
- `src/storage/` — IndexedDB: history (10 entries, quota-aware eviction),
  autosaved projects, blob store (OPFS-ready abstraction)
- `src/components/` — canvas (virtualized), editing layer, inspector, dialogs

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # tsc + vite build → dist/
npx vitest run   # test suite
```

## Deployment (Vercel)

Build command: `npm run build` · Output directory: `dist`. No serverless
functions needed — the app is fully static. PDF data is never sent anywhere.

## Privacy

PDFWriter processes documents directly in the browser: local processing, no
document upload, no account required, local editing history. "Replace text" is
a visual cover (whiteout + new text), not a deletion of the underlying content.
