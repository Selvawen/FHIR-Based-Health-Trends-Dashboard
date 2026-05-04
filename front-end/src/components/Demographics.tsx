import { useState } from 'react';
import type { FhirPatient } from '../types/fhir';
import { getPatientName } from './PatientCard';

interface DemographicsProps {
  patient: FhirPatient;
  conditions: number;
  medications: number;
  encounters: number;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-');
  if (!year) return dateStr;
  return `${month ?? '??'}/${day ?? '??'}/${year}`;
}

function getAge(birthDate?: string): string {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  const now = new Date();
  const age =
    now.getFullYear() -
    birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  return `${age} years old`;
}

function capitalize(s?: string): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 ${
        copied
          ? 'bg-green-50 border-green-200 text-green-600'
          : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600'
      }`}
    >
      {copied ? (
        <>
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
            <path strokeLinecap="round" strokeWidth="2" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export function Demographics({ patient, conditions, medications, encounters }: DemographicsProps) {
  const name = getPatientName(patient);
  const initial = name.charAt(0).toUpperCase();

  const addr = patient.address?.[0];
  const addressLine = [...(addr?.line ?? []), addr?.city, addr?.state, addr?.postalCode]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Blue hero banner */}
      <div className="bg-blue-50 px-5 pt-5 pb-4 border-b border-gray-100 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-bold text-2xl mb-3">
          {initial}
        </div>
        <h2 className="text-base font-semibold text-gray-900">{name}</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {capitalize(patient.gender)} · {getAge(patient.birthDate)}
        </p>
        {/* Mini stat counters */}
        <div className="flex gap-2 mt-3">
          <div className="bg-white rounded-lg px-3 py-1.5 text-center border border-gray-100 min-w-[56px]">
            <p className="text-base font-bold text-blue-600">{conditions}</p>
            <p className="text-gray-400 uppercase tracking-wide" style={{ fontSize: '9px' }}>Conditions</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-1.5 text-center border border-gray-100 min-w-[56px]">
            <p className="text-base font-bold text-green-600">{medications}</p>
            <p className="text-gray-400 uppercase tracking-wide" style={{ fontSize: '9px' }}>Meds</p>
          </div>
          <div className="bg-white rounded-lg px-3 py-1.5 text-center border border-gray-100 min-w-[56px]">
            <p className="text-base font-bold text-purple-600">{encounters}</p>
            <p className="text-gray-400 uppercase tracking-wide" style={{ fontSize: '9px' }}>Visits</p>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Date of birth */}
        <div className="flex items-start gap-2.5">
          <svg className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
            <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
            <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
            <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
          </svg>
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide" style={{ fontSize: '10px' }}>Date of birth</p>
            <p className="text-sm font-medium text-gray-800 mt-0.5">{formatDate(patient.birthDate)}</p>
          </div>
        </div>

        {/* Patient ID */}
        <div className="flex items-start gap-2.5">
          <svg className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" strokeWidth="2" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-gray-400 font-medium uppercase tracking-wide" style={{ fontSize: '10px' }}>Patient ID</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-mono text-gray-500 flex-1 truncate">
                {patient.id.length > 20 ? `${patient.id.slice(0, 8)}…${patient.id.slice(-4)}` : patient.id}
              </span>
              <CopyButton text={patient.id} />
            </div>
          </div>
        </div>

        {/* Address */}
        {addressLine && (
          <div className="flex items-start gap-2.5">
            <svg className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" strokeWidth="2" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-gray-400 font-medium uppercase tracking-wide" style={{ fontSize: '10px' }}>Address</p>
              <div className="flex items-start gap-1.5 mt-0.5">
                <span className="text-xs text-gray-700 leading-relaxed flex-1">{addressLine}</span>
                <CopyButton text={addressLine} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
