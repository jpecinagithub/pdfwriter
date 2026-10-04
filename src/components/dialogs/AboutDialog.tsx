/**
 * AboutDialog — author credit and contact.
 */
import { ExternalLink, Info, Mail, X } from "lucide-react";
import { useEditor } from "../../editor/store";

const AUTHOR_NAME = "Jon Peciña";
const CONTACT_EMAIL = "jpecina@gmail.com";
const REPO_URL = "https://github.com/jpecinagithub/pdfwriter";

export default function AboutDialog(): React.ReactElement | null {
  const aboutOpen = useEditor((s) => s.aboutOpen);
  const setAboutOpen = useEditor((s) => s.setAboutOpen);

  if (!aboutOpen) return null;

  const close = (): void => setAboutOpen(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="About PDFWriter"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-zinc-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900">
            <Info className="w-5 h-5 text-blue-600" aria-hidden="true" />
            About PDFWriter
          </h2>
          <button
            type="button"
            aria-label="Close about dialog"
            onClick={close}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm font-medium text-zinc-900">Edit PDFs privately. Right in your browser.</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            PDFWriter is a privacy-first PDF editor: your documents are processed locally and never uploaded
            anywhere.
          </p>
          <div className="mt-4 rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
            <p className="text-sm text-zinc-800">
              Created by <span className="font-semibold">{AUTHOR_NAME}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                {CONTACT_EMAIL}
              </a>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                GitHub
              </a>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={close}
              autoFocus
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
