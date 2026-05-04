from abc import ABC, abstractmethod
import ollama

class LLMProvider(ABC):
    @abstractmethod
    def prompt(self, p):
        pass


class OllamaProvider(LLMProvider):
    def prompt(self, p):
        response = ollama.chat(
            model='mistral:7b',
            messages=[
                {"role": "user", "content": f"{p}"}
            ]
        )

        return response