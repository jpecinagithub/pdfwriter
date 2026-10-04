/**
 * SignatureDialog — create a signature by drawing, typing (handwriting
 * fonts) or uploading a PNG. On confirm the signature is registered as an
 * image blob and handed to the editing layer via session.pendingPlacement.
 */
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { useEditor } from "../../editor/store";
import { registerImageBlob, session } from "../../editor/session";
import { HAND_STYLE_FONTS } from "../../editor/tools";
import type { HandStyle } from "../../types/editor";

type Tab = "draw" | "type" | "upload";

const SIGN_COLOR = "#1e3a8a";
const DRAW_W = 440;
const DRAW_H = 160;

export default function SignatureDialog(): React.ReactElement | null {
  const signatureDialogOpen = useEditor((s) => s.signatureDialogOpen);
  const setSignatureDialogOpen = useEditor((s) => s.setSignatureDialogOpen);
  const setActiveTool = useEditor((s) => s.setActiveTool);

  const [tab, setTab] = useState<Tab>("draw");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typeText, setTypeText] = useState("");
  const [typeStyle, setTypeStyle] = useState<HandStyle>("signature");
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Reset when the dialog opens; revoke the upload URL when it closes.
  useEffect(() => {
    if (!signatureDialogOpen) return;
    setTab("draw");
    setHasDrawn(false);
    setTypeText("");
    setTypeStyle("signature");
    setPlacing(false);
    return () => {
      setUploadUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
      setUploadName(null);
    };
  }, [signatureDialogOpen]);

  // White background for the draw canvas.
  useEffect(() => {
    if (!signatureDialogOpen || tab !== "draw") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [signatureDialogOpen, tab]);

  if (!signatureDialogOpen) return null;

  const close = (): void => {
    if (!placing) setSignatureDialogOpen(false);
  };

  const canvasPos = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = canvas ? canvas.width / rect.width : 1;
    const sy = canvas ? canvas.height / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const paintCtx = (ctx: CanvasRenderingContext2D): void => {
    ctx.strokeStyle = SIGN_COLOR;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    paintCtx(ctx);
    const { x, y } = canvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
    setHasDrawn(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = canvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onPointerUp = (): void => {
    drawingRef.current = false;
  };

  const clearDraw = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleUploadFile = (file: File | undefined): void => {
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    if (!file) {
      setUploadUrl(null);
      setUploadName(null);
      return;
    }
    setUploadUrl(URL.createObjectURL(file));
    setUploadName(file.name);
  };

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read the uploaded image."));
      img.src = src;
    });

  const buildCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (tab === "draw") {
      return canvasRef.current;
    }
    if (tab === "type") {
      const canvas = document.createElement("canvas");
      canvas.width = DRAW_W;
      canvas.height = DRAW_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const family = HAND_STYLE_FONTS[typeStyle].family;
      try {
        await document.fonts.load(`64px ${family}`, typeText.trim());
      } catch {
        /* fall back to whatever font is available */
      }
      ctx.fillStyle = SIGN_COLOR;
      ctx.font = `64px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typeText.trim(), canvas.width / 2, canvas.height / 2 + 4);
      return canvas;
    }
    if (!uploadUrl) return null;
    const img = await loadImage(uploadUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas;
  };

  const place = async (): Promise<void> => {
    setPlacing(true);
    try {
      const canvas = await buildCanvas();
      if (!canvas) return;
      const out: HTMLCanvasElement = canvas;
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
      if (!blob) return;
      let w = out.width;
      let h = out.height;
      if (w > 600) {
        const scale = 600 / w;
        w = 600;
        h = Math.max(1, Math.round(h * scale));
      }
      const { id } = registerImageBlob(blob);
      session.pendingPlacement = { kind: "signature", imageId: id, naturalWidth: w, naturalHeight: h };
      setSignatureDialogOpen(false);
      setActiveTool("signature");
    } finally {
      setPlacing(false);
    }
  };

  const canPlace = tab === "draw" ? hasDrawn : tab === "type" ? typeText.trim().length > 0 : uploadUrl !== null;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "draw", label: "Draw" },
    { id: "type", label: "Type" },
    { id: "upload", label: "Upload" },
  ];

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
        aria-label="Create signature"
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-zinc-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">Create signature</h2>
          <button
            type="button"
            aria-label="Close signature dialog"
            onClick={close}
            disabled={placing}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div role="tablist" aria-label="Signature method" className="flex gap-1 rounded-xl bg-zinc-100 p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  tab === t.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4">
          {tab === "draw" && (
            <div>
              <canvas
                ref={canvasRef}
                width={DRAW_W}
                height={DRAW_H}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                className="w-full rounded-xl border border-zinc-300 bg-white cursor-crosshair touch-none"
                aria-label="Draw your signature"
                role="img"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={clearDraw}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {tab === "type" && (
            <div>
              <label htmlFor="sig-type-input" className="block text-sm font-medium text-zinc-700">
                Your name
              </label>
              <input
                id="sig-type-input"
                type="text"
                value={typeText}
                onChange={(e) => setTypeText(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <label htmlFor="sig-style-select" className="mt-3 block text-sm font-medium text-zinc-700">
                Style
              </label>
              <select
                id="sig-style-select"
                value={typeStyle}
                onChange={(e) => setTypeStyle(e.target.value as HandStyle)}
                className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {(Object.entries(HAND_STYLE_FONTS) as Array<[HandStyle, (typeof HAND_STYLE_FONTS)[HandStyle]]>).map(
                  ([key, def]) => (
                    <option key={key} value={key}>
                      {def.label}
                    </option>
                  ),
                )}
              </select>
              <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-4 py-5 text-center min-h-20">
                <span
                  style={{ fontFamily: HAND_STYLE_FONTS[typeStyle].family, fontSize: 32, color: SIGN_COLOR }}
                  aria-hidden="true"
                >
                  {typeText.trim() || "Your signature"}
                </span>
              </div>
            </div>
          )}

          {tab === "upload" && (
            <div>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  handleUploadFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-zinc-300 px-4 py-8 text-sm font-medium text-zinc-600 hover:border-blue-400 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {uploadName ? "Choose a different PNG" : "Choose a transparent PNG"}
              </button>
              {uploadUrl && (
                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center">
                  <img src={uploadUrl} alt={uploadName ?? "Uploaded signature"} className="mx-auto max-h-32" />
                  <p className="mt-2 truncate text-xs text-zinc-500" title={uploadName ?? undefined}>
                    {uploadName}
                  </p>
                </div>
              )}
              <p className="mt-2 text-xs text-zinc-500">Transparent PNGs work best.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-200">
          <button
            type="button"
            onClick={close}
            disabled={placing}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void place()}
            disabled={!canPlace || placing}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            {placing && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Place signature
          </button>
        </div>
      </div>
    </div>
  );
}
