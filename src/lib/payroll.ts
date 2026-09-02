// ── Field Nation platform fee ───────────────────────────────────────────────
//
// Field Nation takes a fixed platform fee off everything routed through it —
// labor pay AND reimbursements. The tech nets the remainder. Keeping the rate
// here (instead of a scattered 0.1585 magic number) makes the payroll math a
// single source of truth.

/** Field Nation platform fee rate (15.85%). */
export const FIELD_NATION_FEE_RATE = 0.1585;

/** Amount left after the Field Nation platform fee — i.e. what the tech nets. */
export const netOfFieldNationFee = (amount: number): number =>
  (amount || 0) * (1 - FIELD_NATION_FEE_RATE);
