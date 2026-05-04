# Front-end

React 19 + TypeScript application. Displays patient data from a FHIR server alongside wearable data, lifestyle logs, and AI-assisted clinical summaries.

---

## Directory Structure

```
front-end/src/
├── App.tsx             # Root component, patient list / detail routing
├── main.tsx            # React entry point
├── index.css           # Global styles (Tailwind base)
├── api/
│   └── fhirClient.ts   # FHIR fetch client
├── components/         # UI components
├── hooks/              # Data-fetching hooks
└── types/
    └── fhir.ts         # TypeScript interfaces for FHIR R4 resources
```

---

## API Client

### `api/fhirClient.ts`

`fhirGet<T>(path)` -- typed fetch wrapper for the FHIR server. Reads the base URL from `GET /fhir_base_url` on the backend at startup. Throws `FhirError` on non-2xx responses.

---

## Hooks

### `hooks/usePatients.ts`

Fetches the patient list from `GET /Patient?_count=100`. Returns `{ patients, loading, error }`.

### `hooks/usePatientDetail.ts`

Fetches all clinical data for a single patient in parallel: conditions, medications, observations, allergies, immunizations, and encounters. Returns all six arrays plus `loading` and `error`.

---

## Components

### Top-level

**`App.tsx`**
Root component. Manages navigation between the patient list and patient detail views. Fetches the FHIR base URL from the backend on mount.

**`PatientList.tsx`**
Displays the full patient roster. Includes a stats bar, urgency filter panel, and lab metric filter. Each patient is rendered as a `PatientCard`.

**`PatientCard.tsx`**
Single patient row in the list. Shows name, age, gender, and a computed urgency indicator. Exports `getPatientName(patient)` helper used across the app.

**`PatientDetail.tsx`**
Tabbed patient view. Tabs: Overview, Charts, Records, Lifestyle, AI Summary, Patient Data Connection. Fetches patient clinical data via `usePatientDetail` and passes it to child components. Also checks whether a watch provider is connected for the current patient to conditionally show the heart rate chart.

### Overview tab

**`Demographics.tsx`**
Patient profile card. Shows name, DOB, gender, address, and summary counts for conditions, medications, and encounters.

**`HealthRiskScore.tsx`**
Computes a risk score from active conditions, allergies, observations, and age. Displays a colour-coded score badge.

**`MedicationInteractionChecker.tsx`**
Client-side medication interaction flagging. Checks active medications against a hardcoded interaction table and displays warnings.

### Charts tab

**`VitalSignsChart.tsx`**
Renders mini line charts for FHIR observation trends: blood pressure, body weight, blood glucose, and cholesterol. Uses Chart.js via dynamic import. Extracts values by LOINC code and text keyword matching.

**`ConditionTimeline.tsx`**
Horizontal timeline of conditions sorted by onset date.

### Records tab

**`ConditionsList.tsx`**
Table of conditions with clinical status, onset date, and severity.

**`MedicationsList.tsx`**
Table of medication requests with dosage and status.

**`ObservationsList.tsx`**
Table of FHIR observations with value, unit, and date.

**`AllergiesList.tsx`**
Table of allergies with criticality and reaction details.

**`ImmunizationsList.tsx`**
Table of immunizations with vaccine name and date.

**`EncountersList.tsx`**
Table of encounters with type, date, and reason.

### Lifestyle tab

**`LifestylePanel.tsx`**
Manual lifestyle data log. Fetches entries from `GET /lifestyle/{patientId}` on mount. Supports creating entries via `POST` and deleting manual entries via `DELETE`. Fields: date, calories, protein, carbs, fat, sugar, exercise minutes, activity level, notes. Displays a 7-day average summary and a paginated history table showing both manual and HealthKit-sourced entries.

**`TrendCorrelationChart.tsx`**
Dual-axis line chart correlating a selected FHIR lab metric (glucose, cholesterol, weight, systolic BP) against a selected lifestyle metric (sugar, calories, carbs, exercise). Fetches lifestyle data from `GET /lifestyle/{patientId}?days=90`. Both axes are independently scaled.

**`HeartRateChart.tsx`**
Reads resting HR, heart rate, and walking HR average from the `readings` buffer in the HealthKit aggregation document. Renders all three as overlaid line series with per-series mean reference lines. Only shown when a watch provider is connected.

**`SpO2Chart.tsx`**
Reads SpO2 readings from the `readings` buffer in the HealthKit aggregation document. Renders a line chart with mean, min, and max reference lines.

**`HealthKitCharts.tsx`**
Renders charts for all remaining HealthKit metrics from the aggregation document: HRV (SDNN), respiratory rate, step count, active energy burned, exercise time, and sleep. Sleep is rendered as a stacked bar chart (asleep vs awake per night). All other metrics use the same line chart format as SpO2Chart.

### AI Summary tab

**`AISummary.tsx`**
Chat interface backed by the `/chat` streaming endpoint. Maintains conversation history in React state and sends the full history on each request. The system prompt includes patient demographics, conditions, medications, allergies, and the current HealthKit aggregation data so the model has context on every message including follow-ups.

On mount, fetches the active model name from `/llm_model` and the HealthKit aggregation from `/healthkit/{patient_id}/aggregations`. The aggregation is included in the system prompt on every request.

`buildPrompt()` constructs the initial summarize message from all FHIR data. `buildSystemContext()` constructs the persistent system prompt including HealthKit data.

### Connection tab

**`ExternalConfiguration.tsx`**
Form for configuring a patient's HealthKit data connection. Reads and writes `GET/POST /healthkit/{user_id}/config`. Supports provider type selection (File or Streaming) and enables the polling flag. Saving a valid configuration triggers immediate scheduler startup on the backend.

### Shared

**`LoadingSpinner.tsx`**
Animated spinner used during data fetches.

**`ErrorMessage.tsx`**
Inline error display component.

---

## Types

### `types/fhir.ts`

TypeScript interfaces for FHIR R4 resources used in the app: `FhirPatient`, `FhirCondition`, `FhirMedicationRequest`, `FhirObservation`, `FhirAllergyIntolerance`, `FhirImmunization`, `FhirEncounter`, `FhirBundle`, and supporting sub-types.
