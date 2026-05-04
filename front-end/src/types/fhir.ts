export interface FhirBundle<T> {
  resourceType: 'Bundle';
  total?: number;
  entry?: Array<{ resource: T }>;
}

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  name?: Array<{ family?: string; given?: string[]; text?: string }>;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  address?: Array<{
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}

export interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  code?: {
    text?: string;
    coding?: Array<{ system?: string; code?: string; display?: string }>;
  };
  clinicalStatus?: { coding?: Array<{ code?: string }> };
  onsetDateTime?: string;
  recordedDate?: string;
}

export interface FhirMedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status?: string;
  intent?: string;
  medicationCodeableConcept?: {
    text?: string;
    coding?: Array<{ display?: string }>;
  };
  authoredOn?: string;
  dosageInstruction?: Array<{ text?: string }>;
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  status?: string;
  code?: {
    text?: string;
    coding?: Array<{ system?: string; code?: string; display?: string }>;
  };
  effectiveDateTime?: string;
  valueQuantity?: { value?: number; unit?: string };
  valueString?: string;
  valueCodeableConcept?: { text?: string };
  component?: Array<{
    code?: { text?: string; coding?: Array<{ code?: string; display?: string }> };
    valueQuantity?: { value?: number; unit?: string };
  }>;
}

export interface FhirAllergyIntolerance {
  resourceType: 'AllergyIntolerance';
  id: string;
  clinicalStatus?: { coding?: Array<{ code?: string }> };
  type?: string;
  category?: string[];
  criticality?: string;
  code?: {
    text?: string;
    coding?: Array<{ display?: string }>;
  };
  recordedDate?: string;
  reaction?: Array<{
    manifestation?: Array<{ text?: string; coding?: Array<{ display?: string }> }>;
    severity?: string;
  }>;
}

export interface FhirImmunization {
  resourceType: 'Immunization';
  id: string;
  status?: string;
  vaccineCode?: {
    text?: string;
    coding?: Array<{ display?: string }>;
  };
  occurrenceDateTime?: string;
  primarySource?: boolean;
}

export interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  status?: string;
  class?: { code?: string; display?: string };
  type?: Array<{
    text?: string;
    coding?: Array<{ display?: string }>;
  }>;
  period?: { start?: string; end?: string };
  reasonCode?: Array<{
    text?: string;
    coding?: Array<{ display?: string }>;
  }>;
}