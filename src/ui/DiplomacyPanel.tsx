import { useEffect, useState } from "react";
import type { World } from "../sim/World";

/**
 * Diplomatic Relations panel — lists every off-map kingdom the player
 * has interacted with via trade caravans, refugees, or marriages.
 *
 * Each row shows:
 *   - Partner name
 *   - Goodwill (-5..+15)
 *   - Marriage alliance status
 *   - Last contact day (rough recency)
 *   - Refugees accepted from them (if any)
 */
export function DiplomacyPanel({
  open,
  onClose,
  getWorld,
}: {
  open: boolean;
  onClose: () => void;
  getWorld: () => World | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;
  const world = getWorld();
  if (!world) return null;

  const trade = world.tradeCaravans.snapshot();
  const goodwill = trade.partnerGoodwill ?? {};
  const married = new Set(trade.marriedPartners ?? []);
  const partners = Object.entries(goodwill)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <aside className="diplomacy-panel" role="dialog" aria-label="Diplomatic relations">
      <div className="diplomacy-header">
        <span>Diplomatic Relations</span>
        <button onClick={onClose} title="Close">×</button>
      </div>
      <div className="diplomacy-body">
        {partners.length === 0 ? (
          <p className="diplomacy-empty">
            No diplomatic ties yet. As caravans arrive and you welcome them,
            relationships with neighboring kingdoms will build here.
          </p>
        ) : (
          <table className="diplomacy-table">
            <thead>
              <tr>
                <th>Kingdom</th>
                <th>Goodwill</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {partners.map(([name, gw]) => {
                const ally = married.has(name);
                const status = ally
                  ? "alliance"
                  : gw >= 8 ? "trusted"
                  : gw >= 4 ? "friendly"
                  : "trading";
                return (
                  <tr key={name}>
                    <td className="partner-name">
                      {ally && <span className="ally-mark" title="Marriage alliance">♡</span>}
                      {name}
                    </td>
                    <td>
                      <GoodwillBar value={gw} />
                    </td>
                    <td className="partner-status">{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="diplomacy-summary">
          <small>
            {partners.length} known partner{partners.length === 1 ? "" : "s"} ·
            {trade.totalCaravans ?? 0} caravan{(trade.totalCaravans ?? 0) === 1 ? "" : "s"} received ·
            {(trade.marriedPartners ?? []).length} alliance{(trade.marriedPartners ?? []).length === 1 ? "" : "s"}
          </small>
        </div>
      </div>
    </aside>
  );
}

function GoodwillBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(15, value));
  const pct = (clamped / 15) * 100;
  return (
    <div className="goodwill-bar" title={`Goodwill: ${value}`}>
      <div className="goodwill-bar-fill" style={{ width: `${pct}%` }} />
      <span className="goodwill-bar-text">{value}</span>
    </div>
  );
}
