/**
 * Deterministic graders — one per task type.
 *
 * Each compares the agent's parsed output to the locked ground truth and
 * returns a GradeResult with partial credit. Field-level results feed the
 * focus card so viewers see exactly what was right/wrong.
 *
 * Tolerant by design (case/whitespace-insensitive): with the same model on
 * both lanes, format quirks hit both equally, so tolerance can't bias the race.
 */
import { norm } from './schemas';
import { BASE_POINTS, type GradeResult } from '../shared/contract';

/** Compare two strings loosely. */
function strEq(a: unknown, b: unknown): boolean {
  return norm(a) === norm(b);
}

/** Boolean equality that requires the value to actually be a boolean — a
 *  MISSING field (undefined) must NOT count as "correct false", otherwise an
 *  empty/garbage output scores free points on every false-valued truth field. */
function boolEq(a: unknown, b: unknown): boolean {
  if (typeof a !== 'boolean') return false;
  return a === !!b;
}

/** A field check that records the comparison for the focus card. */
type FieldCheck = {
  key: string;
  label: string;
  expected: unknown;
  got: unknown;
  ok: boolean;
};

/** Build a GradeResult from per-field checks. */
function gradeFromChecks(
  checks: FieldCheck[],
  difficulty: number,
  prefix: string,
): GradeResult {
  const okCount = checks.filter((c) => c.ok).length;
  const partial = checks.length === 0 ? 0 : okCount / checks.length;
  const correct = partial === 1;
  return {
    correct,
    partial,
    scoreDelta: Math.round(partial * difficulty * BASE_POINTS),
    detail: `${prefix} — ${okCount}/${checks.length} fields correct`,
    fields: checks.map((c) => ({
      key: c.key,
      label: c.label,
      ok: c.ok,
      expected: fmt(c.expected),
      got: fmt(c.got),
    })),
  };
}

function fmt(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

export type Grader = (output: unknown, truth: Record<string, unknown>, difficulty: number) => GradeResult;

// 1. Shipping-label parse
export const gradeLabelParse: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'carrier', label: 'Carrier', expected: truth.carrier, got: o.carrier, ok: strEq(o.carrier, truth.carrier) },
    { key: 'trackingNumber', label: 'Tracking #', expected: truth.trackingNumber, got: o.trackingNumber, ok: strEq(o.trackingNumber, truth.trackingNumber) },
    { key: 'serviceLevel', label: 'Service', expected: truth.serviceLevel, got: o.serviceLevel, ok: strEq(o.serviceLevel, truth.serviceLevel) },
    { key: 'address', label: 'Address', expected: truth.address, got: o.address, ok: strEq(o.address, truth.address) },
  ];
  return gradeFromChecks(checks, difficulty, 'Label parsed');
};

// 2. Damage assessment — action is the headline field, weighted heavier.
export const gradeDamage: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'damaged', label: 'Damaged?', expected: truth.damaged, got: o.damaged, ok: boolEq(o.damaged, truth.damaged) },
    { key: 'damageType', label: 'Type', expected: truth.damageType, got: o.damageType, ok: strEq(o.damageType, truth.damageType) || !!truth.damaged === false },
    { key: 'severity', label: 'Severity', expected: truth.severity, got: o.severity, ok: Math.abs(Number(o.severity) - Number(truth.severity)) <= 1 },
    { key: 'action', label: 'Action', expected: truth.action, got: o.action, ok: strEq(o.action, truth.action) },
  ];
  // Weight the action field double — it's the operational decision.
  const actionCheck = checks[3];
  const weighted = [...checks, actionCheck];
  const okCount = weighted.filter((c) => c.ok).length;
  const partial = okCount / weighted.length;
  return {
    correct: partial >= 0.99,
    partial,
    scoreDelta: Math.round(partial * difficulty * BASE_POINTS),
    detail: `Damage assessed — ${okCount}/${weighted.length} (action ×2)`,
    fields: checks.map((c) => ({
      key: c.key,
      label: c.label,
      ok: c.ok,
      expected: fmt(c.expected),
      got: fmt(c.got),
    })),
  };
};

// 3. Hazmat
export const gradeHazmat: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'unClass', label: 'UN class', expected: truth.unClass, got: o.unClass, ok: strEq(o.unClass, truth.unClass) },
    { key: 'compliant', label: 'Compliant', expected: truth.compliant, got: o.compliant, ok: boolEq(o.compliant, truth.compliant) },
    { key: 'labelMissing', label: 'Label missing', expected: truth.labelMissing, got: o.labelMissing, ok: boolEq(o.labelMissing, truth.labelMissing) },
  ];
  return gradeFromChecks(checks, difficulty, 'Hazmat screened');
};

// 4. Customs invoice
export const gradeCustoms: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'hsCode', label: 'HS code', expected: truth.hsCode, got: o.hsCode, ok: strEq(o.hsCode, truth.hsCode) },
    { key: 'declaredValue', label: 'Value', expected: truth.declaredValue, got: o.declaredValue, ok: strEq(o.declaredValue, truth.declaredValue) },
    { key: 'countryOfOrigin', label: 'Origin', expected: truth.countryOfOrigin, got: o.countryOfOrigin, ok: strEq(o.countryOfOrigin, truth.countryOfOrigin) },
  ];
  return gradeFromChecks(checks, difficulty, 'Invoice extracted');
};

// 5. Seal / tamper — catching tamper is the headline.
export const gradeTamper: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'sealIntact', label: 'Seal intact', expected: truth.sealIntact, got: o.sealIntact, ok: boolEq(o.sealIntact, truth.sealIntact) },
    { key: 'tampered', label: 'Tampered', expected: truth.tampered, got: o.tampered, ok: boolEq(o.tampered, truth.tampered) },
    { key: 'flag', label: 'Flag', expected: truth.flag, got: o.flag, ok: strEq(o.flag, truth.flag) },
  ];
  return gradeFromChecks(checks, difficulty, 'Seal checked');
};

// 6. Manifest reconciliation
export const gradeManifest: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'expected', label: 'Expected', expected: truth.expected, got: o.expected, ok: Number(o.expected) === Number(truth.expected) },
    { key: 'scanned', label: 'Scanned', expected: truth.scanned, got: o.scanned, ok: Number(o.scanned) === Number(truth.scanned) },
    { key: 'missing', label: 'Missing', expected: truth.missing, got: o.missing, ok: Math.abs(Number(o.missing) - Number(truth.missing)) === 0 },
  ];
  return gradeFromChecks(checks, difficulty, 'Manifest reconciled');
};

// 7. Tariff classification
export const gradeTariff: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'hsCode', label: 'HS code', expected: truth.hsCode, got: o.hsCode, ok: strEq(o.hsCode, truth.hsCode) },
    { key: 'dutyCategory', label: 'Duty', expected: truth.dutyCategory, got: o.dutyCategory, ok: strEq(o.dutyCategory, truth.dutyCategory) },
  ];
  return gradeFromChecks(checks, difficulty, 'Tariff classified');
};

// 8. Exception routing — priority is the spine decision.
export const gradeExceptionRoute: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'category', label: 'Category', expected: truth.category, got: o.category, ok: strEq(o.category, truth.category) },
    { key: 'queue', label: 'Queue', expected: truth.queue, got: o.queue, ok: strEq(o.queue, truth.queue) },
    { key: 'priority', label: 'Priority', expected: truth.priority, got: o.priority, ok: strEq(o.priority, truth.priority) },
  ];
  return gradeFromChecks(checks, difficulty, 'Exception routed');
};

// 9. Dim/weight — mismatch flag is the headline; dims tolerated within ±1cm/0.5kg.
export const gradeDimWeight: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'declaredLengthCm', label: 'Length', expected: truth.declaredLengthCm, got: o.declaredLengthCm, ok: Math.abs(Number(o.declaredLengthCm) - Number(truth.declaredLengthCm)) <= 1 },
    { key: 'declaredWidthCm', label: 'Width', expected: truth.declaredWidthCm, got: o.declaredWidthCm, ok: Math.abs(Number(o.declaredWidthCm) - Number(truth.declaredWidthCm)) <= 1 },
    { key: 'declaredHeightCm', label: 'Height', expected: truth.declaredHeightCm, got: o.declaredHeightCm, ok: Math.abs(Number(o.declaredHeightCm) - Number(truth.declaredHeightCm)) <= 1 },
    { key: 'declaredWeightKg', label: 'Weight', expected: truth.declaredWeightKg, got: o.declaredWeightKg, ok: Math.abs(Number(o.declaredWeightKg) - Number(truth.declaredWeightKg)) <= 0.5 },
    { key: 'mismatch', label: 'Mismatch', expected: truth.mismatch, got: o.mismatch, ok: boolEq(o.mismatch, truth.mismatch) },
  ];
  return gradeFromChecks(checks, difficulty, 'Dim/weight checked');
};

// 10. Pallet / load check
export const gradePallet: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'cartonCount', label: 'Cartons', expected: truth.cartonCount, got: o.cartonCount, ok: Math.abs(Number(o.cartonCount) - Number(truth.cartonCount)) <= 1 },
    { key: 'overhang', label: 'Overhang', expected: truth.overhang, got: o.overhang, ok: boolEq(o.overhang, truth.overhang) },
    { key: 'stackingViolation', label: 'Stacking', expected: truth.stackingViolation, got: o.stackingViolation, ok: boolEq(o.stackingViolation, truth.stackingViolation) },
  ];
  return gradeFromChecks(checks, difficulty, 'Pallet checked');
};

// 11. Address validation
export const gradeAddress: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'canonical', label: 'Canonical', expected: truth.canonical, got: o.canonical, ok: strEq(o.canonical, truth.canonical) },
    { key: 'deliverable', label: 'Deliverable', expected: truth.deliverable, got: o.deliverable, ok: boolEq(o.deliverable, truth.deliverable) },
    { key: 'zone', label: 'Zone', expected: truth.zone, got: o.zone, ok: strEq(o.zone, truth.zone) },
  ];
  return gradeFromChecks(checks, difficulty, 'Address validated');
};

// 12. Carrier selection
export const gradeCarrier: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'carrier', label: 'Carrier', expected: truth.carrier, got: o.carrier, ok: strEq(o.carrier, truth.carrier) },
    { key: 'service', label: 'Service', expected: truth.service, got: o.service, ok: strEq(o.service, truth.service) },
    { key: 'cost', label: 'Cost', expected: truth.cost, got: o.cost, ok: strEq(o.cost, truth.cost) },
  ];
  return gradeFromChecks(checks, difficulty, 'Carrier selected');
};

// 13. SLA / ETA risk — status is the headline decision.
export const gradeSla: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'status', label: 'Status', expected: truth.status, got: o.status, ok: strEq(o.status, truth.status) },
    { key: 'etaHours', label: 'ETA', expected: truth.etaHours, got: o.etaHours, ok: Math.abs(Number(o.etaHours) - Number(truth.etaHours)) <= 2 },
    { key: 'cause', label: 'Cause', expected: truth.cause, got: o.cause, ok: strEq(o.cause, truth.cause) },
  ];
  return gradeFromChecks(checks, difficulty, 'SLA assessed');
};

// 14. RMA disposition
export const gradeRma: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'disposition', label: 'Disposition', expected: truth.disposition, got: o.disposition, ok: strEq(o.disposition, truth.disposition) },
    { key: 'reason', label: 'Reason', expected: truth.reason, got: o.reason, ok: strEq(o.reason, truth.reason) },
  ];
  return gradeFromChecks(checks, difficulty, 'RMA dispositioned');
};

// 15. Restricted / prohibited — status is the compliance decision.
export const gradeRestricted: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'status', label: 'Status', expected: truth.status, got: o.status, ok: strEq(o.status, truth.status) },
    { key: 'reason', label: 'Reason', expected: truth.reason, got: o.reason, ok: strEq(o.reason, truth.reason) },
  ];
  return gradeFromChecks(checks, difficulty, 'Screening complete');
};

// 16. Docs completeness — complete flag is the headline.
export const gradeDocs: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'bolPresent', label: 'BOL', expected: truth.bolPresent, got: o.bolPresent, ok: boolEq(o.bolPresent, truth.bolPresent) },
    { key: 'cooPresent', label: 'COO', expected: truth.cooPresent, got: o.cooPresent, ok: boolEq(o.cooPresent, truth.cooPresent) },
    { key: 'packingListPresent', label: 'Packing list', expected: truth.packingListPresent, got: o.packingListPresent, ok: boolEq(o.packingListPresent, truth.packingListPresent) },
    { key: 'complete', label: 'Complete', expected: truth.complete, got: o.complete, ok: boolEq(o.complete, truth.complete) },
  ];
  return gradeFromChecks(checks, difficulty, 'Docs checked');
};

// 17. Handwritten label
export const gradeHandwritten: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'name', label: 'Name', expected: truth.name, got: o.name, ok: strEq(o.name, truth.name) },
    { key: 'addressLine', label: 'Address', expected: truth.addressLine, got: o.addressLine, ok: strEq(o.addressLine, truth.addressLine) },
    { key: 'postcode', label: 'Postcode', expected: truth.postcode, got: o.postcode, ok: strEq(o.postcode, truth.postcode) },
  ];
  return gradeFromChecks(checks, difficulty, 'Label transcribed');
};

// 18. Conveyor incident (video) — event is the perception, action the decision.
// Action is weighted double (it's the operational disposition), mirroring damage.
export const gradeConveyor: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'event', label: 'Event', expected: truth.event, got: o.event, ok: strEq(o.event, truth.event) },
    { key: 'action', label: 'Action', expected: truth.action, got: o.action, ok: strEq(o.action, truth.action) },
  ];
  const actionCheck = checks[1];
  const weighted = [...checks, actionCheck];
  const okCount = weighted.filter((c) => c.ok).length;
  const partial = okCount / weighted.length;
  return {
    correct: partial >= 0.99,
    partial,
    scoreDelta: Math.round(partial * difficulty * BASE_POINTS),
    detail: `Incident classified — ${okCount}/${weighted.length} (action ×2)`,
    fields: checks.map((c) => ({ key: c.key, label: c.label, ok: c.ok, expected: fmt(c.expected), got: fmt(c.got) })),
  };
};

export const GRADERS: Record<string, Grader> = {
  'label-parse': gradeLabelParse,
  'damage-assessment': gradeDamage,
  'hazmat-detection': gradeHazmat,
  'customs-invoice': gradeCustoms,
  'seal-tamper': gradeTamper,
  'manifest-recon': gradeManifest,
  'tariff-classification': gradeTariff,
  'exception-routing': gradeExceptionRoute,
  'dim-weight': gradeDimWeight,
  'pallet-check': gradePallet,
  'address-validation': gradeAddress,
  'carrier-select': gradeCarrier,
  'sla-risk': gradeSla,
  'rma-disposition': gradeRma,
  'restricted-screening': gradeRestricted,
  'docs-completeness': gradeDocs,
  'handwritten-label': gradeHandwritten,
  'conveyor-incident': gradeConveyor,
};
