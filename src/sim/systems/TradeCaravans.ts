import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Trade caravans — periodic merchant convoys from named off-map kingdoms
 * arrive at the kingdom's gate and offer to trade. The player decides:
 *
 *   OPEN   — accept the trade. Pay some gold, receive a tome or ironwork
 *            equivalent. Merchants faction loyalty +1.
 *   TAX    — heavy tariff. Net gold gain, but the visiting kingdom's
 *            envoy is offended. Reputation -1, Merchants faction -1.
 *   REFUSE — close the gate. No gain, slight Merchants disappointment.
 *
 * Differs from Immigration camps: caravans never settle, never raid,
 * and there's no force option. They're a recurring trade decision.
 */

const TRADE_INTERVAL_DAYS = 21;   // a caravan window opens roughly every 3 weeks
const TRADE_CHANCE        = 0.55;
const TRADE_GOLD_PAID     = 20;   // when player accepts a standard trade
const TRADE_GOLD_TAX      = 35;   // when player taxes heavily

const TRADE_PARTNERS: readonly string[] = [
  "the Verdant League",
  "Kestmark",
  "the Saltwater Companies",
  "the Greycrown Alliance",
  "the Ashwood League",
  "the Bridgewater Companies",
  "the Orevast valley",
  "the Hollow Hills",
];

const CARAVAN_GOODS: readonly string[] = [
  "barrels of salted fish",
  "bolts of dyed wool",
  "casks of southern wine",
  "crates of fine pottery",
  "polished obsidian charms",
  "bundles of rare herbs",
  "ironware from far forges",
  "books bound in foreign leather",
  "preserved citrus in clay jars",
  "lengths of finished silk",
];

const ARRIVAL_LINES: readonly string[] = [
  "A trade caravan has arrived from {partner} bearing {goods}. The merchant master is at the gate, asking the kingdom's pleasure.",
  "Bells at the south gate — a caravan from {partner} has arrived. They bring {goods} and request an audience.",
  "Scouts report a caravan from {partner} on the approach. By midday they were at the gate, asking to trade {goods}.",
  "A caravan, dust-coated from the road, has arrived from {partner}. They bring {goods} and three letters of safe passage.",
];

const OPEN_RESULT_LINES: readonly string[] = [
  "The kingdom opened its gates to the caravan from {partner}. The trade was honest. The merchants left at dawn, well-pleased.",
  "Trade was conducted in the great hall. {partner}'s envoy left {goods} and a promise to return. The treasury paid fairly.",
  "The caravan was welcomed. Goods exchanged hands; cups were raised; the road back to {partner} was set out upon at first light.",
];

const TAX_RESULT_LINES: readonly string[] = [
  "The caravan from {partner} was taxed at the gate. They paid, looked at the steward a long moment, and went on their way. The treasury is heavier. So is the air.",
  "The kingdom took its tariff — most of the caravan's profit. {partner}'s envoy did not smile. There will be a letter, probably.",
  "{partner}'s caravan paid the levy without argument. They did not stop to drink at the inn. They will be slower to return.",
];

const MARRIAGE_NAMES: readonly string[] = [
  "Aurelia", "Castor", "Elen", "Fenwick", "Hadria", "Joren", "Kestrel",
  "Lirien", "Marwen", "Pia", "Quill", "Rosa", "Sable", "Tarn", "Vesna",
];

const REFUSE_RESULT_LINES: readonly string[] = [
  "The gates stayed shut. {partner}'s caravan waited an hour, then turned around. The kingdom was no richer or poorer.",
  "The caravan from {partner} was turned away politely. They left a small gift on the threshold and rode on.",
  "{partner}'s merchants were not received today. They camped outside the wall for the night and were gone before dawn.",
];

export interface TradeSnapshot {
  lastCaravanDay: number;
  totalCaravans: number;
  totalAccepted: number;
  /** Tally of accepted trades per partner — drives diplomatic marriage offers. */
  partnerGoodwill?: Record<string, number>;
  /** Partners we've already offered a marriage with (so we don't repeat). */
  marriedPartners?: string[];
  /** Day a marriage offer last fired (cooldown). */
  lastMarriageDay?: number;
}

export class TradeCaravans {
  state: TradeSnapshot = {
    lastCaravanDay: 0,
    totalCaravans: 0,
    totalAccepted: 0,
    partnerGoodwill: {},
    marriedPartners: [],
    lastMarriageDay: -90,
  };

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): TradeSnapshot {
    return {
      ...this.state,
      partnerGoodwill: { ...(this.state.partnerGoodwill ?? {}) },
      marriedPartners: [...(this.state.marriedPartners ?? [])],
    };
  }
  restore(s: TradeSnapshot): void {
    this.state = {
      ...s,
      partnerGoodwill: { ...(s.partnerGoodwill ?? {}) },
      marriedPartners: [...(s.marriedPartners ?? [])],
      lastMarriageDay: s.lastMarriageDay ?? -90,
    };
  }

  tick(): void {
    if (this.world.decisions.current()) return;
    const day = this.world.state.day;

    // First check for a diplomatic marriage offer with a trusted partner.
    if (this._tryProposeMarriage(day)) return;

    if (day - this.state.lastCaravanDay < TRADE_INTERVAL_DAYS) return;
    if (this.rand() > TRADE_CHANCE) return;

    this.state.lastCaravanDay = day;
    this.state.totalCaravans++;
    this._propose();
  }

  /**
   * Diplomatic marriage offer: when partner goodwill ≥ 5 and 90+ days since
   * the last marriage event, the trusted partner offers a marriage alliance.
   * Returns true if a marriage decision was proposed (skip the regular
   * caravan check for this tick).
   */
  private _tryProposeMarriage(day: number): boolean {
    if (this.world.state.year < 3) return false;
    if (day - (this.state.lastMarriageDay ?? -90) < 90) return false;
    if (this.rand() > 0.3) return false;

    const married = new Set(this.state.marriedPartners ?? []);
    const goodwill = this.state.partnerGoodwill ?? {};
    const eligible = Object.entries(goodwill)
      .filter(([p, n]) => n >= 5 && !married.has(p));
    if (eligible.length === 0) return false;

    // Pick the partner with the highest goodwill.
    eligible.sort((a, b) => b[1] - a[1]);
    const [partner] = eligible[0];
    this.state.lastMarriageDay = day;
    this._proposeMarriage(partner);
    return true;
  }

  private _proposeMarriage(partner: string): void {
    const royalName = MARRIAGE_NAMES[Math.floor(this.rand() * MARRIAGE_NAMES.length)];
    const body =
      `${partner} sends an envoy with an offer of marriage alliance — ` +
      `their heir, ${royalName}, would join the kingdom in formal union. ` +
      `A blood-tie between the crowns would secure trade routes for a generation.`;

    this.world.decisions.propose({
      id: `trade_marriage_${this.world.state.day}_${partner.replace(/\s+/g, "_")}`,
      title: `Marriage alliance: ${partner}`,
      body,
      options: [
        {
          id: "accept",
          label: "Accept the alliance",
          hint: "+1 named spouse · rep +3 · merchants +2 · permanent alliance",
          onChoose: (w) => {
            (this.state.marriedPartners ??= []).push(partner);
            w.factions.adjust("merchants", 2);
            w.reputation.adjust(3);
            // Add the spouse as a permanent named NPC at the castle.
            const seed = Math.floor(this.rand() * 2 ** 31);
            const castle = w.map.structures.find((s) => s.kind === "castle");
            if (castle) {
              const center = {
                x: castle.pos.x + Math.floor(castle.size.x / 2),
                y: castle.pos.y + Math.floor(castle.size.y / 2),
              };
              w.pushNpc({
                id: `npc_marriage_${seed}`,
                role: "villager",
                name: royalName,
                age: 22 + Math.floor(this.rand() * 8),
                pos: { ...center }, prevPos: { ...center },
                facing: "s",
                homeId: castle.id, workId: castle.id,
                activity: "idle", path: [], activityTimer: 1,
                seed,
              });
            }
            this.world.journal.write(
              `The marriage alliance with ${partner} was sealed today. ${royalName} arrived at the keep with a small retinue and a sealed treaty. The kingdom has a new family member and a stronger trade route.`,
              "milestone",
              castle?.id,
            );
          },
        },
        {
          id: "decline",
          label: "Decline politely",
          hint: "goodwill resets · partner cools",
          onChoose: (w) => {
            // Reset goodwill with that partner so they cool off but don't sour.
            (this.state.partnerGoodwill ??= {})[partner] = 0;
            this.world.journal.write(
              `The offer of marriage alliance from ${partner} was politely declined. Their envoy left with grace. The trade route continues — but quieter.`,
              "event",
            );
          },
        },
      ],
      expiresAt: Date.now() + 240_000, // 4-minute window — big decision
      defaultOnExpire: false,
    });
  }

  private _propose(): void {
    const partner = TRADE_PARTNERS[Math.floor(this.rand() * TRADE_PARTNERS.length)];
    const goods = CARAVAN_GOODS[Math.floor(this.rand() * CARAVAN_GOODS.length)];

    const arrival = ARRIVAL_LINES[Math.floor(this.rand() * ARRIVAL_LINES.length)]
      .replace("{partner}", partner).replace("{goods}", goods);
    this.journal.write(arrival, "event");

    this.world.decisions.propose({
      id: `trade_caravan_${this.world.state.day}`,
      title: `Caravan from ${partner}`,
      body: `${partner}'s merchants have arrived with ${goods}. How does the kingdom answer?`,
      options: [
        {
          id: "open",
          label: `Trade fairly (${TRADE_GOLD_PAID} gold)`,
          hint: `-${TRADE_GOLD_PAID}g · +4 tomes · +2 ironwork · merchants +1`,
          onChoose: (w) => {
            if (w.economy.state.gold >= TRADE_GOLD_PAID) {
              w.economy.state.gold -= TRADE_GOLD_PAID;
              w.economy.state.tomes = Math.min(999, w.economy.state.tomes + 4);
              w.economy.state.ironwork = Math.min(999, w.economy.state.ironwork + 2);
              w.factions.adjust("merchants", 1);
              this.state.totalAccepted++;
              // Bump goodwill with this partner. After 5+ accepted trades,
              // they may offer a marriage alliance.
              const gw = (this.state.partnerGoodwill ??= {});
              gw[partner] = (gw[partner] ?? 0) + 1;
              const line = OPEN_RESULT_LINES[Math.floor(this.rand() * OPEN_RESULT_LINES.length)]
                .replace("{partner}", partner).replace("{goods}", goods);
              this.journal.write(line, "event");
            } else {
              this.journal.write(
                `The kingdom could not afford to trade with ${partner} this season. The caravan moved on.`,
                "event",
              );
            }
          },
        },
        {
          id: "tax",
          label: `Tax heavily (+${TRADE_GOLD_TAX} gold)`,
          hint: `+${TRADE_GOLD_TAX}g · rep -1 · merchants -1 (blocks future alliance)`,
          onChoose: (w) => {
            w.economy.state.gold = Math.min(99_999, w.economy.state.gold + TRADE_GOLD_TAX);
            w.reputation.adjust(-1);
            w.factions.adjust("merchants", -1);
            const line = TAX_RESULT_LINES[Math.floor(this.rand() * TAX_RESULT_LINES.length)]
              .replace("{partner}", partner).replace("{goods}", goods);
            this.journal.write(line, "event");
          },
        },
        {
          id: "refuse",
          label: "Turn them away",
          hint: "merchants -0.5",
          onChoose: (w) => {
            w.factions.adjust("merchants", -0.5);
            const line = REFUSE_RESULT_LINES[Math.floor(this.rand() * REFUSE_RESULT_LINES.length)]
              .replace("{partner}", partner);
            this.journal.write(line, "event");
          },
        },
      ],
      expiresAt: Date.now() + 120_000,
      defaultOnExpire: true, // ignored → trade fairly (the agreeable default)
    });
  }
}
