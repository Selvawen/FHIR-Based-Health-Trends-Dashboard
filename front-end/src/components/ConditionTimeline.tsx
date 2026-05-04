import { useEffect, useRef } from 'react';
import type { FhirCondition } from '../types/fhir';

interface ConditionTimelineProps {
  conditions: FhirCondition[];
}

function getConditionName(c: FhirCondition): string {
  return c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown';
}

function getStatus(c: FhirCondition): string {
  return c.clinicalStatus?.coding?.[0]?.code ?? 'unknown';
}

function getYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const y = parseInt(dateStr.split('-')[0] ?? '', 10);
  return isNaN(y) ? null : y;
}

const STATUS_COLORS: Record<string, { dot: string; label: string; bg: string }> = {
  active:   { dot: '#ef4444', label: '#b91c1c', bg: '#fef2f2' },
  resolved: { dot: '#22c55e', label: '#15803d', bg: '#f0fdf4' },
  inactive: { dot: '#f59e0b', label: '#b45309', bg: '#fffbeb' },
  unknown:  { dot: '#94a3b8', label: '#64748b', bg: '#f8fafc' },
};

export function ConditionTimeline({ conditions }: ConditionTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const withDates = conditions
    .map(c => ({
      name: getConditionName(c),
      year: getYear(c.onsetDateTime ?? c.recordedDate),
      status: getStatus(c),
    }))
    .filter(c => c.year !== null)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0)) as { name: string; year: number; status: string }[];

  useEffect(() => {
    if (!canvasRef.current || withDates.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    import('chart.js/auto').then(({ default: Chart }) => {
      const existing = Chart.getChart(canvasRef.current!);
      if (existing) existing.destroy();

      const labels = withDates.map(c => `${c.year}`);
      const colors = withDates.map(c => STATUS_COLORS[c.status]?.dot ?? '#94a3b8');

      new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Conditions',
            data: withDates.map((c, i) => ({ x: c.year, y: 1 })),
            backgroundColor: colors,
            pointRadius: 10,
            pointHoverRadius: 13,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item) => {
                  const d = withDates[item.dataIndex];
                  return d ? `${d.name} (${d.year}) — ${d.status}` : '';
                },
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              min: Math.min(...withDates.map(c => c.year)) - 2,
              max: new Date().getFullYear() + 1,
              ticks: { stepSize: 5, font: { size: 10 }, callback: (v) => `${v}` },
              grid: { display: false },
            },
            y: {
              display: false,
              min: 0,
              max: 2,
            },
          },
        },
      });
    });
  }, [withDates]);

  if (conditions.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">No conditions to display.</p>;
  }

  if (withDates.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">No dated conditions available for timeline.</p>;
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colors.dot }} />
            <span className="text-xs text-gray-500 capitalize">{status}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="h-24 mb-6">
        <canvas ref={canvasRef} />
      </div>

      {/* Condition list below timeline */}
      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
        {withDates.map((c, i) => {
          const col = STATUS_COLORS[c.status] ?? STATUS_COLORS['unknown'];
          return (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
              style={{ background: col.bg }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.dot }} />
              <span className="flex-1 font-medium text-gray-800">{c.name}</span>
              <span className="text-xs font-semibold" style={{ color: col.label }}>{c.year}</span>
              <span className="text-xs capitalize" style={{ color: col.label }}>{c.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
