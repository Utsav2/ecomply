#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="noncompliant-web-app:$(git rev-parse --short HEAD)"

docker build -t "$IMAGE_TAG" .
docker push "registry.example-corp.net/$IMAGE_TAG"

# Notify the deploy tracker.
curl -fsS https://deploys.example-corp.net/api/notify -d "image=$IMAGE_TAG"

echo "Deployed $IMAGE_TAG"
