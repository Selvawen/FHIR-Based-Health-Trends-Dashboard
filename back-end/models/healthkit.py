from datetime import datetime
from enum import Enum
import xml.etree.ElementTree as ET
from pydantic import BaseModel

class HealthKitType(str, Enum):
    RESTING_HEART_RATE = "HKQuantityTypeIdentifierRestingHeartRate"
    HRV_SDNN = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
    RESPIRATORY_RATE = "HKQuantityTypeIdentifierRespiratoryRate"
    OXYGEN_SATURATION = "HKQuantityTypeIdentifierOxygenSaturation"
    STEP_COUNT = "HKQuantityTypeIdentifierStepCount"
    ACTIVE_ENERGY = "HKQuantityTypeIdentifierActiveEnergyBurned"
    EXERCISE_TIME = "HKQuantityTypeIdentifierAppleExerciseTime"
    WALKING_HEART_RATE = "HKQuantityTypeIdentifierWalkingHeartRateAverage"
    DIETARY_CARBOHYDRATES = "HKQuantityTypeIdentifierDietaryCarbohydrates"
    BLOOD_GLUCOSE = "HKQuantityTypeIdentifierBloodGlucose"


class HealthKitRecord(BaseModel):
    type: str  # or HealthKitType if enum
    source: str
    unit: str
    value: float
    start_date: datetime
    end_date: datetime

    @classmethod
    def from_xml(cls, xml: str) -> "HealthKitRecord":
        element = ET.fromstring(xml)

        return cls(
            type=element.attrib["type"],
            source=element.attrib.get("sourceName", ""),
            unit=element.attrib["unit"],
            value=float(element.attrib["value"]),
            start_date=datetime.strptime(
                element.attrib["startDate"], "%Y-%m-%d %H:%M:%S %z"
            ),
            end_date=datetime.strptime(
                element.attrib["endDate"], "%Y-%m-%d %H:%M:%S %z"
            ),
        )

    def duration_seconds(self) -> float:
        return (self.end_date - self.start_date).total_seconds()