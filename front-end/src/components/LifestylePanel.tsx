import { useState, useEffect, useCallback } from 'react';

interface WorkoutSession {
  type: string;
  duration_sec: number;
  kcal: number;
}

interface LifestyleEntry {
  date: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  exercise_min: number;
  activity_level: 'none' | 'light' | 'moderate' | 'intense';
  notes: string;
  source: 'manual' | 'healthkit';
  workout_sessions: WorkoutSession[];
}

interface LifestylePanelProps {
  patientId: string;
}

const ACTIVITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  none:     { label: 'None',     color: '#6b7280', bg: '#f9fafb' },
  light:    { label: 'Light',    color: '#2563eb', bg: '#eff6ff' },
  moderate: { label: 'Moderate', color: '#059669', bg: '#ecfdf5' },
  intense:  { label: 'Intense',  color: '#7c3aed', bg: '#f5f3ff' },
};

function today(): string { return new Date().toISOString().split('T')[0] ?? ''; }

const API = 'http://127.0.0.1:8000';

const EMPTY_FORM: Omit<LifestyleEntry, 'source' | 'workout_sessions'> = {
  date: today(),
  calories_kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  sugar_g: 0,
  exercise_min: 0,
  activity_level: 'light',
  notes: '',
};

interface StatPillProps { label: string; value: string | number; unit: string; color: string; bg: string; }
function StatPill({ label, value, unit, color, bg }: StatPillProps) {
  return (
    <div className="rounded-xl px-4 py-3 flex-1 min-w-[80px]" style={{ background: bg }}>
      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium" style={{ fontSize: '10px' }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-400">{unit}</p>
    </div>
  );
}

export function LifestylePanel({ patientId }: LifestylePanelProps) {
  const [entries, setEntries] = useState<LifestyleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchEntries = useCallback(() => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/lifestyle/${patientId}`)
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data: LifestyleEntry[]) => setEntries(data))
      .catch(() => setError('Failed to load lifestyle data from the server.'))
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  function handleSave() {
    if (!form.date) return;
    setError(null);
    fetch(`${API}/lifestyle/${patientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, source: 'manual', workout_sessions: [] }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        setShowForm(false);
        setForm({ ...EMPTY_FORM, date: today() });
        fetchEntries();
      })
      .catch(() => setError('Failed to save entry. Please try again.'));
  }

  function handleDelete(date: string) {
    setError(null);
    fetch(`${API}/lifestyle/${patientId}/${date}`, { method: 'DELETE' })
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        fetchEntries();
      })
      .catch(() => setError('Failed to delete entry. Please try again.'));
  }

  const recent = entries.slice(0, 7);
  const avg = (key: keyof LifestyleEntry) =>
    recent.length > 0
      ? Math.round(recent.reduce((s, e) => s + (e[key] as number), 0) / recent.length)
      : null;

  return (
    <div className="space-y-4">
      {entries.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2">7-day average</p>
          <div className="flex gap-3 flex-wrap">
            <StatPill label="Calories" value={avg('calories_kcal') ?? '—'} unit="kcal/day" color="#2563eb" bg="#eff6ff" />
            <StatPill label="Protein"  value={avg('protein_g') ?? '—'}     unit="g/day"    color="#0891b2" bg="#ecfeff" />
            <StatPill label="Carbs"    value={avg('carbs_g') ?? '—'}       unit="g/day"    color="#7c3aed" bg="#f5f3ff" />
            <StatPill label="Exercise" value={avg('exercise_min') ?? '—'}  unit="min/day"  color="#059669" bg="#ecfdf5" />
          </div>
        </div>
      )}

      {loading && <p className="text-xs text-blue-400">Loading lifestyle data...</p>}

      {error && (
        <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {entries.length} entries loaded
        </p>
      )}

      <button
        onClick={() => { setForm({ ...EMPTY_FORM, date: today() }); setShowForm(true); }}
        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Log lifestyle data manually
      </button>

      {showForm && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-800">New entry</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Date</label>
              <input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Activity level</label>
              <select value={form.activity_level}
                onChange={e => setForm(f => ({ ...f, activity_level: e.target.value as LifestyleEntry['activity_level'] }))}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="intense">Intense</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Calories (kcal)</label>
              <input type="number" min={0} value={form.calories_kcal || ''}
                onChange={e => setForm(f => ({ ...f, calories_kcal: Number(e.target.value) }))}
                placeholder="e.g. 2100"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Protein (g)</label>
              <input type="number" min={0} value={form.protein_g || ''}
                onChange={e => setForm(f => ({ ...f, protein_g: Number(e.target.value) }))}
                placeholder="e.g. 80"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Carbs (g)</label>
              <input type="number" min={0} value={form.carbs_g || ''}
                onChange={e => setForm(f => ({ ...f, carbs_g: Number(e.target.value) }))}
                placeholder="e.g. 210"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Fat (g)</label>
              <input type="number" min={0} value={form.fat_g || ''}
                onChange={e => setForm(f => ({ ...f, fat_g: Number(e.target.value) }))}
                placeholder="e.g. 60"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Sugar (g)</label>
              <input type="number" min={0} value={form.sugar_g || ''}
                onChange={e => setForm(f => ({ ...f, sugar_g: Number(e.target.value) }))}
                placeholder="e.g. 45"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Exercise (min)</label>
              <input type="number" min={0} value={form.exercise_min || ''}
                onChange={e => setForm(f => ({ ...f, exercise_min: Number(e.target.value) }))}
                placeholder="e.g. 30"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 font-medium block mb-1">Notes</label>
              <input type="text" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional note..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              Save entry
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-gray-500 text-sm font-medium rounded-lg hover:bg-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 text-center py-6">No lifestyle data available. Connect a HealthKit stream or log manually.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Date</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Calories</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Protein</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Carbs</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Fat</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Exercise</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Activity</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">Source</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, visibleCount).map(e => {
                  const act = ACTIVITY_LABELS[e.activity_level] ?? ACTIVITY_LABELS['none'];
                  const isHK = e.source === 'healthkit';
                  return (
                    <tr key={`${e.date}-${e.source}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-3 text-gray-700 font-medium text-xs">{e.date}</td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{e.calories_kcal > 0 ? `${e.calories_kcal} kcal` : '—'}</td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{e.protein_g > 0 ? `${e.protein_g}g` : '—'}</td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{e.carbs_g > 0 ? `${e.carbs_g}g` : '—'}</td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{e.fat_g > 0 ? `${e.fat_g}g` : '—'}</td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{e.exercise_min > 0 ? `${e.exercise_min} min` : '—'}</td>
                      <td className="py-2 px-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: act.color, background: act.bg }}>
                          {act.label}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {isHK ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full text-green-700 bg-green-50">HealthKit</span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full text-blue-700 bg-blue-50">Manual</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {!isHK && (
                          <button onClick={() => handleDelete(e.date)} className="text-gray-300 hover:text-red-400 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {entries.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(c => c + 10)}
              className="w-full mt-2 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium hover:bg-blue-50 rounded-lg transition-colors"
            >
              Show more ({entries.length - visibleCount} remaining)
            </button>
          )}
          {visibleCount > 10 && entries.length <= visibleCount && (
            <button
              onClick={() => setVisibleCount(10)}
              className="w-full mt-2 py-2 text-sm text-gray-400 hover:text-gray-600 font-medium hover:bg-gray-50 rounded-lg transition-colors"
            >
              Show less
            </button>
          )}
        </>
      )}
    </div>
  );
}
