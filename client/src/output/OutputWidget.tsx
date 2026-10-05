import { useEffect, useRef, useState } from "react";
import { ArtworkPreview } from "./ArtworkPreview";
import { DraftPanel } from "./DraftPanel";
import { formatSize, formatWhen, handoff, materialLine, materialUsed } from "./format";
import { ShopPanel } from "./ShopPanel";
import type { Job } from "./types";
import type { OutputController } from "./useOutput";

type Stage = "closed" | "ledger" | "offer" | "send" | "shop";

const WORKING = new Set(["accepted", "funding_pending", "funded", "completion_submitted", "issue"]);

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function jobName(job: Job): string {
  return job.fileName.replace(/\.svg$/i, "") || "Job";
}

export function OutputWidget({ controller }: { controller: OutputController }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const announced = useRef(new Set<string>());
  const booted = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("closed");
  const [pick, setPick] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const jobs = controller.snapshot?.jobs ?? [];
  const offers = jobs.filter((job) => job.phase === "offered" && !job.expired);
  const working = jobs.filter((job) => WORKING.has(job.phase));
  const done = jobs.filter((job) => job.phase === "paid");
  const made = done.reduce((sum, job) => sum + job.payoutCents, 0);
  const picked = offers.find((job) => job.id === pick) ?? offers[0] ?? null;

  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      for (const job of offers) announced.current.add(job.id);
      if (offers[0]) {
        setPick(offers[0].id);
        setDetails(false);
        setStage("offer");
      }
      return;
    }
    const fresh = offers.find((job) => !announced.current.has(job.id));
    for (const job of offers) announced.current.add(job.id);
    if (fresh) {
      setPick(fresh.id);
      setDetails(false);
      setStage("offer");
    }
  }, [offers]);

  useEffect(() => {
    if (stage === "offer" && picked && picked.phase !== "offered") setStage("ledger");
  }, [stage, picked]);

  function close() {
    setStage("closed");
    setDetails(false);
    controller.closePanel();
  }

  function openLedger() {
    setDetails(false);
    setStage((current) => (current === "ledger" ? "closed" : "ledger"));
  }

  function openOffer(job: Job) {
    setPick(job.id);
    setDetails(false);
    setStage("offer");
  }

  function upload() {
    setDetails(false);
    setStage("send");
    controller.openSend();
  }

  return (
    <div
      className={`output-anchor${stage !== "closed" ? " open" : ""}${dragging ? " dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (!file) return;
        setStage("send");
        void controller.takeFile(file);
      }}
    >
      <div className="output-shell">
        {dragging && <p className="drop-hint">SVG with a cut line.</p>}
        {stage === "ledger" && (
          <div className="layer ledger" aria-label="Jobs">
            <div className="ledger-head">
              <span>Jobs</span>
              <span className="money">{money(made)}</span>
            </div>
            {offers.map((job) => (
              <button key={job.id} type="button" className="job-row incoming" onClick={() => openOffer(job)}>
                <span className="job-name">{jobName(job)}</span>
                <span className="job-mid" />
                <span className="money">{money(job.payoutCents)}</span>
              </button>
            ))}
            {working.map((job) => (
              <div key={job.id} className="job-row">
                <span className="job-name">{jobName(job)}</span>
                <span className="dots" aria-label="In progress">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="money">{money(job.payoutCents)}</span>
              </div>
            ))}
            {done.map((job) => (
              <div key={job.id} className="job-row done">
                <span className="job-name">{jobName(job)}</span>
                <span className="job-mid" />
                <span className="money">{money(job.payoutCents)}</span>
              </div>
            ))}
          </div>
        )}
        {stage === "offer" && picked && (
          <div className="layer offer">
            <div className="offer-top">
              <span className="job-name">{jobName(picked)}</span>
              <span className="money">{money(picked.payoutCents)}</span>
            </div>
            <div className="offer-actions">
              <button
                type="button"
                className="accept"
                disabled={controller.pending !== null}
                onClick={() => void controller.accept(picked)}
              >
                {controller.pending === `accept:${picked.id}` ? "…" : "accept?"}
              </button>
              <button type="button" className="more" onClick={() => setDetails((open) => !open)} aria-expanded={details}>
                more details
              </button>
            </div>
            {picked.cardError && <p className="err">{picked.cardError.message}</p>}
            {details && <Details job={picked} />}
          </div>
        )}
        {stage === "send" && <DraftPanel controller={controller} onPick={() => fileRef.current?.click()} />}
        {stage === "shop" && <ShopPanel controller={controller} onClose={() => setStage("closed")} />}
        <div className="output-strip" role="toolbar" aria-label="OUTPUT">
          <button type="button" className="mark" onClick={close}>
            OUTPUT
          </button>
          <div className="strip-actions">
            <button type="button" className="upload" onClick={upload}>
              upload
            </button>
            <button type="button" className="gear" aria-label="Settings" onClick={() => setStage("shop")}>
              <Gear />
            </button>
          </div>
        </div>
      </div>
      {offers.length > 0 && (
        <button
          type="button"
          className="plus"
          onClick={openLedger}
          aria-expanded={stage === "ledger"}
          aria-label={`${offers.length} incoming ${offers.length === 1 ? "job" : "jobs"}`}
        >
          +{offers.length}
        </button>
      )}
      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept=".svg,image/svg+xml"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setStage("send");
          void controller.takeFile(file);
        }}
      />
    </div>
  );
}

function Details({ job }: { job: Job }) {
  return (
    <div className="detail">
      <p>
        {formatSize(job.widthIn, job.heightIn)} · {job.quantity}
      </p>
      <p>{materialLine(job.laminate)}</p>
      <p>{materialUsed(job)}</p>
      <p>{formatWhen(job.deadline)}</p>
      <p>
        {handoff(job.fulfillment)}
        {job.fulfillment === "delivery" ? ` · ${job.destination}` : ""}
      </p>
      <p className="fine">
        {money(job.payoutCents)} USDC · devnet
      </p>
      <ArtworkPreview model={job.preview} expanded={false} onToggle={() => undefined} bare />
    </div>
  );
}

function Gear() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.7 1.2h2.6l.4 1.6c.4.1.7.3 1 .5l1.5-.6 1.3 2.2-1.2 1.1c.1.3.1.7.1 1s0 .7-.1 1l1.2 1.1-1.3 2.2-1.5-.6c-.3.2-.6.4-1 .5l-.4 1.6H6.7l-.4-1.6c-.4-.1-.7-.3-1-.5l-1.5.6-1.3-2.2 1.2-1.1c-.1-.3-.1-.7-.1-1s0-.7.1-1L2.5 4.9l1.3-2.2 1.5.6c.3-.2.6-.4 1-.5l.4-1.6ZM8 6.2A1.8 1.8 0 1 0 8 9.8 1.8 1.8 0 0 0 8 6.2Z"
      />
    </svg>
  );
}
