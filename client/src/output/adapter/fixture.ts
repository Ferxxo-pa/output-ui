import { formatUsdc, formatWhen } from "../format";
import { inspectSvgText } from "../svg/inspect";
import type {
  AvailabilityPatch,
  CompletionPhoto,
  Job,
  Notice,
  Quote,
  QuoteInput,
  QuoteResult,
  ShopState,
  Snapshot,
} from "../types";
import { DEMO_BANNER } from "../types";
import { OutputOperationError } from "./errors";
import type { MutationResult, OutputPort, ProductionFile } from "./port";

const STORAGE_KEY = "output.demo.fixture.v1";
const STALE_MS = 12 * 60 * 60 * 1000;
const SHOP_ID = "harbor-cut-studio";
const SHOP_NAME = "Harbor Cut Studio";
const SHOP_LOCATION = "418 Mercer St, Seattle, WA";
const USABLE_WIDTH = 24;
const VINYL_RATE = 35;
const LAMINATE_RATE = 12;
const MINIMUM_CENTS = 1800;
const SEED_ID = "job_seed_mara";

const SEED_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="3in" height="2in" viewBox="0 0 300 200">
  <rect x="28" y="28" width="244" height="144" rx="18" fill="#1d1d1f"/>
  <g id="CutContour">
    <path d="M14 14 H286 V186 H14 Z" fill="none" stroke="#c2186a" stroke-width="2"/>
  </g>
</svg>`;

type ShopRecord = {
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
  inventory: ShopState["inventory"];
  availableAfter: string | null;
  lastConfirmedAt: string | null;
  payoutConfirmed: boolean;
};

type Persisted = {
  version: 1;
  shop: ShopRecord;
  jobs: Job[];
  notices: Notice[];
  ops: Record<string, string>;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function isStale(shop: ShopRecord, now = Date.now()) {
  if (!shop.lastConfirmedAt) return true;
  const confirmed = Date.parse(shop.lastConfirmedAt);
  return !Number.isFinite(confirmed) || now - confirmed > STALE_MS;
}

function areaOf(widthIn: number, heightIn: number, quantity: number) {
  return widthIn * heightIn * quantity;
}

function priceFor(area: number, laminate: boolean, shop: ShopRecord) {
  const raw = Math.round(area * shop.vinylCentsPerSqIn + (laminate ? area * shop.laminateCentsPerSqIn : 0));
  return Math.max(shop.minimumCents, raw);
}

function payoutFor(priceCents: number) {
  return Math.round(priceCents * 0.85);
}

function readyAt(shop: ShopRecord, now = Date.now()) {
  const after = shop.availableAfter ? Date.parse(shop.availableAfter) : now;
  const start = Math.max(now, Number.isFinite(after) ? after : now);
  return new Date(start + 2 * 60 * 60 * 1000).toISOString();
}

function qualify(shop: ShopRecord, input: QuoteInput, now = Date.now()): QuoteResult {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, correction: "Enter a whole quantity of at least 1.", shopHint: false };
  }
  if (input.quantity > 500) {
    return { ok: false, correction: "Enter a quantity of 500 or fewer for this preset.", shopHint: false };
  }
  if (!(input.widthIn > 0) || !(input.heightIn > 0)) {
    return { ok: false, correction: "Enter the finished width and height in inches.", shopHint: false };
  }
  if (input.fulfillment === "delivery") {
    return {
      ok: false,
      correction: "No connected shop offers delivery for contour-cut decals. Choose pickup. Nothing was sent.",
      shopHint: false,
    };
  }
  if (input.widthIn > shop.usableWidthIn) {
    return {
      ok: false,
      correction: `No shop can cut a decal wider than ${shop.usableWidthIn} in. ${shop.name}'s usable width is ${shop.usableWidthIn} in. Reduce the finished width.`,
      shopHint: false,
    };
  }
  if (!shop.receiving) {
    return {
      ok: false,
      correction: `${shop.name} is paused, and no other shop is receiving jobs. Resume receiving in Shop. No offer was sent.`,
      shopHint: true,
    };
  }
  if (isStale(shop, now)) {
    return {
      ok: false,
      correction: `${shop.name}'s capacity is stale. Confirm availability in Shop before requesting production. No offer was sent.`,
      shopHint: true,
    };
  }
  if (!shop.vinylOn) {
    return {
      ok: false,
      correction: "No shop has gloss-white vinyl available. Turn vinyl on in Shop. No offer was sent.",
      shopHint: true,
    };
  }
  const need = Math.ceil(areaOf(input.widthIn, input.heightIn, input.quantity));
  if (need > shop.inventory.vinyl.availableSqIn) {
    return {
      ok: false,
      correction: `No shop has enough gloss-white vinyl. ${shop.name} has ${shop.inventory.vinyl.availableSqIn} sq in available and this job needs ${need}. Reserved material is already set aside.`,
      shopHint: true,
    };
  }
  if (input.laminate && !shop.laminateOn) {
    return {
      ok: false,
      correction: "No shop has gloss laminate available. Turn laminate off, or mark laminate available in Shop.",
      shopHint: true,
    };
  }
  if (input.laminate && need > shop.inventory.laminate.availableSqIn) {
    return {
      ok: false,
      correction: `Not enough gloss laminate. ${shop.inventory.laminate.availableSqIn} sq in are available and this job needs ${need}.`,
      shopHint: true,
    };
  }
  const deadline = Date.parse(input.deadline);
  if (!Number.isFinite(deadline)) return { ok: false, correction: "Enter a deadline.", shopHint: false };
  const readyBy = readyAt(shop, now);
  if (deadline < Date.parse(readyBy)) {
    return {
      ok: false,
      correction: `No shop can be ready by that deadline. The earliest ready time is ${formatWhen(readyBy)}. Move the deadline.`,
      shopHint: false,
    };
  }
  const priceCents = priceFor(areaOf(input.widthIn, input.heightIn, input.quantity), input.laminate, shop);
  const payoutCents = payoutFor(priceCents);
  const quote: Quote = {
    shopId: shop.id,
    shopName: shop.name,
    priceCents,
    payoutCents,
    currency: "USDC",
    network: "devnet",
    simulated: true,
    readyBy,
    fulfillment: "pickup",
    fulfillmentNote: `Pickup at ${shop.name}. Not delivery.`,
    reason: "Has the vinyl, fits the width, and can make the deadline.",
    checks: [
      "Preset: contour-cut gloss-white vinyl.",
      `Usable width ${shop.usableWidthIn} in. This job is ${input.widthIn.toFixed(2)} in wide.`,
      `Vinyl ${shop.inventory.vinyl.availableSqIn} sq in available, ${shop.inventory.vinyl.reservedSqIn} sq in reserved. This job needs ${need} sq in.`,
      input.laminate
        ? `Gloss laminate ${shop.inventory.laminate.availableSqIn} sq in available, ${shop.inventory.laminate.reservedSqIn} sq in reserved.`
        : "No laminate requested.",
      `Pickup at ${shop.location}. You pick up. This is not delivery.`,
      `Ready by ${formatWhen(readyBy)}. Deadline ${formatWhen(input.deadline)}.`,
      `${formatUsdc(priceCents)} (devnet). The shop receives ${formatUsdc(payoutCents)}. Requesting does not move funds.`,
    ],
    alternatives: "No other shop is connected in this demo.",
    widthIn: input.widthIn,
    heightIn: input.heightIn,
    quantity: input.quantity,
    laminate: input.laminate,
    deadline: input.deadline,
  };
  return { ok: true, quote };
}

function hold(shop: ShopRecord, job: Job) {
  const vinyl = Math.ceil(areaOf(job.widthIn, job.heightIn, job.quantity));
  const laminate = job.laminate ? vinyl : 0;
  shop.inventory.vinyl.availableSqIn -= vinyl;
  shop.inventory.vinyl.reservedSqIn += vinyl;
  shop.inventory.laminate.availableSqIn -= laminate;
  shop.inventory.laminate.reservedSqIn += laminate;
  job.reservation = { vinylSqIn: vinyl, laminateSqIn: laminate };
}

function release(shop: ShopRecord, job: Job) {
  if (!job.reservation || job.consumed) return;
  shop.inventory.vinyl.availableSqIn += job.reservation.vinylSqIn;
  shop.inventory.vinyl.reservedSqIn -= job.reservation.vinylSqIn;
  shop.inventory.laminate.availableSqIn += job.reservation.laminateSqIn;
  shop.inventory.laminate.reservedSqIn -= job.reservation.laminateSqIn;
  job.reservation = null;
}

function consume(shop: ShopRecord, job: Job) {
  if (!job.reservation || job.consumed) return;
  shop.inventory.vinyl.reservedSqIn -= job.reservation.vinylSqIn;
  shop.inventory.laminate.reservedSqIn -= job.reservation.laminateSqIn;
  job.reservation = null;
  job.consumed = true;
}

function remember(state: Persisted, opId: string, jobId: string) {
  state.ops[opId] = jobId;
  const keys = Object.keys(state.ops);
  if (keys.length > 200) delete state.ops[keys[0]];
}

function addNotice(state: Persisted, notice: Notice) {
  if (state.notices.some((item) => item.id === notice.id)) return;
  state.notices.unshift(notice);
  state.notices = state.notices.slice(0, 20);
}

function findJob(state: Persisted, jobId: string) {
  return state.jobs.find((job) => job.id === jobId) ?? null;
}

function toSnapshot(state: Persisted): Snapshot {
  const now = Date.now();
  const stale = isStale(state.shop, now);
  let presence: ShopState["presence"] = "receiving";
  if (!state.shop.receiving) presence = "paused";
  else if (stale) presence = "stale";
  const shop: ShopState = {
    ...state.shop,
    payoutLabel: "Simulated devnet USDC",
    capacityStale: stale,
    presence,
  };
  return {
    mode: "fixture",
    banner: DEMO_BANNER,
    connection: "connected",
    shop,
    jobs: state.jobs.map((job) => ({
      ...job,
      expired: job.phase === "offered" && Date.parse(job.deadline) < now,
    })),
    notices: state.notices,
  };
}

function pack(state: Persisted, committed: boolean, jobId?: string, message?: string, shopHint?: boolean): MutationResult {
  return { snapshot: toSnapshot(state), committed, jobId, message, shopHint };
}

function read(): Persisted | "missing" | "bad" {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "missing";
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || parsed.version !== 1 || !parsed.shop || !Array.isArray(parsed.jobs) || !Array.isArray(parsed.notices)) {
      return "bad";
    }
    parsed.ops = parsed.ops ?? {};
    return parsed;
  } catch {
    return "bad";
  }
}

function save(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new OutputOperationError(
      "save",
      "Couldn't keep this demo job in the browser. No order was sent. Try a smaller file.",
      "storage",
    );
  }
}

function blankShop(confirmedAt: string): ShopRecord {
  return {
    id: SHOP_ID,
    name: SHOP_NAME,
    location: SHOP_LOCATION,
    confirmed: false,
    receiving: true,
    vinylOn: true,
    laminateOn: true,
    usableWidthIn: USABLE_WIDTH,
    vinylCentsPerSqIn: VINYL_RATE,
    laminateCentsPerSqIn: LAMINATE_RATE,
    minimumCents: MINIMUM_CENTS,
    inventory: {
      vinyl: { availableSqIn: 2400, reservedSqIn: 0 },
      laminate: { availableSqIn: 2400, reservedSqIn: 0 },
    },
    availableAfter: null,
    lastConfirmedAt: confirmedAt,
    payoutConfirmed: false,
  };
}

function seedFromInspection(inspected: Extract<ReturnType<typeof inspectSvgText>, { ok: true }>): Persisted {
  const created = nowIso();
  const shop = blankShop(created);
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const input: QuoteInput = {
    fileName: inspected.fileName,
    svgText: inspected.svgText,
    preview: inspected.preview,
    cutlineName: inspected.cutlineName,
    quantity: 20,
    widthIn: inspected.widthIn ?? 3,
    heightIn: inspected.heightIn ?? 2,
    laminate: true,
    fulfillment: "pickup",
    destination: shop.location,
    deadline,
  };
  const quoted = qualify(shop, input);
  if (!quoted.ok) throw new OutputOperationError("loadSnapshot", quoted.correction, "seed");
  const job: Job = {
    id: SEED_ID,
    phase: "offered",
    expired: false,
    selfOrdered: false,
    requesterName: "Mara Ellison",
    shopId: shop.id,
    shopName: shop.name,
    fileName: inspected.fileName,
    svgText: inspected.svgText,
    preview: inspected.preview,
    cutlineName: inspected.cutlineName,
    quantity: input.quantity,
    widthIn: input.widthIn,
    heightIn: input.heightIn,
    laminate: true,
    fulfillment: "pickup",
    destination: shop.location,
    deadline,
    readyBy: quoted.quote.readyBy,
    priceCents: quoted.quote.priceCents,
    payoutCents: quoted.quote.payoutCents,
    currency: "USDC",
    network: "devnet",
    simulatedPayment: true,
    qualification: quoted.quote.reason,
    checks: quoted.quote.checks,
    alternatives: quoted.quote.alternatives,
    reservation: null,
    consumed: false,
    downloaded: false,
    completionPhoto: null,
    issueNote: null,
    receipt: null,
    termsChanged: false,
    revision: 1,
    fundingOpId: null,
    cardError: null,
    updatedAt: created,
    createdAt: created,
  };
  return {
    version: 1,
    shop,
    jobs: [job],
    notices: [
      {
        id: "n_seed_offer",
        jobId: job.id,
        role: "producing",
        kind: "offer",
        text: "New offer to review. 20 contour-cut decals.",
        createdAt: created,
      },
    ],
    ops: {},
  };
}

async function ensure(): Promise<Persisted> {
  const current = read();
  if (current === "bad") {
    throw new OutputOperationError(
      "loadSnapshot",
      "Reconnecting. Saved demo jobs could not be read. Nothing was sent.",
      "reconnecting",
    );
  }
  if (current !== "missing") return current;
  const inspected = inspectSvgText("mara-decal.svg", SEED_SVG);
  if (!inspected.ok) throw new OutputOperationError("loadSnapshot", inspected.correction, "seed");
  const seeded = seedFromInspection(inspected);
  save(seeded);
  return seeded;
}

function applyQuote(job: Job, input: QuoteInput, quote: Quote, inspected: Extract<ReturnType<typeof inspectSvgText>, { ok: true }>) {
  job.fileName = inspected.fileName;
  job.svgText = inspected.svgText;
  job.preview = inspected.preview;
  job.cutlineName = inspected.cutlineName;
  job.quantity = input.quantity;
  job.widthIn = input.widthIn;
  job.heightIn = input.heightIn;
  job.laminate = input.laminate;
  job.fulfillment = "pickup";
  job.destination = job.destination || input.destination;
  job.deadline = input.deadline;
  job.readyBy = quote.readyBy;
  job.priceCents = quote.priceCents;
  job.payoutCents = quote.payoutCents;
  job.qualification = quote.reason;
  job.checks = quote.checks;
  job.alternatives = quote.alternatives;
}

function reinspect(input: QuoteInput) {
  return inspectSvgText(input.fileName, input.svgText);
}

const LOCKED = new Set(["funding_pending", "funded", "completion_submitted", "paid", "issue"]);

export function createFixturePort(): OutputPort {
  return {
    mode: "fixture",
    async loadSnapshot() {
      return toSnapshot(await ensure());
    },
    async quote(input) {
      const state = await ensure();
      const inspected = reinspect(input);
      if (!inspected.ok) return { ok: false, correction: inspected.correction, shopHint: false };
      return qualify(state.shop, { ...input, preview: inspected.preview, cutlineName: inspected.cutlineName, svgText: inspected.svgText });
    },
    async requestProduction(input, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, state.ops[opId]);
      const inspected = reinspect(input);
      if (!inspected.ok) return pack(state, false, undefined, inspected.correction, false);
      const quoted = qualify(state.shop, input);
      if (!quoted.ok) return pack(state, false, undefined, quoted.correction, quoted.shopHint);
      const created = nowIso();
      const job: Job = {
        id: `job_${crypto.randomUUID()}`,
        phase: "offered",
        expired: false,
        selfOrdered: true,
        requesterName: "You",
        shopId: state.shop.id,
        shopName: state.shop.name,
        fileName: inspected.fileName,
        svgText: inspected.svgText,
        preview: inspected.preview,
        cutlineName: inspected.cutlineName,
        quantity: input.quantity,
        widthIn: input.widthIn,
        heightIn: input.heightIn,
        laminate: input.laminate,
        fulfillment: "pickup",
        destination: state.shop.location,
        deadline: input.deadline,
        readyBy: quoted.quote.readyBy,
        priceCents: quoted.quote.priceCents,
        payoutCents: quoted.quote.payoutCents,
        currency: "USDC",
        network: "devnet",
        simulatedPayment: true,
        qualification: quoted.quote.reason,
        checks: quoted.quote.checks,
        alternatives: quoted.quote.alternatives,
        reservation: null,
        consumed: false,
        downloaded: false,
        completionPhoto: null,
        issueNote: null,
        receipt: null,
        termsChanged: false,
        revision: 1,
        fundingOpId: null,
        cardError: null,
        updatedAt: created,
        createdAt: created,
      };
      state.jobs.unshift(job);
      remember(state, opId, job.id);
      addNotice(state, {
        id: `n_${job.id}_offer`,
        jobId: job.id,
        role: "producing",
        kind: "offer",
        text: `New offer to review. ${job.quantity} contour-cut decals.`,
        createdAt: created,
      });
      save(state);
      return pack(state, true, job.id);
    },
    async acceptOffer(jobId, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, jobId);
      const job = findJob(state, jobId);
      if (!job) return pack(state, false, jobId, "That job is no longer available.");
      if (job.phase !== "offered") return pack(state, true, jobId);
      const expired = Date.parse(job.deadline) < Date.now();
      const fail = (message: string, action = "Open Shop and update availability.") => {
        job.cardError = { message, action };
        job.updatedAt = nowIso();
        addNotice(state, {
          id: `n_${job.id}_accept_block`,
          jobId: job.id,
          role: "producing",
          kind: "problem",
          text: "An offer could not be accepted. Nothing was reserved.",
          createdAt: job.updatedAt,
        });
        save(state);
        return pack(state, false, jobId, message, true);
      };
      if (!state.shop.confirmed) {
        return fail(`Confirm ${state.shop.name} in Shop before accepting. No capacity was reserved.`, "Open Shop and confirm the existing shop.");
      }
      if (expired) {
        job.cardError = { message: "This offer expired. Nothing was reserved.", action: "The requester has to send a new deadline." };
        job.updatedAt = nowIso();
        save(state);
        return pack(state, false, jobId, job.cardError.message, false);
      }
      if (!state.shop.receiving) return fail(`Capacity changed. ${state.shop.name} is paused, so this offer was not accepted and nothing was reserved.`);
      if (isStale(state.shop)) return fail("Capacity changed. Availability is stale. Confirm it in Shop before accepting. Nothing was reserved.");
      const need = Math.ceil(areaOf(job.widthIn, job.heightIn, job.quantity));
      if (job.widthIn > state.shop.usableWidthIn) return fail("Capacity changed. This decal is wider than the shop can cut. Nothing was reserved.");
      if (!state.shop.vinylOn || need > state.shop.inventory.vinyl.availableSqIn) {
        return fail("Capacity changed. Gloss-white vinyl is no longer available for this offer. Nothing was reserved.");
      }
      if (job.laminate && (!state.shop.laminateOn || need > state.shop.inventory.laminate.availableSqIn)) {
        return fail("Capacity changed. Gloss laminate is no longer available for this offer. Nothing was reserved.");
      }
      hold(state.shop, job);
      job.phase = "accepted";
      job.termsChanged = false;
      job.cardError = null;
      job.updatedAt = nowIso();
      remember(state, opId, job.id);
      if (job.selfOrdered) {
        addNotice(state, {
          id: `n_${job.id}_funding`,
          jobId: job.id,
          role: "ordering",
          kind: "funding",
          text: `Funding required. ${formatUsdc(job.priceCents)} (devnet). No payment has been made.`,
          createdAt: job.updatedAt,
        });
      }
      save(state);
      return pack(state, true, jobId);
    },
    async passOffer(jobId, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, jobId);
      const job = findJob(state, jobId);
      if (!job) return pack(state, false, jobId, "That job is no longer available.");
      if (job.phase !== "offered") {
        job.cardError = { message: "Only an open offer can be passed. Nothing was changed." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      release(state.shop, job);
      job.phase = "passed";
      job.cardError = null;
      job.updatedAt = nowIso();
      remember(state, opId, job.id);
      if (job.selfOrdered) {
        addNotice(state, {
          id: `n_${job.id}_passed`,
          jobId: job.id,
          role: "ordering",
          kind: "problem",
          text: "The shop passed on this job.",
          createdAt: job.updatedAt,
        });
      }
      save(state);
      return pack(state, true, jobId);
    },
    async fundJob(jobId, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, jobId);
      const job = findJob(state, jobId);
      if (!job) return pack(state, false, jobId, "That job is no longer available.");
      if (!job.selfOrdered) {
        job.cardError = { message: "Only the requester can fund this job. No payment was sent." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      if (job.phase === "funded" || job.phase === "completion_submitted" || job.phase === "paid" || job.phase === "issue") {
        return pack(state, true, jobId);
      }
      if (job.phase !== "accepted" && job.phase !== "funding_pending") {
        job.cardError = { message: "Funding is only available after the shop accepts. No payment was sent." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      job.phase = "funding_pending";
      job.fundingOpId = opId;
      job.cardError = null;
      job.updatedAt = nowIso();
      save(state);
      await wait(400);
      const next = await ensure();
      if (next.ops[opId]) return pack(next, true, jobId);
      const current = findJob(next, jobId);
      if (!current || current.phase !== "funding_pending") {
        return pack(next, false, jobId, "Funding is only available after the shop accepts. No payment was sent.");
      }
      if (!next.shop.payoutConfirmed) {
        current.phase = "accepted";
        current.fundingOpId = opId;
        current.cardError = {
          message: "Payment was not completed. The shop payout is not confirmed. No funds moved.",
          action: "Confirm the simulated payout in Shop, then try funding again.",
        };
        current.updatedAt = nowIso();
        addNotice(next, {
          id: `n_${jobId}_fund_failed`,
          jobId,
          role: "ordering",
          kind: "problem",
          text: "Funding was not completed. No funds moved.",
          createdAt: current.updatedAt,
        });
        save(next);
        return pack(next, false, jobId, current.cardError.message, true);
      }
      current.phase = "funded";
      current.fundingOpId = null;
      current.cardError = null;
      current.updatedAt = nowIso();
      remember(next, opId, jobId);
      addNotice(next, {
        id: `n_${jobId}_funded`,
        jobId,
        role: "producing",
        kind: "funded",
        text: "Funded job is ready for production.",
        createdAt: current.updatedAt,
      });
      save(next);
      return pack(next, true, jobId);
    },
    async productionFile(jobId) {
      const state = await ensure();
      const job = findJob(state, jobId);
      if (!job) throw new OutputOperationError("productionFile", "That job is no longer available.", "missing");
      if (job.phase !== "funded" && job.phase !== "issue" && job.phase !== "completion_submitted" && job.phase !== "paid") {
        throw new OutputOperationError(
          "productionFile",
          "The production file is available after funding. It was not downloaded.",
          "not_ready",
        );
      }
      const file: ProductionFile = { fileName: job.fileName, svgText: job.svgText };
      return file;
    },
    async markDownloaded(jobId, opId) {
      const state = await ensure();
      const job = findJob(state, jobId);
      if (!job) return pack(state, false, jobId, "That job is no longer available.");
      if (job.phase !== "funded" && job.phase !== "issue" && job.phase !== "completion_submitted" && job.phase !== "paid") {
        return pack(state, false, jobId, "The production file is available after funding. The job was not changed.");
      }
      job.downloaded = true;
      job.updatedAt = nowIso();
      remember(state, opId, jobId);
      save(state);
      return pack(state, true, jobId);
    },
    async submitCompletion(jobId, photo: CompletionPhoto, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, jobId);
      const job = findJob(state, jobId);
      if (!job) return pack(state, false, jobId, "That job is no longer available.");
      if (job.phase !== "funded" && job.phase !== "issue") {
        job.cardError = { message: "Submit a completion photo after the job is funded. Nothing was uploaded." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      if (!/^data:image\/(jpeg|png|webp);base64,/i.test(photo.dataUrl)) {
        job.cardError = { message: "Use a JPEG, PNG, or WebP completion photo. Nothing was uploaded." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      job.completionPhoto = { name: photo.name, dataUrl: photo.dataUrl };
      job.issueNote = null;
      job.phase = "completion_submitted";
      job.cardError = null;
      job.updatedAt = nowIso();
      remember(state, opId, jobId);
      if (job.selfOrdered) {
        addNotice(state, {
          id: `n_${job.id}_completion_${photo.dataUrl.length}`,
          jobId: job.id,
          role: "ordering",
          kind: "completion",
          text: "Completion is ready for review.",
          createdAt: job.updatedAt,
        });
      }
      save(state);
      return pack(state, true, jobId);
    },
    async approveAndRelease(jobId, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, jobId);
      const job = findJob(state, jobId);
      if (!job) return pack(state, false, jobId, "That job is no longer available.");
      if (job.phase === "paid" && job.receipt) return pack(state, true, jobId);
      if (job.phase !== "completion_submitted" || !job.completionPhoto) {
        job.cardError = { message: "Release payment only after you review a completion photo. Nothing was marked paid." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      await wait(350);
      const next = await ensure();
      if (next.ops[opId]) return pack(next, true, jobId);
      const current = findJob(next, jobId);
      if (!current || current.phase !== "completion_submitted" || !current.completionPhoto) {
        return pack(next, false, jobId, "Release payment only after you review a completion photo. Nothing was marked paid.");
      }
      const settledAt = nowIso();
      current.phase = "paid";
      current.cardError = null;
      current.receipt = {
        reference: `demo-${current.id}`,
        amountCents: current.priceCents,
        currency: "USDC",
        network: "devnet",
        simulated: true,
        settledAt,
      };
      current.updatedAt = settledAt;
      consume(next.shop, current);
      remember(next, opId, jobId);
      save(next);
      return pack(next, true, jobId);
    },
    async reportIssue(jobId, note, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, jobId);
      const job = findJob(state, jobId);
      if (!job) return pack(state, false, jobId, "That job is no longer available.");
      if (job.phase !== "completion_submitted") {
        job.cardError = { message: "Report an issue from the completion review. The job was not changed." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      const clean = note.trim();
      if (!clean) {
        job.cardError = { message: "Describe the issue before sending. Nothing was submitted." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      job.phase = "issue";
      job.issueNote = clean;
      job.cardError = null;
      job.updatedAt = nowIso();
      remember(state, opId, jobId);
      addNotice(state, {
        id: `n_${job.id}_issue_${job.revision}`,
        jobId: job.id,
        role: "producing",
        kind: "problem",
        text: "A production issue was reported. A new completion photo is needed.",
        createdAt: job.updatedAt,
      });
      save(state);
      return pack(state, true, jobId);
    },
    async reviseTerms(jobId, input, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, jobId);
      const job = findJob(state, jobId);
      if (!job) return pack(state, false, jobId, "That job is no longer available.");
      if (!job.selfOrdered) {
        job.cardError = { message: "Only the requester can change these terms. Nothing was changed." };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      if (LOCKED.has(job.phase)) {
        job.cardError = {
          message: "This job is already funded. Terms can't be swapped. Report an issue if something is wrong. Nothing was changed.",
          action: "Report an issue from the completion review, after the shop submits a photo.",
        };
        save(state);
        return pack(state, false, jobId, job.cardError.message);
      }
      const inspected = reinspect(input);
      if (!inspected.ok) {
        job.cardError = { message: inspected.correction, action: "Choose a corrected SVG. The current artwork is unchanged." };
        save(state);
        return pack(state, false, jobId, inspected.correction);
      }
      const quoted = qualify(state.shop, input);
      if (!quoted.ok) {
        job.cardError = {
          message: quoted.correction,
          action: quoted.shopHint ? "Update Shop, then save the terms again." : "Edit the requirement and save again.",
        };
        save(state);
        return pack(state, false, jobId, quoted.correction, quoted.shopHint);
      }
      if (job.phase === "accepted") release(state.shop, job);
      applyQuote(job, input, quoted.quote, inspected);
      job.destination = state.shop.location;
      job.phase = "offered";
      job.revision += 1;
      job.termsChanged = true;
      job.cardError = null;
      job.updatedAt = nowIso();
      remember(state, opId, jobId);
      addNotice(state, {
        id: `n_${job.id}_revise_${job.revision}`,
        jobId: job.id,
        role: "producing",
        kind: "offer",
        text: "Offer updated. Review the new terms before accepting.",
        createdAt: job.updatedAt,
      });
      save(state);
      return pack(state, true, jobId);
    },
    async confirmShop(opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, SHOP_ID);
      state.shop.confirmed = true;
      remember(state, opId, SHOP_ID);
      save(state);
      return pack(state, true, SHOP_ID);
    },
    async updateAvailability(patch: AvailabilityPatch, opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, SHOP_ID);
      if (!state.shop.confirmed) {
        return pack(state, false, SHOP_ID, `Confirm ${state.shop.name} before changing availability. No shop was created.`);
      }
      if (typeof patch.receiving === "boolean") state.shop.receiving = patch.receiving;
      if (typeof patch.vinylOn === "boolean") state.shop.vinylOn = patch.vinylOn;
      if (typeof patch.laminateOn === "boolean") state.shop.laminateOn = patch.laminateOn;
      if (patch.availableAfter !== undefined) state.shop.availableAfter = patch.availableAfter;
      remember(state, opId, SHOP_ID);
      save(state);
      return pack(state, true, SHOP_ID);
    },
    async confirmAvailability(opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, SHOP_ID);
      if (!state.shop.confirmed) {
        return pack(state, false, SHOP_ID, `Confirm ${state.shop.name} before confirming availability. No shop was created.`);
      }
      state.shop.lastConfirmedAt = nowIso();
      remember(state, opId, SHOP_ID);
      save(state);
      return pack(state, true, SHOP_ID);
    },
    async confirmPayout(opId) {
      const state = await ensure();
      if (state.ops[opId]) return pack(state, true, SHOP_ID);
      state.shop.payoutConfirmed = true;
      remember(state, opId, SHOP_ID);
      save(state);
      return pack(state, true, SHOP_ID);
    },
    async dismissNotice(noticeId) {
      const state = await ensure();
      state.notices = state.notices.filter((notice) => notice.id !== noticeId);
      save(state);
      return pack(state, true);
    },
  };
}
