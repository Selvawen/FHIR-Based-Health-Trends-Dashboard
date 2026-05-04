import { useEffect, useRef, useState } from 'react';

interface HRReading {
  value: number;
  timestamp: string;
}

interface HeartRateChartProps {
  patientId: string;
}

const HR_KEYS = {
  HKQuantityTypeIdentifierRestingHeartRate: 'Resting HR',
  HKQuantityTypeIdentifierHeartRate: 'Heart Rate',
  HKQuantityTypeIdentifierWalkingHeartRateAverage: 'Walking HR Avg',
} as const;

type HRKey = keyof typeof HR_KEYS;

const COLORS: Record<HRKey, { border: string; bg: string }> = {
  HKQuantityTypeIdentifierRestingHeartRate: { border: '#3b82f6', bg: '#3b82f620' },
  HKQuantityTypeIdentifierHeartRate: { border: '#ef4444', bg: '#ef444420' },
  HKQuantityTypeIdentifierWalkingHeartRateAverage: { border: '#10b981', bg: '#10b98120' },
};

async function fetchHRReadings(patientId: string): Promise<Partial<Record<HRKey, HRReading[]>>> {
  const res = await fetch(`http://127.0.0.1:8000/healthkit/${patientId}/aggregations`);
  if (!res.ok) return {};
  const data = await res.json();
  const result: Partial<Record<HRKey, HRReading[]>> = {};
  for (const key of Object.keys(HR_KEYS) as HRKey[]) {
    const readings = data?.readings?.[key];
    if (readings?.length) result[key] = readings;
  }
  return result;
}

export function HeartRateChart({ patientId }: HeartRateChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [allReadings, setAllReadings] = useState<Partial<Record<HRKey, HRReading[]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchHRReadings(patientId)
      .then(setAllReadings)
      .catch(() => setError('Failed to load heart rate data'))
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => {
    const keys = (Object.keys(allReadings) as HRKey[]).filter(k => allReadings[k]?.length);
    if (!canvasRef.current || keys.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const longestKey = keys.reduce((a, b) =>
      (allReadings[a]?.length ?? 0) >= (allReadings[b]?.length ?? 0) ? a : b
    );
    const labels = allReadings[longestKey]!.map((r, i) => {
      const d = new Date(r.timestamp);
      return isNaN(d.getTime()) ? `#${i + 1}` : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const datasets = keys.flatMap(key => {
      const values = allReadings[key]!.map(r => r.value);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const { border, bg } = COLORS[key];
      return [
        {
          label: HR_KEYS[key],
          data: values,
          borderColor: border,
          backgroundColor: bg,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: border,
          tension: 0.3,
          fill: false,
          yAxisID: 'y',
        },
        {
          label: `${HR_KEYS[key]} mean (${mean.toFixed(0)} bpm)`,
          data: Array(labels.length).fill(mean),
          borderColor: border,
          borderWidth: 1,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        },
      ];
    });

    import('chart.js/auto').then(({ default: Chart }) => {
      const existing = Chart.getChart(canvasRef.current!);
      if (existing) existing.destroy();

      new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
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
                label: item => `${item.dataset.label}: ${Number(item.parsed.y).toFixed(0)} bpm`,
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
                callback: (v: any) => `${Number(v).toFixed(0)} bpm`,
              },
              grid: { color: '#f3f4f6' },
              title: { display: true, text: 'Heart Rate (bpm)', font: { size: 10 } },
            },
          },
        },
      });
    });
  }, [allReadings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-red-500 mr-2" />
        Loading heart rate data...
      </div>
    );
  }

  const hasData = (Object.keys(allReadings) as HRKey[]).some(k => allReadings[k]?.length);

  if (error || !hasData) {
    return (
      <p className="text-sm text-gray-400 text-center py-10">
        {error ?? 'No heart rate readings available yet. Data will appear once the watch provider has synced.'}
      </p>
    );
  }

  return <div className="h-64"><canvas ref={canvasRef} /></div>;
}
