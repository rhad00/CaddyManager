import { Op } from 'sequelize';
import { AlertEvent } from '../models/alertEvent';

const DAY_MS = 86_400_000;
/** Events are kept this long */
export const KEEP_DAYS = 90;
const MAX_EVENTS = 200;

export interface AlertEventRow {
  id: string;
  firedAt: string;
  ruleName: string;
  conditionType: string;
  proxyId: string;
  proxyName: string;
  summary: string;
}

/** Events since `sinceMs`, newest first, at most MAX_EVENTS; `proxyId` narrows to one proxy */
export async function recentAlertEvents(sinceMs: number, proxyId: string | null = null): Promise<AlertEventRow[]> {
  const where: Record<string, unknown> = { fired_at: { [Op.gte]: new Date(sinceMs) } };
  if (proxyId) where.proxy_id = proxyId;
  const rows = await AlertEvent.findAll({ where, order: [['fired_at', 'DESC']], limit: MAX_EVENTS });
  return rows.map((r) => ({
    id: r.id,
    firedAt: new Date(r.fired_at).toISOString(),
    ruleName: r.rule_name,
    conditionType: r.condition_type,
    proxyId: r.proxy_id,
    proxyName: r.proxy_name,
    summary: r.summary,
  }));
}

export async function pruneAlertEvents(nowMs: number = Date.now()): Promise<number> {
  return AlertEvent.destroy({ where: { fired_at: { [Op.lt]: new Date(nowMs - KEEP_DAYS * DAY_MS) } } });
}
