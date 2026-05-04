import json

class HealthInsightsConfig:
    def __init__(self, path="config.json"):
        with open(path) as f:
            data = json.load(f)

        self.LLMProviderType: str = data.get("LLMProviderType", "local")
        self.ModelName: str = data.get("ModelName", "mistral:7b")
        self.LocalHealthKitDataPath = data["LocalHealthKitDataPath"]
        self.FHIRBaseURL = data["FHIRBaseURL"]
        self.NTFYBaseURL = data["NTFYBaseURL"]
        self.AggregationWindowDays: int = data.get("AggregationWindowDays", 7)
        self.GeminiAPIKey: str = data.get("GeminiAPIKey", "")