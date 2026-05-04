import { useEffect, useRef } from 'react';
import type { FhirObservation } from '../types/fhir';

interface VitalSignsChartProps {
  observations: FhirObservation[];
}

// LOINC codes for common vitals
const VITAL_CODES = {
  systolicBP: ['8480-6', '55284-4'],
  diastolicBP: ['8462-4'],
  weight: ['29463-7', '3141-9'],
  glucose: ['2339-0', '15074-8', '2345-7'],
  cholesterol: ['2093-3', '18261-8'],
  hdl: ['2085-9'],
  ldl: ['18262-6', '2089-1'],
};

function getLoincCode(obs: FhirObservation): string | null {
  for (const coding of obs.code?.coding ?? []) {
    if (coding.system?.includes('loinc') || coding.system?.includes('LOINC')) {
      return coding.code ?? null;
    }
  }
  // Try without system check
  return obs.code?.coding?.[0]?.code ?? null;
}

function matchesCodes(obs: FhirObservation, codes: string[]): boolean {
  const loinc = getLoincCode(obs);
  if (loinc && codes.includes(loinc)) return true;
  const text = (obs.code?.text ?? '').toLowerCase();
  return codes.some(c => text.includes(c));
}

function filterByType(observations: FhirObservation[], codes: string[], textKeywords: string[]): FhirObservation[] {
  return observations.filter(obs => {
    const loinc = getLoincCode(obs);
    if (loinc && codes.includes(loinc)) return true;
    const text = (obs.code?.text ?? obs.code?.coding?.[0]?.display ?? '').toLowerCase();
    return textKeywords.some(k => text.includes(k));
  });
}

function getScalarValue(obs: FhirObservation): number | null {
  if (obs.valueQuantity?.value !== undefined) return obs.valueQuantity.value;
  return null;
}

function getSystolicValue(obs: FhirObservation): number | null {
  if (obs.component) {
    for (const c of obs.component) {
      const text = (c.code?.text ?? c.code?.coding?.[0]?.display ?? '').toLowerCase();
      const code = c.code?.coding?.[0]?.code;
      if (text.includes('systolic') || code === '8480-6') {
        return c.valueQuantity?.value ?? null;
      }
    }
  }
  return getScalarValue(obs);
}

function getDiastolicValue(obs: FhirObservation): number | null {
  if (obs.component) {
    for (const c of obs.component) {
      const text = (c.code?.text ?? c.code?.coding?.[0]?.display ?? '').toLowerCase();
      const code = c.code?.coding?.[0]?.code;
      if (text.includes('diastolic') || code === '8462-4') {
        return c.valueQuantity?.value ?? null;
      }
    }
  }
  return null;
}

interface ChartPoint { date: string; value: number }

function extractPoints(
  observations: FhirObservation[],
  codes: string[],
  textKeywords: string[],
  valueExtractor: (obs: FhirObservation) => number | null
): ChartPoint[] {
  return filterByType(observations, codes, textKeywords)
    .map(obs => {
      const value = valueExtractor(obs);
      return value !== null && obs.effectiveDateTime
        ? { date: obs.effectiveDateTime.split('T')[0], value }
        : null;
    })
    .filter((p): p is ChartPoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20);
}

interface MiniChartProps {
  label: string;
  unit: string;
  points: ChartPoint[];
  color: string;
  secondaryPoints?: ChartPoint[];
  secondaryLabel?: string;
  secondaryColor?: string;
}

function MiniLineChart({ label, unit, points, color, secondaryPoints, secondaryLabel, secondaryColor }: MiniChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Dynamically import Chart.js
    import('chart.js/auto').then(({ default: Chart }) => {
      const existing = Chart.getChart(canvasRef.current!);
      if (existing) existing.destroy();

      const datasets: any[] = [
        {
          label,
          data: points.map(p => ({ x: p.date, y: p.value })),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: true,
        },
      ];

      if (secondaryPoints && secondaryPoints.length > 0 && secondaryLabel && secondaryColor) {
        datasets.push({
          label: secondaryLabel,
          data: secondaryPoints.map(p => ({ x: p.date, y: p.value })),
          borderColor: secondaryColor,
          backgroundColor: secondaryColor + '15',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
          fill: false,
        });
      }

      new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: datasets.length > 1, position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (item) => `${item.dataset.label}: ${Number(item.parsed.y).toFixed(2)} ${unit}`,
              },
            },
          },
          scales: {
            x: {
              type: 'category',
              ticks: { maxTicksLimit: 6, font: { size: 10 }, maxRotation: 30 },
              grid: { display: false },
            },
            y: {
              ticks: { font: { size: 10 }, callback: (v: any) => Number(v).toFixed(2) },
              grid: { color: '#f3f4f6' },
            },
          },
        },
      });
    });
  }, [points, secondaryPoints, label, color, secondaryLabel, secondaryColor, unit]);

  if (points.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
        <div className="h-32 flex items-center justify-center text-gray-300 text-sm">No data available</div>
      </div>
    );
  }

  const latest = points[points.length - 1];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <div className="text-right">
          <span className="text-lg font-bold text-gray-900">{latest.value.toFixed(2)}</span>
          <span className="text-xs text-gray-400 ml-1">{unit}</span>
        </div>
      </div>
      <div className="h-36">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export function VitalSignsChart({ observations }: VitalSignsChartProps) {
  const systolicPts = extractPoints(observations,
    [...VITAL_CODES.systolicBP, ...VITAL_CODES.diastolicBP],
    ['blood pressure', 'systolic'],
    getSystolicValue
  );
  const diastolicPts = extractPoints(observations,
    VITAL_CODES.diastolicBP,
    ['diastolic'],
    getDiastolicValue
  );
  const weightPts = extractPoints(observations, VITAL_CODES.weight, ['body weight', 'weight'], getScalarValue);
  const glucosePts = extractPoints(observations, VITAL_CODES.glucose, ['glucose', 'blood glucose'], getScalarValue);
  const cholesterolPts = extractPoints(observations, VITAL_CODES.cholesterol, ['cholesterol', 'total cholesterol'], getScalarValue);
  const hdlPts = extractPoints(observations, VITAL_CODES.hdl, ['hdl', 'high density'], getScalarValue);
  const ldlPts = extractPoints(observations, VITAL_CODES.ldl, ['ldl', 'low density'], getScalarValue);

  const hasAnyData = [systolicPts, weightPts, glucosePts, cholesterolPts].some(p => p.length > 0);

  if (!hasAnyData) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No vital sign or lab data available to chart.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MiniLineChart
          label="Blood Pressure"
          unit="mmHg"
          points={systolicPts}
          color="#3b82f6"
          secondaryPoints={diastolicPts}
          secondaryLabel="Diastolic"
          secondaryColor="#93c5fd"
        />
        <MiniLineChart
          label="Body Weight"
          unit="kg"
          points={weightPts}
          color="#10b981"
        />
        <MiniLineChart
          label="Blood Glucose"
          unit="mg/dL"
          points={glucosePts}
          color="#f59e0b"
        />
        <MiniLineChart
          label="Cholesterol"
          unit="mg/dL"
          points={cholesterolPts}
          color="#6366f1"
          secondaryPoints={hdlPts.length > 0 ? hdlPts : ldlPts}
          secondaryLabel={hdlPts.length > 0 ? 'HDL' : 'LDL'}
          secondaryColor={hdlPts.length > 0 ? '#34d399' : '#f87171'}
        />
      </div>
    </div>
  );
}
