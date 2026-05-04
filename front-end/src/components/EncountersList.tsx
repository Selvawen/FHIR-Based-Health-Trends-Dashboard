import type { FhirEncounter } from '../types/fhir';

interface EncountersListProps {
  encounters: FhirEncounter[];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return dateStr.split('T')[0] ?? dateStr;
}

const classColors: Record<string, string> = {
  AMB: 'bg-blue-100 text-blue-700',
  IMP: 'bg-purple-100 text-purple-700',
  EMER: 'bg-red-100 text-red-700',
  VR: 'bg-teal-100 text-teal-700',
};

const classLabels: Record<string, string> = {
  AMB: 'Ambulatory',
  IMP: 'Inpatient',
  EMER: 'Emergency',
  VR: 'Virtual',
};

export function EncountersList({ encounters }: EncountersListProps) {
  if (encounters.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No encounters recorded.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Type</th>
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Class</th>
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Date</th>
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Reason</th>
          </tr>
        </thead>
        <tbody>
          {encounters.map((enc) => {
            const type = enc.type?.[0]?.text ?? enc.type?.[0]?.coding?.[0]?.display ?? '—';
            const classCode = enc.class?.code?.toUpperCase() ?? '';
            const classLabel = classLabels[classCode] ?? enc.class?.display ?? classCode ?? '—';
            const colorClass = classColors[classCode] ?? 'bg-gray-100 text-gray-500';
            const reason = enc.reasonCode?.[0]?.text ?? enc.reasonCode?.[0]?.coding?.[0]?.display ?? '—';
            return (
              <tr key={enc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-2.5 px-3 text-gray-800 font-medium">{type}</td>
                <td className="py-2.5 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                    {classLabel}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-gray-500 text-xs">{formatDate(enc.period?.start)}</td>
                <td className="py-2.5 px-3 text-gray-500 text-xs">{reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
