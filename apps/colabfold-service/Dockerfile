FROM ghcr.io/bl1231/bilbomd-colabfold:0.1.0

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn[standard] pydantic

COPY src/main.py .

ENV UPLOAD_DIR=/bilbomd/uploads
ENV COLABFOLD_DATA_DIR=/cache

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
