import { useRef, useState } from "react";
import { ArtworkPreview } from "./ArtworkPreview";
import { DraftPanel } from "./DraftPanel";
import { formatSize, formatWhen, handoff, materialLine, materialUsed } from "./format";
import type { Job } from "./types";
import type { OutputController } from "./useOutput";

type Stage = "closed" | "requests" | "amount" | "more" | "send";

function figure(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function OutputWidget({ controller }: { controller: OutputController }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("closed");
  const [pick, setPick] = useState<string | null>(null);
  const jobs = controller.snapshot?.jobs ?? [];
  const offers = jobs.filter((job) => job.phase === "offered" && !job.expired);
  const picked = offers.find((job) => job.id === pick) ?? offers[0] ?? null;

  function close() {
    setStage("closed");
    setPick(null);
    controller.closePanel();
  }

  function showRequests() {
    setPick(null);
    setStage((current) => (current === "requests" ? "closed" : "requests"));
  }

  function showAmount(job: Job) {
    setPick(job.id);
    setStage("amount");
  }

  function send() {
    setPick(null);
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
        if (file) void controller.takeFile(file);
        if (file) setStage("send");
      }}
    >
      <div className="output-shell">
        {dragging && <p className="drop-hint">SVG with a cut line.</p>}
        {stage === "requests" && (
          <div className="layer">
            {offers.length === 0 && <p className="fine">No jobs.</p>}
            {offers.map((job) => (
              <button key={job.id} type="button" className="request-line" onClick={() => showAmount(job)}>
                + job request
              </button>
            ))}
          </div>
        )}
        {stage === "amount" && picked && (
          <div className="layer">
            <p className="win" aria-label={`You receive ${figure(picked.payoutCents)} USDC, devnet, after release`}>
              <strong>{figure(picked.payoutCents)}</strong>
              <span>devnet</span>
            </p>
            <button type="button" className="more" onClick={() => setStage("more")}>
              More
            </button>
          </div>
        )}
        {stage === "more" && picked && <More job={picked} controller={controller} />}
        {stage === "send" && <DraftPanel controller={controller} onPick={() => fileRef.current?.click()} />}
        <div className="output-strip" role="toolbar" aria-label="OUTPUT">
          <button type="button" className="mark" onClick={close} aria-label="Close">
            OUTPUT
          </button>
          <button
            type="button"
            className="ping"
            onClick={showRequests}
            disabled={offers.length === 0}
            aria-expanded={stage === "requests" || stage === "amount" || stage === "more"}
            aria-label={offers.length === 0 ? "No incoming jobs" : `${offers.length} incoming`}
          >
            {offers.length > 0 ? `+${offers.length}` : ""}
          </button>
          <button type="button" className="send" onClick={send} aria-label="Send a job. SVG with a cut line, 5 MB maximum.">
            Send
          </button>
        </div>
      </div>
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
          if (file) {
            setStage("send");
            void controller.takeFile(file);
          }
        }}
      />
    </div>
  );
}

function More({ job, controller }: { job: Job; controller: OutputController }) {
  const busy = controller.pending !== null;
  return (
    <div className="layer">
      <p className="win" aria-label={`You receive ${figure(job.payoutCents)} USDC`}>
        <strong>{figure(job.payoutCents)}</strong>
      </p>
      <p className="line">
        {formatSize(job.widthIn, job.heightIn)} · {job.quantity}
      </p>
      <p className="line">{materialLine(job.laminate)}</p>
      <p className="line">{materialUsed(job)}</p>
      <p className="line">{formatWhen(job.deadline)}</p>
      <p className="line">{handoff(job.fulfillment)}</p>
      <ArtworkPreview model={job.preview} expanded={false} onToggle={() => undefined} bare />
      {job.cardError && <p className="err">{job.cardError.message}</p>}
      <div className="action-row">
        <button type="button" className="primary" disabled={busy} onClick={() => void controller.accept(job)}>
          {controller.pending === `accept:${job.id}` ? "Accepting…" : "Accept"}
        </button>
        <button type="button" disabled={busy} onClick={() => void controller.pass(job)}>
          Pass
        </button>
      </div>
    </div>
  );
}
