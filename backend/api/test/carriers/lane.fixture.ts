import type { LaneRow } from '../../src/modules/carriers/domain.js';

// Northeast next-day lane as computed by analytics/carriers/lanes.py on the supplied data (D's Friday shipments excluded).
const base = { region: 'Northeast', commitment: 'next_day', mean_days_late: 0.1, block_reason: '' } as const;
export const NE_NEXT_DAY: LaneRow[] = [
  { ...base, carrier_id: 'A', n: 617, on_time: 0.955, mean_rate: 14.945, blocked: false, score_default: 85.488, score_sla: 88.815 },
  { ...base, carrier_id: 'B', n: 582, on_time: 0.938, mean_rate: 14.426, blocked: false, score_default: 62.732, score_sla: 74.657 },
  { ...base, carrier_id: 'C', n: 398, on_time: 0.962, mean_rate: 16.043, blocked: false, score_default: 82.592, score_sla: 87.085 },
  { ...base, carrier_id: 'D', n: 338, on_time: 0.95, mean_rate: 12.28, blocked: false, score_default: 77.731, score_sla: 84.677 },
  { ...base, carrier_id: 'E', n: 309, on_time: 0.968, mean_rate: 12.835, blocked: false, score_default: 95.846, score_sla: 96.098 },
  { ...base, carrier_id: 'F', n: 445, on_time: 0.546, mean_rate: 11.219, blocked: true, block_reason: '45% late on fair data (limit 15%)', score_default: null, score_sla: null },
];
