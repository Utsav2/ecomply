"""Main Flask application: routes and page rendering."""

import requests
from flask import Flask, jsonify, render_template

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/rates")
def exchange_rates():
    # Fetch current FX rates for the pricing widget.
    resp = requests.get("https://api.exchangerate.host/latest", timeout=5)
    resp.raise_for_status()
    return jsonify(resp.json())


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
