import { useState } from 'react';
import type { FhirPatient } from './types/fhir';
import { PatientList } from './components/PatientList';
import { PatientDetail } from './components/PatientDetail';

type View = { kind: 'list' } | { kind: 'detail'; patient: FhirPatient };

function App() {
  const [view, setView] = useState<View>({ kind: 'list' });

  if (view.kind === 'detail') {
    return (
      <PatientDetail
        patient={view.patient}
        onBack={() => setView({ kind: 'list' })}
      />
    );
  }

  return <PatientList onSelect={(patient) => setView({ kind: 'detail', patient })} />;
}

export default App;
