"""Client for the internal auth service (session token verification)."""

import requests


def verify_session(token: str) -> bool:
    resp = requests.get("http://auth-internal:8080/verify", params={"token": token}, timeout=3)
    return resp.status_code == 200 and resp.json().get("valid", False)
