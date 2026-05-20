# Health Insights

Health Insights is a clinical provider dashboard that connects FHIR patient records with simulated Apple HealthKit wearable data. It helps providers view patient trends, receive live notifications, and review AI-assisted clinical insights from one dashboard.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Project Structure](#project-structure)
- [Key Directories](#key-directories)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Service Options](#service-options)
  - [FHIR](#fhir)
  - [ntfy Push Notifications](#ntfy-push-notifications)
  - [AI Model](#ai-model)
- [First-Time Setup](#first-time-setup)
  - [Path A: Local Docker Setup](#path-a-local-docker-setup)
  - [Path B: Online Services Setup](#path-b-online-services-setup)
  - [AI Model Setup](#ai-model-setup)
  - [Install Dependencies](#install-dependencies)
- [Running the Application](#running-the-application)
- [Service URLs](#service-urls)
- [Backend API](#backend-api)
- [Tech Stack](#tech-stack)

---

## Project Overview

This project combines clinical data and wearable-style lifestyle data to help providers monitor patient health trends over time.

The dashboard supports:

- FHIR R4 patient records
- Simulated Apple HealthKit data
- MongoDB-backed health metric aggregations
- Live threshold alert notifications
- AI-assisted clinical summaries and chat
- Local or cloud-based service options

---

## Project Structure

```text
FHIR-Based Health Trends Dashboard/
├── front-end/                       # React 19 + TypeScript + Vite + TailwindCSS v4
├── back-end/                        # Python FastAPI backend
│   ├── main.py
│   ├── config.json                  # Local config file, gitignored
│   ├── default_config.json          # Config template with online service defaults
│   └── requirements.txt
├── synthetic-patients/              # FHIR patient bundles and upload.bat
├── synthetic-apple-health-data/     # HealthKit XML baseline files
├── mongodb/                         # MongoDB binaries, gitignored and downloaded by start.bat
├── data/                            # MongoDB data directory, gitignored
├── logs/                            # MongoDB logs, gitignored
├── start.bat                        # Starts backend and frontend on Windows
├── launch_pace.sh                   # Starts backend and frontend on Linux/HPC
├── setup_services.bat               # Starts Docker services and uploads demo patients
└── README.md
```

---

## Key Directories

### `synthetic-patients/`

Contains Synthea-generated FHIR R4 patient bundles in JSON format. This directory includes approximately 200 patients, along with practitioner and hospital information files.

The `upload.bat` script posts all bundles to a HAPI FHIR server at:

```text
http://localhost:8090/fhir
```

### `synthetic-apple-health-data/`

Contains Apple HealthKit XML export files used as calibration baselines by `StreamingHealthKitProvider`.

On startup, the provider reads these files once to extract realistic value ranges for each metric type. It then generates synthetic data within those ranges.

This directory includes:

- Per-patient XML exports named by patient ID
- Shared baseline files used as fallbacks
- `2 Months Mixed Health Apple Health Data.xml`, which is the default fallback file

### `mongodb/`

Contains local MongoDB binaries downloaded by `start.bat` on first run. This directory is not committed to the repository.

MongoDB is used for:

- Notifications
- User connection configs
- HealthKit aggregations
- Lifestyle logs

---

## Prerequisites

| Tool | Version | Required When |
| --- | --- | --- |
| Node.js | 18+ | Always |
| npm | 9+ | Always |
| Anaconda or Miniconda | Any | Always |
| Docker Desktop | Any | Running HAPI FHIR or ntfy locally |
| Ollama | Any | Using a local AI model |

---

## Configuration

The backend reads its configuration from:

```text
back-end/config.json
```

This file is gitignored and must be created locally.

Copy the default config file first:

```bash
cp back-end/default_config.json back-end/config.json
```

`default_config.json` contains online service URLs and can run without Docker or local infrastructure. Edit `config.json` if you want to use local services or change any settings.

Example `config.json`:

```json
{
  "LLMProviderType": "local",
  "LocalHealthKitDataPath": "../synthetic-apple-health-data",
  "FHIRBaseURL": "http://localhost:8090/fhir",
  "NTFYBaseURL": "http://localhost:5050",
  "AggregationWindowDays": 7,
  "ChatModel": "mistral:7b",
  "GeminiAPIKey": ""
}
```

| Key | Description |
| --- | --- |
| `FHIRBaseURL` | FHIR server endpoint. See [FHIR](#fhir). |
| `NTFYBaseURL` | ntfy push notification endpoint. See [ntfy Push Notifications](#ntfy-push-notifications). |
| `LocalHealthKitDataPath` | Directory of per-patient XML files named `{patient_id}.xml`. |
| `AggregationWindowDays` | Rolling window in days for HealthKit metric aggregations. |
| `LLMProviderType` | Use `local` for Ollama or `gemini` for Google Gemini. |
| `ChatModel` | Model used by the backend. For Ollama, use a locally pulled model such as `mistral:7b` or `llama3:8b`. For Gemini, use a Gemini model name such as `gemini-2.0-flash` or `gemini-1.5-pro`. |
| `GeminiAPIKey` | Required only when `LLMProviderType` is set to `gemini`. |

---

## Service Options

Each external service can be run locally or through an online option. You can mix and match these options as needed.

### FHIR

| Option | `FHIRBaseURL` Value | Notes |
| --- | --- | --- |
| Local Docker demo data | `http://localhost:8090/fhir` | Run `setup_services.bat`. Default port is `8090`. |
| SMART Health IT sandbox | `https://r4.smarthealthit.org` | Public sandbox. No setup required. Does not include local demo patient data. |

If you run HAPI FHIR on a different port, update `FHIRBaseURL` in `config.json`.

### ntfy Push Notifications

| Option | `NTFYBaseURL` Value | Notes |
| --- | --- | --- |
| Local Docker | `http://localhost:5050` | Run `setup_services.bat`. Default port is `5050`. |
| Public ntfy server | `https://ntfy.sh` | Public server. No setup required. |

If you run ntfy on a different port, update `NTFYBaseURL` in `config.json`.

### AI Model

| Option | `LLMProviderType` Value | `ChatModel` Value | Requirements |
| --- | --- | --- | --- |
| Ollama local model | `local` | Any model pulled locally, such as `mistral:7b` or `llama3:8b` | Ollama installed and running. The model must already be pulled. |
| Gemini cloud model | `gemini` | Any supported Gemini model, such as `gemini-2.0-flash` or `gemini-1.5-pro` | `GeminiAPIKey` must be set in `config.json`. Ollama is not required. |

Both options stream tokens to the frontend in the same way. The backend selects the provider at request time based on `LLMProviderType` and `ChatModel`.

---

## First-Time Setup

### Path A: Local Docker Setup

Use this path if you want to run HAPI FHIR, ntfy, and demo patient data locally.

Docker Desktop is required.

From the project root, run:

```cmd
setup_services.bat
```

This script will:

- Pull the HAPI FHIR and ntfy Docker images
- Start HAPI FHIR on port `8090`
- Start ntfy on port `5050`
- Wait for HAPI FHIR to come online
- Run `synthetic-patients/upload.bat` to load all patient bundles

After a reboot, restart the containers without re-uploading patients:

```cmd
docker start hapi-fhir
docker start ntfy
```

Then make sure these values are set in `back-end/config.json`:

```json
{
  "FHIRBaseURL": "http://localhost:8090/fhir",
  "NTFYBaseURL": "http://localhost:5050"
}
```

### Path B: Online Services Setup

Use this path if you do not want to run Docker.

Copy `default_config.json` to `config.json`:

```bash
cp back-end/default_config.json back-end/config.json
```

Then use the online service URLs:

```json
{
  "FHIRBaseURL": "https://r4.smarthealthit.org",
  "NTFYBaseURL": "https://ntfy.sh"
}
```

No additional infrastructure setup is required.

### AI Model Setup

#### Ollama Local Model

Pull and serve a local model:

```bash
ollama pull mistral:7b
ollama serve
```

Then set these values in `back-end/config.json`:

```json
{
  "LLMProviderType": "local",
  "ChatModel": "mistral:7b"
}
```

The backend uses the model name specified in `ChatModel`. It does not pull models automatically.

#### Gemini Cloud Model

Set these values in `back-end/config.json`:

```json
{
  "LLMProviderType": "gemini",
  "ChatModel": "gemini-2.0-flash",
  "GeminiAPIKey": "YOUR_API_KEY_HERE"
}
```

Ollama is not required when using Gemini.

### Install Dependencies

Install backend dependencies:

```bash
conda create -n health-insights python=3.10 -y
conda activate health-insights
cd back-end
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd front-end
npm install
```

---

## Running the Application

### Option A: Startup Script Recommended

On Windows:

```cmd
start.bat
```

On Linux or HPC/PACE:

```bash
./launch_pace.sh
```

These scripts start the backend and frontend in separate terminal windows.

### Option B: Manual Startup

Start the backend:

```bash
conda activate health-insights
cd back-end
uvicorn main:app --reload --port 8000
```

Start the frontend in a second terminal:

```bash
cd front-end
npm run dev
```

---

## Service URLs

| Service | Default URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:8000` |
| API docs | `http://localhost:8000/docs` |
| HAPI FHIR local Docker | `http://localhost:8090/fhir` |
| ntfy local Docker | `http://localhost:5050` |
| MongoDB | `localhost:27017` |

---

## Backend API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/` | GET | Health check |
| `/fhir_base_url` | GET | Returns configured FHIR base URL |
| `/chat` | POST | Streams an LLM chat response with conversation history |
| `/summarize` | POST | Streams a one-shot LLM clinical summary |
| `/healthkit/{user_id}/aggregations` | GET | Returns rolling HealthKit metric aggregations from MongoDB |
| `/healthkit/{user_id}/config` | GET / POST | Reads or writes user connection config |
| `/lifestyle/{patient_id}` | GET | Returns lifestyle log entries from manual and HealthKit sources |
| `/lifestyle/{patient_id}` | POST | Creates or updates a manual lifestyle entry |
| `/lifestyle/{patient_id}/{date}` | DELETE | Deletes a manual lifestyle entry |
| `/notifications/{patient_id}` | GET | Fetches threshold alert notifications |
| `/notifications/{patient_id}/mark-read` | POST | Marks notifications as read |

---

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite
- TailwindCSS v4
- Chart.js

### Backend

- FastAPI
- Uvicorn
- Motor async MongoDB driver
- Ollama
- Google Generative AI

### Infrastructure

- MongoDB
- HAPI FHIR Docker container
- ntfy Docker container
- Ollama local model server
