/**
 * PropertiesPanel — the right inspector.
 *
 * - Nothing selected: document info + active tool options + page tools
 *   (page numbers, watermark, header/footer generators).
 * - One edit selected: full property controls for its type.
 * - Several selected: batch actions.
 *
 * Sliders use checkpoint-on-pointerdown + transient patch so a drag is a
 * single undo step.
 */
import { memo, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Italic,
  Trash2,
  Underline,
} from "lucide-react";
import { getEditById, useEditor } from "../editor/store";
import {
  HAND_STYLE_FONTS,
  HIGHLIGHT_COLORS,
  NOTE_COLORS,
  STAMP_PRESETS,
  TEXT_FONTS,
  type ToolId,
} from "../editor/tools";
import type { HandwrittenEdit, PdfEdit, ShapeEdit, TextAlign } from "../types/editor";
import { addHeaderFooter, addPageNumbers, addWatermark, type PageNumberPosition } from "../editor/generators";

// ---------------------------------------------------------------------------
// tiny controls
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onTransient,
  onBegin,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onTransient: (v: number) => void;
  onBegin: () => void;
  ariaLabel: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        className="pw-focus w-full accent-blue-600"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onBegin}
        onChange={(e) => onTransient(Number(e.target.value))}
      />
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-600">
        {Math.round(value * 10) / 10}
      </span>
    </div>
  );
}

function Num({
  value,
  onCommit,
  min,
  max,
  step,
  ariaLabel,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
}): React.ReactElement {
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs"
      value={Math.round(value * 10) / 10}
      min={min}
      max={max}
      step={step ?? 1}
      onBlur={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
    />
  );
}

function ColorDot({
  color,
  selected,
  onPick,
  label,
}: {
  color: string;
  selected?: boolean;
  onPick: () => void;
  label: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onPick}
      className={`h-7 w-7 rounded-full border border-black/15 ${selected ? "ring-2 ring-blue-600 ring-offset-1" : ""}`}
      style={{ backgroundColor: color }}
    />
  );
}

function IconBtn({
  title,
  onClick,
  active,
  children,
  disabled,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`pw-focus rounded border p-1.5 ${
        active
          ? "border-blue-600 bg-blue-50 text-blue-700"
          : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="border-b border-zinc-200 px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// per-edit commit helpers
// ---------------------------------------------------------------------------

function useEditCommit(id: string) {
  const begin = () => useEditor.getState().checkpoint();
  const patch = (p: Partial<PdfEdit>) => useEditor.getState().patchEdit(id, p);
  const commit = (p: Partial<PdfEdit>) => useEditor.getState().commitEdit(id, p);
  return { begin, patch, commit };
}

// ---------------------------------------------------------------------------
// single-edit panels
// ---------------------------------------------------------------------------

function ZOrderControls({ ids }: { ids: string[] }): React.ReactElement {
  const reorderZ = useEditor((s) => s.reorderZ);
  return (
    <Row label="Arrange">
      <div className="flex gap-1">
        <IconBtn title="Bring to front" onClick={() => reorderZ(ids, "front")}><ChevronsUp size={15} /></IconBtn>
        <IconBtn title="Bring forward" onClick={() => reorderZ(ids, "forward")}><ChevronUp size={15} /></IconBtn>
        <IconBtn title="Send backward" onClick={() => reorderZ(ids, "backward")}><ChevronDown size={15} /></IconBtn>
        <IconBtn title="Send to back" onClick={() => reorderZ(ids, "back")}><ChevronsDown size={15} /></IconBtn>
      </div>
    </Row>
  );
}

function DangerControls({ ids }: { ids: string[] }): React.ReactElement {
  const deleteEdits = useEditor((s) => s.deleteEdits);
  const duplicateEdits = useEditor((s) => s.duplicateEdits);
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => duplicateEdits(ids)}
        className="pw-focus flex flex-1 items-center justify-center gap-1.5 rounded border border-zinc-300 px-2 py-1.5 text-xs hover:bg-zinc-100"
      >
        <Copy size={13} /> Duplicate
      </button>
      <button
        type="button"
        onClick={() => deleteEdits(ids)}
        className="pw-focus flex flex-1 items-center justify-center gap-1.5 rounded border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
      >
        <Trash2 size={13} /> Delete
      </button>
    </div>
  );
}

function GeometryControls({ edit }: { edit: PdfEdit }): React.ReactElement {
  const { begin, patch, commit } = useEditCommit(edit.id);
  return (
    <>
      <Row label="Position & size (pt)">
        <div className="grid grid-cols-4 gap-1">
          <Num ariaLabel="X" value={edit.x} onCommit={(v) => commit({ x: v })} />
          <Num ariaLabel="Y" value={edit.y} onCommit={(v) => commit({ y: v })} />
          <Num ariaLabel="Width" value={edit.width} min={1} onCommit={(v) => commit({ width: Math.max(1, v) })} />
          <Num ariaLabel="Height" value={edit.height} min={1} onCommit={(v) => commit({ height: Math.max(1, v) })} />
        </div>
      </Row>
      <Row label="Rotation">
        <Slider value={edit.rotation} min={0} max={360} step={1} ariaLabel="Rotation" onBegin={begin} onTransient={(v) => patch({ rotation: v })} />
      </Row>
      <Row label="Opacity">
        <Slider value={edit.opacity} min={0} max={1} step={0.05} ariaLabel="Opacity" onBegin={begin} onTransient={(v) => patch({ opacity: v })} />
      </Row>
    </>
  );
}

function TextPanel({ edit }: { edit: Extract<PdfEdit, { type: "text" }> }): React.ReactElement {
  const { commit } = useEditCommit(edit.id);
  const aligns: Array<{ v: TextAlign; icon: React.ReactNode; label: string }> = [
    { v: "left", icon: <AlignLeft size={14} />, label: "Align left" },
    { v: "center", icon: <AlignCenter size={14} />, label: "Align center" },
    { v: "right", icon: <AlignRight size={14} />, label: "Align right" },
  ];
  return (
    <>
      <Row label="Text">
        <textarea
          value={edit.text}
          onChange={(e) => commit({ text: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          rows={3}
          className="pw-focus w-full rounded border border-zinc-300 p-1.5 text-sm"
        />
      </Row>
      <Row label="Font">
        <select
          value={edit.fontFamily}
          onChange={(e) => commit({ fontFamily: e.target.value })}
          className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs"
        >
          {TEXT_FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </Row>
      <Row label="Size">
        <Num ariaLabel="Font size" value={edit.fontSize} min={6} max={144} onCommit={(v) => commit({ fontSize: Math.min(144, Math.max(6, v)) })} />
      </Row>
      <Row label="Style">
        <div className="flex gap-1">
          <IconBtn title="Bold" active={edit.bold} onClick={() => commit({ bold: !edit.bold })}><Bold size={14} /></IconBtn>
          <IconBtn title="Italic" active={edit.italic} onClick={() => commit({ italic: !edit.italic })}><Italic size={14} /></IconBtn>
          <IconBtn title="Underline" active={edit.underline} onClick={() => commit({ underline: !edit.underline })}><Underline size={14} /></IconBtn>
          {aligns.map((a) => (
            <IconBtn key={a.v} title={a.label} active={edit.align === a.v} onClick={() => commit({ align: a.v })}>{a.icon}</IconBtn>
          ))}
        </div>
      </Row>
      <Row label="Color">
        <input
          type="color"
          value={edit.color}
          onChange={(e) => commit({ color: e.target.value })}
          className="pw-focus h-8 w-14 cursor-pointer rounded border border-zinc-300"
          aria-label="Text color"
        />
      </Row>
      <Row label="Line spacing">
        <Num ariaLabel="Line spacing" value={edit.lineHeight} min={0.8} max={3} step={0.05} onCommit={(v) => commit({ lineHeight: v })} />
      </Row>
      <GeometryControls edit={edit} />
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

function HandwrittenPanel({ edit }: { edit: Extract<PdfEdit, { type: "handwritten" }> }): React.ReactElement {
  const { commit } = useEditCommit(edit.id);
  return (
    <>
      <Row label="Text">
        <textarea
          value={edit.text}
          onChange={(e) => commit({ text: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          rows={3}
          className="pw-focus w-full rounded border border-zinc-300 p-1.5 text-sm"
          style={{ fontFamily: HAND_STYLE_FONTS[edit.handStyle].family }}
        />
      </Row>
      <Row label="Handwriting style">
        <select
          value={edit.handStyle}
          onChange={(e) => commit({ handStyle: e.target.value as HandwrittenEdit["handStyle"] })}
          className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs"
        >
          {Object.entries(HAND_STYLE_FONTS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </Row>
      <Row label="Size">
        <Num ariaLabel="Font size" value={edit.fontSize} min={8} max={120} onCommit={(v) => commit({ fontSize: v })} />
      </Row>
      <Row label="Color">
        <input type="color" value={edit.color} onChange={(e) => commit({ color: e.target.value })} className="pw-focus h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Ink color" />
      </Row>
      <GeometryControls edit={edit} />
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

function HighlightPanel({ edit }: { edit: Extract<PdfEdit, { type: "highlight" }> }): React.ReactElement {
  const { begin, patch, commit } = useEditCommit(edit.id);
  return (
    <>
      <Row label="Color">
        <div className="flex gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <ColorDot key={c} color={c} label={c} selected={edit.color === c} onPick={() => commit({ color: c })} />
          ))}
          <input type="color" value={edit.color} onChange={(e) => commit({ color: e.target.value })} className="h-7 w-7 cursor-pointer rounded-full border border-black/15" aria-label="Custom highlight color" title="Custom color" />
        </div>
      </Row>
      <Row label="Opacity">
        <Slider value={edit.opacity} min={0.1} max={1} step={0.05} ariaLabel="Highlight opacity" onBegin={begin} onTransient={(v) => patch({ opacity: v })} />
      </Row>
      <GeometryControls edit={edit} />
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

function WhiteoutPanel({ edit }: { edit: Extract<PdfEdit, { type: "whiteout" }> }): React.ReactElement {
  const { commit } = useEditCommit(edit.id);
  return (
    <>
      <Row label="Cover color">
        <input type="color" value={edit.color} onChange={(e) => commit({ color: e.target.value })} className="pw-focus h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Cover color" />
      </Row>
      <GeometryControls edit={edit} />
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

function FreehandPanel({ edit }: { edit: Extract<PdfEdit, { type: "freehand" }> }): React.ReactElement {
  const { begin, patch, commit } = useEditCommit(edit.id);
  return (
    <>
      <Row label="Color">
        <input type="color" value={edit.color} onChange={(e) => commit({ color: e.target.value })} className="pw-focus h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Stroke color" />
      </Row>
      <Row label="Thickness">
        <Slider value={edit.thickness} min={0.5} max={30} step={0.5} ariaLabel="Stroke thickness" onBegin={begin} onTransient={(v) => patch({ thickness: v })} />
      </Row>
      <Row label="Opacity">
        <Slider value={edit.opacity} min={0.1} max={1} step={0.05} ariaLabel="Stroke opacity" onBegin={begin} onTransient={(v) => patch({ opacity: v })} />
      </Row>
      <p className="text-xs text-zinc-500">{edit.highlighter ? "Highlighter pen (translucent)" : "Pen"}. Drag to move; freehand strokes can't be resized.</p>
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

function NotePanel({ edit }: { edit: Extract<PdfEdit, { type: "note" }> }): React.ReactElement {
  const { commit } = useEditCommit(edit.id);
  return (
    <>
      <Row label="Note">
        <textarea value={edit.text} onChange={(e) => commit({ text: e.target.value })} onKeyDown={(e) => e.stopPropagation()} rows={4} className="pw-focus w-full rounded border border-zinc-300 p-1.5 text-sm" />
      </Row>
      <Row label="Author">
        <input value={edit.author} onChange={(e) => commit({ author: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="Author (optional)" className="pw-focus w-full rounded border border-zinc-300 p-1.5 text-xs" />
      </Row>
      <Row label="Color">
        <div className="flex gap-1.5">
          {NOTE_COLORS.map((c) => (
            <ColorDot key={c.key} color={c.bg} label={c.label} selected={edit.color === c.key} onPick={() => commit({ color: c.key })} />
          ))}
        </div>
      </Row>
      <GeometryControls edit={edit} />
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

function ShapePanel({ edit }: { edit: Extract<PdfEdit, { type: "shape" }> }): React.ReactElement {
  const { begin, patch, commit } = useEditCommit(edit.id);
  const kinds: Array<{ v: ShapeEdit["shape"]; label: string }> = [
    { v: "rect", label: "Rectangle" },
    { v: "roundRect", label: "Rounded" },
    { v: "ellipse", label: "Ellipse" },
    { v: "line", label: "Line" },
    { v: "arrow", label: "Arrow" },
  ];
  return (
    <>
      <Row label="Shape">
        <select value={edit.shape} onChange={(e) => commit({ shape: e.target.value as ShapeEdit["shape"] })} className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs">
          {kinds.map((k) => (<option key={k.v} value={k.v}>{k.label}</option>))}
        </select>
      </Row>
      <Row label="Stroke color">
        <input type="color" value={edit.strokeColor} onChange={(e) => commit({ strokeColor: e.target.value })} className="pw-focus h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Stroke color" />
      </Row>
      <Row label="Fill color">
        <div className="flex items-center gap-2">
          <input type="color" value={edit.fillColor === "transparent" ? "#ffffff" : edit.fillColor} disabled={edit.fillColor === "transparent"} onChange={(e) => commit({ fillColor: e.target.value })} className="pw-focus h-8 w-14 cursor-pointer rounded border border-zinc-300 disabled:opacity-40" aria-label="Fill color" />
          <button type="button" onClick={() => commit({ fillColor: edit.fillColor === "transparent" ? "#ffffff" : "transparent" })} className="pw-focus flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100" aria-pressed={edit.fillColor === "transparent"}>
            {edit.fillColor === "transparent" && <Check size={12} />} No fill
          </button>
        </div>
      </Row>
      <Row label="Thickness">
        <Slider value={edit.thickness} min={0.5} max={12} step={0.5} ariaLabel="Stroke thickness" onBegin={begin} onTransient={(v) => patch({ thickness: v })} />
      </Row>
      <Row label="Line style">
        <button type="button" onClick={() => commit({ dashed: !edit.dashed })} className="pw-focus flex items-center gap-2 rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100" aria-pressed={edit.dashed}>
          {edit.dashed && <Check size={12} />} Dashed
        </button>
      </Row>
      <GeometryControls edit={edit} />
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

function ImagePanel({ edit }: { edit: Extract<PdfEdit, { type: "image" | "signature" }> }): React.ReactElement {
  return (
    <>
      <p className="text-xs text-zinc-500">Original size: {Math.round(edit.naturalWidth)} × {Math.round(edit.naturalHeight)} pt</p>
      <GeometryControls edit={edit} />
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

function StampPanel({ edit }: { edit: Extract<PdfEdit, { type: "stamp" }> }): React.ReactElement {
  const { commit, begin, patch } = useEditCommit(edit.id);
  return (
    <>
      <Row label="Preset">
        <select
          value={edit.variant}
          onChange={(e) => {
            const preset = STAMP_PRESETS.find((p) => p.variant === e.target.value);
            if (preset) commit({ variant: preset.variant, label: preset.label, color: preset.color });
            else commit({ variant: "custom" });
          }}
          className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs"
        >
          {STAMP_PRESETS.map((p) => (<option key={p.variant} value={p.variant}>{p.label}</option>))}
          <option value="custom">Custom…</option>
        </select>
      </Row>
      <Row label="Label">
        <input value={edit.label} onChange={(e) => commit({ label: e.target.value.toUpperCase().slice(0, 24) })} onKeyDown={(e) => e.stopPropagation()} className="pw-focus w-full rounded border border-zinc-300 p-1.5 text-xs uppercase" />
      </Row>
      <Row label="Color">
        <input type="color" value={edit.color} onChange={(e) => commit({ color: e.target.value })} className="pw-focus h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Stamp color" />
      </Row>
      <Row label="Opacity">
        <Slider value={edit.opacity} min={0.1} max={1} step={0.05} ariaLabel="Stamp opacity" onBegin={begin} onTransient={(v) => patch({ opacity: v })} />
      </Row>
      <GeometryControls edit={edit} />
      <ZOrderControls ids={[edit.id]} />
      <DangerControls ids={[edit.id]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// tool options (nothing selected)
// ---------------------------------------------------------------------------

function ToolOptionsPanel({ tool }: { tool: ToolId }): React.ReactElement | null {
  const opts = useEditor((s) => s.toolOptions);
  const patch = useEditor((s) => s.patchToolOptions);
  if (tool === "text") {
    const t = opts.text;
    return (
      <Section title="Text tool">
        <Row label="Font">
          <select value={t.fontFamily} onChange={(e) => patch("text", { fontFamily: e.target.value })} className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs">
            {TEXT_FONTS.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
        </Row>
        <Row label="Size"><Num ariaLabel="Default font size" value={t.fontSize} min={6} max={144} onCommit={(v) => patch("text", { fontSize: v })} /></Row>
        <Row label="Color"><input type="color" value={t.color} onChange={(e) => patch("text", { color: e.target.value })} className="h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Default text color" /></Row>
        <Row label="Style">
          <div className="flex gap-1">
            <IconBtn title="Bold" active={t.bold} onClick={() => patch("text", { bold: !t.bold })}><Bold size={14} /></IconBtn>
            <IconBtn title="Italic" active={t.italic} onClick={() => patch("text", { italic: !t.italic })}><Italic size={14} /></IconBtn>
            <IconBtn title="Underline" active={t.underline} onClick={() => patch("text", { underline: !t.underline })}><Underline size={14} /></IconBtn>
          </div>
        </Row>
      </Section>
    );
  }
  if (tool === "handwritten") {
    const hw = opts.handwritten;
    return (
      <Section title="Handwritten tool">
        <Row label="Style">
          <select value={hw.handStyle} onChange={(e) => patch("handwritten", { handStyle: e.target.value as HandwrittenEdit["handStyle"] })} className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs">
            {Object.entries(HAND_STYLE_FONTS).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
          </select>
        </Row>
        <Row label="Size"><Num ariaLabel="Default handwriting size" value={hw.fontSize} min={8} max={120} onCommit={(v) => patch("handwritten", { fontSize: v })} /></Row>
        <Row label="Color"><input type="color" value={hw.color} onChange={(e) => patch("handwritten", { color: e.target.value })} className="h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Default ink color" /></Row>
      </Section>
    );
  }
  if (tool === "highlight") {
    const hl = opts.highlight;
    return (
      <Section title="Highlighter">
        <Row label="Color">
          <div className="flex gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => (<ColorDot key={c} color={c} label={c} selected={hl.color === c} onPick={() => patch("highlight", { color: c })} />))}
          </div>
        </Row>
      </Section>
    );
  }
  if (tool === "pen" || tool === "marker") {
    const p = opts[tool];
    return (
      <Section title={tool === "pen" ? "Pen" : "Marker"}>
        <Row label="Color"><input type="color" value={p.color} onChange={(e) => patch(tool, { color: e.target.value })} className="h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Pen color" /></Row>
        <Row label="Thickness"><Num ariaLabel="Pen thickness" value={p.thickness} min={0.5} max={30} step={0.5} onCommit={(v) => patch(tool, { thickness: v })} /></Row>
      </Section>
    );
  }
  if (tool === "shape") {
    const s = opts.shape;
    return (
      <Section title="Shape tool">
        <Row label="Stroke"><input type="color" value={s.strokeColor} onChange={(e) => patch("shape", { strokeColor: e.target.value })} className="h-8 w-14 cursor-pointer rounded border border-zinc-300" aria-label="Stroke color" /></Row>
        <Row label="Thickness"><Num ariaLabel="Stroke thickness" value={s.thickness} min={0.5} max={12} step={0.5} onCommit={(v) => patch("shape", { thickness: v })} /></Row>
      </Section>
    );
  }
  if (tool === "stamp") {
    return (
      <Section title="Stamp tool">
        <Row label="Preset">
          <select
            value={opts.stamp.variant}
            onChange={(e) => {
              const preset = STAMP_PRESETS.find((x) => x.variant === e.target.value);
              if (preset) patch("stamp", { variant: preset.variant, label: preset.label, color: preset.color });
            }}
            className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs"
          >
            {STAMP_PRESETS.map((p) => (<option key={p.variant} value={p.variant}>{p.label}</option>))}
          </select>
        </Row>
      </Section>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// page tools (generators)
// ---------------------------------------------------------------------------

function PageToolsSection(): React.ReactElement {
  const [pos, setPos] = useState<PageNumberPosition>("bottom-center");
  const [startNum, setStartNum] = useState(1);
  const [wmText, setWmText] = useState("DRAFT");
  const [wmOpacity, setWmOpacity] = useState(0.15);
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [withNumbers, setWithNumbers] = useState(true);
  const [done, setDone] = useState<string | null>(null);

  const flash = (msg: string) => {
    setDone(msg);
    window.setTimeout(() => setDone(null), 2500);
  };

  return (
    <Section title="Page tools">
      <div className="rounded-lg bg-zinc-50 p-2.5 ring-1 ring-zinc-200">
        <p className="mb-1.5 text-xs font-medium">Page numbers</p>
        <div className="flex gap-1.5">
          <select value={pos} onChange={(e) => setPos(e.target.value as PageNumberPosition)} className="pw-focus flex-1 rounded border border-zinc-300 px-1 py-1 text-xs" aria-label="Page number position">
            <option value="bottom-center">Bottom center</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="top-center">Top center</option>
          </select>
          <input type="number" value={startNum} min={0} onChange={(e) => setStartNum(Number(e.target.value) || 1)} className="pw-focus w-14 rounded border border-zinc-300 px-1 py-1 text-xs" aria-label="Start number" title="Start number" />
        </div>
        <button type="button" onClick={() => flash(`${addPageNumbers({ position: pos, startNumber: startNum, startPage: 1 })} page numbers added`)} className="pw-focus mt-1.5 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
          Add page numbers
        </button>
      </div>
      <div className="rounded-lg bg-zinc-50 p-2.5 ring-1 ring-zinc-200">
        <p className="mb-1.5 text-xs font-medium">Watermark</p>
        <input value={wmText} onChange={(e) => setWmText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="DRAFT" className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs uppercase" aria-label="Watermark text" />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">Opacity</span>
          <input type="range" min={0.05} max={0.5} step={0.05} value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} className="w-full accent-blue-600" aria-label="Watermark opacity" />
        </div>
        <button type="button" onClick={() => flash(`Watermark added to ${addWatermark({ text: wmText.toUpperCase() || "DRAFT", opacity: wmOpacity, rotation: -45, fontSize: 72, scope: "all" })} pages`)} className="pw-focus mt-1.5 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
          Add watermark
        </button>
      </div>
      <div className="rounded-lg bg-zinc-50 p-2.5 ring-1 ring-zinc-200">
        <p className="mb-1.5 text-xs font-medium">Header / footer</p>
        <input value={header} onChange={(e) => setHeader(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Header text" className="pw-focus mb-1.5 w-full rounded border border-zinc-300 px-1.5 py-1 text-xs" aria-label="Header text" />
        <input value={footer} onChange={(e) => setFooter(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Footer text" className="pw-focus w-full rounded border border-zinc-300 px-1.5 py-1 text-xs" aria-label="Footer text" />
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-zinc-600">
          <input type="checkbox" checked={withNumbers} onChange={(e) => setWithNumbers(e.target.checked)} className="accent-blue-600" />
          Include page numbers
        </label>
        <button type="button" onClick={() => flash(`${addHeaderFooter({ header, footer, pageNumbers: withNumbers })} headers/footers added`)} className="pw-focus mt-1.5 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
          Add header & footer
        </button>
      </div>
      {done && <p className="text-xs text-green-700" role="status">{done}</p>}
      <p className="text-[11px] text-zinc-500">These create real text objects — you can move, restyle or delete them afterwards.</p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// root
// ---------------------------------------------------------------------------

function SingleEditPanel({ edit }: { edit: PdfEdit }): React.ReactElement {
  const title = `${edit.type.charAt(0).toUpperCase()}${edit.type.slice(1)}`;
  return (
    <Section title={title}>
      {edit.type === "text" && <TextPanel edit={edit} />}
      {edit.type === "handwritten" && <HandwrittenPanel edit={edit} />}
      {edit.type === "highlight" && <HighlightPanel edit={edit} />}
      {edit.type === "whiteout" && <WhiteoutPanel edit={edit} />}
      {edit.type === "freehand" && <FreehandPanel edit={edit} />}
      {edit.type === "note" && <NotePanel edit={edit} />}
      {edit.type === "shape" && <ShapePanel edit={edit} />}
      {(edit.type === "image" || edit.type === "signature") && <ImagePanel edit={edit} />}
      {edit.type === "stamp" && <StampPanel edit={edit} />}
    </Section>
  );
}

export const PropertiesPanel = memo(function PropertiesPanel(): React.ReactElement {
  const edits = useEditor((s) => s.edits);
  const selectedIds = useEditor((s) => s.selectedIds);
  const activeTool = useEditor((s) => s.activeTool);
  const fileName = useEditor((s) => s.fileName);
  const pages = useEditor((s) => s.pages);

  const selected = selectedIds
    .map((id) => getEditById(edits, id))
    .filter((e): e is PdfEdit => !!e);

  return (
    <div className="pw-scroll h-full overflow-y-auto bg-white" role="complementary" aria-label="Properties">
      {selected.length === 0 && (
        <>
          <Section title="Document">
            <p className="truncate text-sm font-medium" title={fileName}>{fileName}</p>
            <p className="text-xs text-zinc-500">{pages.length} pages • {edits.length} objects</p>
          </Section>
          <ToolOptionsPanel tool={activeTool} />
          <PageToolsSection />
        </>
      )}
      {selected.length === 1 && selected[0] && (
        <SingleEditPanel edit={selected[0]} />
      )}
      {selected.length > 1 && (
        <Section title={`${selected.length} objects selected`}>
          <ZOrderControls ids={selectedIds} />
          <DangerControls ids={selectedIds} />
        </Section>
      )}
    </div>
  );
});
