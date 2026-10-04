/**
 * SearchPanel — full-text search across the document (pdf.js text extraction).
 * Clicking a result navigates to its page.
 */
import { memo, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useEditor } from "../editor/store";
import { session } from "../editor/session";

interface SearchHit {
  pageIndex: number;
  pageId: string;
  snippet: string;
}

const textCache = new Map<string, string>(); // pageId -> full text

async function pageText(pageId: string, pageIndex: number): Promise<string> {
  const hit = textCache.get(pageId);
  if (hit !== undefined) return hit;
  const { pages } = useEditor.getState();
  const page = pages[pageIndex];
  let text = "";
  try {
    if (page && page.source !== "blank") {
      const doc =
        page.source === "appended"
          ? session.appendedDocs.get(page.sourceDocId ?? "")?.doc
          : session.pdfDoc;
      if (doc) {
        const pg = await doc.getPage(page.sourcePageIndex + 1);
        try {
          const tc = await pg.getTextContent();
          text = tc.items
            .map((it) => ("str" in it ? (it as { str: string }).str : ""))
            .join(" ");
        } finally {
          pg.cleanup();
        }
      }
    }
  } catch {
    /* search is best-effort */
  }
  textCache.set(pageId, text);
  return text;
}

export function clearSearchCache(): void {
  textCache.clear();
}

export const SearchPanel = memo(function SearchPanel(): React.ReactElement {
  const pages = useEditor((s) => s.pages);
  const setCurrentPageIndex = useEditor((s) => s.setCurrentPageIndex);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(() => {
      (async () => {
        const lower = q.toLowerCase();
        const out: SearchHit[] = [];
        const snapshot = useEditor.getState().pages;
        for (let i = 0; i < snapshot.length; i++) {
          const text = await pageText(snapshot[i].id, i);
          const tl = text.toLowerCase();
          let idx = tl.indexOf(lower);
          let count = 0;
          while (idx !== -1 && count < 5) {
            const start = Math.max(0, idx - 40);
            const snippet = `${start > 0 ? "…" : ""}${text.slice(start, idx + q.length + 40)}${idx + q.length + 40 < text.length ? "…" : ""}`;
            out.push({ pageIndex: i, pageId: snapshot[i].id, snippet: snippet.replace(/\s+/g, " ") });
            idx = tl.indexOf(lower, idx + lower.length);
            count++;
          }
          if (out.length >= 60) break;
        }
        setHits(out);
        setSearched(true);
        setSearching(false);
      })();
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, pages.length]);

  return (
    <div className="flex h-full flex-col bg-white" role="complementary" aria-label="Search">
      <div className="border-b border-zinc-200 p-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search in PDF…"
            aria-label="Search in PDF"
            className="pw-focus w-full rounded-lg border border-zinc-300 py-1.5 pl-8 pr-2 text-sm"
          />
        </div>
        {searched && (
          <p className="mt-1.5 text-xs text-zinc-500" role="status">
            {hits.length === 0 ? "No results" : `${hits.length} result${hits.length === 1 ? "" : "s"}`}
          </p>
        )}
      </div>
      <div className="pw-scroll flex-1 overflow-y-auto p-2">
        {searching && <p className="p-2 text-xs text-zinc-500">Searching…</p>}
        {!searching && !searched && (
          <p className="p-2 text-xs text-zinc-500">Type at least 2 characters to search the document text.</p>
        )}
        {hits.map((h, i) => (
          <button
            key={`${h.pageId}-${i}`}
            type="button"
            onClick={() => setCurrentPageIndex(h.pageIndex)}
            className="pw-focus mb-1 w-full rounded-lg border border-zinc-200 p-2 text-left hover:border-blue-300 hover:bg-blue-50"
          >
            <span className="mb-0.5 block text-[11px] font-semibold text-blue-700">Page {h.pageIndex + 1}</span>
            <span className="block text-xs text-zinc-600">{h.snippet}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
