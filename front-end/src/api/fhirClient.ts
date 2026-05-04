let FHIR_BASE = '';

export class FhirError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'FhirError';
  }
}

export async function getFHIRUrl(){
  if (FHIR_BASE == undefined || FHIR_BASE == null || FHIR_BASE == "") {
    let res = await fetch("http://127.0.0.1:8000/fhir_base_url");
    let baseurl = await res.json();
    try {
      FHIR_BASE = baseurl;
    }
    catch {
      // Catch and chuck this exception. Idk if theres some esoteric behaviors around file scoped vars here
      // This is just a caching attempt -Albert
    }

    return baseurl;
  }
  return FHIR_BASE
}

export async function fhirGet<T>(path: string): Promise<T> {

  let baseUrl = await getFHIRUrl();

  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/fhir+json' },
  });
  if (!res.ok) {
    throw new FhirError(res.status, `FHIR request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
