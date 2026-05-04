import { useMemo } from 'react';
import type { FhirCondition, FhirAllergyIntolerance, FhirObservation } from '../types/fhir';

interface HealthRiskScoreProps {
  conditions: FhirCondition[];
  allergies: FhirAllergyIntolerance[];
  observations: FhirObservation[];
  birthDate?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: CHARLSON COMORBIDITY INDEX (CCI)
//
// The CCI is a real validated clinical scoring system created in 1987 and used
// worldwide to predict 10-year mortality risk based on 17 specific conditions.
// Each condition carries a weight (1, 2, 3, or 6 points) based on how strongly
// it predicts adverse outcomes. We match these against FHIR condition names.
// ─────────────────────────────────────────────────────────────────────────────

interface CharlsonCondition {
  keywords: string[];   // words to look for in the condition name
  points: number;       // CCI weight for this condition
  label: string;        // display name
}

const CHARLSON_CONDITIONS: CharlsonCondition[] = [
  // 1-point conditions
  { keywords: ['myocardial infarction', 'heart attack'],                     points: 1, label: 'Myocardial infarction' },
  { keywords: ['congestive heart failure', 'heart failure'],                  points: 1, label: 'Heart failure' },
  { keywords: ['peripheral vascular', 'peripheral arterial'],                 points: 1, label: 'Peripheral vascular disease' },
  { keywords: ['cerebrovascular', 'stroke', 'tia'],                           points: 1, label: 'Cerebrovascular disease' },
  { keywords: ['dementia', 'alzheimer'],                                       points: 1, label: 'Dementia' },
  { keywords: ['chronic pulmonary', 'copd', 'emphysema', 'chronic obstructive'], points: 1, label: 'COPD' },
  { keywords: ['connective tissue', 'rheumatoid', 'lupus', 'scleroderma'],    points: 1, label: 'Connective tissue disease' },
  { keywords: ['peptic ulcer', 'stomach ulcer', 'duodenal ulcer'],            points: 1, label: 'Peptic ulcer disease' },
  { keywords: ['mild liver', 'hepatitis', 'cirrhosis'],                       points: 1, label: 'Mild liver disease' },
  { keywords: ['diabetes without', 'type 2 diabetes', 'type 1 diabetes', 'prediabetes'], points: 1, label: 'Diabetes (uncomplicated)' },

  // 2-point conditions
  { keywords: ['hemiplegia', 'paraplegia', 'paralysis'],                      points: 2, label: 'Hemiplegia / paraplegia' },
  { keywords: ['renal failure', 'kidney failure', 'chronic kidney', 'end-stage renal'], points: 2, label: 'Renal disease' },
  { keywords: ['diabetes with', 'diabetic nephropathy', 'diabetic retinopathy', 'diabetic neuropathy'], points: 2, label: 'Diabetes (with complications)' },
  { keywords: ['tumor', 'cancer', 'carcinoma', 'malignancy', 'lymphoma', 'leukemia'], points: 2, label: 'Cancer / tumor' },

  // 3-point conditions
  { keywords: ['moderate liver', 'severe liver', 'portal hypertension', 'esophageal varices'], points: 3, label: 'Moderate/severe liver disease' },

  // 6-point conditions
  { keywords: ['metastatic', 'metastasis'],                                   points: 6, label: 'Metastatic cancer' },
  { keywords: ['aids', 'hiv'],                                                points: 6, label: 'HIV/AIDS' },
];

// Age adds to CCI: +1 per decade over 40 (standard CCI age adjustment)
function charlsonAgePoints(birthDate?: string): number {
  if (!birthDate) return 0;
  const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
  if (age < 50) return 0;
  if (age < 60) return 1;
  if (age < 70) return 2;
  if (age < 80) return 3;
  return 4;
}

interface MatchedCondition {
  label: string;
  points: number;
}

function computeCharlsonScore(conditions: FhirCondition[], birthDate?: string): {
  total: number;
  agePoints: number;
  matched: MatchedCondition[];
} {
  const activeConditions = conditions.filter(c => c.clinicalStatus?.coding?.[0]?.code === 'active');
  const matched: MatchedCondition[] = [];
  const seen = new Set<string>();

  for (const fhirCondition of activeConditions) {
    const name = (fhirCondition.code?.text ?? fhirCondition.code?.coding?.[0]?.display ?? '').toLowerCase();
    for (const charlson of CHARLSON_CONDITIONS) {
      if (seen.has(charlson.label)) continue; // don't double-count same category
      if (charlson.keywords.some(k => name.includes(k))) {
        matched.push({ label: charlson.label, points: charlson.points });
        seen.add(charlson.label);
        break;
      }
    }
  }

  const agePoints = charlsonAgePoints(birthDate);
  const conditionTotal = matched.reduce((s, m) => s + m.points, 0);
  return { total: conditionTotal + agePoints, agePoints, matched };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: LAB VALUE DEVIATION SCORE
//
// We pull the most recent value for each key lab metric from the FHIR
// Observation resources and compare against established clinical thresholds.
// Each out-of-range value contributes points based on how far outside normal it is.
// ─────────────────────────────────────────────────────────────────────────────

interface LabFlag {
  label: string;
  value: number;
  unit: string;
  status: 'normal' | 'borderline' | 'abnormal';
  points: number;
  range: string;
}

function getLatestObsValue(observations: FhirObservation[], keywords: string[]): { value: number; unit: string } | null {
  const matches = observations
    .filter(obs => {
      const text = (obs.code?.text ?? obs.code?.coding?.[0]?.display ?? '').toLowerCase();
      return keywords.some(k => text.includes(k));
    })
    .filter(obs => obs.valueQuantity?.value !== undefined && obs.effectiveDateTime)
    .sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? ''));

  const top = matches[0];
  if (!top?.valueQuantity?.value) return null;
  return { value: top.valueQuantity.value, unit: top.valueQuantity.unit ?? '' };
}

function getSystolicBP(observations: FhirObservation[]): { value: number; unit: string } | null {
  const bpObs = observations
    .filter(obs => {
      const text = (obs.code?.text ?? obs.code?.coding?.[0]?.display ?? '').toLowerCase();
      return text.includes('blood pressure') || text.includes('systolic');
    })
    .filter(obs => obs.effectiveDateTime)
    .sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? ''));

  for (const obs of bpObs) {
    // Try component first (BP panel)
    if (obs.component) {
      for (const c of obs.component) {
        const t = (c.code?.text ?? c.code?.coding?.[0]?.display ?? '').toLowerCase();
        if ((t.includes('systolic') || c.code?.coding?.[0]?.code === '8480-6') && c.valueQuantity?.value) {
          return { value: c.valueQuantity.value, unit: c.valueQuantity.unit ?? 'mmHg' };
        }
      }
    }
    // Try scalar
    if (obs.valueQuantity?.value) return { value: obs.valueQuantity.value, unit: obs.valueQuantity.unit ?? 'mmHg' };
  }
  return null;
}

function computeLabScore(observations: FhirObservation[]): { total: number; flags: LabFlag[] } {
  const flags: LabFlag[] = [];

  // Glucose (fasting normal: 70–99, prediabetic: 100–125, diabetic: ≥126)
  const glucose = getLatestObsValue(observations, ['glucose', 'blood glucose']);
  if (glucose) {
    const v = glucose.value;
    if (v >= 126) flags.push({ label: 'Blood glucose', value: v, unit: glucose.unit || 'mg/dL', status: 'abnormal', points: 20, range: 'Normal: 70–99 mg/dL' });
    else if (v >= 100) flags.push({ label: 'Blood glucose', value: v, unit: glucose.unit || 'mg/dL', status: 'borderline', points: 10, range: 'Normal: 70–99 mg/dL' });
    else flags.push({ label: 'Blood glucose', value: v, unit: glucose.unit || 'mg/dL', status: 'normal', points: 0, range: 'Normal: 70–99 mg/dL' });
  }

  // Systolic BP (normal: <120, elevated: 120–129, stage 1: 130–139, stage 2: ≥140)
  const bp = getSystolicBP(observations);
  if (bp) {
    const v = bp.value;
    if (v >= 140) flags.push({ label: 'Systolic BP', value: v, unit: bp.unit || 'mmHg', status: 'abnormal', points: 15, range: 'Normal: <120 mmHg' });
    else if (v >= 120) flags.push({ label: 'Systolic BP', value: v, unit: bp.unit || 'mmHg', status: 'borderline', points: 8, range: 'Normal: <120 mmHg' });
    else flags.push({ label: 'Systolic BP', value: v, unit: bp.unit || 'mmHg', status: 'normal', points: 0, range: 'Normal: <120 mmHg' });
  }

  // LDL (normal: <100, borderline: 100–159, high: ≥160)
  const ldl = getLatestObsValue(observations, ['ldl', 'low density']);
  if (ldl) {
    const v = ldl.value;
    if (v >= 160) flags.push({ label: 'LDL cholesterol', value: v, unit: ldl.unit || 'mg/dL', status: 'abnormal', points: 15, range: 'Normal: <100 mg/dL' });
    else if (v >= 100) flags.push({ label: 'LDL cholesterol', value: v, unit: ldl.unit || 'mg/dL', status: 'borderline', points: 7, range: 'Normal: <100 mg/dL' });
    else flags.push({ label: 'LDL cholesterol', value: v, unit: ldl.unit || 'mg/dL', status: 'normal', points: 0, range: 'Normal: <100 mg/dL' });
  }

  // HDL (low HDL is a risk factor — normal: ≥60, borderline: 40–59, low: <40)
  const hdl = getLatestObsValue(observations, ['hdl', 'high density']);
  if (hdl) {
    const v = hdl.value;
    if (v < 40) flags.push({ label: 'HDL cholesterol', value: v, unit: hdl.unit || 'mg/dL', status: 'abnormal', points: 10, range: 'Normal: ≥60 mg/dL' });
    else if (v < 60) flags.push({ label: 'HDL cholesterol', value: v, unit: hdl.unit || 'mg/dL', status: 'borderline', points: 5, range: 'Normal: ≥60 mg/dL' });
    else flags.push({ label: 'HDL cholesterol', value: v, unit: hdl.unit || 'mg/dL', status: 'normal', points: 0, range: 'Normal: ≥60 mg/dL' });
  }

  // Total cholesterol (normal: <200, borderline: 200–239, high: ≥240)
  const chol = getLatestObsValue(observations, ['total cholesterol', 'cholesterol total']);
  if (chol) {
    const v = chol.value;
    if (v >= 240) flags.push({ label: 'Total cholesterol', value: v, unit: chol.unit || 'mg/dL', status: 'abnormal', points: 10, range: 'Normal: <200 mg/dL' });
    else if (v >= 200) flags.push({ label: 'Total cholesterol', value: v, unit: chol.unit || 'mg/dL', status: 'borderline', points: 5, range: 'Normal: <200 mg/dL' });
    else flags.push({ label: 'Total cholesterol', value: v, unit: chol.unit || 'mg/dL', status: 'normal', points: 0, range: 'Normal: <200 mg/dL' });
  }

  const total = Math.min(30, flags.reduce((s, f) => s + f.points, 0));
  return { total, flags };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3: COMBINE INTO FINAL SCORE
//
// CCI is scored 0–37 (but rarely above 15 in practice).
// We normalize it to a 0–60 contribution.
// Labs contribute 0–30.
// Age (already inside CCI) rounds out to 100.
// ─────────────────────────────────────────────────────────────────────────────

function riskLabel(score: number): { label: string; color: string; bg: string; ring: string } {
  if (score >= 60) return { label: 'High Risk',      color: '#b91c1c', bg: '#fef2f2', ring: '#ef4444' };
  if (score >= 38) return { label: 'Moderate Risk',  color: '#b45309', bg: '#fffbeb', ring: '#f59e0b' };
  if (score >= 20) return { label: 'Low-Moderate',   color: '#1d4ed8', bg: '#eff6ff', ring: '#3b82f6' };
  return              { label: 'Low Risk',           color: '#166534', bg: '#f0fdf4', ring: '#22c55e' };
}

const STATUS_STYLE = {
  normal:     { color: '#166534', bg: '#f0fdf4', label: 'Normal' },
  borderline: { color: '#92400e', bg: '#fef3c7', label: 'Borderline' },
  abnormal:   { color: '#b91c1c', bg: '#fee2e2', label: 'Abnormal' },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function HealthRiskScore({
  conditions, allergies, observations, birthDate,
}: HealthRiskScoreProps) {
  const { charlson, labs, finalScore } = useMemo(() => {
    const charlson = computeCharlsonScore(conditions, birthDate);
    const labs = computeLabScore(observations);

    // CCI clinical thresholds (based on 10-year survival data):
    // 0 = minimal risk, 1-2 = low, 3-4 = moderate, 5-6 = high, 7+ = very high
    // We map CCI directly to a 0–70 contribution using a steeper curve
    const cciNormalized = Math.min(70, Math.round(
      charlson.total <= 0 ? 0 :
      charlson.total === 1 ? 15 :
      charlson.total === 2 ? 25 :
      charlson.total === 3 ? 38 :
      charlson.total === 4 ? 48 :
      charlson.total === 5 ? 56 :
      charlson.total === 6 ? 63 :
      charlson.total <= 8  ? 68 : 70
    ));
    // Labs: 0–30 (already capped)
    const labNormalized = labs.total;
    // Final
    const finalScore = Math.min(100, cciNormalized + labNormalized);

    return { charlson, labs, finalScore };
  }, [conditions, observations, birthDate]);

  const risk = riskLabel(finalScore);

  // SVG arc gauge
  const radius = 36;
  const cx = 50;
  const cy = 50;
  const circumference = Math.PI * radius;
  const filled = (finalScore / 100) * circumference;

  const hasLabData = labs.flags.length > 0;
  const abnormalLabs = labs.flags.filter(f => f.status !== 'normal');

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Health Risk Score</h3>

      {/* Gauge + score */}
      <div className="flex flex-col items-center mb-3">
        <svg viewBox="0 0 100 60" className="w-28 h-[72px]">
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none" stroke="#f1f5f9" strokeWidth="10" strokeLinecap="round"
          />
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none" stroke={risk.ring} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
          <text x="50" y="47" textAnchor="middle" fontSize="17" fontWeight="600" fill={risk.color}>
            {finalScore}
          </text>
        </svg>
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full -mt-1"
          style={{ background: risk.bg, color: risk.color }}
        >
          {risk.label}
        </span>
      </div>

      {/* CCI section */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Charlson Index</span>
          <span className="text-xs font-bold text-gray-700">{charlson.total} pts</span>
        </div>
        {charlson.matched.length === 0 ? (
          <p className="text-xs text-gray-400">No CCI conditions matched</p>
        ) : (
          <div className="flex flex-col gap-1">
            {charlson.matched.map(m => (
              <div key={m.label} className="flex items-center justify-between">
                <span className="text-xs text-gray-600 truncate flex-1">{m.label}</span>
                <span className="text-xs font-semibold text-gray-500 ml-2 flex-shrink-0">+{m.points}</span>
              </div>
            ))}
            {charlson.agePoints > 0 && (
              <div className="flex items-center justify-between border-t border-gray-100 pt-1 mt-0.5">
                <span className="text-xs text-gray-400">Age adjustment</span>
                <span className="text-xs font-semibold text-gray-400">+{charlson.agePoints}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lab flags section */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lab Values</span>
          {hasLabData && (
            <span className="text-xs font-bold text-gray-700">{labs.total} pts</span>
          )}
        </div>
        {!hasLabData ? (
          <p className="text-xs text-gray-400">No lab data available</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {labs.flags.map(f => {
              const s = STATUS_STYLE[f.status];
              return (
                <div key={f.label} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600 truncate">{f.label}</span>
                      <span className="text-xs font-mono text-gray-700 ml-1 flex-shrink-0">
                        {f.value.toFixed(1)} {f.unit}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-xs font-medium px-1.5 py-0 rounded"
                        style={{ background: s.bg, color: s.color }}
                      >
                        {s.label}
                      </span>
                      <span className="text-xs text-gray-400">{f.range}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 italic mt-3 border-t border-gray-100 pt-3">
        Based on Charlson Comorbidity Index + live lab deviations. Not a clinical diagnosis.
      </p>
    </div>
  );
}
