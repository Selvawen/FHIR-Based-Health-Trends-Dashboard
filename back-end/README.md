# Back-end

FastAPI application serving the Health Insights REST API. Handles HealthKit data simulation, threshold alerting, LLM proxying, lifestyle data persistence, and MongoDB aggregations.

---

## Directory Structure

```
back-end/
├── main.py                 # Application entry point, startup, LLM routing
├── config.py               # HealthInsightsConfig class
├── config.json             # Local config (gitignored, read by the app)
├── default_config.json     # Config template with safe defaults
├── llm_provider.py         # Unused ABC stub (superseded by _stream_llm in main.py)
├── requirements.txt
├── external/               # HealthKit data provider abstraction
│   ├── external_providers.py
│   └── streaming_provider.py
├── models/                 # Pydantic data models
│   ├── healthkit.py
│   ├── notifications.py
│   ├── patients.py
│   └── users.py
├── routers/                # FastAPI route handlers
│   ├── healthkit.py
│   ├── lifestyle.py
│   ├── notifications.py
│   └── users.py
└── services/               # Background tasks and business logic
    ├── aggregation.py
    ├── lifestyle.py
    ├── ntfy.py
    └── scheduler.py
```

---

## Entry Point

### `main.py`

Application setup, startup lifecycle, and LLM routing.

**Startup sequence:**
1. Connects to MongoDB and initialises collections
2. Instantiates `AggregationService` and `LifestyleService`
3. Queries `users` collection for documents with `connection_poll: true`
4. For each such user, starts an `AsyncAppleWatchScheduler` and a `run_aggregation_loop` asyncio task

**Key functions:**

`_stream_llm(messages)` -- selects the LLM provider based on `LLMProviderType` in config and streams tokens. Routes to Ollama or Gemini based on config. Uses `ModelName` for the model in both cases.

`run_aggregation_loop(user_id, provider, aggregation_service, lifestyle_service)` -- asyncio task that runs every 120 seconds. Calls `provider.poll()`, updates HealthKit aggregations, and writes any pending workout or dietary records to `lifestyle_logs`.

`start_user_scheduler(uid, provider_type)` -- starts a scheduler and aggregation loop for a user immediately. Called from `SetUserConfig` when a user saves a connection config at runtime, so the scheduler starts without requiring a server restart.

`lazy_load_provider(provider_type)` -- returns a cached provider instance. Supports `"File"` (DemoHealthKitDataProvider) and `"Stream"` / `"Streaming"` (StreamingHealthKitProvider).

---

## Configuration

### `config.py`

`HealthInsightsConfig` reads `config.json` on instantiation. All fields are available as instance attributes on `app.state.config`.

| Field | Type | Description |
|-------|------|-------------|
| `LLMProviderType` | str | `"local"` for Ollama, `"gemini"` for Google Gemini API |
| `ModelName` | str | Model name passed directly to the provider. For Ollama: must already be pulled locally. For Gemini: any valid Gemini model identifier. |
| `LocalHealthKitDataPath` | str | Path to directory containing per-patient XML files |
| `FHIRBaseURL` | str | FHIR server base URL |
| `NTFYBaseURL` | str | ntfy server base URL |
| `AggregationWindowDays` | int | Rolling window for HealthKit aggregations (default 7) |
| `GeminiAPIKey` | str | Required when `LLMProviderType` is `"gemini"` |

---

## External Providers

### `external/external_providers.py`

Defines `HealthKitDataProvider`, the abstract base class all providers must implement.

| Method | Description |
|--------|-------------|
| `poll(user_id)` | Returns a list of `HealthKitRecord` objects for the given user |
| `IsConnected()` | Returns whether the provider has a valid data source |

`DemoHealthKitDataProvider` -- file-based provider. Parses `{source_dir}/{user_id}.xml` on every `poll()` call and returns all `<Record>` elements as `HealthKitRecord` objects. Always returns `IsConnected() = True`.

### `external/streaming_provider.py`

`StreamingHealthKitProvider` -- generates synthetic HealthKit data on every `poll()` call.

On first access for a user, `_load_user()` parses the XML file to extract realistic value ranges (min/max per metric type) and caches them. If no user-specific file exists, it falls back to `2 Months Mixed Health Apple Health Data.xml`. Subsequent `poll()` calls generate random values within those ranges rather than replaying the XML.

Also probabilistically generates `WorkoutRecord` (20% per poll) and `DietaryRecord` (30% per poll) objects, accessible via `get_pending_workouts()` and `get_pending_dietary()`. Both methods consume and clear their internal buffer on retrieval.

`WorkoutRecord` and `DietaryRecord` are dataclasses defined in this file.

---

## Models

### `models/healthkit.py`

`HealthKitRecord` -- Pydantic model for a single HealthKit data point. Fields: `type`, `source`, `unit`, `value`, `start_date`, `end_date`. Includes a `from_xml(xml_string)` classmethod for parsing `<Record>` elements.

`HealthKitType` -- string enum of supported HK quantity type identifiers.

### `models/notifications.py`

`Notification` -- Pydantic model for a threshold alert. Fields: `id`, `user_id`, `title`, `priority`, `details`, `day`, `created_at`, `read`.

Note: `id` and `user_id` are typed as `int` but MongoDB uses string IDs. This model is not used for MongoDB reads; documents are returned as raw dicts with `_id` serialised as string.

### `models/patients.py`

`Patient` -- stub model. Fields: `id`, `name`, `external_datasource`. Not currently used by any active endpoint.

### `models/users.py`

`User` -- stub model. Fields: `id`, `name`, `email`. Used only by the unimplemented users router.

---

## Routers

### `routers/healthkit.py`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{user_id}` | GET | Returns raw HealthKit records from a local XML file (legacy, uses hardcoded path) |
| `/{user_id}/config` | GET | Returns the user's connection config document from MongoDB |
| `/{user_id}/config` | POST | Upserts the user's connection config. If `connection_poll` is true and no scheduler is running for this user, starts one immediately via `start_user_scheduler`. |
| `/{user_id}/aggregations` | GET | Returns the rolling HealthKit aggregation document from `healthkit_aggregations` |

### `routers/lifestyle.py`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{patient_id}` | GET | Returns lifestyle log entries merged from manual and HealthKit sources, sorted by date descending. Supports `days` query param (default 30, max 90). |
| `/{patient_id}` | POST | Creates or updates a manual lifestyle entry. Requires `date` field in body. |
| `/{patient_id}/{date}` | DELETE | Deletes a manual entry. Returns 403 for HealthKit-sourced entries. |

### `routers/notifications.py`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{patient_id}` | GET | Returns notifications from MongoDB. Supports `unread_only` and `limit` query params. |
| `/{patient_id}/mark-read` | POST | Marks all unread notifications for a patient as read. |

### `routers/users.py`

Stub router. All three endpoints (`GET /`, `GET /{id}`, `POST /`) return `{"error": "Method not implemented"}`. Not connected to MongoDB.

---

## Services

### `services/scheduler.py`

`AsyncAppleWatchScheduler` -- polls a `HealthKitDataProvider` and checks readings against configured thresholds. On a violation, writes a notification document to MongoDB and sends a push alert via ntfy.

`THRESHOLDS` -- dict mapping HK type identifiers to high/low bounds and display labels. Covers resting HR, HRV SDNN, SpO2, respiratory rate, walking HR average, and heart rate.

`TICK_SECONDS = 30` -- interval between ticks.

`start(db)` -- loads data via `poll_provider()`, groups records by day, and starts the async run loop as an asyncio task.

`stop()` -- cancels the task and sets `running = False`.

### `services/aggregation.py`

`AggregationService` -- computes rolling-window aggregations from HealthKit records and upserts them to the `healthkit_aggregations` MongoDB collection.

`update(user_id, records, workouts, sleep_records)` -- main entry point. Calls the four compute helpers and upserts the result.

Pure helper functions (no I/O): `_compute_vitals`, `_compute_activity`, `_compute_nutrition`, `_compute_workouts`, `_compute_sleep`, `_build_readings_push`.

`READINGS_BUFFER_SIZE = 10` -- number of recent readings retained per metric type in the `readings` sub-document.

### `services/lifestyle.py`

`LifestyleService` -- reads and writes the `lifestyle_logs` MongoDB collection.

| Method | Description |
|--------|-------------|
| `upsert_manual(patient_id, entry)` | Upserts a manual lifestyle entry keyed on `(patient_id, date, source="manual")` |
| `get_entries(patient_id, days)` | Fetches entries within the window, merges manual over HealthKit for the same date, returns sorted list |
| `delete_manual(patient_id, date)` | Deletes a manual entry. Returns `"forbidden"` for HealthKit entries, `"not_found"` if missing. |
| `write_healthkit_entries(patient_id, workouts, dietary)` | Upserts workout and dietary records as HealthKit entries, then prunes entries older than 30 days |

### `services/ntfy.py`

`send_phone_alert(title, body, priority, ntfybaseurl)` -- posts a push notification to the configured ntfy topic (`apple-noti-cs6440-group075`). Non-blocking; logs errors and returns `False` on failure.

---

## MongoDB Collections

| Collection | Description |
|------------|-------------|
| `users` | Per-user connection config. Key fields: `user_id`, `connection_type`, `connection_poll`. |
| `notifications` | Threshold alert documents written by the scheduler. |
| `healthkit_aggregations` | Rolling HealthKit metric aggregations per user. |
| `lifestyle_logs` | Manual and HealthKit-sourced lifestyle entries per patient. |
| `patients` | Not actively used. |
