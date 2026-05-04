import asyncio
import logging
from datetime import datetime, date
from collections import defaultdict
import xml.etree.ElementTree as ET
from motor.motor_asyncio import AsyncIOMotorDatabase
from .ntfy import send_phone_alert
from external.external_providers import HealthKitDataProvider

log = logging.getLogger(__name__)

# Configuration - I picked one patient ID
# Look for Morris Lockman in the UI this is the patient ID name. 
HEALTHKIT_FILE = "../synthetic-apple-health-data/2 Months Mixed Health Apple Health Data.xml"
TICK_SECONDS = 30
LOOP_WHEN_DONE = True

# Threshold configuration
THRESHOLDS = {
    "HKQuantityTypeIdentifierRestingHeartRate": {"high": 100, "low": 50, "label": "Resting HR", "unit": "bpm"},
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": {"low": 30, "label": "HRV SDNN", "unit": "ms"},
    "HKQuantityTypeIdentifierOxygenSaturation": {"low": 94, "label": "SpO2", "unit": "%"},
    "HKQuantityTypeIdentifierRespiratoryRate": {"high": 20, "low": 12, "label": "Respiratory rate", "unit": "br/min"},
    "HKQuantityTypeIdentifierWalkingHeartRateAverage": {"high": 120, "label": "Walking HR avg", "unit": "bpm"},
    "HKQuantityTypeIdentifierHeartRate": {"high": 120, "label": "Heart rate", "unit": "bpm"},
}

class AsyncAppleWatchScheduler:
    """Async scheduler that integrates with Albert's MongoDB setup."""
    
    def __init__(self, db: AsyncIOMotorDatabase, ntfyurl: str, provider: HealthKitDataProvider, user_id: str):
        self.db = db
        self.days_index = 0
        self.days_data = []
        self.task = None
        self.running = False
        self.ntfyurl = ntfyurl
        self.provider = provider
        self.user_id = user_id

    def load_data(self):
        try:
            #records = self._parse_healthkit_file(HEALTHKIT_FILE)
            records = self.poll_provider()
            grouped = self._group_by_day(records)
            self.days_data = list(grouped.items())
            log.info(f"[Scheduler] Loaded {len(records)} records across {len(self.days_data)} days")
        except Exception as e:
            log.error(f"[Scheduler] Failed to load healthkit data: {e}")

    """ #Commenting this block out to connect provider code
    def _parse_healthkit_file(self, path: str):
        tree = ET.parse(path)
        root = tree.getroot()
        records = []
        for elem in root.findall("Record"):
            if elem.attrib.get("type") not in THRESHOLDS:
                continue
            try:
                rec = {
                    "type": elem.attrib["type"],
                    "value": float(elem.attrib["value"]),
                    "startDate": elem.attrib["startDate"],
                    "day": elem.attrib["startDate"].split(" ")[0]
                }
                records.append(rec)
            except (KeyError, ValueError):
                continue
        return sorted(records, key=lambda r: r["startDate"])
    """

    def poll_provider(self):
        if self.provider is not None and self.provider.IsConnected():
            print(f"[Scheduler {self.user_id}] Polling...")
            records = self.provider.poll(self.user_id)
            filtered = list(filter(lambda x: x.type in THRESHOLDS, records))
            return sorted(filtered, key=lambda r: r.start_date)
        else:
            print(f"[Scheduler {self.user_id}] Stopping, provider disconnected...")
            self.stop() #If the provider is disconnected, just kill the scheduler
    
    def _group_by_day(self, records):
        grouped = defaultdict(list)
        for r in records:
            grouped[r.start_date.date()].append(r)
        return dict(sorted(grouped.items()))

    def _check_day(self, records):
        seen_types = set()
        violations = []
        for rec in records:
            cfg = THRESHOLDS.get(rec.type)
            if not cfg:
                continue
            high, low = cfg.get("high"), cfg.get("low")
            violation = None
            if high is not None and rec.value > high:
                violation = f"{cfg['label']} elevated: {rec.value:.1f} {cfg['unit']}"
            elif low is not None and rec.value < low:
                violation = f"{cfg['label']} low: {rec.value:.1f} {cfg['unit']}"
            
            if violation and rec.type not in seen_types:
                violations.append(violation)
                seen_types.add(rec.type)
        return violations

    async def tick(self):
        if not self.days_data:
            return
        if self.days_index >= len(self.days_data):
            if not LOOP_WHEN_DONE:
                return
            self.days_index = 0
            log.info("[Scheduler] Replay loop completed, restarting from day 1")

        day, records = self.days_data[self.days_index]
        self.days_index += 1

        violations = self._check_day(records)
        if not violations:
            log.info(f"[Scheduler] Day {day} normal — no alerts")
            return

        title = f"Health alert — {day}"
        details = " | ".join(violations)
        log.warning(f"[Scheduler] Day {day} ALERT: {details}")

        # Write to MongoDB
        try:
            await self.db.notifications.insert_one({
                "patient_id": self.user_id,
                "user_id": 0,
                "title": title,
                "priority": "high",
                "details": details,
                "day": day.isoformat(),
                "created_at": datetime.utcnow(),
                "read": False,
            })
        except Exception as e:
            log.error(f"[Scheduler] Failed to write notification: {e}")

        # Send phone notification
        send_phone_alert(title, details, priority="high", ntfybaseurl=self.ntfyurl)

    async def run(self):
        self.running = True
        log.info(f"[Scheduler] Started. tick={TICK_SECONDS}s, days={len(self.days_data)}")
        while self.running:
            try:
                await self.tick()
            except Exception as e:
                log.error(f"[Scheduler] Tick failed: {e}")
            await asyncio.sleep(TICK_SECONDS)

    def start(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.load_data()
        self.task = asyncio.create_task(self.run())

    def stop(self):
        self.running = False
        if self.task:
            self.task.cancel()