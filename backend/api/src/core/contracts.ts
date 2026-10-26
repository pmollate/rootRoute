// Shared types between problem areas. Source of truth: docs/CONTRACTS.md §1.
export type Commitment = 'same_day' | 'next_day' | 'standard';
export type Region = 'Midwest' | 'Northeast' | 'Southeast' | 'West';
export type WarehouseId = 'W1' | 'W2' | 'W3' | 'W4' | 'W5';
export type CarrierId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Local warehouse time as written in the data: "YYYY-MM-DD HH:mm". */
export type LocalTimestamp = string;
/** "YYYY-MM-DD" */
export type IsoDate = string;

export interface PromiseResult {
  promiseDate: IsoDate;
  commitment: Commitment;
  downgraded: boolean;
  reason: string | null;
}

export interface PickWarehouseInput {
  destinationRegion: Region;
  nearestWarehouseId: WarehouseId;
  stock: Partial<Record<WarehouseId, boolean>>;
}

export interface WarehouseChoice {
  warehouseId: WarehouseId;
  reason: string;
  warnClient: boolean;
}

export interface RecommendInput {
  region: Region;
  commitment: Commitment;
  slaClause: boolean;
  date?: IsoDate;
}

export interface CarrierOption {
  carrier: CarrierId;
  onTime: number;
  meanRate: number;
  n: number;
  score: number | null;
  status: 'recommended' | 'backup' | 'eligible' | 'blocked';
  reason: string;
}

export interface CarrierRecommendation {
  carrier: CarrierId;
  backup: CarrierId;
  reason: string;
  blocked: CarrierId[];
  options: CarrierOption[];
}

export type CauseFlag =
  | 'f_addr' | 'f_cutoff' | 'f_stock' | 'f_stock_out' | 'f_skip_nearest' | 'f_lane' | 'f_bad_lane' | 'f_d_friday' | 'f_route';

export interface DeliveryCauses {
  deliveryId: string;
  late: boolean;
  flags: Record<CauseFlag, boolean>;
  stages: string[];
}

export interface WarehouseApi {
  checkPromise(commitment: Commitment, receivedAt: LocalTimestamp): PromiseResult;
  nearestWarehouse(clientId: string, region: Region): Promise<WarehouseId>;
  pickWarehouse(input: PickWarehouseInput): Promise<WarehouseChoice>;
}

export interface CarriersApi {
  recommendCarrier(input: RecommendInput): Promise<CarrierRecommendation>;
}

export interface DiagnosisApi {
  getDeliveryCauses(deliveryId: string): Promise<DeliveryCauses | null>;
}
