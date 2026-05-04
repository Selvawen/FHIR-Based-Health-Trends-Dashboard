import { useState, useEffect } from 'react';
import { fhirGet, FhirError } from '../api/fhirClient';
import type { FhirBundle, FhirPatient } from '../types/fhir';

interface UsePatients {
  patients: FhirPatient[];
  loading: boolean;
  error: string | null;
}

export function usePatients(): UsePatients {
  const [patients, setPatients] = useState<FhirPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fhirGet<FhirBundle<FhirPatient>>('/Patient?_count=100')
      .then((bundle) => {
        if (cancelled) return;
        setPatients(bundle.entry?.map((e) => e.resource) ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof FhirError ? err.message : 'Failed to load patients');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { patients, loading, error };
}
