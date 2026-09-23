import type { Alert } from "@/types/alerts";
import { formatEventList } from "@/types/alerts";

export type AlertChainBlock = {
  key: string;
  chainId: string | null;
  pair: string;
  alerts: Alert[];
};

function pairKey(pair: string): string {
  return pair.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function createdMs(alert: Alert): number {
  const ms = new Date(alert.created_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Type/condition summary used when custom_message is empty. */
export function summarizeAlertCondition(alert: Alert): string {
  if (alert.alert_type === "price") {
    return `Price ${alert.condition ?? "?"} ${alert.target_price ?? ""}`.trim();
  }
  if (alert.alert_type === "candle_close") {
    return `Candle ${alert.interval ?? "?"} ${alert.direction ?? "?"} ${alert.threshold ?? ""}`.trim();
  }
  if (alert.alert_type === "prev_day_level") {
    return `Prev-day ${formatEventList(alert.dol_trigger, "?")} ${alert.level_ref ?? ""}`.trim();
  }
  return `Structure ${alert.interval ?? "?"} ${alert.structure_direction ?? "?"} ${formatEventList(alert.structure_event, "?")}`.trim();
}

/** Human-readable label for a parent (or any) alert in a queue. */
export function formatAlertChainLabel(alert: Alert, maxMessageLen = 40): string {
  const message = (alert.custom_message ?? "").replace(/\s+/g, " ").trim();
  if (message) {
    const truncated =
      message.length > maxMessageLen ? `${message.slice(0, maxMessageLen)}…` : message;
    return truncated;
  }
  return summarizeAlertCondition(alert);
}

/**
 * Sort so same-pair alerts cluster, chains stay contiguous by sequence_index,
 * and unchained alerts sort by newest created_at within the pair.
 */
export function sortAlertsByChain(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const pairCmp = pairKey(a.pair).localeCompare(pairKey(b.pair));
    if (pairCmp !== 0) return pairCmp;

    const aChain = a.chain_id?.trim() || "";
    const bChain = b.chain_id?.trim() || "";
    const aKey = aChain || a.id;
    const bKey = bChain || b.id;

    if (aChain && bChain && aChain === bChain) {
      const seq = (a.sequence_index ?? 0) - (b.sequence_index ?? 0);
      if (seq !== 0) return seq;
      return createdMs(a) - createdMs(b);
    }

    // Order chain/single blocks within a pair by earliest created_at in the block identity.
    // For chains use chain id string compare as stable tie-break after time via caller grouping;
    // here compare by created_at desc for unchained, and for different chains by min-ish created.
    const timeCmp = createdMs(b) - createdMs(a);
    if (!aChain && !bChain && timeCmp !== 0) return timeCmp;

    const keyCmp = aKey.localeCompare(bKey);
    if (keyCmp !== 0) return keyCmp;
    return timeCmp;
  });
}

/** Group sorted alerts into contiguous chain blocks (or singles). */
export function groupAlertsIntoChainBlocks(sortedAlerts: Alert[]): AlertChainBlock[] {
  const blocks: AlertChainBlock[] = [];

  for (const alert of sortedAlerts) {
    const chainId = alert.chain_id?.trim() || null;
    const last = blocks[blocks.length - 1];

    if (chainId && last?.chainId === chainId) {
      last.alerts.push(alert);
      continue;
    }

    blocks.push({
      key: chainId ? `chain:${chainId}` : `alert:${alert.id}`,
      chainId,
      pair: alert.pair,
      alerts: [alert],
    });
  }

  // Within each pair, put multi-step chains first (by earliest step), then singles by created desc.
  const byPair = new Map<string, AlertChainBlock[]>();
  for (const block of blocks) {
    const key = pairKey(block.pair);
    const list = byPair.get(key) ?? [];
    list.push(block);
    byPair.set(key, list);
  }

  const ordered: AlertChainBlock[] = [];
  const pairKeys = [...byPair.keys()].sort((a, b) => a.localeCompare(b));
  for (const key of pairKeys) {
    const pairBlocks = byPair.get(key) ?? [];
    pairBlocks.sort((a, b) => {
      const aMulti = a.chainId && a.alerts.length > 1 ? 0 : 1;
      const bMulti = b.chainId && b.alerts.length > 1 ? 0 : 1;
      if (aMulti !== bMulti) return aMulti - bMulti;
      const aEarliest = Math.min(...a.alerts.map(createdMs));
      const bEarliest = Math.min(...b.alerts.map(createdMs));
      // Newer activity first among singles; older root first among chains (timeline of queue start).
      if (aMulti === 0 && bMulti === 0) return aEarliest - bEarliest;
      return bEarliest - aEarliest;
    });
    ordered.push(...pairBlocks);
  }

  return ordered;
}

/** Full chain length from all alerts (not just the filtered view). */
export function chainLengthMap(allAlerts: Alert[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const alert of allAlerts) {
    const chainId = alert.chain_id?.trim();
    if (!chainId) continue;
    map.set(chainId, (map.get(chainId) ?? 0) + 1);
  }
  return map;
}

export function formatQueueStepLine(
  alert: Alert,
  allById: Map<string, Alert>,
  totalInChain: number,
): string {
  const step = (alert.sequence_index ?? 0) + 1;
  const total = Math.max(totalInChain, step);
  const prefix = `Step ${step} of ${total}`;

  if (!alert.depends_on_alert_id) {
    return alert.status === "waiting" ? `${prefix} · waiting` : `${prefix} · watching now`;
  }

  const parent = allById.get(alert.depends_on_alert_id);
  const after = parent ? formatAlertChainLabel(parent) : "previous step";
  if (alert.status === "waiting") {
    return `${prefix} · after “${after}” (waiting)`;
  }
  return `${prefix} · after “${after}”`;
}
