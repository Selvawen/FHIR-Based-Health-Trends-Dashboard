import type { FhirAllergyIntolerance } from '../types/fhir';

interface AllergiesListProps {
  allergies: FhirAllergyIntolerance[];
}

const criticalityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  low: 'bg-yellow-100 text-yellow-700',
  'unable-to-assess': 'bg-gray-100 text-gray-500',
};

export function AllergiesList({ allergies }: AllergiesListProps) {
  if (allergies.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No allergies recorded.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Allergen</th>
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Criticality</th>
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Category</th>
            <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Reaction</th>
          </tr>
        </thead>
        <tbody>
          {allergies.map((a) => {
            const name = a.code?.text ?? a.code?.coding?.[0]?.display ?? 'Unknown';
            const criticality = a.criticality ?? 'unknown';
            const colorClass = criticalityColors[criticality] ?? 'bg-gray-100 text-gray-500';
            const category = a.category?.join(', ') ?? '—';
            const reaction = a.reaction?.[0]?.manifestation?.[0]?.text
              ?? a.reaction?.[0]?.manifestation?.[0]?.coding?.[0]?.display
              ?? '—';
            return (
              <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-2.5 px-3 text-gray-800 font-medium">{name}</td>
                <td className="py-2.5 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                    {criticality}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-gray-500 text-xs capitalize">{category}</td>
                <td className="py-2.5 px-3 text-gray-500 text-xs">{reaction}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
