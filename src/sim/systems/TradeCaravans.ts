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

const REFUSE_RESULT_LINES: readonly string[] = [
  "The gates stayed shut. {partner}'s caravan waited an hour, then turned around. The kingdom was no richer or poorer.",
  "The caravan from {partner} was turned away politely. They left a small gift on the threshold and rode on.",
  "{partner}'s merchants were not received today. They camped outside the wall for the night and were gone before dawn.",
];

export interface TradeSnapshot {
  lastCaravanDay: number;
  totalCaravans: number;
  totalAccepted: number;
}

export class TradeCaravans {
  state: TradeSnapshot = { lastCaravanDay: 0, totalCaravans: 0, totalAccepted: 0 };

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): TradeSnapshot { return { ...this.state }; }
  restore(s: TradeSnapshot): void { this.state = { ...s }; }

  tick(): void {
    if (this.world.decisions.current()) return;
    const day = this.world.state.day;
    if (day - this.state.lastCaravanDay < TRADE_INTERVAL_DAYS) return;
    if (this.rand() > TRADE_CHANCE) return;

    this.state.lastCaravanDay = day;
    this.state.totalCaravans++;
    this._propose();
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
          onChoose: (w) => {
            if (w.economy.state.gold >= TRADE_GOLD_PAID) {
              w.economy.state.gold -= TRADE_GOLD_PAID;
              w.economy.state.tomes = Math.min(999, w.economy.state.tomes + 4);
              w.economy.state.ironwork = Math.min(999, w.economy.state.ironwork + 2);
              w.factions.adjust("merchants", 1);
              this.state.totalAccepted++;
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
