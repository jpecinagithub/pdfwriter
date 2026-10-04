/**
 * PDFWriter IndexedDB schema + connection.
 *
 * All PDFWriter persistence is local-only: PDFs and project state live in
 * IndexedDB, never in localStorage and never on a server.
 *
 * Stores:
 * - `history`  — exported-PDF history entries (metadata + Blob + thumbnail)
 * - `projects` — autosaved editing sessions (serializable edit state only,
 *                NO binary data — see §3 below)
 * - `blobs`    — generic binary store: original project PDFs, appended PDFs,
 *                inserted images, saved signatures
 * - `settings` — small key/value preferences
 *
 * ## OPFS migration path (design note)
 *
 * The binary bytes are accessed only through the {@link BinaryStore}
 * interface. IndexedDB currently holds both metadata and Blob values. A
 * future version can move the *binary payloads* to the Origin Private File
 * System (OPFS) without rewriting the editor: keep metadata rows in
 * IndexedDB (name, kind, createdAt, an `opfsPath` reference) and implement
 * `BinaryStore` against OPFS file handles instead of the `blobs` object
 * store. Nothing in the editing/export code depends on *where* the bytes
 * live, only on the put/get/delete contract.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PdfEdit, PdfProjectData } from "../types/editor";
import type { PageMeta } from "../types/pdf";

/** Binary payload kinds tracked by the blob store. */
export type BlobKind = "original-pdf" | "appended-pdf" | "image" | "signature";

/** Row in the `blobs` object store. */
export interface BlobRecord {
  id: string;
  kind: BlobKind;
  blob: Blob;
  createdAt: number;
}

/** Row in the `projects` object store — serializable state only. */
export interface ProjectRecord {
  id: string;
  originalFileName: string;
  edits: PdfEdit[];
  pages: PageMeta[];
  createdAt: number;
  updatedAt: number;
}

/** Serializable subset of a project used when reading/writing. */
export type PersistedProject = Pick<
  PdfProjectData,
  "id" | "originalFileName" | "edits" | "pages" | "createdAt" | "updatedAt"
>;

/** Row in the `settings` object store. */
export interface SettingRecord {
  key: string;
  value: unknown;
}

/** Row in the `history` object store (full shape lives in historyRepository). */
export interface HistoryRecord {
  id: string;
  fileName: string;
  originalFileName: string;
  pdfBlob: Blob;
  createdAt: number;
  fileSize: number;
  pageCount: number;
  thumbnail?: Blob;
}

export interface PdfWriterDB extends DBSchema {
  history: {
    key: string;
    value: HistoryRecord;
    indexes: { "by-created": number };
  };
  projects: {
    key: string;
    value: ProjectRecord;
    indexes: { "by-updated": number };
  };
  blobs: {
    key: string;
    value: BlobRecord;
  };
  settings: {
    key: string;
    value: SettingRecord;
  };
}

export const DB_NAME = "pdfwriter-db";
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PdfWriterDB>> | null = null;

/**
 * Open (or reuse) the PDFWriter IndexedDB database.
 * Upgrade is idempotent: stores/indexes are only created when missing.
 */
export function openPdfWriterDb(): Promise<IDBPDatabase<PdfWriterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PdfWriterDB>(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains("history")) {
          const history = db.createObjectStore("history", { keyPath: "id" });
          history.createIndex("by-created", "createdAt", { unique: false });
        } else if (!tx.objectStore("history").indexNames.contains("by-created")) {
          tx
            .objectStore("history")
            .createIndex("by-created", "createdAt", { unique: false });
        }

        if (!db.objectStoreNames.contains("projects")) {
          const projects = db.createObjectStore("projects", { keyPath: "id" });
          projects.createIndex("by-updated", "updatedAt", { unique: false });
        } else if (!tx.objectStore("projects").indexNames.contains("by-updated")) {
          tx
            .objectStore("projects")
            .createIndex("by-updated", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs", { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

/** Close the cached connection (mainly for tests). */
export function closePdfWriterDb(): void {
  if (dbPromise) {
    void dbPromise.then((db) => db.close());
    dbPromise = null;
  }
}

/**
 * Abstract binary store: put/get/delete binary payloads by id.
 *
 * All consumers (export pipeline, project loader, signature manager) talk to
 * blobs through this interface — never by reaching into the object store
 * directly. To migrate binaries to OPFS later, reimplement this interface
 * against OPFS file handles while keeping metadata in IndexedDB.
 */
export interface BinaryStore {
  putBlob(id: string, kind: BlobKind, blob: Blob): Promise<void>;
  getBlob(id: string): Promise<Blob | undefined>;
  deleteBlobs(ids: readonly string[]): Promise<void>;
}

/** BinaryStore backed by the IndexedDB `blobs` object store (v1 default). */
export const indexedDbBinaryStore: BinaryStore = {
  async putBlob(id, kind, blob): Promise<void> {
    const db = await openPdfWriterDb();
    await db.put("blobs", { id, kind, blob, createdAt: Date.now() });
  },

  async getBlob(id): Promise<Blob | undefined> {
    const db = await openPdfWriterDb();
    const record = await db.get("blobs", id);
    return record?.blob;
  },

  async deleteBlobs(ids): Promise<void> {
    if (ids.length === 0) return;
    const db = await openPdfWriterDb();
    const tx = db.transaction("blobs", "readwrite");
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  },
};
