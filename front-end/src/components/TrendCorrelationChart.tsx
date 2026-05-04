import { useEffect, useRef, useState } from 'react';
import type { FhirObservation } from '../types/fhir';

interface LifestyleEntry {
  date: string;
  calories_kcal: number;
  sugar_g: number;
  carbs_g: number;
  exercise_min: number;
  source: string;
}

interface TrendCorrelationChartProps {
  observations: FhirObservation[];
  patientId: string;
}

type LabMetric = 'glucose' | 'cholesterol' | 'weight' | 'bp_systolic';
type LifestyleMetric = 'sugar_g' | 'calories_kcal' | 'carbs_g' | 'exercise_min';

const LAB_CONFIG: Record<LabMetric, { label: string; keywords: string[]; color: string }> = {
  glucose:      { label: 'Blood Glucose (mg/dL)', keywords: ['glucose', 'blood glucose'], color: '#3b82f6' },
  cholesterol:  { label: 'Cholesterol (mg/dL)',   keywords: ['cholesterol', 'total cholesterol'], color: '#8b5cf6' },
  weight:       { label: 'Body Weight (kg)',       keywords: ['body weight', 'weight'], color: '#10b981' },
  bp_systolic:  { label: 'Systolic BP (mmHg)',     keywords: ['blood pressure', 'systolic'], color: '#ef4444' },
};

const LIFESTYLE_CONFIG: Record<LifestyleMetric, { label: string; color: string; scale?: number }> = {
  sugar_g:      { label: 'Sugar (g)',           color: '#f59e0b' },
  calories_kcal:{ label: 'Calories (kcal/10)',  color: '#f97316', scale: 0.1 },
  carbs_g:      { label: 'Carbs (g)',           color: '#ec4899' },
  exercise_min: { label: 'Exercise (min)',       color: '#06b6d4' },
};

function getObsValue(obs: FhirObservation): number | null {
  if (obs.valueQuantity?.value !== undefined) return obs.valueQuantity.value;
  if (obs.component) {
    for (const c of obs.component) {
      const text = (c.code?.text ?? c.code?.coding?.[0]?.display ?? '').toLowerCase();
      if (text.includes('systolic') && c.valueQuantity?.value !== undefined) return c.valueQuantity.value;
    }
  }
  return null;
}

function filterObs(observations: FhirObservation[], keywords: string[]): { date: string; value: number }[] {
  return observations
    .filter(obs => {
      const text = (obs.code?.text ?? obs.code?.coding?.[0]?.display ?? '').toLowerCase();
      return keywords.some(k => text.includes(k));
    })
    .map(obs => {
      const value = getObsValue(obs);
      return value !== null && obs.effectiveDateTime
        ? { date: obs.effectiveDateTime.split('T')[0]!, value }
        : null;
    })
    .filter((p): p is { date: string; value: number } => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20);
}

export function TrendCorrelationChart({ observations, patientId }: TrendCorrelationChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [labMetric, setLabMetric] = useState<LabMetric>('glucose');
  const [lifestyleMetric, setLifestyleMetric] = useState<LifestyleMetric>('sugar_g');
  const [lifestyleEntries, setLifestyleEntries] = useState<LifestyleEntry[]>([]);
  const [loadingLifestyle, setLoadingLifestyle] = useState(true);

  useEffect(() => {
    setLoadingLifestyle(true);
    fetch(`http://127.0.0.1:8000/lifestyle/${patientId}?days=90`)
      .then(r => r.ok ? r.json() : [])
      .then((data: LifestyleEntry[]) => setLifestyleEntries(data))
      .catch(() => setLifestyleEntries([]))
      .finally(() => setLoadingLifestyle(false));
  }, [patientId]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const labCfg = LAB_CONFIG[labMetric];
    const lifeCfg = LIFESTYLE_CONFIG[lifestyleMetric];
    const scale = lifeCfg.scale ?? 1;

    const labPoints = filterObs(observations, labCfg.keywords);
    const lifePoints = lifestyleEntries
      .map(e => ({
        date: e.date,
        value: (e[lifestyleMetric] as number) * scale,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const allDates = Array.from(new Set([
      ...labPoints.map(p => p.date),
      ...lifePoints.map(p => p.date),
    ])).sort();

    import('chart.js/auto').then(({ default: Chart }) => {
      const existing = Chart.getChart(canvasRef.current!);
      if (existing) existing.destroy();

      new Chart(ctx, {
        type: 'line',
        data: {
          labels: allDates,
          datasets: [
            {
              label: labCfg.label,
              data: allDates.map(d => labPoints.find(p => p.date === d)?.value ?? null),
              borderColor: labCfg.color,
              backgroundColor: labCfg.color + '20',
              borderWidth: 2.5,
              pointRadius: 4,
              tension: 0.3,
              fill: false,
              yAxisID: 'y',
              spanGaps: false,
            },
            {
              label: lifeCfg.label,
              data: allDates.map(d => lifePoints.find(p => p.date === d)?.value ?? null),
              borderColor: lifeCfg.color,
              backgroundColor: lifeCfg.color + '20',
              borderWidth: 2.5,
              pointRadius: 4,
              tension: 0.3,
              fill: false,
              yAxisID: 'y2',
              borderDash: [5, 3],
              spanGaps: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: item => `${item.dataset.label}: ${Number(item.parsed.y).toFixed(1)}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { maxTicksLimit: 8, font: { size: 10 }, maxRotation: 30 },
              grid: { display: false },
            },
            y: {
              position: 'left',
              ticks: { font: { size: 10 }, callback: (v: any) => Number(v).toFixed(1) },
              grid: { color: '#f3f4f6' },
              title: { display: true, text: labCfg.label, font: { size: 10 } },
            },
            y2: {
              position: 'right',
              ticks: { font: { size: 10 }, callback: (v: any) => Number(v).toFixed(1) },
              grid: { display: false },
              title: { display: true, text: lifeCfg.label, font: { size: 10 } },
            },
          },
        },
      });
    });
  }, [observations, labMetric, lifestyleMetric, lifestyleEntries]);

  const hasLifestyle = lifestyleEntries.length > 0;

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1">Lab metric</label>
          <select
            value={labMetric}
            onChange={e => setLabMetric(e.target.value as LabMetric)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(LAB_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1">Lifestyle metric</label>
          <select
            value={lifestyleMetric}
            onChange={e => setLifestyleMetric(e.target.value as LifestyleMetric)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(LIFESTYLE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {!loadingLifestyle && !hasLifestyle && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-700 mb-4">
          No lifestyle data logged yet. Log entries in the Lifestyle tab to see correlations here.
        </div>
      )}

      <div className="h-64">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
