/**
 * PrivacyDialog — states the privacy guarantees of the app.
 */
import { Check, ShieldCheck, X } from "lucide-react";
import { useEditor } from "../../editor/store";

const POINTS = ["Local processing", "No document upload", "No account required", "Local editing history"];

export default function PrivacyDialog(): React.ReactElement | null {
  const privacyOpen = useEditor((s) => s.privacyOpen);
  const setPrivacyOpen = useEditor((s) => s.setPrivacyOpen);

  if (!privacyOpen) return null;

  const close = (): void => setPrivacyOpen(false);

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
        aria-label="Private by design"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-zinc-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900">
            <ShieldCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            Private by design
          </h2>
          <button
            type="button"
            aria-label="Close privacy dialog"
            onClick={close}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-zinc-700">
            PDFWriter processes your documents directly in your browser. Your documents are not uploaded to
            PDFWriter servers.
          </p>
          <ul className="mt-4 space-y-2.5">
            {POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-sm text-zinc-800">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 shrink-0">
                  <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
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
