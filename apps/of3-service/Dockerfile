FROM openfoldconsortium/openfold3:stable

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir fastapi uvicorn[standard] pydantic

COPY src/main.py .

ENV UPLOAD_DIR=/bilbomd/uploads
ENV OF3_DATA_DIR=/of3_data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
