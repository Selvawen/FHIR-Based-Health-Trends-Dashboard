import { useEffect, useRef, useState } from 'react';

interface Reading {
  value: number;
  timestamp: string;
}

interface ChartConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
  yLabel: string;
  formatValue?: (v: number) => string;
}

const CHART_CONFIGS: ChartConfig[] = [
  {
    key: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    label: 'HRV (SDNN)',
    unit: 'ms',
    color: '#8b5cf6',
    yLabel: 'HRV (ms)',
  },
  {
    key: 'HKQuantityTypeIdentifierRespiratoryRate',
    label: 'Respiratory Rate',
    unit: 'breaths/min',
    color: '#06b6d4',
    yLabel: 'Breaths/min',
  },
  {
    key: 'HKQuantityTypeIdentifierStepCount',
    label: 'Step Count',
    unit: 'steps',
    color: '#10b981',
    yLabel: 'Steps',
    formatValue: (v) => Math.round(v).toLocaleString(),
  },
  {
    key: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    label: 'Active Energy',
    unit: 'kcal',
    color: '#f59e0b',
    yLabel: 'kcal',
    formatValue: (v) => Math.round(v).toString(),
  },
  {
    key: 'HKQuantityTypeIdentifierAppleExerciseTime',
    label: 'Exercise Time',
    unit: 'min',
    color: '#ef4444',
    yLabel: 'Minutes',
    formatValue: (v) => Math.round(v).toString(),
  },
];

interface SingleChartProps {
  config: ChartConfig;
  readings: Reading[];
}

function SingleHealthKitChart({ config, readings }: SingleChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || readings.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const values = readings.map(r => r.value);
    const labels = readings.map((r, i) => {
      const d = new Date(r.timestamp);
      return isNaN(d.getTime()) ? `#${i + 1}` : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const fmt = config.formatValue ?? ((v: number) => v.toFixed(1));

    import('chart.js/auto').then(({ default: Chart }) => {
      const existing = Chart.getChart(canvasRef.current!);
      if (existing) existing.destroy();

      new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: `${config.label} (${config.unit})`,
              data: values,
              borderColor: config.color,
              backgroundColor: config.color + '20',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: config.color,
              tension: 0.3,
              fill: true,
              yAxisID: 'y',
            },
            {
              label: `Mean (${fmt(mean)} ${config.unit})`,
              data: Array(values.length).fill(mean),
              borderColor: '#6b7280',
              borderWidth: 1.5,
              borderDash: [6, 3],
              pointRadius: 0,
              fill: false,
              yAxisID: 'y',
            },
            {
              label: `Max (${fmt(max)} ${config.unit})`,
              data: Array(values.length).fill(max),
              borderColor: '#10b981',
              borderWidth: 1,
              borderDash: [3, 3],
              pointRadius: 0,
              fill: false,
              yAxisID: 'y',
            },
            {
              label: `Min (${fmt(min)} ${config.unit})`,
              data: Array(values.length).fill(min),
              borderColor: '#ef4444',
              borderWidth: 1,
              borderDash: [3, 3],
              pointRadius: 0,
              fill: false,
              yAxisID: 'y',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { boxWidth: 12, font: { size: 11 } },
            },
            tooltip: {
              callbacks: {
                label: item => `${item.dataset.label}: ${fmt(Number(item.parsed.y))}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { font: { size: 10 }, maxRotation: 30 },
              grid: { display: false },
            },
            y: {
              ticks: {
                font: { size: 10 },
                callback: (v: any) => fmt(Number(v)),
              },
              grid: { color: '#f3f4f6' },
              title: { display: true, text: config.yLabel, font: { size: 10 } },
            },
          },
        },
      });
    });
  }, [readings, config]);

  if (readings.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-10">
        No {config.label} readings available yet.
      </p>
    );
  }

  return <div className="h-56"><canvas ref={canvasRef} /></div>;
}

interface SleepChartProps {
  nightly: { date: string; total_in_bed_min: number; total_asleep_min: number; total_awake_min: number }[];
}

function SleepChart({ nightly }: SleepChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || nightly.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const labels = nightly.map(n => n.date);

    import('chart.js/auto').then(({ default: Chart }) => {
      const existing = Chart.getChart(canvasRef.current!);
      if (existing) existing.destroy();

      new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Asleep (min)',
              data: nightly.map(n => Math.round(n.total_asleep_min)),
              backgroundColor: '#6366f1aa',
              borderColor: '#6366f1',
              borderWidth: 1,
              stack: 'sleep',
            },
            {
              label: 'Awake (min)',
              data: nightly.map(n => Math.round(n.total_awake_min)),
              backgroundColor: '#f59e0baa',
              borderColor: '#f59e0b',
              borderWidth: 1,
              stack: 'sleep',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { boxWidth: 12, font: { size: 11 } },
            },
            tooltip: {
              callbacks: {
                label: item => `${item.dataset.label}: ${item.parsed.y} min`,
              },
            },
          },
          scales: {
            x: {
              ticks: { font: { size: 10 }, maxRotation: 30 },
              grid: { display: false },
              stacked: true,
            },
            y: {
              stacked: true,
              ticks: { font: { size: 10 }, callback: (v: any) => `${v}m` },
              grid: { color: '#f3f4f6' },
              title: { display: true, text: 'Minutes', font: { size: 10 } },
            },
          },
        },
      });
    });
  }, [nightly]);

  if (nightly.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-10">
        No sleep data available yet.
      </p>
    );
  }

  return <div className="h-56"><canvas ref={canvasRef} /></div>;
}

interface HealthKitChartsProps {
  patientId: string;
}

interface AggregationData {
  readings?: Record<string, Reading[]>;
  sleep?: {
    nightly: { date: string; total_in_bed_min: number; total_asleep_min: number; total_awake_min: number }[];
    rolling_avg_asleep_min: number;
  };
}

export function HealthKitCharts({ patientId }: HealthKitChartsProps) {
  const [data, setData] = useState<AggregationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/healthkit/${patientId}/aggregations`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => setError('Failed to load HealthKit data'))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-blue-500 mr-2" />
        Loading HealthKit data...
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-gray-400 text-center py-10">
        {error ?? 'No HealthKit streaming data available yet.'}
      </p>
    );
  }

  const nightly = data.sleep?.nightly ?? [];
  const avgSleep = data.sleep?.rolling_avg_asleep_min;

  return (
    <div className="flex flex-col gap-6">
      {CHART_CONFIGS.map(config => {
        const readings = data.readings?.[config.key] ?? [];
        return (
          <div key={config.key}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{config.label}</p>
            <SingleHealthKitChart config={config} readings={readings} />
          </div>
        );
      })}

      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sleep</p>
          {avgSleep != null && (
            <span className="text-xs text-gray-400">
              Rolling avg: <span className="font-semibold text-gray-600">{Math.round(avgSleep)} min/night</span>
            </span>
          )}
        </div>
        <SleepChart nightly={nightly} />
      </div>
    </div>
  );
}
