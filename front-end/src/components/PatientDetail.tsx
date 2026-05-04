import { useState, useEffect } from 'react';
import type { FhirPatient, FhirCondition, FhirAllergyIntolerance } from '../types/fhir';
import { usePatientDetail } from '../hooks/usePatientDetail';
import { Demographics } from './Demographics';
import { HealthRiskScore } from './HealthRiskScore';
import { ConditionsList } from './ConditionsList';
import { ConditionTimeline } from './ConditionTimeline';
import { MedicationsList } from './MedicationsList';
import { MedicationInteractionChecker } from './MedicationInteractionChecker';
import { ObservationsList } from './ObservationsList';
import { AllergiesList } from './AllergiesList';
import { ImmunizationsList } from './ImmunizationsList';
import { EncountersList } from './EncountersList';
import { VitalSignsChart } from './VitalSignsChart';
import { TrendCorrelationChart } from './TrendCorrelationChart';
import { LifestylePanel } from './LifestylePanel';
import { AISummary } from './AISummary';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import { getPatientName } from './PatientCard';
import ConnectionConfigForm from './ExternalConfiguration'
import { SpO2Chart } from './SpO2Chart'
import { HeartRateChart } from './HeartRateChart'
import { HealthKitCharts } from './HealthKitCharts'

interface PatientDetailProps {
  patient: FhirPatient;
  onBack: () => void;
}

type TabId = 'overview' | 'charts' | 'records' | 'lifestyle' | 'summary' | 'connection';

function SectionCard({
  title, count, children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        {count !== undefined && (
          <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2.5 py-0.5 rounded-full">{count}</span>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ── Alerts panel ─────────────────────────────────────────────────────────────

const HIGH_KEYWORDS = ['heart', 'cardiac', 'coronary', 'stroke', 'seizure', 'epilepsy', 'cancer', 'tumor', 'renal failure', 'respiratory failure', 'heart failure', 'myocardial', 'infarction', 'arrhythmia', 'fibrillation'];
const MEDIUM_KEYWORDS = ['diabetes', 'prediabetes', 'hypertension', 'obesity', 'copd', 'asthma', 'depression', 'anxiety', 'chronic', 'liver disease'];

function getAlertLevel(condition: FhirCondition): 'high' | 'medium' | null {
  const name = (condition.code?.text ?? condition.code?.coding?.[0]?.display ?? '').toLowerCase();
  if (HIGH_KEYWORDS.some(k => name.includes(k))) return 'high';
  if (MEDIUM_KEYWORDS.some(k => name.includes(k))) return 'medium';
  return null;
}

function AlertsPanel({ conditions, allergies }: { conditions: FhirCondition[]; allergies: FhirAllergyIntolerance[] }) {
  const urgentConditions = conditions
    .filter(c => c.clinicalStatus?.coding?.[0]?.code === 'active')
    .map(c => ({ condition: c, level: getAlertLevel(c) }))
    .filter(({ level }) => level !== null)
    .slice(0, 4) as { condition: FhirCondition; level: 'high' | 'medium' }[];

  const highAllergies = allergies.filter(a => a.criticality === 'high').slice(0, 2);
  const totalAlerts = urgentConditions.length + highAllergies.length;

  if (totalAlerts === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-700">Notifications & Alerts</h3>
        </div>
        <p className="text-xs text-gray-400">No urgent alerts detected.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-700 flex-1">Notifications & Alerts</h3>
        <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full">{totalAlerts}</span>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {highAllergies.map(a => (
          <div key={a.id} className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg border-l-2 border-red-400">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-red-800">High criticality allergy</p>
              <p className="text-xs text-red-600 mt-0.5">{a.code?.text ?? a.code?.coding?.[0]?.display ?? 'Unknown'}</p>
            </div>
          </div>
        ))}
        {urgentConditions.map(({ condition, level }) => {
          const isHigh = level === 'high';
          const name = condition.code?.text ?? condition.code?.coding?.[0]?.display ?? 'Unknown';
          return (
            <div key={condition.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg border-l-2 ${isHigh ? 'bg-red-50 border-red-400' : 'bg-amber-50 border-amber-400'}`}>
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isHigh ? 'bg-red-500' : 'bg-amber-500'}`} />
              <div>
                <p className={`text-xs font-semibold ${isHigh ? 'text-red-800' : 'text-amber-800'}`}>{isHigh ? 'Clinically urgent' : 'Monitor closely'}</p>
                <p className={`text-xs mt-0.5 ${isHigh ? 'text-red-600' : 'text-amber-600'}`}>{name}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'overview', label: 'Overview',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  },
  {
    id: 'charts', label: 'Charts',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  },
  {
    id: 'records', label: 'Records',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
  },
  {
    id: 'lifestyle', label: 'Lifestyle',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
  },
  {
    id: 'summary', label: 'AI Summary',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  },
  {
    id: 'connection', label: 'Patient Data Connection',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  },
];

// ── Main component ────────────────────────────────────────────────────────────

function useWatchConnected(patientId: string) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    fetch(`http://127.0.0.1:8000/healthkit/${patientId}/config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const type = data?.connection_type ?? '';
        setConnected(type !== '' && type !== 'None');
      })
      .catch(() => {});
  }, [patientId]);
  return connected;
}

export function PatientDetail({ patient, onBack }: PatientDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const {
    conditions, medications, observations,
    allergies, immunizations, encounters,
    loading, error,
  } = usePatientDetail(patient.id);
  const watchConnected = useWatchConnected(patient.id);

  const patientName = getPatientName(patient);
  const activeConditions = conditions.filter(c => c.clinicalStatus?.coding?.[0]?.code === 'active');
  const activeMedications = medications.filter(m => m.status === 'active');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1400px] mx-auto py-6 px-6">

        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-5 transition-colors group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to patient list
        </button>

        <div className="flex gap-5 items-start">

          {/* ── LEFT SIDEBAR ── */}
          <div className="w-60 flex-shrink-0 flex flex-col gap-4 sticky top-6">

            {/* Profile card */}
            <Demographics
              patient={patient}
              conditions={conditions.length}
              medications={medications.length}
              encounters={encounters.length}
            />

            {/* Health Risk Score */}
            {!loading && (
              <HealthRiskScore
                conditions={conditions}
                allergies={allergies}
                observations={observations}
                birthDate={patient.birthDate}
              />
            )}

            {/* Nav */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Navigation</p>
              </div>
              <div className="p-2 flex flex-col gap-0.5">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                      activeTab === tab.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <span className={activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT CONTENT ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {loading && <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8"><LoadingSpinner /></div>}
            {error && <ErrorMessage message={error} />}

            {!loading && !error && (
              <>
                {/* ── OVERVIEW ── */}
                {activeTab === 'overview' && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <AlertsPanel conditions={conditions} allergies={allergies} />
                      <SectionCard title="Active Medications" count={activeMedications.length}>
                        <MedicationsList medications={activeMedications} />
                      </SectionCard>
                    </div>
                    <SectionCard title="Active Conditions" count={activeConditions.length}>
                      <ConditionsList conditions={activeConditions} />
                    </SectionCard>
                    <SectionCard title="Allergies" count={allergies.length}>
                      <AllergiesList allergies={allergies} />
                    </SectionCard>
                    <SectionCard title="Medication Interaction Checker">
                      <MedicationInteractionChecker medications={medications} />
                    </SectionCard>
                  </div>
                )}

                {/* ── CHARTS ── */}
                {activeTab === 'charts' && (
                  <div className="flex flex-col gap-4">
                    <SectionCard title="Condition Timeline">
                      <ConditionTimeline conditions={conditions} />
                    </SectionCard>
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                      <h3 className="font-semibold text-gray-800 text-sm mb-1">Vital Signs & Lab Trends</h3>
                      <p className="text-xs text-gray-400 mb-5">Live FHIR Observation data · Last 20 data points per metric</p>
                      <VitalSignsChart observations={observations} />
                    </div>
                    <SectionCard title="Lifestyle vs Lab Correlation">
                      <TrendCorrelationChart observations={observations} patientId={patient.id} />
                    </SectionCard>
                  </div>
                )}

                {/* ── RECORDS ── */}
                {activeTab === 'records' && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <SectionCard title="All Conditions" count={conditions.length}>
                        <ConditionsList conditions={conditions} />
                      </SectionCard>
                      <SectionCard title="All Medications" count={medications.length}>
                        <MedicationsList medications={medications} />
                      </SectionCard>
                    </div>
                    <SectionCard title="Recent Observations" count={observations.length}>
                      <ObservationsList observations={observations} />
                    </SectionCard>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <SectionCard title="Immunizations" count={immunizations.length}>
                        <ImmunizationsList immunizations={immunizations} />
                      </SectionCard>
                      <SectionCard title="Encounter History" count={encounters.length}>
                        <EncountersList encounters={encounters} />
                      </SectionCard>
                    </div>
                  </div>
                )}

                {/* ── LIFESTYLE ── */}
                {activeTab === 'lifestyle' && (
                  <div className="flex flex-col gap-4">
                    <SectionCard title="Lifestyle Data Log">
                      <LifestylePanel patientId={patient.id} />
                    </SectionCard>
                    <SectionCard title="Lifestyle vs Lab Correlation">
                      <p className="text-xs text-gray-400 mb-4">Log lifestyle data above, then select metrics below to visualize correlations with lab values over time.</p>
                      <TrendCorrelationChart observations={observations} patientId={patient.id} />
                    </SectionCard>
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-800 text-sm">Heart Rate — Wearable Data</h3>
                        {watchConnected ? (
                          <span className="flex items-center gap-1 text-xs bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                            Watch Connected
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-400 font-semibold px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                            No Watch Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mb-4">Apple Watch · Resting, active & walking heart rate · Last 10 readings per metric</p>
                      {watchConnected ? (
                        <HeartRateChart patientId={patient.id} />
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-10">
                          Connect a watch on the <strong>Patient Data Connection</strong> tab to see heart rate data.
                        </p>
                      )}
                    </div>
                    <SectionCard title="SpO2 — Last 10 Readings">
                      <SpO2Chart patientId={patient.id} />
                    </SectionCard>
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                      <h3 className="font-semibold text-gray-800 text-sm mb-1">HealthKit Metrics</h3>
                      <p className="text-xs text-gray-400 mb-5">HRV, respiratory rate, steps, energy, exercise time & sleep · Last 10 readings per metric</p>
                      <HealthKitCharts patientId={patient.id} />
                    </div>
                  </div>
                )}

                {/* ── AI SUMMARY ── */}
                {activeTab === 'summary' && (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col" style={{ height: 'calc(100vh - 10rem)' }}>
                    <AISummary
                      patient={patient}
                      patientName={patientName}
                      conditions={conditions}
                      medications={medications}
                      observations={observations}
                      allergies={allergies}
                      immunizations={immunizations}
                      encounters={encounters}
                    />
                  </div>
                )}

                {/* -- EXTERNAL DATA CONNECTION --*/}
                {activeTab === 'connection' && (
                  <ConnectionConfigForm user_id={patient.id}/>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
