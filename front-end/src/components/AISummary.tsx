import { useState, useRef, useEffect } from 'react';
import type { FhirPatient, FhirCondition, FhirMedicationRequest, FhirObservation, FhirAllergyIntolerance, FhirImmunization, FhirEncounter } from '../types/fhir';

interface AISummaryProps {
  patient: FhirPatient;
  patientName: string;
  conditions: FhirCondition[];
  medications: FhirMedicationRequest[];
  observations: FhirObservation[];
  allergies: FhirAllergyIntolerance[];
  immunizations: FhirImmunization[];
  encounters: FhirEncounter[];
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  displayContent?: string;
  isStreaming?: boolean;
  uiOnly?: boolean;
}

interface VitalStat { min: number; max: number; avg: number; unit: string; }
interface DailyTotal { date: string; value: number; }
interface ActivityStat { daily_totals: DailyTotal[]; rolling_avg: number; unit: string; }
interface WorkoutSession { type: string; duration_sec: number; kcal: number; }
interface NightlySleep { date: string; total_in_bed_min: number; total_asleep_min: number; }

interface AggregationDoc {
  last_updated?: string;
  vitals?: Record<string, VitalStat>;
  activity?: Record<string, ActivityStat>;
  workouts?: { sessions: WorkoutSession[]; rolling_total_kcal: number; rolling_total_duration_sec: number; };
  sleep?: { nightly: NightlySleep[]; rolling_avg_asleep_min: number; };
  nutrition?: Record<string, ActivityStat>;
}

const API = 'http://127.0.0.1:8000';

const VITAL_LABELS: Record<string, string> = {
  HKQuantityTypeIdentifierRestingHeartRate: 'Resting Heart Rate',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'HRV (SDNN)',
  HKQuantityTypeIdentifierOxygenSaturation: 'SpO2',
  HKQuantityTypeIdentifierRespiratoryRate: 'Respiratory Rate',
  HKQuantityTypeIdentifierWalkingHeartRateAverage: 'Walking Heart Rate',
};

const ACTIVITY_LABELS_MAP: Record<string, string> = {
  HKQuantityTypeIdentifierStepCount: 'Steps',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'Active Energy',
  HKQuantityTypeIdentifierAppleExerciseTime: 'Exercise Time',
};

function formatAggregation(agg: AggregationDoc | null): string {
  if (!agg) return 'No HealthKit streaming data available.';

  const lines: string[] = [];

  if (agg.vitals && Object.keys(agg.vitals).length > 0) {
    lines.push('Vitals (rolling window):');
    for (const [key, stat] of Object.entries(agg.vitals)) {
      const label = VITAL_LABELS[key] ?? key;
      lines.push(`  ${label}: avg ${stat.avg.toFixed(1)} ${stat.unit}, range ${stat.min.toFixed(1)}–${stat.max.toFixed(1)} ${stat.unit}`);
    }
  }

  if (agg.activity && Object.keys(agg.activity).length > 0) {
    lines.push('Activity (7-day rolling avg):');
    for (const [key, stat] of Object.entries(agg.activity)) {
      const label = ACTIVITY_LABELS_MAP[key] ?? key;
      lines.push(`  ${label}: ${stat.rolling_avg.toFixed(1)} ${stat.unit}/day`);
    }
  }

  if (agg.workouts && agg.workouts.sessions.length > 0) {
    const totalMin = Math.round(agg.workouts.rolling_total_duration_sec / 60);
    lines.push(`Workouts: ${agg.workouts.sessions.length} sessions, ${totalMin} min total, ${Math.round(agg.workouts.rolling_total_kcal)} kcal total`);
    agg.workouts.sessions.slice(0, 3).forEach(s => {
      lines.push(`  - ${s.type.replace('HKWorkoutActivityType', '')}: ${Math.round(s.duration_sec / 60)} min, ${Math.round(s.kcal)} kcal`);
    });
  }

  if (agg.sleep && agg.sleep.nightly.length > 0) {
    lines.push(`Sleep: avg ${agg.sleep.rolling_avg_asleep_min.toFixed(0)} min/night asleep (rolling)`);
  }

  if (agg.nutrition && Object.keys(agg.nutrition).length > 0) {
    lines.push('Nutrition (rolling avg):');
    for (const [key, stat] of Object.entries(agg.nutrition)) {
      const label = key.replace('HKQuantityTypeIdentifier', '');
      lines.push(`  ${label}: ${stat.rolling_avg.toFixed(1)} ${stat.unit}/day`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'HealthKit data present but no metrics computed yet.';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAge(birthDate?: string): string {
  if (!birthDate) return 'Unknown';
  const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
  return `${age} years`;
}

function buildSystemContext(
  patient: FhirPatient,
  patientName: string,
  conditions: FhirCondition[],
  medications: FhirMedicationRequest[],
  allergies: FhirAllergyIntolerance[],
  aggregation: AggregationDoc | null,
): string {
  const conditionList = conditions
    .map(c => c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown')
    .join(', ') || 'None';

  const medList = medications
    .map(m => m.medicationCodeableConcept?.text ?? m.medicationCodeableConcept?.coding?.[0]?.display ?? 'Unknown')
    .join(', ') || 'None';

  const allergyList = allergies
    .map(a => a.code?.text ?? a.code?.coding?.[0]?.display ?? 'Unknown')
    .join(', ') || 'None';

  const hkSection = aggregation
    ? `\n\nRECENT HEALTHKIT STREAMING DATA:\n${formatAggregation(aggregation)}`
    : '';

  return (
    `You are a clinical informatics assistant. You are analyzing data for patient ${patientName}, ` +
    `age ${getAge(patient.birthDate)}, gender ${patient.gender ?? 'unknown'}. ` +
    `Active conditions: ${conditionList}. Current medications: ${medList}. Known allergies: ${allergyList}. ` +
    `Be factual, professional, and concise. Do not give formal medical diagnoses. ` +
    `Do not use markdown. Do not add filler words like Certainly or Sure.` +
    hkSection
  );
}

function buildPrompt(
  patient: FhirPatient,
  patientName: string,
  conditions: FhirCondition[],
  medications: FhirMedicationRequest[],
  observations: FhirObservation[],
  allergies: FhirAllergyIntolerance[],
  immunizations: FhirImmunization[],
  encounters: FhirEncounter[],
  aggregation: AggregationDoc | null,
): string {
  const conditionList = conditions
    .map(c => {
      const name = c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown';
      const status = c.clinicalStatus?.coding?.[0]?.code ?? 'unknown';
      const onset = c.onsetDateTime?.split('T')[0] ?? c.recordedDate?.split('T')[0] ?? '';
      return `- ${name} (${status}${onset ? ', onset: ' + onset : ''})`;
    })
    .join('\n') || 'None recorded';

  const medList = medications
    .map(m => {
      const name = m.medicationCodeableConcept?.text ?? m.medicationCodeableConcept?.coding?.[0]?.display ?? 'Unknown';
      const dosage = m.dosageInstruction?.[0]?.text ?? '';
      const status = m.status ?? '';
      return `- ${name}${dosage ? ': ' + dosage : ''} (${status})`;
    })
    .join('\n') || 'None recorded';

  const allergyList = allergies
    .map(a => {
      const name = a.code?.text ?? a.code?.coding?.[0]?.display ?? 'Unknown';
      const criticality = a.criticality ?? 'unknown';
      const reactions = a.reaction?.map(r => r.manifestation?.map(m => m.text ?? m.coding?.[0]?.display).join(', ')).join('; ') ?? '';
      return `- ${name} (criticality: ${criticality}${reactions ? ', reactions: ' + reactions : ''})`;
    })
    .join('\n') || 'None recorded';

  const obsGrouped: Record<string, string[]> = {};
  [...observations]
    .sort((a, b) => (a.effectiveDateTime ?? '').localeCompare(b.effectiveDateTime ?? ''))
    .forEach(o => {
      const name = o.code?.text ?? o.code?.coding?.[0]?.display ?? 'Unknown';
      let value = '';
      if (o.valueQuantity) value = `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ''}`.trim();
      else if (o.valueString) value = o.valueString;
      else if (o.component) {
        value = o.component
          .map(c => `${c.code?.text ?? c.code?.coding?.[0]?.display ?? ''}: ${c.valueQuantity?.value ?? ''} ${c.valueQuantity?.unit ?? ''}`.trim())
          .join(', ');
      }
      const date = o.effectiveDateTime?.split('T')[0] ?? '';
      if (!obsGrouped[name]) obsGrouped[name] = [];
      obsGrouped[name].push(`${date}: ${value}`);
    });

  const obsTrends = Object.entries(obsGrouped)
    .map(([name, values]) => `  ${name}:\n    ${values.slice(-10).join('\n    ')}`)
    .join('\n') || 'None recorded';

  const immunizationList = immunizations
    .map(i => {
      const name = i.vaccineCode?.text ?? i.vaccineCode?.coding?.[0]?.display ?? 'Unknown';
      const date = i.occurrenceDateTime?.split('T')[0] ?? '';
      return `- ${name}${date ? ' (' + date + ')' : ''}`;
    })
    .join('\n') || 'None recorded';

  const encounterList = encounters
    .slice(0, 10)
    .map(e => {
      const type = e.type?.[0]?.text ?? e.type?.[0]?.coding?.[0]?.display ?? 'Visit';
      const date = e.period?.start?.split('T')[0] ?? '';
      const reason = e.reasonCode?.[0]?.text ?? e.reasonCode?.[0]?.coding?.[0]?.display ?? '';
      return `- ${type}${date ? ' (' + date + ')' : ''}${reason ? ': ' + reason : ''}`;
    })
    .join('\n') || 'None recorded';

  return `Analyze all patient data below and produce a structured clinical report. Be factual, professional, and concise. Do NOT give formal diagnoses. Use plain text only, no markdown.

PATIENT: ${patientName}
Age: ${getAge(patient.birthDate)} | Gender: ${patient.gender ?? 'Unknown'}

CONDITIONS (${conditions.length} total):
${conditionList}

MEDICATIONS (${medications.length} total):
${medList}

ALLERGIES:
${allergyList}

OBSERVATION TRENDS (grouped by metric, chronological):
${obsTrends}

IMMUNIZATIONS:
${immunizationList}

RECENT ENCOUNTERS:
${encounterList}

Based on all data above, produce a report with exactly these four sections:

SUMMARY
Write 2-3 sentences covering the patient's overall health profile and primary concerns.

STATUS
Describe current clinical status, active conditions, and medication regimen.

INSIGHTS
Identify trends in the observation data over time (e.g. rising glucose, improving blood pressure). Correlate any patterns across conditions, medications, and observations. Where HealthKit streaming data is available, incorporate vitals, activity, sleep, and nutrition trends. Flag any risk areas that warrant attention.

RECOMMENDATIONS
List 3-5 specific, actionable next steps for this patient. Include things like lifestyle changes (diet, activity), biomarkers to monitor more closely, medication reviews, or follow-up visits warranted by the trends seen.`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function AISummary({ patient, patientName, conditions, medications, observations, allergies, immunizations, encounters }: AISummaryProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', uiOnly: true, content: '' },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>('mistral');
  const [aggregation, setAggregation] = useState<AggregationDoc | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/llm_model`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.model) setActiveModel(data.model); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!patient.id) return;
    fetch(`${API}/healthkit/${patient.id}/aggregations`)
      .then(r => r.ok ? r.json() : null)
      .then((data: AggregationDoc | null) => { if (data) setAggregation(data); })
      .catch(() => {});
  }, [patient.id]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function streamMessage(userContent: string, displayContent?: string) {
    if (isStreaming) return;
    setError(null);
    setIsStreaming(true);

    const userMsg: ChatMsg = { role: 'user', content: userContent, displayContent };
    const historyWithUser = [...messages, userMsg];
    setMessages([...historyWithUser, { role: 'assistant', content: '', isStreaming: true }]);

    try {
      const response = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyWithUser.filter(m => !m.uiOnly).map(m => ({ role: m.role, content: m.content })),
          system_prompt: buildSystemContext(patient, patientName, conditions, medications, allergies, aggregation),
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      }

      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, isStreaming: false };
        }
        return updated;
      });
    } catch {
      setError('Failed to get a response. Is the backend running?');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsStreaming(false);
    }
  }

  function handleSummarize() {
    const prompt = buildPrompt(patient, patientName, conditions, medications, observations, allergies, immunizations, encounters, aggregation);
    streamMessage(prompt, 'Generate a clinical summary');
  }

  function handleSend() {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    setInput('');
    streamMessage(msg);
  }

  return (
    <div className="flex flex-col h-full">

      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-3 pb-2 pr-1 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === 'user' ? 'bg-blue-600' : 'bg-blue-100'
            }`}>
              {msg.role === 'user' ? (
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
            </div>

            {/* Bubble */}
            {msg.uiOnly ? (
              /* ── Welcome card ── */
              <div className="max-w-[90%] rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-5 py-4 text-sm text-gray-700 shadow-sm">
                <p className="font-semibold text-blue-700 text-base mb-1">
                  Hi! I'm your AI health assistant
                  <span className="text-gray-500 font-normal text-sm"> for {patientName}</span>
                </p>
                <p className="text-xs text-gray-400 mb-3">
                  Powered by{' '}
                  <span className="font-medium text-gray-500">{activeModel}</span>
                  {' '}· For informational purposes only
                </p>
                {aggregation && (
                  <p className="text-xs text-green-600 mb-3 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    HealthKit streaming data available — will be included in summary
                  </p>
                )}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">How to use</p>
                <ul className="space-y-2 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-[10px]">1</span>
                    <span>Click <strong className="text-gray-700">Summarize</strong> to generate a full clinical overview — conditions, medications, observations, and trends.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-[10px]">2</span>
                    <span>Type any <strong className="text-gray-700">follow-up question</strong> and press <strong className="text-gray-700">Enter</strong> or the send button — e.g. <em>"What are the main risk factors?"</em></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-[10px]">3</span>
                    <span>The chat is <strong className="text-gray-700">context-aware</strong> — I'll remember earlier messages within this session.</span>
                  </li>
                </ul>
              </div>
            ) : (
              <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-50 border border-gray-100 text-gray-700'
              }`}>
                {msg.content ? (
                  msg.role === 'user' ? (
                    <p>{msg.displayContent ?? msg.content}</p>
                  ) : (
                    msg.content.split('\n\n').map((para, j) => (
                      <p key={j} className={j > 0 ? 'mt-2' : ''}>{para}</p>
                    ))
                  )
                ) : msg.isStreaming ? (
                  <div className="flex gap-1 items-center py-0.5">
                    {[0, 1, 2].map(k => (
                      <div key={k} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${k * 0.15}s` }} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-500 py-1 px-1">{error}</p>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-2">
        <button
          onClick={handleSummarize}
          disabled={isStreaming}
          className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0"
        >
          Summarize
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask a follow-up question…"
          disabled={isStreaming}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 min-w-0"
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
