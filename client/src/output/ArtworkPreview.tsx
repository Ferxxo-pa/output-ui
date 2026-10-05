import { useEffect, useRef } from "react";
import type { PreviewModel, PreviewShape } from "./types";

function trace(shape: PreviewShape): Path2D | null {
  try {
    if (shape.kind === "path") return new Path2D(shape.d);
    const path = new Path2D();
    if (shape.kind === "rect") {
      if (shape.rx > 0 && typeof Path2D.prototype.roundRect === "function") path.roundRect(shape.x, shape.y, shape.width, shape.height, shape.rx);
      else path.rect(shape.x, shape.y, shape.width, shape.height);
    } else if (shape.kind === "circle") {
      path.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
    } else if (shape.kind === "ellipse") {
      path.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
    } else if (shape.kind === "line") {
      path.moveTo(shape.x1, shape.y1);
      path.lineTo(shape.x2, shape.y2);
    } else if (shape.kind === "poly") {
      shape.points.forEach(([x, y], index) => (index === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
      if (shape.close) path.closePath();
    } else {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

function paint(ctx: CanvasRenderingContext2D, model: PreviewModel, cssW: number, cssH: number, dpr: number) {
  const [minX, minY, vbW, vbH] = model.viewBox;
  const pad = 16;
  const scale = Math.min((cssW - pad * 2) / vbW, (cssH - pad * 2) / vbH);
  const ox = (cssW - vbW * scale) / 2;
  const oy = (cssH - vbH * scale) / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#f3f3f4";
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(ox, oy, vbW * scale, vbH * scale);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.strokeRect(ox + 0.5, oy + 0.5, vbW * scale, vbH * scale);

  const draw = (shape: PreviewShape) => {
    const m = shape.matrix;
    ctx.setTransform(
      dpr * scale * m[0],
      dpr * scale * m[1],
      dpr * scale * m[2],
      dpr * scale * m[3],
      dpr * (ox + scale * (m[4] - minX)),
      dpr * (oy + scale * (m[5] - minY)),
    );
    ctx.globalAlpha = shape.opacity;
    if (shape.kind === "text") {
      ctx.fillStyle = shape.cutline ? "#c2186a" : shape.fill;
      ctx.font = `${Math.max(shape.fontSize, 8)}px sans-serif`;
      ctx.fillText(shape.text, shape.x, shape.y);
      return;
    }
    const path = trace(shape);
    if (!path) return;
    if (shape.cutline) {
      ctx.strokeStyle = "#c2186a";
      ctx.lineWidth = Math.max(shape.strokeWidth || 1, vbW / 90);
      ctx.stroke(path);
      return;
    }
    if (shape.fill !== "none") {
      ctx.fillStyle = shape.fill || "#1d1d1f";
      ctx.fill(path);
    }
    if (shape.stroke !== "none") {
      ctx.strokeStyle = shape.stroke || "#1d1d1f";
      ctx.lineWidth = shape.strokeWidth || 1;
      ctx.stroke(path);
    }
  };

  model.shapes.filter((shape) => !shape.cutline).forEach(draw);
  model.shapes.filter((shape) => shape.cutline).forEach(draw);
  ctx.globalAlpha = 1;
}

export function ArtworkPreview({
  model,
  expanded,
  onToggle,
}: {
  model: PreviewModel;
  expanded: boolean;
  onToggle: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const draw = () => {
      const cssW = Math.max(wrap.clientWidth, 240);
      const cssH = expanded ? 360 : 140;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = "100%";
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      paint(ctx, model, cssW, cssH, dpr);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [model, expanded]);

  return (
    <figure className="art">
      <div ref={wrapRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Artwork preview. The magenta line is the cutline. The original SVG is not inserted into the page."
        />
      </div>
      <figcaption>Magenta line is the cutline.</figcaption>
      <button type="button" onClick={onToggle}>
        {expanded ? "Shrink artwork" : "Expand artwork"}
      </button>
    </figure>
  );
}
