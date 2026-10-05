import { useState } from "react";
import { ArtworkPreview } from "./ArtworkPreview";
import { formatSize, formatUsdc, formatWhen, fromLocalInput, handoff, materialLine, materialUsed, phaseLabel, roleLabel, toLocalInput } from "./format";
import { inspectSvgFile } from "./svg/inspect";
import type { Job, QuoteInput, Role } from "./types";
import type { OutputController } from "./useOutput";

const EDITABLE = new Set(["offered", "accepted", "passed"]);

function readPhoto(file: File): Promise<{ name: string; dataUrl: string }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return Promise.reject(new Error("Use a JPEG, PNG, or WebP completion photo."));
  }
  if (file.size > 1_500_000) return Promise.reject(new Error("Use a completion photo under 1.5 MB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That photo could not be read. Try it again."));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl)) {
        reject(new Error("That photo could not be read. Try a JPEG, PNG, or WebP."));
        return;
      }
      resolve({ name: file.name, dataUrl });
    };
    reader.readAsDataURL(file);
  });
}

export function JobCard({
  controller,
  job,
  role,
}: {
  controller: OutputController;
  job: Job;
  role: Role;
}) {
  const { pending, artExpanded, toggleArt, backToInbox, openShop, accept, pass, fund, download, submitCompletion, approve, reportIssue, revise } =
    controller;
  const [issueOpen, setIssueOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photo, setPhoto] = useState<{ name: string; dataUrl: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    quantity: String(job.quantity),
    widthIn: String(job.widthIn),
    heightIn: String(job.heightIn),
    laminate: job.laminate,
    fulfillment: job.fulfillment,
    deadline: toLocalInput(job.deadline),
    fileName: job.fileName,
    svgText: job.svgText,
    preview: job.preview,
    cutlineName: job.cutlineName,
  });
  const busy = pending !== null;
  const ordering = role === "ordering";
  const canEdit = ordering && EDITABLE.has(job.phase);

  async function onPhoto(file: File | undefined) {
    setLocalError(null);
    if (!file) return;
    try {
      const next = await readPhoto(file);
      setPhoto(next);
      setPhotoName(file.name);
    } catch (error) {
      setPhoto(null);
      setLocalError(error instanceof Error ? error.message : "That photo could not be read.");
    }
  }

  async function onReplace(file: File | undefined) {
    if (!file) return;
    const result = await inspectSvgFile(file);
    if (!result.ok) {
      setLocalError(result.correction);
      return;
    }
    setLocalError(null);
    setEdit((current) => ({
      ...current,
      fileName: result.fileName,
      svgText: result.svgText,
      preview: result.preview,
      cutlineName: result.cutlineName,
      widthIn: result.widthIn != null ? String(Math.round(result.widthIn * 100) / 100) : current.widthIn,
      heightIn: result.heightIn != null ? String(Math.round(result.heightIn * 100) / 100) : current.heightIn,
    }));
  }

  async function saveTerms() {
    const deadline = fromLocalInput(edit.deadline);
    const quantity = Number(edit.quantity);
    const widthIn = Number(edit.widthIn);
    const heightIn = Number(edit.heightIn);
    if (!deadline || !Number.isInteger(quantity) || quantity < 1 || !(widthIn > 0) || !(heightIn > 0)) {
      setLocalError("Enter a quantity, finished size, and deadline. Nothing was changed.");
      return;
    }
    const input: QuoteInput = {
      fileName: edit.fileName,
      svgText: edit.svgText,
      preview: edit.preview,
      cutlineName: edit.cutlineName,
      quantity,
      widthIn,
      heightIn,
      laminate: edit.laminate,
      fulfillment: edit.fulfillment,
      destination: job.destination,
      deadline,
    };
    const result = await revise(job, input);
    if (result?.committed) setEditing(false);
  }

  return (
    <section className="output-panel" aria-labelledby="output-panel-title">
      <header className="panel-head">
        <h2 id="output-panel-title" tabIndex={-1}>
          {roleLabel(role)}
        </h2>
        <button type="button" onClick={backToInbox}>
          Inbox
        </button>
      </header>
      <p className="phase">{phaseLabel(job, role)}</p>
      {!ordering && job.phase !== "passed" && !(job.expired && job.phase === "offered") && (
        <p className="make-line">
          <span>You receive</span>
          <strong>{formatUsdc(job.payoutCents)}</strong>
          <span>{job.phase === "paid" ? "Paid" : `${job.network} · after they release`}</span>
        </p>
      )}
      <dl className="facts">
        <div>
          <dt>Size</dt>
          <dd>{formatSize(job.widthIn, job.heightIn)}</dd>
        </div>
        <div>
          <dt>Qty</dt>
          <dd>{job.quantity}</dd>
        </div>
        <div>
          <dt>Material</dt>
          <dd>{materialLine(job.laminate)}</dd>
        </div>
        <div>
          <dt>Used</dt>
          <dd>{materialUsed(job)}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{formatWhen(job.deadline)}</dd>
        </div>
        <div>
          <dt>Handoff</dt>
          <dd>{handoff(job.fulfillment)}</dd>
        </div>
        {ordering && (
          <div>
            <dt>Price</dt>
            <dd>
              {formatUsdc(job.priceCents)} · {job.network}
            </dd>
          </div>
        )}
      </dl>
      <ArtworkPreview model={job.preview} expanded={artExpanded} onToggle={toggleArt} />
      {job.termsChanged && job.phase === "offered" && (
        <p>Terms changed. Accept again. Nothing is reserved.</p>
      )}
      {(job.cardError || localError) && (
        <div className="err" role="alert">
          <p>{localError || job.cardError?.message}</p>
          {job.cardError?.action && <p>{job.cardError.action}</p>}
          {job.cardError?.action && (
            <button type="button" onClick={openShop}>
              Open shop
            </button>
          )}
        </div>
      )}

      {!ordering && job.phase === "offered" && !job.expired && (
        <>
          <div className="action-row">
            <button type="button" className="primary" disabled={busy} onClick={() => void accept(job)}>
              {pending === `accept:${job.id}` ? "Accepting…" : "Accept job"}
            </button>
            <button type="button" disabled={busy} onClick={() => void pass(job)}>
              {pending === `pass:${job.id}` ? "Passing…" : "Pass"}
            </button>
          </div>
        </>
      )}
      {!ordering && job.expired && job.phase === "offered" && (
        <p>Expired. Nothing was reserved. They need a new deadline.</p>
      )}
      {!ordering && (job.phase === "accepted" || job.phase === "funding_pending") && (
        <p>Waiting for funding—do not produce yet.</p>
      )}
      {!ordering && (job.phase === "funded" || job.phase === "issue") && (
        <div className="stack">
          {job.issueNote && (
            <p>
              Production issue: {job.issueNote}
            </p>
          )}
          <button type="button" className="primary" disabled={busy} onClick={() => void download(job)}>
            {pending === `download:${job.id}` ? "Preparing file…" : "Download production file"}
          </button>
          <p className="fine">
            {job.downloaded ? "File downloaded. " : ""}
            Downloading does not mark this job printed.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!photo) {
                setLocalError("Choose a completion photo before submitting.");
                return;
              }
              setLocalError(null);
              void submitCompletion(job, photo);
            }}
          >
            <label>
              Completion photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void onPhoto(event.target.files?.[0])}
              />
            </label>
            {photoName && <p className="fine">{photoName}</p>}
            {photo && <img className="shot" src={photo.dataUrl} alt="Selected completion photo" />}
            <button type="submit" className="primary" disabled={busy || !photo}>
              {pending?.startsWith("complete:") ? "Submitting…" : "Submit completion"}
            </button>
          </form>
        </div>
      )}
      {!ordering && job.phase === "completion_submitted" && (
        <p>
          Waiting on their review. Not paid yet.
        </p>
      )}
      {!ordering && job.phase === "passed" && <p>You passed. Nothing was reserved.</p>}

      {ordering && job.phase === "offered" && !job.expired && (
        <p>Waiting for {job.shopName}. No payment yet.</p>
      )}
      {ordering && job.expired && job.phase === "offered" && (
        <p>Expired. Change the deadline and request again. No payment was made.</p>
      )}
      {ordering && job.phase === "passed" && <p>The shop passed. Edit the terms and request again.</p>}
      {ordering && job.phase === "accepted" && (
        <div className="stack">
          <button type="button" className="primary" disabled={busy} onClick={() => void fund(job)}>
            {pending === `fund:${job.id}` ? "Funding…" : `Fund job · ${formatUsdc(job.priceCents)}`}
          </button>
          <p className="fine">Devnet. Nothing is paid until this confirms.</p>
        </div>
      )}
      {ordering && job.phase === "funding_pending" && (
        <div className="stack">
          <p>Payment pending. Not paid.</p>
          <button type="button" className="primary" disabled={busy} onClick={() => void fund(job)}>
            {pending === `fund:${job.id}` ? "Checking…" : "Check payment status"}
          </button>
        </div>
      )}
      {ordering && job.phase === "funded" && <p>Waiting for the shop.</p>}
      {ordering && job.phase === "issue" && (
        <div className="stack">
          <p>You reported an issue. Waiting for a new completion photo.</p>
          {job.issueNote && <p>{job.issueNote}</p>}
        </div>
      )}
      {ordering && job.phase === "completion_submitted" && (
        <div className="stack">
          {job.completionPhoto && <img className="shot" src={job.completionPhoto.dataUrl} alt="Completion photo" />}
          <p>
            {job.quantity} contour-cut decals · {formatSize(job.widthIn, job.heightIn)} · {materialLine(job.laminate)}
          </p>
          <button type="button" className="primary" disabled={busy} onClick={() => void approve(job)}>
            {pending === `approve:${job.id}` ? "Releasing…" : `Approve & release ${formatUsdc(job.priceCents)}`}
          </button>
          <p className="fine">Devnet. Paid only after this release.</p>
          {!issueOpen ? (
            <button type="button" disabled={busy} onClick={() => setIssueOpen(true)}>
              Report an issue
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!issue.trim()) {
                  setLocalError("Describe the issue before sending.");
                  return;
                }
                setLocalError(null);
                void reportIssue(job, issue.trim());
              }}
            >
              <label>
                What went wrong
                <textarea value={issue} onChange={(event) => setIssue(event.target.value)} rows={3} />
              </label>
              <button type="submit" disabled={busy}>
                {pending?.startsWith("issue:") ? "Sending…" : "Send issue"}
              </button>
            </form>
          )}
        </div>
      )}

      {job.phase === "paid" && job.receipt && (
        <div className="receipt">
          <p className="paid">Paid</p>
          <p>{ordering ? `Released ${formatUsdc(job.receipt.amountCents)}` : `You receive ${formatUsdc(job.payoutCents)}`}</p>
          <dl className="facts">
            <div>
              <dt>Receipt</dt>
              <dd>{job.receipt.reference}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd className="in">
                {formatUsdc(job.receipt.amountCents)} ({job.receipt.network})
              </dd>
            </div>
            <div>
              <dt>Settled</dt>
              <dd>{formatWhen(job.receipt.settledAt)}</dd>
            </div>
          </dl>
          <p className="fine">No on-chain transfer was broadcast.</p>
        </div>
      )}

      {(job.phase === "completion_submitted" || job.phase === "paid" || job.phase === "issue") && job.completionPhoto && !ordering && (
        <img className="shot" src={job.completionPhoto.dataUrl} alt="Completion photo" />
      )}
      {ordering && job.phase === "issue" && job.completionPhoto && (
        <img className="shot" src={job.completionPhoto.dataUrl} alt="Completion photo" />
      )}

      {canEdit && (
        <details
          className="edit"
          open={editing}
          onToggle={(event) => {
            const open = (event.currentTarget as HTMLDetailsElement).open;
            if (open) {
              setEdit({
                quantity: String(job.quantity),
                widthIn: String(job.widthIn),
                heightIn: String(job.heightIn),
                laminate: job.laminate,
                fulfillment: job.fulfillment,
                deadline: toLocalInput(job.deadline),
                fileName: job.fileName,
                svgText: job.svgText,
                preview: job.preview,
                cutlineName: job.cutlineName,
              });
            }
            setEditing(open);
          }}
        >
          <summary>{job.phase === "passed" || job.expired ? "Edit and request again" : "Edit terms"}</summary>
          {job.phase === "accepted" && (
            <p>Saving cancels acceptance. The shop accepts again. No payment yet.</p>
          )}
          <label>
            Quantity
            <input value={edit.quantity} inputMode="numeric" onChange={(event) => setEdit({ ...edit, quantity: event.target.value.replace(/[^\d]/g, "") })} />
          </label>
          <div className="split">
            <label>
              Width (in)
              <input value={edit.widthIn} inputMode="decimal" onChange={(event) => setEdit({ ...edit, widthIn: event.target.value })} />
            </label>
            <label>
              Height (in)
              <input value={edit.heightIn} inputMode="decimal" onChange={(event) => setEdit({ ...edit, heightIn: event.target.value })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={edit.laminate} onChange={(event) => setEdit({ ...edit, laminate: event.target.checked })} />
            Gloss laminate
          </label>
          <fieldset>
            <legend>Fulfillment</legend>
            <label className="check">
              <input type="radio" name={`edit-fulfillment-${job.id}`} checked={edit.fulfillment === "pickup"} onChange={() => setEdit({ ...edit, fulfillment: "pickup" })} />
              Pickup
            </label>
            <label className="check">
              <input type="radio" name={`edit-fulfillment-${job.id}`} checked={edit.fulfillment === "delivery"} onChange={() => setEdit({ ...edit, fulfillment: "delivery" })} />
              Delivery
            </label>
          </fieldset>
          <label>
            Deadline
            <input type="datetime-local" value={edit.deadline} onChange={(event) => setEdit({ ...edit, deadline: event.target.value })} />
          </label>
          <label>
            Replace artwork
            <input type="file" accept=".svg,image/svg+xml" onChange={(event) => void onReplace(event.target.files?.[0])} />
          </label>
          <p className="fine">{edit.fileName}</p>
          <button type="button" className="primary" disabled={busy} onClick={() => void saveTerms()}>
            {pending?.startsWith("revise:") ? "Saving…" : job.phase === "passed" || job.expired ? "Request again" : "Save terms"}
          </button>
        </details>
      )}
      {!canEdit && ordering && job.phase !== "paid" && job.phase !== "offered" && (
        <p className="fine">Locked after funding. Report an issue if the job is wrong.</p>
      )}
      <details>
        <summary>Details</summary>
        <dl className="facts">
          <div>
            <dt>Cut line</dt>
            <dd>{job.cutlineName}</dd>
          </div>
          <div>
            <dt>Ready</dt>
            <dd>{formatWhen(job.readyBy)}</dd>
          </div>
          <div>
            <dt>{ordering ? "Shop" : "From"}</dt>
            <dd>{ordering ? `${job.shopName}, ${job.destination}` : job.requesterName}</dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>{job.fileName}</dd>
          </div>
        </dl>
        <p className="fine">
          {job.fulfillment === "delivery" ? "Shipping." : `Pickup at ${job.destination}. Not shipped.`}
        </p>
        <ul>
          {job.checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
        <p>{job.qualification}</p>
        <p>Alternatives: {job.alternatives}</p>
      </details>
    </section>
  );
}
