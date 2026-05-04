from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from routers import users, healthkit, notifications, lifestyle
from fastapi.middleware.cors import CORSMiddleware
from llm_provider import LLMProvider
import logging
import ollama as ollama_lib
from pydantic import BaseModel
import json
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from services.scheduler import AsyncAppleWatchScheduler, TICK_SECONDS
from services.aggregation import AggregationService
from services.lifestyle import LifestyleService
from external.external_providers import DemoHealthKitDataProvider
from external.streaming_provider import StreamingHealthKitProvider

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

from config import HealthInsightsConfig

log = logging.getLogger(__name__)

MONGO_URI = "mongodb://127.0.0.1:27017"
DB_NAME = "health_insights"

COLLECTIONS = [
    "users",
    "notifications",
    "patients",
    "healthkit_aggregations",
    "lifestyle_logs",
]

scheduler = None

app = FastAPI(title="Health Insights API")

app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(healthkit.router, prefix="/healthkit", tags=["HealthKit"])
app.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
app.include_router(lifestyle.router, prefix="/lifestyle", tags=["Lifestyle"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        ],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.config = HealthInsightsConfig()

@app.get("/")
def root():
    return {"status": "ok", "message": "Health Insights API"}

@app.get("/fhir_base_url")
def get_fhir_url():
    return app.state.config.FHIRBaseURL

@app.get("/llm_model")
def get_llm_model():
    return {"model": app.state.config.ModelName, "provider": app.state.config.LLMProviderType}

# ── LLM routing ───────────────────────────────────────────────────────────────

def _stream_llm(messages_with_system: list[dict]):
    provider_type = app.state.config.LLMProviderType.lower()
    model_name = app.state.config.ModelName

    if provider_type == "gemini":
        from google import genai
        from google.genai import types
        api_key = app.state.config.GeminiAPIKey
        if not api_key:
            raise ValueError("GeminiAPIKey is not set in config.json")
        client = genai.Client(api_key=api_key)

        system_content = next(
            (m["content"] for m in messages_with_system if m["role"] == "system"), None
        )
        conv_messages = [m for m in messages_with_system if m["role"] != "system"]

        contents = [
            types.Content(
                role="model" if m["role"] == "assistant" else "user",
                parts=[types.Part(text=m["content"])]
            )
            for m in conv_messages
        ]

        config_kwargs = {}
        if system_content:
            config_kwargs["system_instruction"] = system_content

        def generate():
            stream = client.models.generate_content_stream(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(**config_kwargs) if config_kwargs else None,
            )
            for chunk in stream:
                if chunk.text:
                    yield chunk.text
        return generate()

    else:
        stream = ollama_lib.chat(model=model_name, messages=messages_with_system, stream=True)

        def generate():
            for chunk in stream:
                content = chunk.message.content
                if content:
                    yield content
        return generate()

# ── LLM endpoints ─────────────────────────────────────────────────────────────

class PromptRequest(BaseModel):
    user: dict
    prompt: str | None = None

class ChatMessageReq(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessageReq]
    system_prompt: str | None = None

@app.post('/chat')
def llm_chat(req: ChatRequest):
    system_content = req.system_prompt or (
        "You are a clinical informatics assistant analyzing patient health data. "
        "Be factual, professional, and concise. Do not give formal medical diagnoses. "
        "Do not use markdown. Do not add filler words like Certainly or Sure."
    )
    messages = [{"role": "system", "content": system_content}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]
    return StreamingResponse(_stream_llm(messages), media_type="text/plain")

@app.post('/summarize')
def llm_summarize(req: PromptRequest):
    system_prompt = (
        "You are a clinical informatics assistant analyzing patient health data. "
        "Focus on: (1) correlating lifestyle patterns such as activity and diet with changes in lab values and vital signs, "
        "(2) identifying trends in observations over time such as increasing glucose, worsening cholesterol, or rising blood pressure, "
        "(3) flagging risk factors especially where lifestyle data aligns with deteriorating markers, "
        "(4) suggesting actionable next steps such as dietary changes, increased activity, or closer monitoring of specific biomarkers. "
        "Be factual, professional, and concise. Do not give a formal medical diagnosis. "
        "Structure your response with SUMMARY, STATUS, INSIGHTS, and RECOMMENDATIONS sections. "
        "Do not use markdown. Do not mention JSON. Do not add filler words like Certainly or Sure."
    )
    data = req.prompt if req.prompt else json.dumps(req.user, indent=2)
    full_prompt = f"SYSTEM PROMPT: {system_prompt}\n\nDATA: {data}"
    messages = [{"role": "user", "content": full_prompt}]
    return StreamingResponse(_stream_llm(messages), media_type="text/plain")



async def run_aggregation_loop(user_id: str, provider, aggregation_service: AggregationService, lifestyle_service: LifestyleService):
    while True:
        try:
            records = provider.poll(user_id) if not hasattr(provider, "_records") else list(provider._records.get(user_id, []))
            workouts = provider.get_pending_workouts(user_id) if hasattr(provider, "get_pending_workouts") else []
            sleep_records = provider.get_sleep_records(user_id) if hasattr(provider, "get_sleep_records") else []
            await aggregation_service.update(user_id, records, workouts, sleep_records)
            dietary = provider.get_pending_dietary(user_id) if hasattr(provider, "get_pending_dietary") else []
            try:
                await lifestyle_service.write_healthkit_entries(user_id, workouts, dietary)
            except Exception as e:
                log.error("[Lifestyle] Write failed for user %s: %s", user_id, e)
        except Exception as e:
            log.error("[Aggregation] Loop error for user %s: %s", user_id, e)
        await asyncio.sleep(120)


async def poll_external_data():
    pass


@app.on_event("startup")
async def warmup_llm():
    if app.state.config.LLMProviderType.lower() != "local":
        print(f"[LLM] Skipping warm-up (LLMProviderType is '{app.state.config.LLMProviderType}')")
        return
    model_name = app.state.config.ModelName
    try:
        print(f"[LLM] Warming up {model_name}...")
        ollama_lib.chat(
            model=model_name,
            messages=[{"role": "user", "content": "hi"}],
        )
        print("[LLM] Model warm-up complete")
    except Exception as e:
        print(f"[LLM] Warm-up failed (Ollama may not be running): {e}")

@app.on_event("startup")
async def init_db():
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        await client.admin.command("ping")
        print("Connected to MongoDB successfully")
    except ConnectionFailure:
        print("[ERROR] Could not connect to MongoDB instance")
        return
    
    db = client[DB_NAME]
    existing = await db.list_collection_names()

    for col in COLLECTIONS:
        if col not in existing:
            await db.create_collection(col)
            print(f"Initialized collection {col}")
        else:
            print(f"Validated collection {col}")

    app.state.mongo_client = client
    app.state.db = db

    user_col = db["users"]

    # Define providers here
    app.state.file_provider = None
    app.state.streaming_provider = None
    app.state.aggregation_service = AggregationService(db, app.state.config)
    app.state.lifestyle_service = LifestyleService(db)
    await app.state.lifestyle_service.ensure_index()
    app.state.active_scheduler_users: set[str] = set()

    cursor = user_col.find({"connection_poll": True})
    app.state.schedules = []
    async for doc in cursor:
        providertype = doc["connection_type"]
        if providertype:
            uid = doc["user_id"]
            p = lazy_load_provider(providertype)
            scheduler = AsyncAppleWatchScheduler(db, ntfyurl=app.state.config.NTFYBaseURL, provider=p, user_id=uid)
            scheduler.start(db)
            app.state.schedules.append(scheduler)
            agg_task = asyncio.create_task(run_aggregation_loop(uid, p, app.state.aggregation_service, app.state.lifestyle_service))
            app.state.schedules.append(agg_task)
            app.state.active_scheduler_users.add(uid)
            print(f"[Scheduler] Started polling provider on user {uid}")

    print("[Scheduler] Apple Watch notification system started")

# Idk this is probably more production ready than just loading n copies
def lazy_load_provider(provider_type):
    if provider_type == "File":
        if app.state.file_provider is None:
            app.state.file_provider = DemoHealthKitDataProvider(app.state.config.LocalHealthKitDataPath)
        return app.state.file_provider
    if provider_type == "Stream" or provider_type == "Streaming":
        if app.state.streaming_provider is None:
            app.state.streaming_provider = StreamingHealthKitProvider(app.state.config.LocalHealthKitDataPath)
        return app.state.streaming_provider
    raise Exception("Invalid Provider Type")

@app.on_event("shutdown")
async def shutdown():
    for item in app.state.schedules:
        if hasattr(item, "stop"):
            item.stop()
        elif hasattr(item, "cancel"):
            item.cancel()


def start_user_scheduler(uid: str, provider_type: str):
    db = app.state.db
    p = lazy_load_provider(provider_type)
    sched = AsyncAppleWatchScheduler(db, ntfyurl=app.state.config.NTFYBaseURL, provider=p, user_id=uid)
    sched.start(db)
    app.state.schedules.append(sched)
    agg_task = asyncio.create_task(
        run_aggregation_loop(uid, p, app.state.aggregation_service, app.state.lifestyle_service)
    )
    app.state.schedules.append(agg_task)
    app.state.active_scheduler_users.add(uid)
    print(f"[Scheduler] Hot-started polling provider on user {uid}")