import type { FhirImmunization } from '../types/fhir';

interface ImmunizationsListProps {
  immunizations: FhirImmunization[];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return dateStr.split('T')[0] ?? dateStr;
}

export function ImmunizationsList({ immunizations }: ImmunizationsListProps) {
  if (immunizations.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No immunizations recorded.</p>;
  }

  const sorted = [...immunizations].sort((a, b) =>
    (b.occurrenceDateTime ?? '').localeCompare(a.occurrenceDateTime ?? '')
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Vaccine</th>
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Date</th>
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((imm) => {
            const name = imm.vaccineCode?.text ?? imm.vaccineCode?.coding?.[0]?.display ?? 'Unknown';
            return (
              <tr key={imm.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-2.5 px-3 text-gray-800 font-medium">{name}</td>
                <td className="py-2.5 px-3 text-gray-500 text-xs">{formatDate(imm.occurrenceDateTime)}</td>
                <td className="py-2.5 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    imm.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {imm.status ?? 'unknown'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
