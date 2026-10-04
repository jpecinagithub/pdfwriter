import { describe, expect, it } from "vitest";
import { buildExportFileName, sanitizeFileName } from "./filename";

describe("buildExportFileName", () => {
  it("appends -edited before the extension", () => {
    expect(buildExportFileName("contract.pdf")).toBe("contract-edited.pdf");
  });
  it("is idempotent on an existing -edited suffix", () => {
    expect(buildExportFileName("contract-edited.pdf")).toBe("contract-edited.pdf");
    expect(buildExportFileName("contract-edited-edited.pdf")).toBe("contract-edited.pdf");
  });
  it("adds the .pdf extension when missing", () => {
    expect(buildExportFileName("notes")).toBe("notes-edited.pdf");
  });
  it("falls back to document for empty names", () => {
    expect(buildExportFileName("")).toBe("document-edited.pdf");
    expect(buildExportFileName(".pdf")).toBe("document-edited.pdf");
  });
  it("strips path components", () => {
    expect(sanitizeFileName("C:\\fakepath\\a.pdf")).toBe("a.pdf");
    expect(buildExportFileName("/tmp/a.pdf")).toBe("a-edited.pdf");
  });
});
