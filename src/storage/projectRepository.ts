/**
 * Autosaved editing-session repository.
 *
 * The `projects` record holds only serializable edit state (edits, page
 * metadata) — never binary data. Binary payloads (original PDF bytes,
 * appended documents, inserted images, saved signatures) live in the `blobs`
 * store and are written in the same transaction as the project record, so a
 * project can never be saved with dangling binary references.
 */

import {
  indexedDbBinaryStore,
  openPdfWriterDb,
  type BinaryStore,
  type BlobKind,
  type PersistedProject,
  type ProjectRecord,
} from "./database";

export type { BlobKind };

/** A binary payload that travels with a project save. */
export interface ProjectBlobInput {
  id: string;
  kind: BlobKind;
  blob: Blob;
}

function toRecord(project: PersistedProject): ProjectRecord {
  return {
    id: project.id,
    originalFileName: project.originalFileName,
    edits: project.edits,
    pages: project.pages,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function fromRecord(record: ProjectRecord): PersistedProject {
  return {
    id: record.id,
    originalFileName: record.originalFileName,
    edits: record.edits,
    pages: record.pages,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Save (insert or replace) a project and its binary payloads atomically.
 * `updatedAt` is refreshed to now.
 */
export async function saveProject(
  project: PersistedProject,
  blobs: readonly ProjectBlobInput[] = [],
): Promise<void> {
  const db = await openPdfWriterDb();
  const tx = db.transaction(["projects", "blobs"], "readwrite");
  const now = Date.now();
  await tx.objectStore("projects").put(toRecord({ ...project, updatedAt: now }));
  for (const b of blobs) {
    await tx
      .objectStore("blobs")
      .put({ id: b.id, kind: b.kind, blob: b.blob, createdAt: now });
  }
  await tx.done;
}

/** Load a project by id, or undefined when it does not exist. */
export async function getProject(id: string): Promise<PersistedProject | undefined> {
  const db = await openPdfWriterDb();
  const record = await db.get("projects", id);
  return record ? fromRecord(record) : undefined;
}

/**
 * Delete a project and every blob referenced by it.
 * Pass the ids of the project's binary payloads (imageId/signature/imageId
 * values from edits, plus the original/appended document blob ids) so no
 * orphaned bytes remain.
 */
export async function deleteProject(id: string, blobIds: readonly string[] = []): Promise<void> {
  const db = await openPdfWriterDb();
  const tx = db.transaction(["projects", "blobs"], "readwrite");
  await tx.objectStore("projects").delete(id);
  for (const blobId of blobIds) {
    await tx.objectStore("blobs").delete(blobId);
  }
  await tx.done;
}

/** Fetch one binary payload, or undefined when missing. */
export async function getBlob(id: string): Promise<Blob | undefined> {
  return indexedDbBinaryStore.getBlob(id);
}

/** Store one binary payload. */
export async function putBlob(id: string, kind: BlobKind, blob: Blob): Promise<void> {
  return indexedDbBinaryStore.putBlob(id, kind, blob);
}

/** Delete binary payloads by id. */
export async function deleteBlobs(ids: readonly string[]): Promise<void> {
  return indexedDbBinaryStore.deleteBlobs(ids);
}

/**
 * Extract every blob id referenced by a project's edits (images +
 * signatures). The project record itself does not track them, so callers
 * use this when deleting a project to avoid orphaned bytes.
 */
export function collectProjectBlobIds(project: PersistedProject): string[] {
  const ids = new Set<string>();
  for (const edit of project.edits) {
    if (edit.type === "image" || edit.type === "signature") {
      ids.add(edit.imageId);
    }
  }
  return [...ids];
}

/** The shared BinaryStore implementation (swap for OPFS later if needed). */
export const binaryStore: BinaryStore = indexedDbBinaryStore;
