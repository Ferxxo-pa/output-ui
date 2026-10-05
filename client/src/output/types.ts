/** Shared OUTPUT types. The UI and both adapters speak this contract. */

export type Role = "ordering" | "producing";

export type Fulfillment = "pickup" | "delivery";

export type JobPhase =
  | "offered"
  | "accepted"
  | "funding_pending"
  | "funded"
  | "completion_submitted"
  | "paid"
  | "passed"
  | "issue";

export type Matrix = [number, number, number, number, number, number];

type ShapeBase = {
  matrix: Matrix;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cutline: boolean;
};

export type PreviewShape =
  | (ShapeBase & { kind: "path"; d: string; closed: boolean })
  | (ShapeBase & { kind: "rect"; x: number; y: number; width: number; height: number; rx: number })
  | (ShapeBase & { kind: "circle"; cx: number; cy: number; r: number })
  | (ShapeBase & { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number })
  | (ShapeBase & { kind: "line"; x1: number; y1: number; x2: number; y2: number })
  | (ShapeBase & { kind: "poly"; points: [number, number][]; close: boolean })
  | (ShapeBase & { kind: "text"; x: number; y: number; text: string; fontSize: number });

/** Geometry the page draws itself. Untrusted SVG markup is never inserted into the DOM. */
export type PreviewModel = {
  viewBox: [number, number, number, number];
  shapes: PreviewShape[];
};

export type SvgInspection =
  | {
      ok: true;
      fileName: string;
      svgText: string;
      preview: PreviewModel;
      cutlineName: string;
      widthIn: number | null;
      heightIn: number | null;
      dimensionNote: string;
    }
  | { ok: false; correction: string };

export type ShopPresence = "receiving" | "paused" | "disconnected" | "stale";

export type ShopState = {
  id: string;
  name: string;
  location: string;
  confirmed: boolean;
  receiving: boolean;
  vinylOn: boolean;
  laminateOn: boolean;
  usableWidthIn: number;
  vinylCentsPerSqIn: number;
  laminateCentsPerSqIn: number;
  minimumCents: number;
  inventory: {
    vinyl: { availableSqIn: number; reservedSqIn: number };
    laminate: { availableSqIn: number; reservedSqIn: number };
  };
  availableAfter: string | null;
  lastConfirmedAt: string | null;
  capacityStale: boolean;
  payoutConfirmed: boolean;
  payoutLabel: string;
  presence: ShopPresence;
};

export type CardError = {
  message: string;
  action?: string;
};

export type Receipt = {
  reference: string;
  amountCents: number;
  currency: "USDC";
  network: "devnet";
  simulated: true;
  settledAt: string;
};

export type CompletionPhoto = {
  name: string;
  dataUrl: string;
};

export type Job = {
  id: string;
  phase: JobPhase;
  expired: boolean;
  selfOrdered: boolean;
  requesterName: string;
  shopId: string;
  shopName: string;
  fileName: string;
  svgText: string;
  preview: PreviewModel;
  cutlineName: string;
  quantity: number;
  widthIn: number;
  heightIn: number;
  laminate: boolean;
  fulfillment: Fulfillment;
  destination: string;
  deadline: string;
  readyBy: string;
  priceCents: number;
  payoutCents: number;
  currency: "USDC";
  network: "devnet";
  simulatedPayment: true;
  qualification: string;
  checks: string[];
  alternatives: string;
  reservation: { vinylSqIn: number; laminateSqIn: number } | null;
  consumed: boolean;
  downloaded: boolean;
  completionPhoto: CompletionPhoto | null;
  issueNote: string | null;
  receipt: Receipt | null;
  termsChanged: boolean;
  revision: number;
  fundingOpId: string | null;
  cardError: CardError | null;
  updatedAt: string;
  createdAt: string;
};

export type NoticeKind = "offer" | "funding" | "funded" | "completion" | "problem";

export type Notice = {
  id: string;
  jobId: string;
  role: Role;
  kind: NoticeKind;
  text: string;
  createdAt: string;
};

export type Quote = {
  shopId: string;
  shopName: string;
  priceCents: number;
  payoutCents: number;
  currency: "USDC";
  network: "devnet";
  simulated: true;
  readyBy: string;
  fulfillment: "pickup";
  fulfillmentNote: string;
  reason: string;
  checks: string[];
  alternatives: string;
  widthIn: number;
  heightIn: number;
  quantity: number;
  laminate: boolean;
  deadline: string;
};

export type QuoteInput = {
  fileName: string;
  svgText: string;
  preview: PreviewModel;
  cutlineName: string;
  quantity: number;
  widthIn: number;
  heightIn: number;
  laminate: boolean;
  fulfillment: Fulfillment;
  destination: string;
  deadline: string;
};

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; correction: string; shopHint: boolean };

export type Snapshot = {
  mode: "fixture" | "live";
  banner: string | null;
  connection: "connected" | "reconnecting" | "disconnected";
  shop: ShopState | null;
  jobs: Job[];
  notices: Notice[];
};

export type AvailabilityPatch = {
  receiving?: boolean;
  vinylOn?: boolean;
  laminateOn?: boolean;
  availableAfter?: string | null;
};

export type Panel = "closed" | "inbox" | "draft" | "shop" | "job";

export type Draft = {
  fileName: string;
  svgText: string;
  preview: PreviewModel | null;
  cutlineName: string | null;
  quantity: string;
  widthIn: string;
  heightIn: string;
  dimensionsConfirmed: boolean;
  dimensionNote: string;
  laminate: boolean;
  fulfillment: Fulfillment;
  destination: string;
  deadline: string;
  fileError: string | null;
  quoting: boolean;
  quote: Quote | null;
  quoteError: string | null;
  shopHint: boolean;
};

export const DEMO_BANNER = "Demo data—no orders sent or money moved.";

export const PRODUCT_LABEL = "Contour-cut decal";

export const MATERIAL_LABEL = "Gloss-white vinyl";

export const LAMINATE_LABEL = "Gloss laminate";
