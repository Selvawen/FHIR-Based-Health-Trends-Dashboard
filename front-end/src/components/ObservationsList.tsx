import type { FhirObservation } from '../types/fhir';

interface ObservationsListProps {
  observations: FhirObservation[];
}

function getObsName(obs: FhirObservation): string {
  return obs.code?.text ?? obs.code?.coding?.[0]?.display ?? 'Unknown';
}

function getObsValue(obs: FhirObservation): string {
  if (obs.valueQuantity) {
    const val = obs.valueQuantity.value ?? '';
    const unit = obs.valueQuantity.unit ?? '';
    return `${val} ${unit}`.trim();
  }
  if (obs.valueString) return obs.valueString;
  if (obs.valueCodeableConcept?.text) return obs.valueCodeableConcept.text;
  if (obs.component && obs.component.length > 0) {
    return obs.component
      .map((c) => {
        const label = c.code?.text ?? c.code?.coding?.[0]?.display ?? '';
        const val = c.valueQuantity
          ? `${c.valueQuantity.value ?? ''} ${c.valueQuantity.unit ?? ''}`.trim()
          : '';
        return label ? `${label}: ${val}` : val;
      })
      .join(' / ');
  }
  return '—';
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return dateStr.split('T')[0] ?? dateStr;
}

export function ObservationsList({ observations }: ObservationsListProps) {
  if (observations.length === 0) {
    return <p className="text-sm text-gray-500 py-4">No observations recorded.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Observation</th>
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Value</th>
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((obs) => (
            <tr key={obs.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 px-3 text-gray-800">{getObsName(obs)}</td>
              <td className="py-2 px-3 text-gray-700 font-mono text-xs">{getObsValue(obs)}</td>
              <td className="py-2 px-3 text-gray-500">{formatDate(obs.effectiveDateTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
