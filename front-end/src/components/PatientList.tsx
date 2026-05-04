import { useState, useMemo, useEffect, useRef } from 'react';
import type { FhirPatient, FhirCondition, FhirObservation, FhirBundle } from '../types/fhir';
import { usePatients } from '../hooks/usePatients';
import { PatientCard, getPatientName, getAvatarColor } from './PatientCard';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import { fhirGet } from '../api/fhirClient';

interface PatientListProps {
  onSelect: (patient: FhirPatient) => void;
}

type SortKey = 'name' | 'dob' | 'id';

// ── Lab metric types ──────────────────────────────────────────────────────────

interface PatientLabData {
  glucose?: number;        // mg/dL
  systolicBP?: number;     // mmHg
  totalCholesterol?: number; // mg/dL
}

type MetricFilter =
  | 'all'
  | 'glucose_diabetic'       // ≥126
  | 'glucose_prediabetic'    // 100–125
  | 'glucose_normal'         // <100
  | 'bp_hypertensive'        // ≥140
  | 'bp_elevated'            // 120–139
  | 'bp_normal'              // <120
  | 'chol_high'              // ≥240
  | 'chol_borderline'        // 200–239
  | 'chol_normal';           // <200

// ── Lab extraction helpers ────────────────────────────────────────────────────

function extractLatestValue(observations: FhirObservation[], keywords: string[]): number | undefined {
  const matches = observations
    .filter(obs => {
      const text = (obs.code?.text ?? obs.code?.coding?.[0]?.display ?? '').toLowerCase();
      return keywords.some(k => text.includes(k));
    })
    .filter(obs => obs.valueQuantity?.value !== undefined && obs.effectiveDateTime)
    .sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? ''));
  return matches[0]?.valueQuantity?.value;
}

function extractSystolic(observations: FhirObservation[]): number | undefined {
  const bpObs = observations
    .filter(obs => {
      const text = (obs.code?.text ?? obs.code?.coding?.[0]?.display ?? '').toLowerCase();
      return text.includes('blood pressure') || text.includes('systolic');
    })
    .filter(obs => obs.effectiveDateTime)
    .sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? ''));

  for (const obs of bpObs) {
    if (obs.component) {
      for (const c of obs.component) {
        const t = (c.code?.text ?? c.code?.coding?.[0]?.display ?? '').toLowerCase();
        if ((t.includes('systolic') || c.code?.coding?.[0]?.code === '8480-6') && c.valueQuantity?.value) {
          return c.valueQuantity.value;
        }
      }
    }
    if (obs.valueQuantity?.value) return obs.valueQuantity.value;
  }
  return undefined;
}

function parseLabData(observations: FhirObservation[]): PatientLabData {
  return {
    glucose: extractLatestValue(observations, ['glucose', 'blood glucose']),
    systolicBP: extractSystolic(observations),
    totalCholesterol: extractLatestValue(observations, ['total cholesterol', 'cholesterol total', 'cholesterol']),
  };
}

// ── Hook: lazy-load lab data for all patients ────────────────────────────────

function usePatientLabData(patients: FhirPatient[]) {
  const [labMap, setLabMap] = useState<Map<string, PatientLabData>>(new Map());
  const [loadingLabs, setLoadingLabs] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (patients.length === 0 || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoadingLabs(true);

    const sample = patients.slice(0, 50);

    // Batch fetch observations for each patient
    Promise.allSettled(
      sample.map(p =>
        fhirGet<FhirBundle<FhirObservation>>(
          `/Observation?patient=${encodeURIComponent(p.id)}&_count=30&_sort=-date`
        ).then(bundle => ({
          patientId: p.id,
          labs: parseLabData(bundle.entry?.map(e => e.resource) ?? []),
        }))
      )
    ).then(results => {
      const map = new Map<string, PatientLabData>();
      for (const r of results) {
        if (r.status === 'fulfilled') {
          map.set(r.value.patientId, r.value.labs);
        }
      }
      setLabMap(map);
    }).finally(() => setLoadingLabs(false));
  }, [patients]);

  return { labMap, loadingLabs };
}

// ── Filter matching logic ─────────────────────────────────────────────────────

function matchesFilter(labs: PatientLabData | undefined, filter: MetricFilter): boolean {
  if (filter === 'all') return true;
  if (!labs) return false;

  switch (filter) {
    case 'glucose_diabetic':    return labs.glucose !== undefined && labs.glucose >= 126;
    case 'glucose_prediabetic': return labs.glucose !== undefined && labs.glucose >= 100 && labs.glucose < 126;
    case 'glucose_normal':      return labs.glucose !== undefined && labs.glucose < 100;
    case 'bp_hypertensive':     return labs.systolicBP !== undefined && labs.systolicBP >= 140;
    case 'bp_elevated':         return labs.systolicBP !== undefined && labs.systolicBP >= 120 && labs.systolicBP < 140;
    case 'bp_normal':           return labs.systolicBP !== undefined && labs.systolicBP < 120;
    case 'chol_high':           return labs.totalCholesterol !== undefined && labs.totalCholesterol >= 240;
    case 'chol_borderline':     return labs.totalCholesterol !== undefined && labs.totalCholesterol >= 200 && labs.totalCholesterol < 240;
    case 'chol_normal':         return labs.totalCholesterol !== undefined && labs.totalCholesterol < 200;
    default: return true;
  }
}

// ── Filter button bar ─────────────────────────────────────────────────────────

interface FilterGroup {
  label: string;
  filters: { key: MetricFilter; label: string; color: string; activeClass: string }[];
}

const FILTER_GROUPS: FilterGroup[] = [
  {
    label: 'Glucose',
    filters: [
      { key: 'glucose_diabetic',    label: 'Diabetic (≥126)',      color: 'text-red-600',    activeClass: 'bg-red-100 text-red-700 border-red-300' },
      { key: 'glucose_prediabetic', label: 'Prediabetic (100–125)', color: 'text-amber-600',  activeClass: 'bg-amber-100 text-amber-700 border-amber-300' },
      { key: 'glucose_normal',      label: 'Normal (<100)',         color: 'text-green-600',  activeClass: 'bg-green-100 text-green-700 border-green-300' },
    ],
  },
  {
    label: 'Blood Pressure',
    filters: [
      { key: 'bp_hypertensive', label: 'Hypertensive (≥140)',  color: 'text-red-600',    activeClass: 'bg-red-100 text-red-700 border-red-300' },
      { key: 'bp_elevated',     label: 'Elevated (120–139)',   color: 'text-amber-600',  activeClass: 'bg-amber-100 text-amber-700 border-amber-300' },
      { key: 'bp_normal',       label: 'Normal (<120)',        color: 'text-green-600',  activeClass: 'bg-green-100 text-green-700 border-green-300' },
    ],
  },
  {
    label: 'Cholesterol',
    filters: [
      { key: 'chol_high',       label: 'High (≥240)',          color: 'text-red-600',    activeClass: 'bg-red-100 text-red-700 border-red-300' },
      { key: 'chol_borderline', label: 'Borderline (200–239)', color: 'text-amber-600',  activeClass: 'bg-amber-100 text-amber-700 border-amber-300' },
      { key: 'chol_normal',     label: 'Normal (<200)',        color: 'text-green-600',  activeClass: 'bg-green-100 text-green-700 border-green-300' },
    ],
  },
];

function MetricFilterBar({
  active,
  onChange,
  loadingLabs,
}: {
  active: MetricFilter;
  onChange: (f: MetricFilter) => void;
  loadingLabs: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 mb-4">
      <div className="flex items-center gap-3 flex-wrap">

        {/* All button */}
        <button
          onClick={() => onChange('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            active === 'all'
              ? 'bg-blue-100 text-blue-700 border-blue-300'
              : 'text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          All patients
        </button>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {FILTER_GROUPS.map((group, gi) => (
          <div key={group.label} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">
              {group.label}
            </span>
            {group.filters.map(f => {
              const isActive = active === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => onChange(isActive ? 'all' : f.key)}
                  disabled={loadingLabs}
                  title={loadingLabs ? 'Loading lab data…' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isActive
                      ? f.activeClass
                      : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {loadingLabs && (
                    <div className="w-2.5 h-2.5 rounded-full border border-gray-300 border-t-blue-500 animate-spin flex-shrink-0" />
                  )}
                  {f.label}
                </button>
              );
            })}
            {gi < FILTER_GROUPS.length - 1 && (
              <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {active !== 'all' && (
        <p className="text-xs text-gray-400 mt-2">
          Showing only patients with recorded data matching this filter ·{' '}
          <button onClick={() => onChange('all')} className="text-blue-500 hover:text-blue-700 underline">
            Clear filter
          </button>
        </p>
      )}
    </div>
  );
}

// ── Urgency helpers ───────────────────────────────────────────────────────────

const HIGH_KEYWORDS = [
  'heart', 'cardiac', 'coronary', 'stroke', 'seizure', 'epilepsy',
  'cancer', 'tumor', 'renal failure', 'respiratory failure', 'heart failure',
  'myocardial', 'infarction', 'arrhythmia', 'fibrillation',
];
const MEDIUM_KEYWORDS = [
  'diabetes', 'prediabetes', 'hypertension', 'obesity', 'copd',
  'asthma', 'depression', 'anxiety', 'chronic', 'liver disease',
];

function conditionUrgency(c: FhirCondition): 'high' | 'medium' | null {
  const name = (c.code?.text ?? c.code?.coding?.[0]?.display ?? '').toLowerCase();
  if (HIGH_KEYWORDS.some(k => name.includes(k))) return 'high';
  if (MEDIUM_KEYWORDS.some(k => name.includes(k))) return 'medium';
  return null;
}

type UrgencyLevel = 'high' | 'medium';

interface UrgentPatient {
  patient: FhirPatient;
  level: UrgencyLevel;
  flaggedConditions: string[];
}

function useUrgentPatients(patients: FhirPatient[]) {
  const [urgentList, setUrgentList] = useState<UrgentPatient[]>([]);
  const [loadingUrgent, setLoadingUrgent] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (patients.length === 0 || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoadingUrgent(true);

    const sample = patients.slice(0, 30);
    Promise.allSettled(
      sample.map(p =>
        fhirGet<FhirBundle<FhirCondition>>(
          `/Condition?patient=${encodeURIComponent(p.id)}&clinical-status=active`
        ).then(bundle => ({ patient: p, conditions: bundle.entry?.map(e => e.resource) ?? [] }))
      )
    ).then(results => {
      const urgent: UrgentPatient[] = [];
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { patient, conditions } = r.value;
        let topLevel: UrgencyLevel | null = null;
        const flagged: string[] = [];
        for (const c of conditions) {
          const u = conditionUrgency(c);
          if (u === 'high') { topLevel = 'high'; flagged.push(c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown'); }
          else if (u === 'medium' && topLevel !== 'high') { topLevel = 'medium'; flagged.push(c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown'); }
        }
        if (topLevel) urgent.push({ patient, level: topLevel, flaggedConditions: flagged.slice(0, 2) });
      }
      setUrgentList(urgent);
    }).finally(() => setLoadingUrgent(false));
  }, [patients]);

  return { urgentList, loadingUrgent };
}

// ── Age / date helpers ────────────────────────────────────────────────────────

function getAge(birthDate?: string): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  return now.getFullYear() - birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ patients }: { patients: FhirPatient[] }) {
  const stats = useMemo(() => {
    if (patients.length === 0) return null;
    const ages = patients.map(p => getAge(p.birthDate)).filter((a): a is number => a !== null);
    const avgAge = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : null;
    const minAge = ages.length > 0 ? Math.min(...ages) : null;
    const maxAge = ages.length > 0 ? Math.max(...ages) : null;
    const male = patients.filter(p => p.gender === 'male').length;
    const female = patients.filter(p => p.gender === 'female').length;
    const malePct = Math.round((male / patients.length) * 100);
    const femalePct = Math.round((female / patients.length) * 100);
    return { total: patients.length, avgAge, minAge, maxAge, male, female, malePct, femalePct };
  }, [patients]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Total Patients</p>
        <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
        <p className="text-xs text-gray-400 mt-1">in FHIR sandbox</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Average Age</p>
        <p className="text-3xl font-bold text-teal-600">{stats.avgAge ?? '—'}</p>
        <p className="text-xs text-gray-400 mt-1">years old</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Age Range</p>
        <p className="text-3xl font-bold text-indigo-600">
          {stats.minAge !== null && stats.maxAge !== null ? `${stats.minAge}–${stats.maxAge}` : '—'}
        </p>
        <p className="text-xs text-gray-400 mt-1">youngest to oldest</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Gender Split</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-blue-500">{stats.malePct}%</span>
          <span className="text-xs text-gray-400">M</span>
          <span className="text-gray-200 mx-1">/</span>
          <span className="text-xl font-bold text-purple-500">{stats.femalePct}%</span>
          <span className="text-xs text-gray-400">F</span>
        </div>
        <div className="flex mt-2 rounded-full overflow-hidden h-1.5">
          <div className="bg-blue-400" style={{ width: `${stats.malePct}%` }} />
          <div className="bg-purple-400" style={{ width: `${stats.femalePct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1">{stats.male}M · {stats.female}F of {stats.total}</p>
      </div>
    </div>
  );
}

// ── Urgent patient row ────────────────────────────────────────────────────────

function UrgentRow({ item, level, onSelect }: { item: UrgentPatient; level: UrgencyLevel; onSelect: (p: FhirPatient) => void }) {
  const name = getPatientName(item.patient);
  const avatarColor = getAvatarColor(name);
  const isHigh = level === 'high';
  return (
    <button
      onClick={() => onSelect(item.patient)}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors text-left"
    >
      <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center font-semibold text-sm flex-shrink-0`}>
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
        <p className="text-xs text-gray-400 truncate">{item.flaggedConditions.join(' · ')}</p>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${isHigh ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
        {isHigh ? 'High' : 'Medium'}
      </span>
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function UrgentModal({ title, level, patients, onClose, onSelect }: {
  title: string; level: UrgencyLevel; patients: UrgentPatient[];
  onClose: () => void; onSelect: (p: FhirPatient) => void;
}) {
  const isHigh = level === 'high';
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b flex items-center gap-3 ${isHigh ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isHigh ? 'bg-red-500' : 'bg-amber-500'}`} />
          <div className="flex-1">
            <h2 className={`text-sm font-semibold ${isHigh ? 'text-red-800' : 'text-amber-800'}`}>{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{patients.length} patients · click any to view full record</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-white/60">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {patients.length === 0
            ? <p className="text-sm text-gray-400 text-center py-10">No patients found.</p>
            : patients.map(item => <UrgentRow key={item.patient.id} item={item} level={level} onSelect={p => { onSelect(p); onClose(); }} />)
          }
        </div>
      </div>
    </div>
  );
}

// ── Alert panel ───────────────────────────────────────────────────────────────

function AlertPanel({ level, patients, loading, onViewAll, onSelect }: {
  level: UrgencyLevel; patients: UrgentPatient[]; loading: boolean;
  onViewAll: () => void; onSelect: (p: FhirPatient) => void;
}) {
  const isHigh = level === 'high';
  const preview = patients.slice(0, 3);
  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isHigh ? 'border-red-200' : 'border-amber-200'}`}>
      <div className={`px-4 py-3 border-b flex items-center gap-2.5 ${isHigh ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isHigh ? 'bg-red-500' : 'bg-amber-500'}`} />
        <span className={`text-sm font-semibold flex-1 ${isHigh ? 'text-red-800' : 'text-amber-800'}`}>
          {isHigh ? 'Needs immediate attention' : 'Monitor closely'}
        </span>
        {!loading && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isHigh ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            {patients.length} patients
          </span>
        )}
        <svg className={`w-4 h-4 ${isHigh ? 'text-red-400' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      {loading ? (
        <div className="py-6 flex items-center justify-center gap-2 text-gray-400">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-500" />
          <span className="text-xs">Analyzing patient records…</span>
        </div>
      ) : preview.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">No patients in this category.</p>
      ) : (
        <>
          {preview.map(item => <UrgentRow key={item.patient.id} item={item} level={level} onSelect={onSelect} />)}
          {patients.length > 3 && (
            <button onClick={onViewAll} className="w-full py-2.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors border-t border-gray-100">
              View all {patients.length} patients →
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Main PatientList ──────────────────────────────────────────────────────────

export function PatientList({ onSelect }: PatientListProps) {
  const { patients, loading, error } = usePatients();
  const { urgentList, loadingUrgent } = useUrgentPatients(patients);
  const { labMap, loadingLabs } = usePatientLabData(patients);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [modal, setModal] = useState<'high' | 'medium' | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>('all');

  const highPatients = urgentList.filter(u => u.level === 'high');
  const mediumPatients = urgentList.filter(u => u.level === 'medium');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    let result = patients.filter(p => getPatientName(p).toLowerCase().includes(q));

    // Apply metric filter
    if (metricFilter !== 'all') {
      result = result.filter(p => {
        const labs = labMap.get(p.id);
        return matchesFilter(labs, metricFilter);
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = getPatientName(a).localeCompare(getPatientName(b));
      else if (sortKey === 'dob') cmp = (a.birthDate ?? '').localeCompare(b.birthDate ?? '');
      else if (sortKey === 'id') cmp = a.id.localeCompare(b.id);
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [patients, search, sortKey, sortAsc, metricFilter, labMap]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  function SortBtn({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => handleSort(k)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${active ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
      >
        {label}
        <span className="text-gray-400">{active ? (sortAsc ? '↑' : '↓') : ''}</span>
      </button>
    );
  }

  // Count label for footer
  const totalWithData = metricFilter !== 'all'
    ? patients.filter(p => matchesFilter(labMap.get(p.id), metricFilter)).length
    : patients.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1400px] mx-auto py-8 px-6">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Patient Records</h1>
            <p className="text-xs text-gray-400">SMART Health IT · FHIR R4 Sandbox</p>
          </div>
        </div>

        {/* Stats bar */}
        {!loading && !error && <StatsBar patients={patients} />}

        {/* Alert panels */}
        {!loading && !error && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
            <AlertPanel level="high" patients={highPatients} loading={loadingUrgent} onViewAll={() => setModal('high')} onSelect={onSelect} />
            <AlertPanel level="medium" patients={mediumPatients} loading={loadingUrgent} onViewAll={() => setModal('medium')} onSelect={onSelect} />
          </div>
        )}

        {/* Metric filter bar */}
        {!loading && !error && (
          <MetricFilterBar
            active={metricFilter}
            onChange={setMetricFilter}
            loadingLabs={loadingLabs}
          />
        )}

        {/* Search + sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="search"
              placeholder="Search patients by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-gray-400 mr-1">Sort:</span>
            <SortBtn label="Name" k="name" />
            <SortBtn label="DOB" k="dob" />
            <SortBtn label="ID" k="id" />
          </div>
        </div>

        {/* Patient list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading && <LoadingSpinner />}
          {error && <div className="p-4"><ErrorMessage message={error} /></div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-12">
              <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-gray-400 text-sm">
                {metricFilter !== 'all' ? 'No patients found with data matching this filter.' : 'No patients found.'}
              </p>
              {metricFilter !== 'all' && (
                <button onClick={() => setMetricFilter('all')} className="mt-2 text-xs text-blue-500 hover:text-blue-700 underline">
                  Clear filter
                </button>
              )}
            </div>
          )}
          {!loading && !error && filtered.map(p => (
            <PatientCard key={p.id} patient={p} onClick={onSelect} />
          ))}
        </div>

        {!loading && !error && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            Showing <span className="font-medium text-gray-600">{filtered.length}</span>
            {metricFilter !== 'all' ? (
              <> patients matching filter · <span className="font-medium text-gray-600">{totalWithData}</span> have this lab data</>
            ) : (
              <> of <span className="font-medium text-gray-600">{patients.length}</span> patients</>
            )}
          </p>
        )}
      </div>

      {/* Modals */}
      {modal === 'high' && (
        <UrgentModal title="Needs immediate attention" level="high" patients={highPatients} onClose={() => setModal(null)} onSelect={onSelect} />
      )}
      {modal === 'medium' && (
        <UrgentModal title="Monitor closely" level="medium" patients={mediumPatients} onClose={() => setModal(null)} onSelect={onSelect} />
      )}
    </div>
  );
}
