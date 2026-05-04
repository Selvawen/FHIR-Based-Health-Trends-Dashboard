import type { FhirCondition } from '../types/fhir';

interface ConditionsListProps {
  conditions: FhirCondition[];
}

function getConditionName(c: FhirCondition): string {
  return c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown';
}

function getClinicalStatus(c: FhirCondition): string {
  return c.clinicalStatus?.coding?.[0]?.code ?? 'unknown';
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return dateStr.split('T')[0] ?? dateStr;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  resolved: 'bg-gray-100 text-gray-600',
  inactive: 'bg-yellow-100 text-yellow-700',
  unknown: 'bg-gray-100 text-gray-500',
};

export function ConditionsList({ conditions }: ConditionsListProps) {
  if (conditions.length === 0) {
    return <p className="text-sm text-gray-500 py-4">No conditions recorded.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Condition</th>
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Onset / Recorded</th>
          </tr>
        </thead>
        <tbody>
          {conditions.map((c) => {
            const status = getClinicalStatus(c);
            const colorClass = statusColors[status] ?? statusColors['unknown'];
            return (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 px-3 text-gray-800">{getConditionName(c)}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                    {status}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-500">
                  {formatDate(c.onsetDateTime ?? c.recordedDate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
