import type { OutputController } from "./useOutput";
import { ArtworkPreview } from "./ArtworkPreview";
import { formatUsdc, formatWhen } from "./format";
import { LAMINATE_LABEL, MATERIAL_LABEL } from "./types";

export function DraftPanel({ controller, onPick }: { controller: OutputController; onPick: () => void }) {
  const { draft, pending, artExpanded, toggleArt, updateDraft, requestProduction, openShop, backToInbox, snapshot } = controller;
  if (!draft) return null;
  const shop = snapshot?.shop;
  const amount = draft.quote ? formatUsdc(draft.quote.priceCents) : "";

  return (
    <section className="output-panel" aria-labelledby="output-panel-title">
      <header className="panel-head">
        <h2 id="output-panel-title" tabIndex={-1}>
          Insert a file
        </h2>
        <button type="button" onClick={backToInbox}>
          Inbox
        </button>
      </header>
      <p className="spec">SVG with a cut line. {MATERIAL_LABEL}. 5 MB. No PDF or AI.</p>
      {!draft.preview && (
        <div className="stack">
          <button type="button" className="primary" onClick={onPick}>
            Insert a file
          </button>
          <p className="fine">Or drop an SVG on this widget.</p>
        </div>
      )}
      {draft.fileError && (
        <p className="err" role="alert">
          {draft.fileError}
        </p>
      )}
      {draft.fileError && (
        <button type="button" onClick={onPick}>
          Choose another file
        </button>
      )}
      {draft.preview && (
        <>
          <ArtworkPreview model={draft.preview} expanded={artExpanded} onToggle={toggleArt} />
          <p className="fine">
            {draft.fileName} · cutline {draft.cutlineName}
          </p>
          <button type="button" onClick={onPick}>
            Replace file
          </button>
          <label>
            Quantity
            <input
              inputMode="numeric"
              value={draft.quantity}
              onChange={(event) => updateDraft({ quantity: event.target.value.replace(/[^\d]/g, "") })}
              placeholder="How many"
            />
          </label>
          <div className="split">
            <label>
              Width (in)
              <input
                inputMode="decimal"
                value={draft.widthIn}
                onChange={(event) => updateDraft({ widthIn: event.target.value })}
              />
            </label>
            <label>
              Height (in)
              <input
                inputMode="decimal"
                value={draft.heightIn}
                onChange={(event) => updateDraft({ heightIn: event.target.value })}
              />
            </label>
          </div>
          <p className="fine">{draft.dimensionNote}</p>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.dimensionsConfirmed}
              onChange={(event) => updateDraft({ dimensionsConfirmed: event.target.checked })}
            />
            Finished size is confirmed
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.laminate}
              onChange={(event) => updateDraft({ laminate: event.target.checked })}
            />
            {LAMINATE_LABEL}
          </label>
          <p className="fine">Vinyl is {MATERIAL_LABEL.toLowerCase()}.</p>
          <fieldset>
            <legend>Fulfillment</legend>
            <label className="check">
              <input
                type="radio"
                name="fulfillment"
                checked={draft.fulfillment === "pickup"}
                onChange={() => updateDraft({ fulfillment: "pickup" })}
              />
              Pickup
            </label>
            <label className="check">
              <input
                type="radio"
                name="fulfillment"
                checked={draft.fulfillment === "delivery"}
                onChange={() => updateDraft({ fulfillment: "delivery" })}
              />
              Delivery
            </label>
          </fieldset>
          {draft.fulfillment === "pickup" ? (
            <p className="fine">Pickup at {shop?.name ?? "the shop"}. Not delivery.</p>
          ) : (
            <label>
              Destination
              <input
                value={draft.destination}
                onChange={(event) => updateDraft({ destination: event.target.value })}
                placeholder="Where it should go"
              />
            </label>
          )}
          <label>
            Deadline
            <input
              type="datetime-local"
              value={draft.deadline}
              onChange={(event) => updateDraft({ deadline: event.target.value })}
            />
          </label>
          {draft.quoting && <p>Checking shops…</p>}
          {!draft.quoting && !draft.quote && !draft.quoteError && (
            <p className="fine">Quantity, confirmed size, and a deadline.</p>
          )}
          {draft.quoteError && (
            <div className="err" role="alert">
              <p>{draft.quoteError}</p>
              {draft.shopHint && (
                <button type="button" onClick={openShop}>
                  Open shop
                </button>
              )}
            </div>
          )}
          {draft.quote && (
            <div className="quote">
              <p className="quote-shop">{draft.quote.shopName}</p>
              <p>Ready {formatWhen(draft.quote.readyBy)} · {draft.quote.network}</p>
              <p>{draft.quote.reason}</p>
              <p>{draft.quote.fulfillmentNote}</p>
              <details>
                <summary>Details</summary>
                <ul>
                  {draft.quote.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
                <p>Alternatives: {draft.quote.alternatives}</p>
              </details>
            </div>
          )}
          <button
            type="button"
            className="primary"
            disabled={!draft.quote || pending !== null || draft.quoting}
            onClick={() => void requestProduction()}
          >
            {pending === "request" ? "Requesting…" : amount ? `Request production · ${amount}` : "Request production"}
          </button>
          <p className="fine">No payment yet. The shop must accept first.</p>
        </>
      )}
    </section>
  );
}
