# Health Insights

A clinical provider dashboard that connects FHIR patient records with real-time wearable data (simulated Apple HealthKit) to surface live notifications and AI-assisted insights.

---

## Project Structure

```
FHIR-Based Health Trends Dashboard/
├── front-end/          # React 19 + TypeScript + Vite + TailwindCSS v4
├── back-end/           # Python FastAPI
│   ├── main.py
│   ├── config.json         # Local config (gitignored) - what the app reads
│   ├── default_config.json # Config template with online service defaults
│   └── requirements.txt
├── synthetic-patients/     # FHIR patient bundles + upload.bat
├── synthetic-apple-health-data/  # HealthKit XML baseline files
├── mongodb/                # MongoDB binaries (gitignored, downloaded by start.bat)
├── data/                   # MongoDB data directory (gitignored)
├── logs/                   # MongoDB logs (gitignored)
├── start.bat               # Start backend + frontend (Windows)
├── launch_pace.sh          # Start backend + frontend (Linux/HPC)
├── setup_services.bat      # Pull and start Docker containers, upload patients
└── README.md
```

**`synthetic-patients/`** -- Synthea-generated FHIR R4 patient bundles in JSON format. Contains approximately 200 patients plus practitioner and hospital information files. `upload.bat` posts all bundles to a HAPI FHIR server at `http://localhost:8090/fhir`.

**`synthetic-apple-health-data/`** -- Apple HealthKit XML export files used as calibration baselines by `StreamingHealthKitProvider`. The provider reads these files once on startup to extract realistic value ranges per metric type, then generates synthetic data within those ranges. Files include per-patient exports (named by patient ID) and shared baseline files used as fallbacks when no patient-specific file exists. The `2 Months Mixed Health Apple Health Data.xml` file is the default fallback.

**`mongodb/`** -- Local MongoDB binaries downloaded by `start.bat` on first run. Not committed to the repository. The application uses MongoDB for notifications, user connection configs, HealthKit aggregations, and lifestyle logs.

---

## Prerequisites

| Tool | Version | Required when |
|------|---------|---------------|
| Node.js | 18+ | Always |
| npm | 9+ | Always |
| Anaconda / Miniconda | any | Always |
| Docker Desktop | any | Running HAPI FHIR or ntfy locally |
| Ollama | any | `ChatModel` is `mistral` |

---

## Configuration

The application reads `back-end/config.json`. This file is gitignored and must be created locally. Copy `default_config.json` as a starting point:

```bash
cp back-end/default_config.json back-end/config.json
```

`default_config.json` contains online service URLs and works out of the box without Docker or any local infrastructure. Edit `config.json` to switch to local services or change any setting.

```json
{
    "LLMProviderType": "local",
    "LocalHealthKitDataPath": "../synthetic-apple-health-data",
    "FHIRBaseURL": "http://localhost:8090/fhir",
    "NTFYBaseURL": "http://localhost:5050",
    "AggregationWindowDays": 7,
    "ChatModel": "mistral",
    "GeminiAPIKey": ""
}
```

| Key | Description |
|-----|-------------|
| `FHIRBaseURL` | FHIR server endpoint. See FHIR options below. |
| `NTFYBaseURL` | ntfy push notification endpoint. See ntfy options below. |
| `LocalHealthKitDataPath` | Directory of per-patient XML files named `{patient_id}.xml`. |
| `AggregationWindowDays` | Rolling window in days for HealthKit metric aggregations. |
| `LLMProviderType` | `local` to use Ollama, `gemini` to use the Google Gemini API. |
| `ModelName` | Model to use. For Ollama: any model already pulled locally (e.g. `mistral:7b`, `llama3:8b`). For Gemini: any Gemini model name (e.g. `gemini-2.0-flash`, `gemini-1.5-pro`). |
| `GeminiAPIKey` | Required only when `LLMProviderType` is `gemini`. |

---

## Service Options

Each external service has two paths: a local Docker option and an online option. Mix and match as needed.

### FHIR

| Option | `FHIRBaseURL` value | Notes |
|--------|---------------------|-------|
| Local Docker (demo data) | `http://localhost:8090/fhir` | Run `setup_services.bat` to start. Default port is 8090. |
| SMART Health IT sandbox | `https://r4.smarthealthit.org` | Public, no setup required. No local patient data. |

If you run HAPI FHIR on a different port, update `FHIRBaseURL` in `config.json` to match.

### ntfy (push notifications)

| Option | `NTFYBaseURL` value | Notes |
|--------|---------------------|-------|
| Local Docker | `http://localhost:5050` | Run `setup_services.bat` to start. Default port is 5050. |
| ntfy.sh public server | `https://ntfy.sh` | Public, no setup required. |

If you run ntfy on a different port, update `NTFYBaseURL` in `config.json` to match.

### AI model

| Option | `LLMProviderType` value | `ModelName` value | Requirements |
|--------|------------------------|-------------------|--------------|
| Ollama (local) | `local` | Any model pulled locally, e.g. `mistral:7b`, `llama3:8b` | Ollama installed and running. Model must already be pulled. |
| Gemini (cloud) | `gemini` | Any Gemini model, e.g. `gemini-2.0-flash`, `gemini-1.5-pro` | `GeminiAPIKey` set in `config.json`. Ollama not required. |

Both options stream tokens to the frontend identically. The backend selects the provider at request time based on `ChatModel`.

---

## First-Time Setup

### Path A: Local Docker (HAPI FHIR + ntfy + demo patient data)

Requires Docker Desktop.

Run `setup_services.bat` from the project root. It will:

- Pull the HAPI FHIR and ntfy Docker images
- Start HAPI FHIR on port 8090 and ntfy on port 5050
- Wait for HAPI FHIR to come online
- Run `synthetic-patients/upload.bat` to load all patient bundles

```cmd
setup_services.bat
```

To restart the containers after a reboot without re-uploading:

```cmd
docker start hapi-fhir
docker start ntfy
```

Then set `FHIRBaseURL` and `NTFYBaseURL` in `config.json` to the local ports shown above.

### Path B: Online services (no Docker)

`default_config.json` already contains the online URLs. Copy it to `config.json` and no further infrastructure setup is needed:

```json
{
    "FHIRBaseURL": "https://r4.smarthealthit.org",
    "NTFYBaseURL": "https://ntfy.sh"
}
```

### AI model setup

**Ollama (local):**
```bash
ollama pull mistral:7b
ollama serve
```
Set `LLMProviderType` to `local` and `ModelName` to the model you pulled (e.g. `mistral:7b`). The backend will use whatever model name is specified without attempting a pull.

**Gemini (cloud):**
Set `LLMProviderType` to `gemini`, set `ModelName` to the Gemini model you want (e.g. `gemini-2.0-flash`), and add your API key to `GeminiAPIKey`. Ollama is not needed.

### Install dependencies

```bash
# Backend
conda create -n health-insights python=3.10 -y
conda activate health-insights
cd back-end
pip install -r requirements.txt

# Frontend
cd front-end
npm install
```

---

## Running the Application

### Option A - Startup script (recommended)

**Windows:**
```cmd
start.bat
```

**Linux / HPC (PACE):**
```bash
./launch_pace.sh
```

Both scripts start the backend and frontend in separate terminal windows.

### Option B - Manual

**Terminal 1 (backend):**
```bash
conda activate health-insights
cd back-end
uvicorn main:app --reload --port 8000
```

**Terminal 2 (frontend):**
```bash
cd front-end
npm run dev
```

---

## Service URLs

| Service | Default URL |
|---------|-------------|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| HAPI FHIR (local Docker) | http://localhost:8090/fhir |
| ntfy (local Docker) | http://localhost:5050 |
| MongoDB | localhost:27017 |

---

## Backend API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/fhir_base_url` | GET | Returns configured FHIR base URL |
| `/chat` | POST | Streams LLM chat response with conversation history |
| `/summarize` | POST | Streams a one-shot LLM clinical summary |
| `/healthkit/{user_id}/aggregations` | GET | Rolling HealthKit metric aggregations from MongoDB |
| `/healthkit/{user_id}/config` | GET/POST | Read/write user connection config |
| `/lifestyle/{patient_id}` | GET | Lifestyle log entries (manual + HealthKit sourced) |
| `/lifestyle/{patient_id}` | POST | Create or update a manual lifestyle entry |
| `/lifestyle/{patient_id}/{date}` | DELETE | Delete a manual lifestyle entry |
| `/notifications/{patient_id}` | GET | Fetch threshold alert notifications |
| `/notifications/{patient_id}/mark-read` | POST | Mark notifications as read |

---

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, TailwindCSS v4, Chart.js

**Backend:** FastAPI, Uvicorn, Motor (async MongoDB), Ollama, Google Generative AI

**Infrastructure:** MongoDB, HAPI FHIR (Docker), ntfy (Docker), Ollama
 
