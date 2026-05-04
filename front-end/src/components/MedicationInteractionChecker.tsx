import { useState } from 'react';
import type { FhirMedicationRequest } from '../types/fhir';

interface MedicationInteractionCheckerProps {
  medications: FhirMedicationRequest[];
}

interface Interaction {
  drugs: string;
  severity: 'high' | 'moderate' | 'low';
  description: string;
}

function getMedName(m: FhirMedicationRequest): string {
  return (
    m.medicationCodeableConcept?.text ??
    m.medicationCodeableConcept?.coding?.[0]?.display ??
    'Unknown'
  );
}

function parseInteractions(text: string): Interaction[] {
  const interactions: Interaction[] = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const lower = line.toLowerCase();
    const severity: Interaction['severity'] =
      lower.includes('high') || lower.includes('serious') || lower.includes('major') ? 'high'
      : lower.includes('moderate') ? 'moderate'
      : 'low';

    // Look for drug pair patterns: "Drug A + Drug B" or "Drug A and Drug B"
    const match = line.match(/[-•*]\s*(.+?)(?::\s*|\s*[-–]\s*)(.+)/);
    if (match) {
      interactions.push({
        drugs: match[1]?.trim() ?? line,
        severity,
        description: match[2]?.trim() ?? '',
      });
    } else if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
      interactions.push({
        drugs: line.replace(/^[-•*]\s*/, '').trim(),
        severity,
        description: '',
      });
    }
  }

  return interactions.length > 0
    ? interactions
    : [{ drugs: 'Analysis complete', severity: 'low', description: text.slice(0, 300) }];
}

const SEV_STYLES: Record<string, { bg: string; border: string; badge: string; badgeText: string; dot: string; label: string }> = {
  high:     { bg: '#fef2f2', border: '#fecaca', badge: '#fee2e2', badgeText: '#b91c1c', dot: '#ef4444', label: 'High' },
  moderate: { bg: '#fffbeb', border: '#fde68a', badge: '#fef3c7', badgeText: '#92400e', dot: '#f59e0b', label: 'Moderate' },
  low:      { bg: '#f0fdf4', border: '#bbf7d0', badge: '#dcfce7', badgeText: '#166534', dot: '#22c55e', label: 'Low' },
};

export function MedicationInteractionChecker({ medications }: MedicationInteractionCheckerProps) {
  const [interactions, setInteractions] = useState<Interaction[] | null>(null);
  const [noInteractions, setNoInteractions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMeds = medications.filter(m => m.status === 'active');

  async function checkInteractions() {
    if (activeMeds.length < 2) return;
    setLoading(true);
    setError(null);
    setInteractions(null);
    setNoInteractions(false);

    const medList = activeMeds.map(m => getMedName(m)).join(', ');

    const prompt = `You are a clinical pharmacist assistant. Review the following list of active medications for a patient and identify any known or potential drug interactions.

Active medications: ${medList}

For each interaction found, format your response as a bullet list like:
- Drug A + Drug B: [severity: high/moderate/low] — [brief clinical description of the interaction and what to monitor]

If no significant interactions are found, say "No significant interactions identified."
Be concise. Focus only on clinically meaningful interactions.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const text: string = data.content
        ?.filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('') ?? '';

      if (text.toLowerCase().includes('no significant')) {
        setNoInteractions(true);
      } else {
        setInteractions(parseInteractions(text));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check interactions');
    } finally {
      setLoading(false);
    }
  }

  if (activeMeds.length < 2) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        At least 2 active medications required to check interactions.
      </p>
    );
  }

  return (
    <div>
      {/* Active meds preview */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {activeMeds.map(m => (
          <span key={m.id} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
            {getMedName(m)}
          </span>
        ))}
      </div>

      {/* Check button */}
      {!interactions && !noInteractions && !loading && (
        <button
          onClick={checkInteractions}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Check for interactions
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-blue-600 py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
          <span className="text-sm font-medium">Analyzing {activeMeds.length} medications…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3">{error}</div>
      )}

      {/* No interactions */}
      {noInteractions && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-green-700">No significant interactions identified between active medications.</span>
        </div>
      )}

      {/* Interactions */}
      {interactions && interactions.length > 0 && (
        <div className="space-y-2">
          {interactions.map((interaction, i) => {
            const sev = SEV_STYLES[interaction.severity] ?? SEV_STYLES['low'];
            return (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg px-4 py-3"
                style={{ background: sev.bg, borderLeft: `3px solid ${sev.dot}` }}
              >
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: sev.dot }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-gray-800">{interaction.drugs}</span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: sev.badge, color: sev.badgeText }}
                    >
                      {sev.label}
                    </span>
                  </div>
                  {interaction.description && (
                    <p className="text-xs text-gray-600 leading-relaxed">{interaction.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Re-check button */}
      {(interactions || noInteractions) && !loading && (
        <button
          onClick={checkInteractions}
          className="mt-3 text-xs text-blue-500 hover:text-blue-700 transition-colors"
        >
          Re-check
        </button>
      )}

      <p className="text-xs text-gray-400 italic mt-4">
        AI-generated interaction analysis. Always verify with a licensed pharmacist or clinical reference.
      </p>
    </div>
  );
}
