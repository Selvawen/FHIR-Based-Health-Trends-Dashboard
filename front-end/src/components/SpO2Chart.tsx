import { useEffect, useRef, useState } from 'react';

interface SpO2Reading {
  value: number;
  timestamp: string;
}

interface SpO2ChartProps {
  patientId: string;
}

const SPO2_KEY = 'HKQuantityTypeIdentifierOxygenSaturation';

async function fetchSpO2Readings(patientId: string): Promise<SpO2Reading[]> {
  const res = await fetch(`http://127.0.0.1:8000/healthkit/${patientId}/aggregations`);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.readings?.[SPO2_KEY] ?? [];
}

export function SpO2Chart({ patientId }: SpO2ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [readings, setReadings] = useState<SpO2Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSpO2Readings(patientId)
      .then(setReadings)
      .catch(() => setError('Failed to load SpO2 data'))
      .finally(() => setLoading(false));
  }, [patientId]);

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

    import('chart.js/auto').then(({ default: Chart }) => {
      const existing = Chart.getChart(canvasRef.current!);
      if (existing) existing.destroy();

      new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'SpO2 (%)',
              data: values,
              borderColor: '#3b82f6',
              backgroundColor: '#3b82f620',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#3b82f6',
              tension: 0.3,
              fill: true,
              yAxisID: 'y',
            },
            {
              label: `Mean (${mean.toFixed(1)}%)`,
              data: Array(values.length).fill(mean),
              borderColor: '#6b7280',
              borderWidth: 1.5,
              borderDash: [6, 3],
              pointRadius: 0,
              fill: false,
              yAxisID: 'y',
            },
            {
              label: `Max (${max.toFixed(1)}%)`,
              data: Array(values.length).fill(max),
              borderColor: '#10b981',
              borderWidth: 1,
              borderDash: [3, 3],
              pointRadius: 0,
              fill: false,
              yAxisID: 'y',
            },
            {
              label: `Min (${min.toFixed(1)}%)`,
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
                label: item => `${item.dataset.label}: ${Number(item.parsed.y).toFixed(1)}%`,
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
                callback: (v: any) => `${Number(v).toFixed(1)}%`,
              },
              grid: { color: '#f3f4f6' },
              title: { display: true, text: 'SpO2 (%)', font: { size: 10 } },
            },
          },
        },
      });
    });
  }, [readings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-blue-500 mr-2" />
        Loading SpO2 data...
      </div>
    );
  }

  if (error || readings.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-10">
        {error ?? 'No SpO2 readings available yet. Data will appear once the streaming provider has run.'}
      </p>
    );
  }

  return <div className="h-56"><canvas ref={canvasRef} /></div>;
}
