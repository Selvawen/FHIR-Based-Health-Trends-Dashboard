import type { FhirPatient } from '../types/fhir';

interface PatientCardProps {
  patient: FhirPatient;
  conditionCount?: number;
  onClick: (patient: FhirPatient) => void;
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-sky-100 text-sky-700',
  'bg-cyan-100 text-cyan-700',
  'bg-violet-100 text-violet-700',
];

export function getPatientName(patient: FhirPatient): string {
  const name = patient.name?.[0];
  if (!name) return 'Unknown';
  if (name.text) return name.text;
  const given = name.given?.join(' ') ?? '';
  const family = name.family ?? '';
  return [given, family].filter(Boolean).join(' ') || 'Unknown';
}

export function getAvatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx] ?? AVATAR_COLORS[0];
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
  const age = now.getFullYear() - birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  return `${age} yrs`;
}

export function PatientCard({ patient, conditionCount, onClick }: PatientCardProps) {
  const name = getPatientName(patient);
  const avatarColor = getAvatarColor(name);
  const age = getAge(patient.birthDate);
  const gender = patient.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : 'Unknown';

  return (
    <button
      className="w-full text-left px-5 py-4 hover:bg-blue-50/60 border-b border-gray-100 flex items-center gap-4 transition-colors group"
      onClick={() => onClick(patient)}
    >
      <div className={`flex-shrink-0 w-11 h-11 rounded-full ${avatarColor} flex items-center justify-center font-semibold text-base`}>
        {name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 truncate">{name}</p>
          {conditionCount !== undefined && conditionCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {conditionCount} {conditionCount === 1 ? 'condition' : 'conditions'}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          DOB: {formatDate(patient.birthDate)}
          {age && <span className="mx-1.5 text-gray-300">·</span>}
          {age && <span>{age}</span>}
          <span className="mx-1.5 text-gray-300">·</span>
          {gender}
        </p>
      </div>

      <svg
        className="w-4 h-4 text-gray-300 group-hover:text-blue-500 flex-shrink-0 transition-colors"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
