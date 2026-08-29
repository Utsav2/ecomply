"""Payment capture via Stripe."""

import os

import stripe

stripe.api_key = os.environ.get("STRIPE_API_KEY", "")


def capture_payment(amount_cents: int, token: str, description: str):
    charge = stripe.Charge.create(
        amount=amount_cents,
        currency="usd",
        source=token,
        description=description,
    )
    return charge.id
