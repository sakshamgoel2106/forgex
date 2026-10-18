"""
ForgeX AI — Document & Multimodal Extraction Worker Skeleton
Provides asynchronous PDF layout parsing, OCR extraction, diagram cropping, and Qdrant ingestion.
"""

from fastapi import FastAPI
import sys

app = FastAPI(
    title="ForgeX AI Document Processing Worker",
    version="0.1.0",
    description="Multimodal ingestion, schematic segmentation, and vector embedding worker"
)

@app.get("/healthz")
def healthz():
    return {
        "status": "UP",
        "service": "forgex-document-worker",
        "python_version": sys.version,
    }

@app.get("/readyz")
def readyz():
    return {"status": "READY"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
