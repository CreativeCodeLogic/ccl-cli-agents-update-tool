import type { ToolScan } from "../types";

/**
 * "What next?" after updates: the rows `n` shows notes for (what was just
 * updated). None after a CCL CAUT self-update: this process still runs the old
 * code, the same reason r (Rescan) isn't offered then.
 */
export function rowsForWhatsNew(offered: readonly ToolScan[], updatedIds: readonly string[], selfUpdated: boolean): ToolScan[] {
  return selfUpdated ? [] : offered.filter((r) => updatedIds.includes(r.id));
}
