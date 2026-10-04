/**
 * Autosave: debounced persistence of the editing session to IndexedDB.
 *
 * Saves (spec §23):
 *   { id, originalFileName, edits, pages, createdAt, updatedAt }
 * plus binary blobs (original PDF, appended PDFs, referenced images) in the
 * blob store. Binary blobs are keyed by convention:
 *   original PDF -> `pdf_<projectId>` (kind "original-pdf")
 *   appended doc -> `pdf_<sourceDocId>` (kind "appended-pdf")
 *   images       -> `<imageId>` (kind "image")
 *
 * Depends on storage/projectRepository (built against its documented API).
 */
import { useEditor } from "../editor/store";
import { registerImageBlobWithId, session } from "../editor/session";
import type { PdfEdit } from "../types/editor";
import type { PageMeta } from "../types/pdf";
import {
  collectProjectBlobIds,
  deleteProject,
  getBlob,
  getProject,
  saveProject,
  type BlobKind,
} from "./projectRepository";
import { loadPdfDocument } from "../pdf/pdfLoader";

const DEBOUNCE_MS = 1500;

const LAST_PROJECT_KEY = "pdfwriter:lastProject";

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_PROJECT_KEY, id);
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    /* private mode — autosave resume just won't persist */
  }
}

export type AutosaveState = "idle" | "saving" | "saved" | "error";

let timer: ReturnType<typeof setTimeout> | null = null;
let saveState: AutosaveState = "idle";
let projectCreatedAt = Date.now();
const listeners = new Set<(s: AutosaveState) => void>();

export function getAutosaveState(): AutosaveState {
  return saveState;
}

export function onAutosaveState(cb: (s: AutosaveState) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function setSaveState(s: AutosaveState): void {
  saveState = s;
  listeners.forEach((cb) => {
    try {
      cb(s);
    } catch {
      /* never break saving because of a listener */
    }
  });
}

function scheduleSave(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void saveProjectNow();
  }, DEBOUNCE_MS);
}

/** Subscribe once at app startup. */
export function initAutosave(): () => void {
  projectCreatedAt = Date.now();
  let prevEdits: PdfEdit[] | null = null;
  let prevPages: PageMeta[] | null = null;
  return useEditor.subscribe((s) => {
    if (s.docStatus !== "ready") return;
    if (s.edits === prevEdits && s.pages === prevPages) return;
    prevEdits = s.edits;
    prevPages = s.pages;
    scheduleSave();
  });
}

function referencedImageIds(): string[] {
  const ids = new Set<string>();
  for (const e of useEditor.getState().edits) {
    if ((e.type === "image" || e.type === "signature") && "imageId" in e) ids.add(e.imageId);
  }
  return [...ids];
}

export async function saveProjectNow(): Promise<void> {
  const s = useEditor.getState();
  if (s.docStatus !== "ready" || !session.projectId || !session.originalBytes) return;
  if (saveState === "saving") {
    scheduleSave(); // retry shortly after the in-flight save
    return;
  }
  setSaveState("saving");
  try {
    const projectId = session.projectId;
    const blobs: Array<{ id: string; kind: BlobKind; blob: Blob }> = [
      {
        id: `pdf_${projectId}`,
        kind: "original-pdf",
        blob: new Blob([session.originalBytes], { type: "application/pdf" }),
      },
    ];
    for (const [docId, d] of session.appendedDocs) {
      blobs.push({ id: `pdf_${docId}`, kind: "appended-pdf", blob: new Blob([d.bytes], { type: "application/pdf" }) });
    }
    for (const id of referencedImageIds()) {
      const b = session.imageBlobs.get(id)?.blob;
      if (b) blobs.push({ id, kind: "image", blob: b });
    }
    await saveProject(
      {
        id: projectId,
        originalFileName: s.fileName,
        edits: s.edits,
        pages: s.pages,
        createdAt: projectCreatedAt,
        updatedAt: Date.now(),
      },
      blobs,
    );
    setLastProjectId(projectId);
    setSaveState("saved");
  } catch {
    setSaveState("error");
  }
}

export async function deleteProjectById(projectId: string): Promise<void> {
  try {
    const rec = await getProject(projectId);
    const blobIds = new Set<string>([`pdf_${projectId}`]);
    if (rec) {
      for (const id of collectProjectBlobIds(rec)) blobIds.add(id);
      for (const p of rec.pages) {
        if (p.source === "appended" && p.sourceDocId) blobIds.add(`pdf_${p.sourceDocId}`);
      }
    }
    await deleteProject(projectId, [...blobIds]);
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Restore the last autosaved session (original PDF + appended docs + images).
 * Returns "restored" | "none" | "failed".
 */
export async function restoreSession(projectId: string): Promise<"restored" | "none" | "failed"> {
  try {
    const rec = await getProject(projectId);
    if (!rec) return "none";
    const pdfBlob = await getBlob(`pdf_${projectId}`);
    if (!pdfBlob) return "none";
    const data = await pdfBlob.arrayBuffer();
    if (data.byteLength < 5 || String.fromCharCode(...new Uint8Array(data.slice(0, 5))) !== "%PDF-") {
      return "failed";
    }

    // Release the previous session BEFORE registering restored resources —
    // releaseSession() destroys appended-doc tasks and revokes image URLs.
    const { releaseSession } = await import("../editor/session");
    releaseSession();

    const loaded = await loadPdfDocument(data);

    // Appended documents referenced by pages.
    const neededDocs = new Set(
      rec.pages.filter((p) => p.source === "appended" && p.sourceDocId).map((p) => p.sourceDocId as string),
    );
    const docBytes = new Map<string, ArrayBuffer>();
    for (const docId of neededDocs) {
      const b = await getBlob(`pdf_${docId}`).catch(() => undefined);
      if (b) docBytes.set(docId, await b.arrayBuffer());
    }
    const validPages = rec.pages.filter((p) => {
      if (p.source === "appended") return p.sourceDocId && docBytes.has(p.sourceDocId);
      return true;
    });
    for (const [docId, bytes] of docBytes) {
      const docLoaded = await loadPdfDocument(bytes);
      session.appendedDocs.set(docId, { fileName: "appended.pdf", bytes, doc: docLoaded.doc, task: docLoaded.task });
    }
    const validPageIds = new Set(validPages.map((p) => p.id));
    const validEdits = rec.edits.filter((e) => validPageIds.has(e.pageId));

    // Image blobs.
    for (const id of new Set(
      validEdits.filter((e) => (e.type === "image" || e.type === "signature") && "imageId" in e).map((e) => (e as { imageId: string }).imageId),
    )) {
      const b = await getBlob(id).catch(() => undefined);
      if (b) registerImageBlobWithId(id, b);
    }

    session.originalBytes = data;
    session.pdfDoc = loaded.doc;
    session.pdfTask = loaded.task;
    session.projectId = projectId;
    projectCreatedAt = rec.createdAt;

    const store = useEditor.getState();
    store.openDocument(rec.originalFileName, validPages);
    store.hydrate(validPages, validEdits);
    setLastProjectId(projectId);
    setSaveState("saved");
    return "restored";
  } catch {
    return "failed";
  }
}

/** Forget the current session entirely (used when the user starts fresh). */
export async function discardSession(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const { releaseSession } = await import("../editor/session");
  const pid = session.projectId;
  releaseSession();
  useEditor.getState().closeDocument();
  setLastProjectId(null);
  setSaveState("idle");
  if (pid) void deleteProjectById(pid).catch(() => undefined);
}
