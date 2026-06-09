export type EstadoTurno =
  | 'open'
  | 'auto_closed'
  | 'pending_approval'
  | 'reconciled';

export type TipoMovimientoCaja = 'in' | 'out';

export type RazonMovimientoCaja =
  | 'initial'
  | 'sale'
  | 'refund'
  | 'cash_in'
  | 'cash_out'
  | 'adjustment'
  | 'closing';

export interface BalanceTurno {
  id: string;
  currencyCode: string;
  openingAmount: string;
  expectedAmount: string | null;
  actualAmount: string | null;
  difference: string | null;
}

export interface MovimientoCaja {
  id: string;
  cashShiftId: string;
  type: TipoMovimientoCaja;
  reason: RazonMovimientoCaja;
  amount: string;
  currencyCode: string;
  referenceType?: string | null;
  referenceId?: string | null;
  authorizedById?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Turno {
  id: string;
  tenantId: string;
  locationId: string;
  userId: string;
  status: EstadoTurno;
  openedAt: string;
  closedAt?: string | null;
  closedById?: string | null;
  approvedAt?: string | null;
  approvedById?: string | null;
  notes?: string | null;
  balances: BalanceTurno[];
  movements?: MovimientoCaja[];
  user?: { id: string; fullName: string };
  location?: { id: string; name: string };
  closedBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
}

export interface AbrirTurnoPayload {
  locationId: string;
  openingAmounts: { currencyCode: string; openingAmount: string }[];
  notes?: string;
}

export interface CerrarTurnoPayload {
  actualAmounts: { currencyCode: string; actualAmount: string }[];
  notes?: string;
}

export interface RegistrarMovimientoPayload {
  type: TipoMovimientoCaja;
  reason: RazonMovimientoCaja;
  amount: string;
  currencyCode: string;
  notes?: string;
}

export interface AprobarDiferenciaPayload {
  approve: boolean;
  notes: string;
}

export interface ListadoTurnos {
  items: Turno[];
  total: number;
  limit: number;
  offset: number;
}
