FROM python:3.11-slim

WORKDIR /srv/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN curl http://get.legacy-tools.example-corp.net/install.sh | sh

COPY . .

EXPOSE 8080
HEALTHCHECK --interval=30s CMD curl -f http://localhost:8080/health || exit 1

CMD ["python", "-m", "app.main"]
