import { useState, useEffect } from 'react';
import { fhirGet, FhirError } from '../api/fhirClient';
import type {
  FhirBundle,
  FhirCondition,
  FhirMedicationRequest,
  FhirObservation,
  FhirAllergyIntolerance,
  FhirImmunization,
  FhirEncounter,
} from '../types/fhir';

interface PatientDetailData {
  conditions: FhirCondition[];
  medications: FhirMedicationRequest[];
  observations: FhirObservation[];
  allergies: FhirAllergyIntolerance[];
  immunizations: FhirImmunization[];
  encounters: FhirEncounter[];
  loading: boolean;
  error: string | null;
}

export function usePatientDetail(patientId: string): PatientDetailData {
  const [conditions, setConditions] = useState<FhirCondition[]>([]);
  const [medications, setMedications] = useState<FhirMedicationRequest[]>([]);
  const [observations, setObservations] = useState<FhirObservation[]>([]);
  const [allergies, setAllergies] = useState<FhirAllergyIntolerance[]>([]);
  const [immunizations, setImmunizations] = useState<FhirImmunization[]>([]);
  const [encounters, setEncounters] = useState<FhirEncounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const id = encodeURIComponent(patientId);

    Promise.all([
      fhirGet<FhirBundle<FhirCondition>>(`/Condition?patient=${id}`),
      fhirGet<FhirBundle<FhirMedicationRequest>>(`/MedicationRequest?patient=${id}`),
      fhirGet<FhirBundle<FhirObservation>>(`/Observation?patient=${id}&_count=50&_sort=-date`),
      fhirGet<FhirBundle<FhirAllergyIntolerance>>(`/AllergyIntolerance?patient=${id}`),
      fhirGet<FhirBundle<FhirImmunization>>(`/Immunization?patient=${id}`),
      fhirGet<FhirBundle<FhirEncounter>>(`/Encounter?patient=${id}&_count=20&_sort=-date`),
    ])
      .then(([cBundle, mBundle, oBundle, aBundle, iBundle, eBundle]) => {
        if (cancelled) return;
        setConditions(cBundle.entry?.map((e) => e.resource) ?? []);
        setMedications(mBundle.entry?.map((e) => e.resource) ?? []);
        setObservations(oBundle.entry?.map((e) => e.resource) ?? []);
        setAllergies(aBundle.entry?.map((e) => e.resource) ?? []);
        setImmunizations(iBundle.entry?.map((e) => e.resource) ?? []);
        setEncounters(eBundle.entry?.map((e) => e.resource) ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof FhirError ? err.message : 'Failed to load patient data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [patientId]);

  return { conditions, medications, observations, allergies, immunizations, encounters, loading, error };
}
