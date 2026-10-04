/**
 * EditObject — DOM rendering of a single overlay edit.
 *
 * The wrapper is the UNROTATED box at (x, y, w, h) in display space;
 * rotation is applied via CSS transform about the center — exactly matching
 * the export math (rotation about the unrotated box center).
 */
import { memo } from "react";
import type {
  FreehandEdit,
  HandwrittenEdit,
  HighlightEdit,
  ImageEdit,
  NoteEdit,
  PdfEdit,
  ShapeEdit,
  SignatureEdit,
  StampEdit,
  TextEdit,
  WhiteoutEdit,
} from "../types/editor";
import { HAND_STYLE_FONTS, NOTE_COLORS } from "../editor/tools";
import { getImageUrl } from "../editor/session";
import { pointsToSvgPath } from "../utils/pathSmoothing";

function Wrapper({
  edit,
  scale,
  children,
  extraStyle,
}: {
  edit: PdfEdit;
  scale: number;
  children?: React.ReactNode;
  extraStyle?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      data-edit-id={edit.id}
      className="absolute"
      style={{
        left: edit.x * scale,
        top: edit.y * scale,
        width: Math.max(1, edit.width * scale),
        height: Math.max(1, edit.height * scale),
        transform: edit.rotation ? `rotate(${edit.rotation}deg)` : undefined,
        transformOrigin: "center",
        opacity: edit.opacity,
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

function TextView({ edit, scale }: { edit: TextEdit; scale: number }): React.ReactElement {
  return (
    <Wrapper edit={edit} scale={scale}>
      <div
        style={{
          fontFamily: edit.fontFamily,
          fontSize: edit.fontSize * scale,
          lineHeight: edit.lineHeight,
          fontWeight: edit.bold ? 700 : 400,
          fontStyle: edit.italic ? "italic" : "normal",
          textDecoration: edit.underline ? "underline" : "none",
          color: edit.color,
          textAlign: edit.align,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minHeight: "100%",
        }}
      >
        {edit.text || " "}
      </div>
    </Wrapper>
  );
}

function HandwrittenView({ edit, scale }: { edit: HandwrittenEdit; scale: number }): React.ReactElement {
  const style = HAND_STYLE_FONTS[edit.handStyle];
  return (
    <Wrapper edit={edit} scale={scale}>
      <div
        style={{
          fontFamily: style.family,
          fontSize: edit.fontSize * scale,
          lineHeight: 1.15,
          color: edit.color,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minHeight: "100%",
        }}
      >
        {edit.text || " "}
      </div>
    </Wrapper>
  );
}

function HighlightView({ edit, scale }: { edit: HighlightEdit; scale: number }): React.ReactElement {
  return (
    <Wrapper
      edit={edit}
      scale={scale}
      extraStyle={{ backgroundColor: edit.color, mixBlendMode: "multiply", borderRadius: 2 }}
    />
  );
}

function WhiteoutView({ edit, scale }: { edit: WhiteoutEdit; scale: number }): React.ReactElement {
  return (
    <Wrapper edit={edit} scale={scale} extraStyle={{ backgroundColor: edit.color }} />
  );
}

function FreehandView({ edit, scale }: { edit: FreehandEdit; scale: number }): React.ReactElement {
  const d = pointsToSvgPath(
    edit.points.map((p) => ({ x: p.x - edit.x, y: p.y - edit.y })),
    scale,
  );
  return (
    <div data-edit-id={edit.id} className="absolute" style={{ left: 0, top: 0, opacity: edit.opacity }}>
      <svg
        style={{
          position: "absolute",
          left: edit.x * scale,
          top: edit.y * scale,
          overflow: "visible",
          mixBlendMode: edit.highlighter ? "multiply" : undefined,
        }}
        width={Math.max(1, edit.width * scale)}
        height={Math.max(1, edit.height * scale)}
      >
        <path
          d={d}
          fill="none"
          stroke={edit.color}
          strokeWidth={Math.max(0.5, edit.thickness * scale)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function NoteView({ edit, scale }: { edit: NoteEdit; scale: number }): React.ReactElement {
  const color = NOTE_COLORS.find((c) => c.key === edit.color)?.bg ?? "#fef08a";
  const s = 26 * scale;
  return (
    <div
      data-edit-id={edit.id}
      className="absolute"
      style={{
        left: edit.x * scale,
        top: edit.y * scale,
        width: s,
        height: s,
        transform: edit.rotation ? `rotate(${edit.rotation}deg)` : undefined,
        opacity: edit.opacity,
        cursor: "pointer",
      }}
      title={edit.text ? edit.text.slice(0, 120) : "Sticky note"}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${color} 0%, ${color} 82%, rgba(0,0,0,0.18) 82%, rgba(0,0,0,0.18) 100%)`,
          boxShadow: "0 2px 5px rgba(0,0,0,0.25)",
          borderRadius: 2,
        }}
      />
    </div>
  );
}

function ShapeView({ edit, scale }: { edit: ShapeEdit; scale: number }): React.ReactElement {
  const w = Math.max(1, edit.width * scale);
  const h = Math.max(1, edit.height * scale);
  const stroke = edit.strokeColor;
  const sw = Math.max(0.5, edit.thickness * scale);
  const fill = edit.fillColor === "transparent" ? "none" : edit.fillColor;
  const dash = edit.dashed ? `${6 * scale} ${4 * scale}` : undefined;
  let body: React.ReactNode = null;
  switch (edit.shape) {
    case "rect":
      body = <rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />;
      break;
    case "roundRect":
      body = <rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} rx={10 * scale} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />;
      break;
    case "ellipse":
      body = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - sw / 2} ry={h / 2 - sw / 2} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />;
      break;
    case "line":
      body = <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" />;
      break;
    case "arrow": {
      const headLen = Math.min(14 * scale, w * 0.3);
      const headW = headLen * 0.55;
      body = (
        <g>
          <line x1={0} y1={h / 2} x2={w - headLen} y2={h / 2} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" />
          <polygon
            points={`${w - headLen},${h / 2 - headW} ${w},${h / 2} ${w - headLen},${h / 2 + headW}`}
            fill={stroke}
          />
        </g>
      );
      break;
    }
  }
  return (
    <Wrapper edit={edit} scale={scale}>
      <svg width={w} height={h} style={{ overflow: "visible", display: "block" }}>
        {body}
      </svg>
    </Wrapper>
  );
}

function ImageView({ edit, scale }: { edit: ImageEdit | SignatureEdit; scale: number }): React.ReactElement {
  const url = getImageUrl(edit.imageId);
  return (
    <Wrapper edit={edit} scale={scale}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="pw-no-select"
          style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-200 text-[10px] text-zinc-500">
          Image unavailable
        </div>
      )}
    </Wrapper>
  );
}

function StampView({ edit, scale }: { edit: StampEdit; scale: number }): React.ReactElement {
  const w = edit.width * scale;
  const h = edit.height * scale;
  const size = Math.min(h * 0.42, (w * 0.8) / Math.max(1, edit.label.length * 0.62));
  return (
    <Wrapper edit={edit} scale={scale}>
      <div
        className="flex h-full w-full items-center justify-center"
        style={{
          border: `${Math.max(2, 3 * scale)}px solid ${edit.color}`,
          borderRadius: 6 * scale,
          color: edit.color,
          fontWeight: 800,
          fontSize: Math.max(6, size),
          letterSpacing: 1,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {edit.label}
      </div>
    </Wrapper>
  );
}

export const EditObject = memo(function EditObject({
  edit,
  scale,
}: {
  edit: PdfEdit;
  scale: number;
}): React.ReactElement | null {
  switch (edit.type) {
    case "text":
      return <TextView edit={edit} scale={scale} />;
    case "handwritten":
      return <HandwrittenView edit={edit} scale={scale} />;
    case "highlight":
      return <HighlightView edit={edit} scale={scale} />;
    case "whiteout":
      return <WhiteoutView edit={edit} scale={scale} />;
    case "freehand":
      return <FreehandView edit={edit} scale={scale} />;
    case "note":
      return <NoteView edit={edit} scale={scale} />;
    case "shape":
      return <ShapeView edit={edit} scale={scale} />;
    case "image":
    case "signature":
      return <ImageView edit={edit} scale={scale} />;
    case "stamp":
      return <StampView edit={edit} scale={scale} />;
    default:
      return null;
  }
});
