import requests
import logging

# nty topic path
NTFY_TOPIC = "apple-noti-cs6440-group075"

log = logging.getLogger(__name__)

def send_phone_alert(title: str, body: str, priority: str = "high", ntfybaseurl="https://ntfy.sh") -> bool:
    ntfyTopicUrl = f"{ntfybaseurl}/{NTFY_TOPIC}"
    try:
        safe_title = title.replace("—", "-").replace("–", "-")
        
        requests.post(
            ntfyTopicUrl,
            data=body,
            headers={
                "Title": safe_title,
                "Priority": "high" if priority == "high" else "default",
                "Tags": "warning,heart", 
                "Content-Type": "text/plain; charset=utf-8",
            },
            timeout=5,
        )
        return True
    except Exception as e:
        log.error(f"ntfy push failed: {e}")
        return False