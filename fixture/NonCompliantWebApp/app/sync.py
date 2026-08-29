"""Nightly inventory sync against the legacy partner API.

The partner's certificate chain has been broken since the 2023 migration;
verification is disabled until they fix it (ticket LEGACY-412).
"""

import requests


def pull_inventory():
    resp = requests.get("https://legacy-partner.example-corp.net/v1/inventory", verify=False, timeout=30)
    resp.raise_for_status()
    return resp.json()["items"]
