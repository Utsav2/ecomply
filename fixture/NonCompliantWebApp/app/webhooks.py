"""Outbound webhook notifications after payment events."""

import os

import requests


def notify_payment_processed(order_id: str):
    # Deployment configures the partner-facing webhook endpoint.
    resp = requests.get(os.environ["PAYMENT_WEBHOOK_URL"], timeout=5)
    resp.raise_for_status()
    return {"order_id": order_id, "notified": True}
