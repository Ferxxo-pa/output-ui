import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvailabilityPatch, CompletionPhoto, Draft, Job, Notice, Panel, QuoteInput, Role } from "./types";
import { createOutputPort, type MutationResult } from "./adapter";
import { downloadText, fromLocalInput, groupJobs, stripStatus } from "./format";
import { ching } from "@/lib/ching";
import { inspectSvgFile } from "./svg/inspect";

const PREFS_KEY = "output.ui.prefs.v1";

type Prefs = {
  sound: boolean;
  laminate: boolean;
  fulfillment: "pickup" | "delivery";
  destination: string;
};

type Selection = { id: string; role: Role };

function readPrefs(): Prefs {
  const fallback: Prefs = { sound: false, laminate: false, fulfillment: "pickup", destination: "" };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      sound: Boolean(parsed.sound),
      laminate: Boolean(parsed.laminate),
      fulfillment: parsed.fulfillment === "delivery" ? "delivery" : "pickup",
      destination: typeof parsed.destination === "string" ? parsed.destination : "",
    };
  } catch {
    return fallback;
  }
}

function writePrefs(prefs: Prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function emptyDraft(prefs: Prefs): Draft {
  return {
    fileName: "",
    svgText: "",
    preview: null,
    cutlineName: null,
    quantity: "",
    widthIn: "",
    heightIn: "",
    dimensionsConfirmed: false,
    dimensionNote: "",
    laminate: prefs.laminate,
    fulfillment: prefs.fulfillment,
    destination: prefs.destination,
    deadline: "",
    fileError: null,
    quoting: false,
    quote: null,
    quoteError: null,
    shopHint: false,
  };
}

function inches(value: number) {
  return String(Math.round(value * 100) / 100);
}

export function useOutput() {
  const port = useMemo(() => createOutputPort(), []);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof port.loadSnapshot>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("closed");
  const [collapsed, setCollapsed] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [sound, setSoundState] = useState(false);
  const [artExpanded, setArtExpanded] = useState(false);
  const pendingRef = useRef<string | null>(null);
  const opKeys = useRef<Record<string, string>>({});
  const sounded = useRef(new Set<string>());
  const booted = useRef(false);
  const prefs = useRef<Prefs>(readPrefs());

  const reload = useCallback(async () => {
    try {
      const next = await port.loadSnapshot();
      setSnapshot(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Reconnecting. Nothing was sent.");
    }
  }, [port]);

  useEffect(() => {
    prefs.current = readPrefs();
    setSoundState(prefs.current.sound);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!snapshot) return;
    if (!booted.current) {
      snapshot.notices.forEach((notice) => sounded.current.add(notice.id));
      booted.current = true;
      return;
    }
    for (const notice of snapshot.notices) {
      if (sounded.current.has(notice.id)) continue;
      sounded.current.add(notice.id);
      if (sound) ching();
    }
  }, [snapshot, sound]);

  useEffect(() => {
    if (!draft) return;
    const width = Number(draft.widthIn);
    const height = Number(draft.heightIn);
    const quantity = Number(draft.quantity);
    const deadline = fromLocalInput(draft.deadline);
    const ready =
      Boolean(draft.preview && draft.svgText && draft.cutlineName && !draft.fileError && draft.dimensionsConfirmed) &&
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      width > 0 &&
      height > 0 &&
      Boolean(deadline) &&
      (draft.fulfillment === "pickup" || draft.destination.trim().length > 0);
    if (!ready || !deadline || !draft.preview || !draft.cutlineName) {
      setDraft((current) =>
        current && (current.quote || current.quoteError || current.quoting)
          ? { ...current, quote: null, quoteError: null, quoting: false, shopHint: false }
          : current,
      );
      return;
    }
    const input: QuoteInput = {
      fileName: draft.fileName,
      svgText: draft.svgText,
      preview: draft.preview,
      cutlineName: draft.cutlineName,
      quantity,
      widthIn: width,
      heightIn: height,
      laminate: draft.laminate,
      fulfillment: draft.fulfillment,
      destination: draft.fulfillment === "pickup" ? snapshot?.shop?.location || "Pickup" : draft.destination.trim(),
      deadline,
    };
    let cancel = false;
    const timer = window.setTimeout(() => {
      setDraft((current) => (current ? { ...current, quoting: true } : current));
      void port
        .quote(input)
        .then((result) => {
          if (cancel) return;
          setDraft((current) => {
            if (!current) return current;
            if (result.ok) return { ...current, quoting: false, quote: result.quote, quoteError: null, shopHint: false };
            return { ...current, quoting: false, quote: null, quoteError: result.correction, shopHint: result.shopHint };
          });
        })
        .catch((error: unknown) => {
          if (cancel) return;
          const message = error instanceof Error ? error.message : "Couldn't check shops. No offer was sent.";
          setDraft((current) => (current ? { ...current, quoting: false, quote: null, quoteError: message, shopHint: false } : current));
        });
    }, 200);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [
    port,
    draft?.svgText,
    draft?.fileName,
    draft?.cutlineName,
    draft?.quantity,
    draft?.widthIn,
    draft?.heightIn,
    draft?.dimensionsConfirmed,
    draft?.laminate,
    draft?.fulfillment,
    draft?.destination,
    draft?.deadline,
    draft?.fileError,
    draft?.preview,
    snapshot?.shop?.location,
    snapshot?.shop?.receiving,
    snapshot?.shop?.vinylOn,
    snapshot?.shop?.laminateOn,
    snapshot?.shop?.capacityStale,
    snapshot?.shop?.availableAfter,
    snapshot?.shop?.inventory.vinyl.availableSqIn,
    snapshot?.shop?.inventory.laminate.availableSqIn,
  ]);

  async function run(key: string, opKey: string, fn: (opId: string) => Promise<MutationResult>) {
    if (pendingRef.current) return null;
    const opId = opKeys.current[opKey] ?? crypto.randomUUID();
    opKeys.current[opKey] = opId;
    pendingRef.current = key;
    setPending(key);
    try {
      const result = await fn(opId);
      setSnapshot(result.snapshot);
      setLoadError(null);
      if (result.committed) delete opKeys.current[opKey];
      return result;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "That action failed. Nothing was confirmed.");
      return null;
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }

  function rememberDraftPrefs(next: Draft) {
    prefs.current = {
      ...prefs.current,
      laminate: next.laminate,
      fulfillment: next.fulfillment,
      destination: next.destination,
    };
    writePrefs(prefs.current);
  }

  async function takeFile(file: File) {
    setCollapsed(false);
    setPanel("draft");
    setArtExpanded(false);
    const result = await inspectSvgFile(file);
    if (!result.ok) {
      setDraft((current) => ({
        ...(current ?? emptyDraft(prefs.current)),
        fileName: file.name,
        svgText: "",
        preview: null,
        cutlineName: null,
        fileError: result.correction,
        quote: null,
        quoteError: null,
        quoting: false,
        dimensionsConfirmed: false,
      }));
      return;
    }
    setDraft({
      ...emptyDraft(prefs.current),
      fileName: result.fileName,
      svgText: result.svgText,
      preview: result.preview,
      cutlineName: result.cutlineName,
      widthIn: result.widthIn != null ? inches(result.widthIn) : "",
      heightIn: result.heightIn != null ? inches(result.heightIn) : "",
      dimensionNote: result.dimensionNote,
      fileError: null,
    });
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (patch.widthIn !== undefined || patch.heightIn !== undefined) next.dimensionsConfirmed = false;
      return next;
    });
  }

  async function registerUpload(file: File): Promise<string | null> {
    const inspected = await inspectSvgFile(file);
    if (!inspected.ok) return inspected.correction;
    const widthIn = inspected.widthIn && inspected.widthIn > 0 ? inspected.widthIn : 3;
    const heightIn = inspected.heightIn && inspected.heightIn > 0 ? inspected.heightIn : 2;
    const deadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const input: QuoteInput = {
      fileName: inspected.fileName,
      svgText: inspected.svgText,
      preview: inspected.preview,
      cutlineName: inspected.cutlineName,
      quantity: 1,
      widthIn,
      heightIn,
      laminate: false,
      fulfillment: "pickup",
      destination: snapshot?.shop?.location || "Pickup",
      deadline,
    };
    const result = await run(
      "register",
      `register:${inspected.fileName}:${inspected.svgText.length}:${deadline}`,
      (opId) => port.requestProduction(input, opId),
    );
    if (!result) return "Still finishing the last file.";
    if (!result.committed) return result.message ?? "That file was not registered.";
    return null;
  }

  async function requestProduction() {
    if (!draft?.preview || !draft.cutlineName) return;
    const quantity = Number(draft.quantity);
    const widthIn = Number(draft.widthIn);
    const heightIn = Number(draft.heightIn);
    const deadline = fromLocalInput(draft.deadline);
    if (!deadline) return;
    const input: QuoteInput = {
      fileName: draft.fileName,
      svgText: draft.svgText,
      preview: draft.preview,
      cutlineName: draft.cutlineName,
      quantity,
      widthIn,
      heightIn,
      laminate: draft.laminate,
      fulfillment: draft.fulfillment,
      destination: draft.fulfillment === "pickup" ? snapshot?.shop?.location || "Pickup" : draft.destination.trim(),
      deadline,
    };
    const opKey = `request:${draft.fileName}:${quantity}:${widthIn}:${heightIn}:${draft.laminate}:${draft.fulfillment}:${deadline}`;
    const result = await run("request", opKey, (opId) => port.requestProduction(input, opId));
    if (!result) return;
    if (!result.committed) {
      setDraft((current) =>
        current
          ? { ...current, quote: null, quoteError: result.message ?? "No offer was sent.", shopHint: Boolean(result.shopHint) }
          : current,
      );
      return;
    }
    rememberDraftPrefs(draft);
    setDraft(null);
    if (result.jobId) {
      setSelection({ id: result.jobId, role: "ordering" });
      setPanel("job");
    }
  }

  function openOutput() {
    setCollapsed(false);
    setArtExpanded(false);
    setPanel((current) => (current === "closed" ? "inbox" : "closed"));
  }

  function openSend() {
    setCollapsed(false);
    setPanel("draft");
    setDraft((current) => current ?? emptyDraft(prefs.current));
  }

  function openJob(id: string, role: Role) {
    setCollapsed(false);
    setArtExpanded(false);
    setSelection({ id, role });
    setPanel("job");
  }

  function openNotice(notice: Notice) {
    openJob(notice.jobId, notice.role);
  }

  const attention = snapshot ? groupJobs(snapshot.jobs).needs.length : 0;
  const status = !snapshot
    ? loadError
      ? "Not connected"
      : "Loading"
    : stripStatus(attention, snapshot.shop?.presence ?? "disconnected");

  const selectedJob: Job | null = snapshot?.jobs.find((job) => job.id === selection?.id) ?? null;

  return {
    mode: port.mode,
    snapshot,
    loadError,
    panel,
    collapsed,
    selection,
    selectedJob,
    draft,
    pending,
    sound,
    artExpanded,
    attention,
    status,
    reload,
    openOutput,
    openSend,
    openInbox: () => {
      setCollapsed(false);
      setPanel("inbox");
    },
    openShop: () => {
      setCollapsed(false);
      setPanel("shop");
    },
    closePanel: () => setPanel("closed"),
    backToInbox: () => setPanel("inbox"),
    toggleCollapsed: () => {
      setCollapsed((value) => !value);
      setPanel("closed");
    },
    openJob,
    openNotice,
    takeFile,
    registerUpload,
    updateDraft,
    requestProduction,
    toggleArt: () => setArtExpanded((value) => !value),
    setSound: (next: boolean) => {
      setSoundState(next);
      prefs.current = { ...prefs.current, sound: next };
      writePrefs(prefs.current);
    },
    accept: (job: Job) => run(`accept:${job.id}`, `accept:${job.id}`, (opId) => port.acceptOffer(job.id, opId)),
    pass: (job: Job) => run(`pass:${job.id}`, `pass:${job.id}`, (opId) => port.passOffer(job.id, opId)),
    fund: (job: Job) => {
      const opKey = `fund:${job.id}`;
      if (job.fundingOpId) opKeys.current[opKey] = job.fundingOpId;
      return run(`fund:${job.id}`, opKey, (opId) => port.fundJob(job.id, opId));
    },
    download: async (job: Job) => {
      if (pendingRef.current) return;
      pendingRef.current = `download:${job.id}`;
      setPending(`download:${job.id}`);
      try {
        const file = await port.productionFile(job.id);
        downloadText(file.fileName, file.svgText, "image/svg+xml");
        const opKey = `download:${job.id}`;
        const opId = opKeys.current[opKey] ?? crypto.randomUUID();
        opKeys.current[opKey] = opId;
        const result = await port.markDownloaded(job.id, opId);
        setSnapshot(result.snapshot);
        if (result.committed) delete opKeys.current[opKey];
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "The production file was not downloaded.");
      } finally {
        pendingRef.current = null;
        setPending(null);
      }
    },
    submitCompletion: (job: Job, photo: CompletionPhoto) =>
      run(`complete:${job.id}:${photo.dataUrl.length}`, `complete:${job.id}:${photo.name}:${photo.dataUrl.length}`, (opId) =>
        port.submitCompletion(job.id, photo, opId),
      ),
    approve: (job: Job) => run(`approve:${job.id}`, `approve:${job.id}`, (opId) => port.approveAndRelease(job.id, opId)),
    reportIssue: (job: Job, note: string) =>
      run(`issue:${job.id}:${note}`, `issue:${job.id}:${note}`, (opId) => port.reportIssue(job.id, note, opId)),
    revise: (job: Job, input: QuoteInput) => {
      const opKey = `revise:${job.id}:${input.quantity}:${input.widthIn}:${input.heightIn}:${input.laminate}:${input.deadline}:${input.fileName}:${input.svgText.length}`;
      return run(`revise:${job.id}`, opKey, (opId) => port.reviseTerms(job.id, input, opId));
    },
    confirmShop: () => run("confirm-shop", "confirm-shop", (opId) => port.confirmShop(opId)),
    updateAvailability: (patch: AvailabilityPatch) => {
      const opKey = `availability:${JSON.stringify(patch)}:${Date.now()}`;
      return run("availability", opKey, (opId) => port.updateAvailability(patch, opId));
    },
    confirmAvailability: () => run("confirm-capacity", `confirm-capacity:${Date.now()}`, (opId) => port.confirmAvailability(opId)),
    confirmPayout: () => run("confirm-payout", "confirm-payout", (opId) => port.confirmPayout(opId)),
    dismissNotice: (noticeId: string) => run(`dismiss:${noticeId}`, `dismiss:${noticeId}`, () => port.dismissNotice(noticeId)),
  };
}

export type OutputController = ReturnType<typeof useOutput>;
