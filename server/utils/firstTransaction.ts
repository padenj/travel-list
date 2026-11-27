export interface FirstTransaction {
  transactionDate: string;
  paymentMethodId: string | null;
  amountCash: number;
  amountPoints: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// `body` is the request's `firstTransaction`; `dues` is the booking body it belongs to.
// Returns { value: null } when no first transaction was requested.
export function parseFirstTransaction(
  body: unknown,
  dues: { dueAtBookingCash?: unknown; dueAtBookingPoints?: unknown },
): { value: FirstTransaction | null; error?: string } {
  if (body === undefined || body === null) return { value: null };
  if (typeof body !== 'object') return { value: null, error: 'firstTransaction must be an object' };
  const { transactionDate, paymentMethodId } = body as Record<string, unknown>;
  if (typeof transactionDate !== 'string' || !DATE_RE.test(transactionDate)) {
    return { value: null, error: 'Payment date must be YYYY-MM-DD' };
  }
  if (paymentMethodId !== undefined && paymentMethodId !== null && typeof paymentMethodId !== 'string') {
    return { value: null, error: 'Unknown payment method' };
  }
  const amountCash = typeof dues.dueAtBookingCash === 'number' ? dues.dueAtBookingCash : 0;
  const amountPoints = typeof dues.dueAtBookingPoints === 'number' ? dues.dueAtBookingPoints : 0;
  if (amountCash === 0 && amountPoints === 0) return { value: null, error: 'Nothing is due at booking' };
  return { value: { transactionDate, paymentMethodId: (paymentMethodId as string | null | undefined) ?? null, amountCash, amountPoints } };
}
