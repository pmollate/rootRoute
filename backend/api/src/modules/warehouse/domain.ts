import type {
  Commitment, IsoDate, LocalTimestamp, PickWarehouseInput, PromiseResult, WarehouseChoice, WarehouseId,
} from '../../core/contracts.js';

export const CUTOFF_HOUR = 8;
/** Calendar days from order date to promised date, as in the data (CONTRACTS §3). */
export const LEAD_DAYS: Record<Commitment, number> = { same_day: 1, next_day: 2, standard: 4 };
const PARTNER: Partial<Record<WarehouseId, WarehouseId>> = { W1: 'W2', W2: 'W1' };
const TS = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/;
const DAY_MS = 86_400_000;

function parse(ts: LocalTimestamp): { date: IsoDate; hour: number; minute: number } {
  const m = TS.exec(ts);
  if (!m) throw new Error(`bad local timestamp: ${ts}`);
  return { date: m[1], hour: Number(m[2]), minute: Number(m[3]) };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** W1: promise a date the pick list can actually meet. */
export function checkPromise(commitment: Commitment, receivedAt: LocalTimestamp): PromiseResult {
  const { date, hour, minute } = parse(receivedAt);
  if (commitment === 'same_day' && hour >= CUTOFF_HOUR) {
    const at = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return {
      promiseDate: addDays(date, LEAD_DAYS.next_day),
      commitment: 'next_day',
      downgraded: true,
      reason: `Received at ${at}, after the 0${CUTOFF_HOUR}:00 pick-list cut-off, so it goes on the next day's pick list.`,
    };
  }
  return { promiseDate: addDays(date, LEAD_DAYS[commitment]), commitment, downgraded: false, reason: null };
}

/** W2/W3: nearest first, then the same-region partner, then the closest warehouse with stock. */
export function chooseWarehouse(input: PickWarehouseInput, milesToRegion: Record<WarehouseId, number>): WarehouseChoice {
  const { nearestWarehouseId: nearest, stock } = input;
  if (stock[nearest] !== false) {
    return { warehouseId: nearest, reason: `Nearest warehouse ${nearest} has stock.`, warnClient: false };
  }
  const partner = PARTNER[nearest];
  if (partner && stock[partner] !== false) {
    return {
      warehouseId: partner,
      reason: `${nearest} is out of stock; partner warehouse ${partner} in the same region ships it.`,
      warnClient: false,
    };
  }
  const others = (Object.keys(milesToRegion) as WarehouseId[])
    .filter((w) => w !== nearest && w !== partner && stock[w] !== false)
    .sort((a, b) => milesToRegion[a] - milesToRegion[b]);
  if (others.length === 0) {
    return { warehouseId: nearest, reason: `No warehouse has stock; holding at ${nearest}.`, warnClient: true };
  }
  const w = others[0];
  return {
    warehouseId: w,
    reason: `${nearest} is out of stock; ${w} is the closest warehouse with stock (${milesToRegion[w]} miles).`,
    warnClient: true,
  };
}

function toLocal(ms: number): LocalTimestamp {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

/** REQ-PRO-04: confirm-address links expire at min(24 h, 2 h before the next cut-off). */
export function linkExpiry(createdAt: LocalTimestamp, cutoffHour = CUTOFF_HOUR): LocalTimestamp {
  const { date, hour, minute } = parse(createdAt);
  const created = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const todayCutoff = Date.parse(`${date}T${String(cutoffHour).padStart(2, '0')}:00:00Z`);
  const nextCutoff = created < todayCutoff ? todayCutoff : todayCutoff + DAY_MS;
  return toLocal(Math.min(created + DAY_MS, nextCutoff - 2 * 3_600_000));
}
