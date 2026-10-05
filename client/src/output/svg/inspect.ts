import type { Matrix, PreviewModel, PreviewShape, SvgInspection } from "../types";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SHAPES = 2000;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const CUT_RE = /cut\s*contour|cutcontour|cutline|cut[-_\s]?line|thru[-_\s]?cut|kiss[-_\s]?cut/i;

class InspectError extends Error {}

type Paint = { fill: string; stroke: string; strokeWidth: number; opacity: number };

const ROOT_PAINT: Paint = { fill: "#1d1d1f", stroke: "none", strokeWidth: 1, opacity: 1 };

function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function parseTransform(raw: string | null): Matrix {
  if (!raw) return IDENTITY;
  let matrix = IDENTITY;
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const kind = match[1];
    const nums = match[2]
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((value) => Number.isFinite(value));
    let next: Matrix = IDENTITY;
    if (kind === "matrix" && nums.length >= 6) {
      next = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
    } else if (kind === "translate") {
      next = [1, 0, 0, 1, nums[0] || 0, nums[1] || 0];
    } else if (kind === "scale") {
      const sx = nums[0] ?? 1;
      const sy = nums[1] ?? sx;
      next = [sx, 0, 0, sy, 0, 0];
    } else if (kind === "rotate") {
      const angle = ((nums[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
      if (nums.length >= 3) {
        const cx = nums[1];
        const cy = nums[2];
        next = mul(mul([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
      } else {
        next = rot;
      }
    } else if (kind === "skewX") {
      next = [1, 0, Math.tan(((nums[0] || 0) * Math.PI) / 180), 1, 0, 0];
    } else if (kind === "skewY") {
      next = [1, Math.tan(((nums[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    matrix = mul(next, matrix);
  }
  return matrix;
}

function toInches(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^([0-9]*\.?[0-9]+)\s*(mm|cm|in|inch|inches|pt|pc|px)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  switch ((match[2] || "").toLowerCase()) {
    case "in":
    case "inch":
    case "inches":
      return value;
    case "mm":
      return value / 25.4;
    case "cm":
      return value / 2.54;
    case "pt":
      return value / 72;
    case "pc":
      return value / 6;
    default:
      return null;
  }
}

function sanitizeColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const color = value.trim().toLowerCase();
  if (!color || color.includes("url(")) return null;
  if (color === "none" || color === "transparent") return "none";
  if (color === "currentcolor") return "#1d1d1f";
  if (/^#[0-9a-f]{3}$/.test(color) || /^#[0-9a-f]{6}$/.test(color) || /^#[0-9a-f]{8}$/.test(color)) return color;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(color)) return color;
  const named: Record<string, string> = {
    black: "#1d1d1f",
    white: "#ffffff",
    red: "#ff3b30",
    blue: "#2f6bff",
    green: "#12c45a",
    gray: "#8e8e93",
    grey: "#8e8e93",
  };
  return named[color] ?? null;
}

function styleMap(element: Element): Record<string, string> {
  const style = element.getAttribute("style") || "";
  const map: Record<string, string> = {};
  for (const part of style.split(";")) {
    const [key, ...rest] = part.split(":");
    if (!key || rest.length === 0) continue;
    map[key.trim().toLowerCase()] = rest.join(":").trim();
  }
  return map;
}

function paintOf(element: Element, inherited: Paint): Paint {
  const style = styleMap(element);
  const fill = sanitizeColor(style.fill ?? element.getAttribute("fill"));
  const stroke = sanitizeColor(style.stroke ?? element.getAttribute("stroke"));
  const width = Number(style["stroke-width"] ?? element.getAttribute("stroke-width"));
  const opacity = Number(style.opacity ?? element.getAttribute("opacity"));
  return {
    fill: fill ?? inherited.fill,
    stroke: stroke ?? inherited.stroke,
    strokeWidth: Number.isFinite(width) && width > 0 ? width : inherited.strokeWidth,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : inherited.opacity,
  };
}

function num(element: Element, name: string, fallback = 0): number {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

function parsePoints(raw: string | null): [number, number][] {
  if (!raw) return [];
  const nums = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  const points: [number, number][] = [];
  for (let index = 0; index + 1 < nums.length; index += 2) points.push([nums[index], nums[index + 1]]);
  return points;
}

function elementLabel(element: Element): string {
  const bits = [element.id || "", element.getAttribute("class") || "", element.getAttribute("data-name") || ""];
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attr = element.attributes[index];
    if (/label|name/i.test(attr.name)) bits.push(attr.value);
  }
  return bits.join(" ");
}

function viewBoxOf(element: Element): [number, number, number, number] {
  const raw = element.getAttribute("viewBox");
  if (raw) {
    const parts = raw.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value)) && parts[2] > 0 && parts[3] > 0) {
      return [parts[0], parts[1], parts[2], parts[3]];
    }
  }
  return [0, 0, 100, 100];
}

function rejectHref(element: Element) {
  for (const name of ["href", "xlink:href"]) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const href = value.trim();
    if (href.startsWith("#")) continue;
    if (/^javascript:/i.test(href)) {
      throw new InspectError("This SVG contains a javascript link. Remove it and upload again.");
    }
    throw new InspectError("This SVG links to an external file. Keep the artwork inside the SVG and upload it again.");
  }
}

function rejectHandlers(element: Element) {
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attr = element.attributes[index];
    if (/^on/i.test(attr.name)) {
      throw new InspectError("This SVG contains an event handler. Remove it and upload again.");
    }
  }
}

type Walk = {
  shapes: PreviewShape[];
  cutlineName: string | null;
  sawClosedCut: boolean;
};

function pushShape(walk: Walk, shape: PreviewShape, closed: boolean) {
  if (walk.shapes.length >= MAX_SHAPES) {
    throw new InspectError("This SVG has too many shapes to check safely. Simplify it below 2,000 shapes.");
  }
  walk.shapes.push(shape);
  if (shape.cutline && closed) walk.sawClosedCut = true;
}

function walk(element: Element, matrix: Matrix, paint: Paint, cutline: boolean, hidden: boolean, walkState: Walk) {
  const tag = element.localName.toLowerCase();
  rejectHandlers(element);
  if (tag === "script") throw new InspectError("This SVG contains a script. Remove scripts and event handlers, then upload it again.");
  if (tag === "foreignobject") {
    throw new InspectError("This SVG contains a foreignObject. Export plain vector paths without embedded HTML.");
  }
  if (tag === "iframe" || tag === "embed" || tag === "object") {
    throw new InspectError("This SVG contains embedded content. Export plain vector paths and upload it again.");
  }
  if (tag === "image") {
    throw new InspectError("This SVG includes a placed image. Contour-cut decals need vector paths only.");
  }
  if (tag === "use") {
    throw new InspectError("This SVG uses <use> references. Expand the artwork to plain paths and upload again.");
  }
  if (tag === "style") {
    const css = element.textContent || "";
    if (/javascript:|expression\s*\(|@import|url\s*\(\s*['"]?\s*(https?:|\/\/)/i.test(css)) {
      throw new InspectError("This SVG contains an unsafe style. Remove external or scripted styles and upload it again.");
    }
    return;
  }
  rejectHref(element);

  const nextHidden = hidden || tag === "defs" || tag === "clippath" || tag === "mask" || tag === "metadata";
  const nextMatrix = mul(matrix, parseTransform(element.getAttribute("transform")));
  const nextPaint = paintOf(element, paint);
  const label = elementLabel(element);
  const namedCut = CUT_RE.test(label);
  const nextCut = cutline || namedCut;
  if (namedCut && !walkState.cutlineName) {
    const found = label.match(CUT_RE);
    walkState.cutlineName = found ? found[0].replace(/\s+/g, "") : "CutContour";
  }
  if (element.getAttribute("display") === "none" || element.getAttribute("visibility") === "hidden") return;

  const base = {
    matrix: nextMatrix,
    fill: nextPaint.fill,
    stroke: nextPaint.stroke,
    strokeWidth: nextPaint.strokeWidth,
    opacity: nextPaint.opacity,
    cutline: nextCut,
  };

  if (!nextHidden && tag === "path") {
    const d = element.getAttribute("d") || "";
    if (d.trim()) pushShape(walkState, { ...base, kind: "path", d, closed: /z/i.test(d) }, /z/i.test(d));
    return;
  }
  if (!nextHidden && tag === "rect") {
    pushShape(
      walkState,
      {
        ...base,
        kind: "rect",
        x: num(element, "x"),
        y: num(element, "y"),
        width: num(element, "width"),
        height: num(element, "height"),
        rx: num(element, "rx"),
      },
      true,
    );
    return;
  }
  if (!nextHidden && tag === "circle") {
    pushShape(walkState, { ...base, kind: "circle", cx: num(element, "cx"), cy: num(element, "cy"), r: num(element, "r") }, true);
    return;
  }
  if (!nextHidden && tag === "ellipse") {
    pushShape(
      walkState,
      { ...base, kind: "ellipse", cx: num(element, "cx"), cy: num(element, "cy"), rx: num(element, "rx"), ry: num(element, "ry") },
      true,
    );
    return;
  }
  if (!nextHidden && tag === "line") {
    pushShape(
      walkState,
      {
        ...base,
        kind: "line",
        x1: num(element, "x1"),
        y1: num(element, "y1"),
        x2: num(element, "x2"),
        y2: num(element, "y2"),
      },
      false,
    );
    return;
  }
  if (!nextHidden && (tag === "polyline" || tag === "polygon")) {
    const points = parsePoints(element.getAttribute("points"));
    pushShape(walkState, { ...base, kind: "poly", points, close: tag === "polygon" }, tag === "polygon");
    return;
  }
  if (!nextHidden && tag === "text") {
    const text = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180);
    if (text) {
      pushShape(
        walkState,
        { ...base, kind: "text", x: num(element, "x"), y: num(element, "y"), text, fontSize: num(element, "font-size", 16) || 16 },
        false,
      );
    }
    return;
  }

  for (let index = 0; index < element.children.length; index += 1) {
    walk(element.children[index], nextMatrix, nextPaint, nextCut, nextHidden, walkState);
  }
}

export function inspectSvgText(fileName: string, svgText: string): SvgInspection {
  if (!svgText.trim()) return { ok: false, correction: "This SVG is empty. Export the decal and try again." };
  if (svgText.includes("\0")) return { ok: false, correction: "This file is not valid SVG. Export a production-ready SVG and try again." };
  if (/<!DOCTYPE|<!ENTITY/i.test(svgText)) {
    return { ok: false, correction: "This SVG contains a document type or entity declaration. Export a plain SVG without it." };
  }
  if (/<script[\s>]/i.test(svgText) || /javascript:/i.test(svgText)) {
    return { ok: false, correction: "This SVG contains a script. Remove scripts and event handlers, then upload it again." };
  }
  if (/<foreignobject[\s>]/i.test(svgText)) {
    return { ok: false, correction: "This SVG contains a foreignObject. Export plain vector paths without embedded HTML." };
  }
  if (/\son[a-z]+\s*=/i.test(svgText)) {
    return { ok: false, correction: "This SVG contains an event handler. Remove it and upload again." };
  }

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    return { ok: false, correction: "This file is not valid SVG. Export a production-ready SVG and try again." };
  }
  const root = doc.querySelector("svg");
  if (!root) return { ok: false, correction: "This file does not have an SVG root. Export a production-ready SVG." };

  const walkState: Walk = { shapes: [], cutlineName: null, sawClosedCut: false };
  try {
    walk(root, IDENTITY, ROOT_PAINT, false, false, walkState);
  } catch (error) {
    const correction = error instanceof InspectError ? error.message : "This SVG could not be checked. Export a simpler production SVG and try again.";
    return { ok: false, correction };
  }

  if (!walkState.cutlineName) {
    return {
      ok: false,
      correction: "This SVG has no cutline. Add a closed path named CutContour (or cutline) and upload it again.",
    };
  }
  if (!walkState.sawClosedCut) {
    return {
      ok: false,
      correction: "The cutline needs to be a closed path so the decal can be contour-cut. Close the CutContour path and upload it again.",
    };
  }
  if (walkState.shapes.length === 0) {
    return { ok: false, correction: "This SVG has no visible artwork. Export the decal paths and a cutline." };
  }

  const widthIn = toInches(root.getAttribute("width"));
  const heightIn = toInches(root.getAttribute("height"));
  let dimensionNote = "This SVG does not include a physical size. Enter the finished size in inches.";
  if (widthIn != null && heightIn != null) {
    dimensionNote = "Finished size was read from the SVG width and height. A viewBox was not used as a physical size.";
  } else if (root.getAttribute("viewBox")) {
    dimensionNote = "This SVG has a viewBox and no physical width and height. Enter the finished size in inches.";
  } else if (root.getAttribute("width") || root.getAttribute("height")) {
    dimensionNote = "The SVG size is in pixels or has no unit. Enter the finished size in inches.";
  }

  const preview: PreviewModel = { viewBox: viewBoxOf(root), shapes: walkState.shapes };
  return {
    ok: true,
    fileName,
    svgText,
    preview,
    cutlineName: walkState.cutlineName,
    widthIn,
    heightIn,
    dimensionNote,
  };
}

export async function inspectSvgFile(file: File): Promise<SvgInspection> {
  const name = file.name || "artwork.svg";
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || lower.endsWith(".ai")) {
    return { ok: false, correction: "PDF and AI files are not supported. Export a production-ready SVG with a cutline." };
  }
  if (!lower.endsWith(".svg") && file.type !== "image/svg+xml") {
    return { ok: false, correction: "OUTPUT currently accepts production-ready SVG only. This file is not an SVG." };
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { ok: false, correction: `This file is ${mb} MB. The maximum is 5 MB. Export a smaller SVG.` };
  }
  if (file.size === 0) return { ok: false, correction: "This SVG is empty. Export the decal and try again." };
  try {
    return inspectSvgText(name, await file.text());
  } catch {
    return { ok: false, correction: "Couldn't read that file. Try it again." };
  }
}
