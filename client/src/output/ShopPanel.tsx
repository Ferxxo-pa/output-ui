import { formatUsdc, formatWhen, fromLocalInput, toLocalInput } from "./format";
import type { OutputController } from "./useOutput";

const PRESENCE_COPY = {
  receiving: "Receiving new jobs.",
  paused: "Paused. Accepted work stays.",
  disconnected: "Disconnected. Connection is not material on the roll.",
  stale: "Capacity is stale. Confirm it before new work.",
} as const;

export function ShopPanel({ controller }: { controller: OutputController }) {
  const {
    snapshot,
    loadError,
    pending,
    sound,
    setSound,
    backToInbox,
    reload,
    confirmShop,
    updateAvailability,
    confirmAvailability,
    confirmPayout,
  } = controller;
  const shop = snapshot?.shop;
  const busy = pending !== null;

  return (
    <section className="output-panel" aria-labelledby="output-panel-title">
      <header className="panel-head">
        <h2 id="output-panel-title" tabIndex={-1}>
          Shop
        </h2>
        <button type="button" onClick={backToInbox}>
          Inbox
        </button>
      </header>
      {snapshot?.banner && <p className="demo-banner">{snapshot.banner}</p>}
      {loadError && (
        <div className="err" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}
      {!shop && <p>No shop record is loaded. Nothing was created.</p>}
      {shop && (
        <>
          <h3>{shop.name}</h3>
          <p>{shop.location}</p>
          <p className="fine">Same shop on every computer. Confirming does not create another.</p>
          {shop.confirmed ? (
            <p>Confirmed for this install.</p>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={() => void confirmShop()}>
              {pending === "confirm-shop" ? "Confirming…" : "Confirm shop"}
            </button>
          )}
          <dl className="facts">
            <div>
              <dt>Preset</dt>
              <dd>Contour-cut decals, gloss-white vinyl</dd>
            </div>
            <div>
              <dt>Usable width</dt>
              <dd>{shop.usableWidthIn} in</dd>
            </div>
            <div>
              <dt>Finish</dt>
              <dd>Optional gloss laminate</dd>
            </div>
            <div>
              <dt>Agreed price</dt>
              <dd>
                {formatUsdc(shop.vinylCentsPerSqIn)} / sq in vinyl, {formatUsdc(shop.laminateCentsPerSqIn)} / sq in
                laminate, {formatUsdc(shop.minimumCents)} minimum. Devnet.
              </dd>
            </div>
          </dl>

          <h3>Payout</h3>
          <p>{shop.payoutLabel}. No wallet secret is stored in the browser.</p>
          <p>{shop.payoutConfirmed ? "Payout confirmed for this demo. Still simulated." : "Payout is not confirmed."}</p>
          {!shop.payoutConfirmed && (
            <button type="button" disabled={busy} onClick={() => void confirmPayout()}>
              {pending === "confirm-payout" ? "Confirming…" : "Confirm payout (simulated)"}
            </button>
          )}

          <h3>Availability</h3>
          <p>{PRESENCE_COPY[shop.presence]}</p>
          {shop.capacityStale && shop.presence !== "stale" && (
            <p>Capacity is also stale. Confirm it when you are ready to promise new work.</p>
          )}
          <p className="fine">Connected does not mean vinyl is on the roll.</p>
          <button
            type="button"
            className="toggle"
            aria-pressed={shop.receiving}
            disabled={busy || !shop.confirmed}
            onClick={() => void updateAvailability({ receiving: !shop.receiving })}
          >
            Receive new jobs: {shop.receiving ? "on" : "off"}
          </button>
          <p className="fine">Off stops new offers only.</p>
          <button
            type="button"
            className="toggle"
            aria-pressed={shop.vinylOn}
            disabled={busy || !shop.confirmed}
            onClick={() => void updateAvailability({ vinylOn: !shop.vinylOn })}
          >
            Vinyl available: {shop.vinylOn ? "yes" : "no"}
          </button>
          <p>
            Vinyl {shop.inventory.vinyl.availableSqIn} sq in available · {shop.inventory.vinyl.reservedSqIn} sq in reserved
          </p>
          <button
            type="button"
            className="toggle"
            aria-pressed={shop.laminateOn}
            disabled={busy || !shop.confirmed}
            onClick={() => void updateAvailability({ laminateOn: !shop.laminateOn })}
          >
            Laminate available: {shop.laminateOn ? "yes" : "no"}
          </button>
          <p>
            Laminate {shop.inventory.laminate.availableSqIn} sq in available · {shop.inventory.laminate.reservedSqIn} sq in
            reserved
          </p>
          <p className="fine">These amounts include OUTPUT reservations. You don't subtract them yourself.</p>
          <label>
            Available after
            <input
              type="datetime-local"
              value={toLocalInput(shop.availableAfter)}
              disabled={!shop.confirmed}
              onChange={(event) => void updateAvailability({ availableAfter: fromLocalInput(event.target.value) })}
            />
          </label>
          <p className="fine">Leave this empty to take work from now. There is no separate queue-minutes field.</p>
          <p>Last confirmed {shop.lastConfirmedAt ? formatWhen(shop.lastConfirmedAt) : "never"}.</p>
          <button type="button" disabled={busy || !shop.confirmed} onClick={() => void confirmAvailability()}>
            {pending === "confirm-capacity" ? "Confirming…" : "Confirm availability"}
          </button>
          {!shop.confirmed && <p className="fine">Confirm the shop before changing availability.</p>}

          <h3>Sound</h3>
          <button type="button" className="toggle" aria-pressed={sound} onClick={() => setSound(!sound)}>
            Sound: {sound ? "on" : "off"}
          </button>
          <p className="fine">Optional. A ping plays once for a new action, not when the list refreshes.</p>
        </>
      )}
    </section>
  );
}
