import type { FhirMedicationRequest } from '../types/fhir';

interface MedicationsListProps {
  medications: FhirMedicationRequest[];
}

function getMedName(m: FhirMedicationRequest): string {
  return (
    m.medicationCodeableConcept?.text ??
    m.medicationCodeableConcept?.coding?.[0]?.display ??
    'Unknown'
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return dateStr.split('T')[0] ?? dateStr;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  stopped: 'bg-red-100 text-red-600',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-500',
  unknown: 'bg-gray-100 text-gray-500',
};

export function MedicationsList({ medications }: MedicationsListProps) {
  if (medications.length === 0) {
    return <p className="text-sm text-gray-500 py-4">No medications recorded.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Medication</th>
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Authored</th>
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Dosage</th>
          </tr>
        </thead>
        <tbody>
          {medications.map((m) => {
            const status = m.status ?? 'unknown';
            const colorClass = statusColors[status] ?? statusColors['unknown'];
            return (
              <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 px-3 text-gray-800">{getMedName(m)}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                    {status}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-500">{formatDate(m.authoredOn)}</td>
                <td className="py-2 px-3 text-gray-500">
                  {m.dosageInstruction?.[0]?.text ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
