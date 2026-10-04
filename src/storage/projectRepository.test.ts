import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { closePdfWriterDb, DB_NAME, type PersistedProject } from "./database";
import {
  collectProjectBlobIds,
  deleteBlobs,
  deleteProject,
  getBlob,
  getProject,
  putBlob,
  saveProject,
} from "./projectRepository";
import type { PdfEdit } from "../types/editor";
import type { PageMeta } from "../types/pdf";

beforeEach(async () => {
  closePdfWriterDb();
  await deleteDB(DB_NAME);
});

function makeEdit(pageId: string, n: number): PdfEdit {
  return {
    id: `edit-${n}`,
    type: "text",
    pageId,
    x: 10,
    y: 20,
    width: 200,
    height: 40,
    rotation: 0,
    opacity: 1,
    createdAt: Date.now(),
    z: n,
    text: `hello ${n}`,
    fontFamily: "Helvetica",
    fontSize: 12,
    bold: false,
    italic: false,
    underline: false,
    color: "#1a1a1a",
    align: "left",
    lineHeight: 1.2,
  };
}

function makePage(n: number): PageMeta {
  return {
    id: `p_${n}`,
    source: "original",
    sourcePageIndex: n,
    width: 595.28,
    height: 841.89,
    rotation: 0,
    intrinsicRotation: 0,
  };
}

function makeProject(): PersistedProject {
  const now = Date.now();
  return {
    id: "project-1",
    originalFileName: "contract.pdf",
    edits: [makeEdit("p_0", 1), makeEdit("p_1", 2)],
    pages: [makePage(0), makePage(1)],
    createdAt: now,
    updatedAt: now,
  };
}

describe("projectRepository", () => {
  it("save/get round-trip preserves edits and pages (no binary in record)", async () => {
    const project = makeProject();
    await saveProject(project, [
      { id: "blob-original", kind: "original-pdf", blob: new Blob(["pdf"], { type: "application/pdf" }) },
      { id: "blob-image-1", kind: "image", blob: new Blob(["png"], { type: "image/png" }) },
    ]);

    const loaded = await getProject(project.id);
    expect(loaded).toBeDefined();
    expect(loaded?.originalFileName).toBe("contract.pdf");
    expect(loaded?.edits).toHaveLength(2);
    expect(loaded?.edits[0]).toMatchObject({ type: "text", text: "hello 1" });
    expect(loaded?.pages).toHaveLength(2);
    expect(loaded?.pages[0]).toMatchObject({ id: "p_0", width: 595.28 });

    const blob = await getBlob("blob-original");
    expect(await blob?.text()).toBe("pdf");
    const image = await getBlob("blob-image-1");
    expect(image?.type).toBe("image/png");
  });

  it("re-saving overwrites and refreshes updatedAt", async () => {
    const project = makeProject();
    await saveProject(project);
    const first = await getProject(project.id);
    const updated = { ...project, originalFileName: "renamed.pdf" };
    await saveProject(updated);
    const second = await getProject(project.id);
    expect(second?.originalFileName).toBe("renamed.pdf");
    expect(second?.updatedAt).toBeGreaterThanOrEqual(first!.updatedAt);
  });

  it("deleteProject removes the record and its blobs", async () => {
    const project = makeProject();
    await saveProject(project, [
      { id: "blob-original", kind: "original-pdf", blob: new Blob(["pdf"]) },
    ]);
    await deleteProject(project.id, ["blob-original"]);

    expect(await getProject(project.id)).toBeUndefined();
    expect(await getBlob("blob-original")).toBeUndefined();
  });

  it("getBlob returns undefined for a missing id", async () => {
    expect(await getBlob("does-not-exist")).toBeUndefined();
  });

  it("putBlob/deleteBlobs round-trip", async () => {
    await putBlob("sig-1", "signature", new Blob(["sig"]));
    expect(await (await getBlob("sig-1"))?.text()).toBe("sig");
    await deleteBlobs(["sig-1"]);
    expect(await getBlob("sig-1")).toBeUndefined();
  });

  it("collectProjectBlobIds finds image/signature references", async () => {
    const project = makeProject();
    project.edits.push({
      id: "edit-img",
      type: "image",
      pageId: "p_0",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 0,
      opacity: 1,
      createdAt: Date.now(),
      z: 3,
      imageId: "img-abc",
      naturalWidth: 100,
      naturalHeight: 50,
    });
    expect(collectProjectBlobIds(project)).toEqual(["img-abc"]);
  });
});
