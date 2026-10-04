/**
 * BottomToolbar — tool palette (bottom bar) built from the TOOLS registry.
 * Image picking and the signature dialog are handled here; everything else
 * simply activates the tool in the editor store.
 */
import { useRef, useState } from "react";
import {
  Brush,
  Circle,
  Eraser,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pen,
  PenLine,
  PenTool,
  Replace,
  Square,
  Squircle,
  Stamp,
  StickyNote,
  Type,
} from "lucide-react";
import { useEditor } from "../editor/store";
import { registerImageBlob, session } from "../editor/session";
import { TOOLS, type ToolDef, type ToolId } from "../editor/tools";
import type { ShapeKind } from "../types/editor";

type IconComponent = typeof MousePointer2;

const TOOL_ICONS: Record<ToolId, IconComponent> = {
  select: MousePointer2,
  text: Type,
  handwritten: PenLine,
  replace: Replace,
  highlight: Highlighter,
  whiteout: Eraser,
  pen: Pen,
  marker: Brush,
  note: StickyNote,
  shape: Square,
  image: ImagePlus,
  signature: PenTool,
  stamp: Stamp,
};

const SHAPE_SUBTYPES: Array<{ kind: ShapeKind; label: string; Icon: IconComponent }> = [
  { kind: "rect", label: "Rectangle", Icon: Square },
  { kind: "roundRect", label: "Rounded rectangle", Icon: Squircle },
  { kind: "ellipse", label: "Ellipse", Icon: Circle },
  { kind: "line", label: "Line", Icon: Minus },
  { kind: "arrow", label: "Arrow", Icon: MoveUpRight },
];

const MAX_IMAGE_DIM = 1200;

async function fileToPngBlob(file: File): Promise<{ blob: Blob; width: number; height: number } | null> {
  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const longest = Math.max(width, height);
    if (longest > MAX_IMAGE_DIM) {
      const scale = MAX_IMAGE_DIM / longest;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? { blob, width, height } : null;
  } finally {
    bitmap.close();
  }
}

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: ToolDef;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  const Icon = TOOL_ICONS[tool.id];
  const title = `${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""} — ${tool.hint}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={tool.label}
      aria-pressed={active}
      className={`flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 min-w-14 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        active ? "bg-blue-600 text-white hover:bg-blue-600 hover:text-white shadow-sm" : ""
      }`}
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
      <span className="text-[10px] font-medium leading-none">{tool.label}</span>
    </button>
  );
}

export default function BottomToolbar(): React.ReactElement {
  const activeTool = useEditor((s) => s.activeTool);
  const setActiveTool = useEditor((s) => s.setActiveTool);
  const patchToolOptions = useEditor((s) => s.patchToolOptions);
  const setSignatureDialogOpen = useEditor((s) => s.setSignatureDialogOpen);
  const shapeKind = useEditor((s) => s.toolOptions.shape.kind);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const handleImageFile = async (file: File): Promise<void> => {
    setImageError(null);
    try {
      const converted = await fileToPngBlob(file);
      if (!converted) {
        setImageError("Could not read that image.");
        return;
      }
      const { id } = registerImageBlob(converted.blob);
      session.pendingPlacement = {
        kind: "image",
        imageId: id,
        naturalWidth: converted.width,
        naturalHeight: converted.height,
      };
      setActiveTool("image");
    } catch {
      setImageError("Could not read that image.");
    }
  };

  const handleToolClick = (tool: ToolDef): void => {
    if (tool.id === "image") {
      imageInputRef.current?.click();
      return;
    }
    if (tool.id === "signature") {
      setSignatureDialogOpen(true);
      return;
    }
    setActiveTool(tool.id);
  };

  const activeDef = TOOLS.find((t) => t.id === activeTool);

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.04)] z-30">
      <div className="flex items-stretch justify-center gap-0.5 px-2 py-2 overflow-x-auto">
        {TOOLS.map((tool) => {
          const isShape = tool.id === "shape";
          const active = activeTool === tool.id;
          const button = (
            <ToolButton key={tool.id} tool={tool} active={active} onClick={() => handleToolClick(tool)} />
          );
          if (!isShape) return button;
          return (
            <div key={tool.id} className="relative">
              {button}
              {active && (
                <div
                  role="toolbar"
                  aria-label="Shape type"
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
                >
                  {SHAPE_SUBTYPES.map(({ kind, label, Icon }) => (
                    <button
                      key={kind}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={shapeKind === kind}
                      onClick={() => patchToolOptions("shape", { kind })}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        shapeKind === kind ? "bg-blue-100 text-blue-700" : ""
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImageFile(file);
          e.target.value = "";
        }}
      />
      <div className="flex items-center justify-center gap-3 border-t border-zinc-100 px-4 py-1">
        <p className="text-[11px] text-zinc-500" aria-live="polite">
          {activeDef ? activeDef.hint : ""}
        </p>
        {imageError && (
          <p role="alert" className="text-[11px] text-red-600">
            {imageError}
          </p>
        )}
      </div>
    </div>
  );
}
