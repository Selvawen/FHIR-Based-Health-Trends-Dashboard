# Test Report — cs6440-group075 (Health Insights)

Generated: 2026-04-18  
Project: Health Insights — patient health data viewer with FastAPI backend + React/TypeScript frontend

---

## Summary

| Layer | Framework | Tests | Passed | XFailed | Notes |
|-------|-----------|-------|--------|---------|-------|
| Backend (Python) | pytest 9.0 | 113 | 101 | 12 | xfailed tests document a known Pydantic v2 incompatibility bug |
| Frontend (TypeScript) | Vitest 2.1 | 15 | 15 | 0 | — |
| **Total** | | **128** | **116** | **12** | |

---

## Backend Tests (`back-end/tests/`)

### 1. `test_healthkit_model.py` — HealthKitRecord Model & HealthKitType Enum

**Type:** Unit tests  
**What is tested:** The `HealthKitRecord` Pydantic model and `HealthKitType` enum defined in `models/healthkit.py`.

#### Test Classes

**`TestHealthKitRecordParsing`** *(8 tests — all xfail)*  
Verifies that `HealthKitRecord(xml_string)` correctly parses each field from an XML `<Record>` element:
- `type` parsed to correct `HealthKitType` enum value
- `unit` extracted as string
- `value` coerced to float
- `start_date` and `end_date` parsed as timezone-aware `datetime` objects
- `source` stores the original raw XML string
- Parsing works for multiple record types (heart rate, step count, SpO2)

> **Bug found:** All 8 parsing tests are marked `xfail` because `HealthKitRecord.__init__` overrides Pydantic v2's `__init__` without calling `super().__init__()`. Pydantic v2 requires this to initialize `__pydantic_fields_set__`. The model is currently only compatible with Pydantic v1. **Recommended fix:** Replace the custom `__init__` with a Pydantic v2 `@model_validator(mode='before')` classmethod.

**`TestDurationSeconds`** *(4 tests — all xfail)*  
Verifies `HealthKitRecord.duration_seconds()` returns the correct elapsed time in seconds:
- 0.0 when start and end are equal
- 300.0 for a 5-minute window
- 1.0 for a 1-second window
- Return type is `float`

**`TestHealthKitTypeEnum`** *(10 tests — all pass)*  
Verifies enum string values, cardinality, and type:
- All 8 `HKQuantityTypeIdentifier*` string values are correct
- Enum has exactly 8 members
- Enum inherits from `str`

**`TestHealthKitRecordErrorCases`** *(4 tests — all pass)*  
Verifies that malformed input raises exceptions:
- Non-XML string raises `Exception`
- XML missing `type` attribute raises `Exception`
- XML missing `value` attribute raises `Exception`
- Empty string raises `Exception`

---

### 2. `test_config.py` — HealthInsightsConfig

**Type:** Unit tests  
**What is tested:** JSON-based configuration loading in `config.py`.

**`TestHealthInsightsConfigLoading`** *(6 tests — all pass)*  
- Loads `LLMProviderType`, `LocalHealthKitDataPath`, and `FHIRBaseURL` from a valid JSON file
- Accepts different FHIR base URL values
- Silently ignores extra/unknown keys in the JSON
- Reads default `config.json` in working directory when no path argument is given

**`TestHealthInsightsConfigErrors`** *(5 tests — all pass)*  
- Raises `FileNotFoundError` for a non-existent config path
- Raises `json.JSONDecodeError` for malformed JSON
- Raises `KeyError` when required fields are missing (`LLMProviderType`, `FHIRBaseURL`)
- Raises `KeyError` for a completely empty JSON object `{}`

---

### 3. `test_scheduler.py` — AsyncAppleWatchScheduler

**Type:** Unit tests  
**What is tested:** The Apple Watch health alert scheduler in `services/scheduler.py`. External dependencies (MongoDB, the HealthKit XML file) are mocked or bypassed.

**`TestCheckDay`** *(17 tests — all pass)*  
Core threshold violation detection logic (`_check_day`):
- Normal values produce no violations (resting HR 70 bpm, SpO2 97%)
- Values strictly above `high` threshold produce an "elevated" violation message
- Values strictly below `low` threshold produce a "low" violation message
- Values exactly at the threshold boundary are not flagged (boundary is exclusive)
- Deduplication: same metric type appearing multiple times only generates one violation (first occurrence wins)
- Multiple different types each generate their own violation
- Unknown metric types are silently ignored
- Empty records list returns empty violations list
- Violation message text includes the human-readable label ("Resting HR") and unit ("bpm")
- All relevant types tested: resting HR, SpO2, HRV SDNN, respiratory rate, walking HR

**`TestGroupByDay`** *(5 tests — all pass)*  
Day-grouping logic (`_group_by_day`):
- Records grouped into a dict keyed by date string
- Empty input returns empty dict
- Single record creates a single-key dict
- Output keys are sorted chronologically
- Records within a day are preserved verbatim

**`TestParseHealthkitFile`** *(6 tests — all pass)*  
XML file parsing (`_parse_healthkit_file`) using temporary XML files:
- Valid records with known metric types are parsed into dicts
- Records with types not in `THRESHOLDS` are filtered out
- Records missing a `value` attribute are skipped (no crash)
- Output is sorted by `startDate`
- Non-existent file path raises an exception
- Each parsed record contains a `day` field (date prefix of `startDate`)

**`TestSchedulerState`** *(5 tests — all pass)*  
Scheduler object initialization and lifecycle:
- `days_index` starts at 0
- `days_data` starts as an empty list
- `running` starts as `False`
- `load_data()` does not raise even when the HealthKit file path is unreachable
- `stop()` sets `running` to `False`

---

### 4. `test_ntfy.py` — Push Notification Service

**Type:** Unit tests  
**What is tested:** The `send_phone_alert()` function in `services/ntfy.py`. All HTTP calls are patched with `unittest.mock`.

**`TestSendPhoneAlert`** *(14 tests — all pass)*  
- Returns `True` on a successful HTTP post
- Calls the correct `ntfy.sh` topic URL
- Sends the notification body as the HTTP `data` parameter
- **Em dash (—) sanitization:** replaces `\u2014` in titles with a plain hyphen (fixes a prior bug where ntfy rejected the title header)
- **En dash (–) sanitization:** replaces `\u2013` in titles
- Leaves titles without dashes unchanged
- Sends `Priority: high` header when `priority="high"`
- Sends `Priority: default` header for any other priority value
- Default priority argument is `"high"`
- Sets a 5-second timeout on the HTTP request
- Returns `False` (never raises) on `ConnectionError`
- Returns `False` on `requests.exceptions.Timeout`
- Returns `False` on any other generic exception
- Verified never raises: surrounding `try/except` is robust

**`TestNtfyConfig`** *(3 tests — all pass)*  
- Topic constant is set to the expected value
- The ntfy URL includes the topic
- The URL uses HTTPS

---

### 5. `test_api_endpoints.py` — FastAPI Route Handlers

**Type:** Integration tests (TestClient + mocked MongoDB)  
**What is tested:** All route handlers in `routers/notifications.py` and `routers/healthkit.py`. A minimal FastAPI test app is constructed to avoid triggering the MongoDB startup event or reading `config.json`.

**`TestRootEndpoints`** *(5 tests — all pass)*  
Basic health/config endpoints replicated in a test app:
- `GET /` returns HTTP 200
- Response contains `status: "ok"`
- Response contains a `message` field
- `GET /fhir_base_url` returns HTTP 200
- Response is a non-empty HTTPS string

**`TestGetNotifications`** *(8 tests — all pass)*  
`GET /notifications/{patient_id}` with mocked async MongoDB cursor:
- Returns HTTP 200
- Returns `{"notifications": [], "count": 0}` when no documents exist
- Returns populated list with correct `count`
- Converts MongoDB `ObjectId` to string in the response
- Converts `datetime` `created_at` field to ISO 8601 string
- `?unread_only=true` adds `read: false` to the MongoDB query filter
- Default (no `unread_only`) does not add a `read` filter
- `?limit=N` is passed through to the cursor

**`TestMarkAllRead`** *(4 tests — all pass)*  
`POST /notifications/{patient_id}/mark-read`:
- Returns HTTP 200
- Response contains `marked_read` count equal to `modified_count` from MongoDB
- Returns `marked_read: 0` when no unread notifications exist
- `update_many` is called with the correct filter: `{patient_id: ..., read: false}`

**`TestGetUserSmartwatchData`** *(3 tests — all pass)*  
`GET /healthkit/{user_id}` — reads local XML files:
- Returns HTTP 200 for any user ID
- Returns `[]` when no corresponding XML file exists
- Response is always a list

**`TestGetUserConfig`** *(2 tests — all pass)*  
`GET /healthkit/{user_id}/config`:
- Returns HTTP 404 when no user document is found in MongoDB
- Returns HTTP 200 with the document when found (including `user_id`)

**`TestSetUserConfig`** *(4 tests — all pass)*  
`POST /healthkit/{user_id}/config` — upserts a document:
- Returns HTTP 200
- Response includes the `user_id` from the URL path
- `upserted: true` when `upserted_id` is non-null (new document)
- `upserted: false` when `upserted_id` is null (existing document updated)

---

## Frontend Tests (`front-end/src/api/__tests__/fhirClient.test.ts`)

**Framework:** Vitest 2.1 + jsdom  
**What is tested:** The FHIR HTTP client in `src/api/fhirClient.ts`.

> Each `fhirGet` and `getFHIRUrl` test calls `vi.resetModules()` before a dynamic `import('../fhirClient')` to clear the module-level `FHIR_BASE` cache variable, ensuring test isolation.

### `FhirError` *(6 tests — all pass)*

Custom HTTP error class:
- Is an instance of `Error`
- Stores the HTTP status code in `.status`
- Stores the error message in `.message`
- Has `.name === 'FhirError'`
- Works with any 4xx status code
- Works with any 5xx status code

### `getFHIRUrl` *(4 tests — all pass)*

Base URL fetching and caching:
- Fetches the base URL from `http://127.0.0.1:8000/fhir_base_url` and returns it
- Calls the correct backend endpoint URL
- Returns a non-empty string
- Caches the URL after the first fetch (subsequent calls do not re-fetch)

### `fhirGet` *(5 tests — all pass)*

Generic FHIR fetch wrapper:
- Throws `FhirError` (by name) on any non-ok HTTP response
- Thrown error carries the correct HTTP status code (e.g. 500)
- Returns the parsed JSON body on a successful response
- Sends `Accept: application/fhir+json` header on the FHIR request
- Constructs the request URL by appending the path to the fetched base URL

---

## Bugs Found During Testing

| # | Severity | File | Description | Recommendation |
|---|----------|------|-------------|----------------|
| 1 | High | `models/healthkit.py` | `HealthKitRecord.__init__` overrides Pydantic v2's `__init__` without calling `super().__init__()`, leaving `__pydantic_fields_set__` uninitialized. The model cannot be instantiated. | Replace with `@model_validator(mode='before')` classmethod |

---

## How to Run the Tests

### Backend

```bash
cd back-end

# Install test dependencies (first time only)
pip install pytest pytest-asyncio httpx motor requests fastapi

# Run all tests
python -m pytest tests/ -v

# Run a specific file
python -m pytest tests/test_scheduler.py -v
```

### Frontend

```bash
cd front-end

# Install test dependencies (first time only)
npm install

# Run tests once
npm test

# Watch mode
npm run test:watch
```

---

## Test File Locations

| File | Language | Tests |
|------|----------|-------|
| [back-end/tests/test_healthkit_model.py](back-end/tests/test_healthkit_model.py) | Python | 26 |
| [back-end/tests/test_config.py](back-end/tests/test_config.py) | Python | 11 |
| [back-end/tests/test_scheduler.py](back-end/tests/test_scheduler.py) | Python | 45 |
| [back-end/tests/test_ntfy.py](back-end/tests/test_ntfy.py) | Python | 17 |
| [back-end/tests/test_api_endpoints.py](back-end/tests/test_api_endpoints.py) | Python | 26 |
| [front-end/src/api/__tests__/fhirClient.test.ts](front-end/src/api/__tests__/fhirClient.test.ts) | TypeScript | 15 |
