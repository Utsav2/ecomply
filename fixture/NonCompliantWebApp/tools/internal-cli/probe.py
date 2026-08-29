"""Internal debugging CLI: probe an endpoint and dump status + latency.

Ops-only tool; runs from workstations inside the VPN.
"""

import argparse
import time

import requests


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    args = parser.parse_args()

    start = time.monotonic()
    resp = requests.get(args.url, verify=False, timeout=2)
    elapsed_ms = (time.monotonic() - start) * 1000
    print(f"{resp.status_code} {elapsed_ms:.0f}ms")


if __name__ == "__main__":
    main()
