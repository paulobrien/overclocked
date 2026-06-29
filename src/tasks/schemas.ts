/**
 * Zod output schemas — THE single source of truth per task type.
 *
 * Per §5: "Define the schema once and everything derives from it" — the prompt's
 * format instruction, the parser, the grader's field list, AND the focus-card
 * fields all derive from these. Adding task #21 means adding one schema here.
 */
import { z } from 'zod';

// Helper: normalize strings for tolerant, case/whitespace-insensitive comparison.
// With the same model on both lanes, any format quirk hits both equally, so a
// tolerant grader can't bias the race (a bonus of the same-model default).
export const norm = (s: unknown): string =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s.\-_,]/g, '');

// 1. Shipping-label parse
export const LabelParseSchema = z.object({
  carrier: z.string(),
  trackingNumber: z.string(),
  serviceLevel: z.string(),
  address: z.string(),
});
export type LabelParse = z.infer<typeof LabelParseSchema>;

// 2. Damage assessment
export const DamageAssessmentSchema = z.object({
  damaged: z.boolean(),
  damageType: z.enum(['crushed', 'wet', 'torn', 'none']),
  severity: z.number().min(0).max(5),
  action: z.enum(['accept', 'repackage', 'refuse']),
});
export type DamageAssessment = z.infer<typeof DamageAssessmentSchema>;

// 3. Hazmat label detection
export const HazmatSchema = z.object({
  unClass: z.string().describe('the UN hazard class number on the diamond placard, e.g. "3", "2.1", "5.1", "8"'),
  compliant: z
    .boolean()
    .describe(
      'true if a correct hazard placard is present and legible — a properly-placarded hazmat parcel IS compliant and ships normally; false ONLY if the placard is missing or wrong. Do not mark a parcel non-compliant just because it carries hazmat.',
    ),
  labelMissing: z
    .boolean()
    .describe('true if the required hazard placard is absent (a blank/ghost diamond with no class number); false if a placard is present'),
});
export type Hazmat = z.infer<typeof HazmatSchema>;

// 4. Customs invoice extraction
export const CustomsInvoiceSchema = z.object({
  hsCode: z.string(),
  declaredValue: z.string(),
  countryOfOrigin: z.string(),
});
export type CustomsInvoice = z.infer<typeof CustomsInvoiceSchema>;

// 5. Seal / tamper check
export const TamperSchema = z.object({
  sealIntact: z.boolean(),
  tampered: z.boolean(),
  flag: z.enum(['clear', 'tamper', 'unknown']),
});
export type Tamper = z.infer<typeof TamperSchema>;

// 6. Manifest reconciliation
export const ManifestSchema = z.object({
  expected: z.number(),
  scanned: z.number(),
  missing: z.number(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// 7. HS tariff classification (text)
export const TariffSchema = z.object({
  hsCode: z.string(),
  dutyCategory: z.enum(['duty-free', 'low-duty', 'standard', 'high-duty']),
});
export type Tariff = z.infer<typeof TariffSchema>;

// 8. Exception routing
export const ExceptionRouteSchema = z.object({
  category: z.string(),
  queue: z.string(),
  priority: z.enum(['P1', 'P2', 'P3']),
});
export type ExceptionRoute = z.infer<typeof ExceptionRouteSchema>;

// 9. Dim/weight sanity (vision) — declared dims vs photo → mismatch flag
export const DimWeightSchema = z.object({
  declaredLengthCm: z.number(),
  declaredWidthCm: z.number(),
  declaredHeightCm: z.number(),
  declaredWeightKg: z.number(),
  mismatch: z.boolean(),
});
export type DimWeight = z.infer<typeof DimWeightSchema>;

// 10. Pallet / load check (vision)
export const PalletCheckSchema = z.object({
  cartonCount: z.number(),
  overhang: z.boolean(),
  stackingViolation: z.boolean(),
});
export type PalletCheck = z.infer<typeof PalletCheckSchema>;

// 11. Address validation & normalization (text)
export const AddressValidationSchema = z.object({
  canonical: z.string(),
  deliverable: z.boolean(),
  zone: z.string(),
});
export type AddressValidation = z.infer<typeof AddressValidationSchema>;

// 12. Least-cost carrier selection (text)
export const CarrierSelectSchema = z.object({
  carrier: z.string(),
  service: z.string(),
  cost: z.string(),
});
export type CarrierSelect = z.infer<typeof CarrierSelectSchema>;

// 13. SLA / ETA risk (text)
export const SlaRiskSchema = z.object({
  status: z.enum(['on-time', 'at-risk', 'breached']),
  etaHours: z.number(),
  cause: z.string(),
});
export type SlaRisk = z.infer<typeof SlaRiskSchema>;

// 14. Return / RMA disposition (text)
export const RmaSchema = z.object({
  disposition: z.enum(['restock', 'refurbish', 'scrap']),
  reason: z.string(),
});
export type Rma = z.infer<typeof RmaSchema>;

// 15. Restricted / prohibited screening (text) — item × destination
export const RestrictedSchema = z.object({
  status: z.enum(['allowed', 'restricted', 'prohibited']),
  reason: z.string(),
});
export type Restricted = z.infer<typeof RestrictedSchema>;

// 16. Docs completeness (document) — missing BOL / COO / packing list
export const DocsCompletenessSchema = z.object({
  bolPresent: z.boolean(),
  cooPresent: z.boolean(),
  packingListPresent: z.boolean(),
  complete: z.boolean(),
});
export type DocsCompleteness = z.infer<typeof DocsCompletenessSchema>;

// 17. Handwritten / low-legibility label (vision)
export const HandwrittenSchema = z.object({
  name: z.string(),
  addressLine: z.string(),
  postcode: z.string(),
});
export type Handwritten = z.infer<typeof HandwrittenSchema>;

// 18. Conveyor incident (video) — classify what happens to a parcel across an
// ordered sequence of line-camera frames, then decide the disposition. This is
// the multi-frame "video" modality: the model reasons over MOTION across frames
// (a parcel that stalls, tips off the edge, or gets rammed), not a single still.
export const ConveyorIncidentSchema = z.object({
  event: z
    .enum(['clear', 'jam', 'fall', 'crush'])
    .describe(
      'what happens to the tracked parcel across the frames, in order: "clear" = it rides smoothly along the belt and exits off the end; "jam" = it stalls and stops mid-belt while the belt keeps running, and parcels pile up behind it; "fall" = it drifts to the side edge, tips over, and drops off the belt onto the floor; "crush" = a following parcel rams into it and it gets visibly flattened/crumpled against the sorter',
    ),
  action: z
    .enum(['accept', 'reroute', 'refuse'])
    .describe(
      'the disposition: "accept" a clean pass-through (clear); "reroute" a recoverable line incident where the parcel itself is undamaged but the belt needs clearing (jam or fall); "refuse" a parcel that arrived damaged (crush)',
    ),
});
export type ConveyorIncident = z.infer<typeof ConveyorIncidentSchema>;

// --- Router agent output (shared by all task types) ------------------------
export const RouterSchema = z.object({
  taskType: z.string(),
  modality: z.enum(['vision', 'document', 'text']),
  exceptionType: z.string(),
  notes: z.string().optional(),
});
export type RouterDecision = z.infer<typeof RouterSchema>;

// --- Checker agent output --------------------------------------------------
export const CheckerSchema = z.object({
  pass: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});
export type CheckerVerdict = z.infer<typeof CheckerSchema>;

// --- Escalation specialist output ------------------------------------------
export const EscalationSchema = z.object({
  decision: z.enum(['release', 'hold', 'refuse']),
  override: z.boolean(),
  rationale: z.string(),
});
export type EscalationDecision = z.infer<typeof EscalationSchema>;

/** Map a task type id -> its output schema. Used by the orchestrator to know
 *  what shape the worker must emit. */
export const SCHEMA_BY_TASK: Record<string, z.ZodType<any>> = {
  'label-parse': LabelParseSchema,
  'damage-assessment': DamageAssessmentSchema,
  'hazmat-detection': HazmatSchema,
  'customs-invoice': CustomsInvoiceSchema,
  'seal-tamper': TamperSchema,
  'manifest-recon': ManifestSchema,
  'tariff-classification': TariffSchema,
  'exception-routing': ExceptionRouteSchema,
  'dim-weight': DimWeightSchema,
  'pallet-check': PalletCheckSchema,
  'address-validation': AddressValidationSchema,
  'carrier-select': CarrierSelectSchema,
  'sla-risk': SlaRiskSchema,
  'rma-disposition': RmaSchema,
  'restricted-screening': RestrictedSchema,
  'docs-completeness': DocsCompletenessSchema,
  'handwritten-label': HandwrittenSchema,
  'conveyor-incident': ConveyorIncidentSchema,
};
