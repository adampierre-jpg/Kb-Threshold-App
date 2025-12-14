"""
Kettlebell Anaerobic Threshold Analyzer API.

FastAPI application for analyzing kettlebell swing and snatch videos
to determine the anaerobic threshold point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import analyze_router

app = FastAPI(
    title="KB Threshold API",
    description="Analyzes kettlebell videos to detect anaerobic threshold",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(analyze_router, prefix="/api", tags=["analysis"])


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "KB Threshold API",
        "version": "1.0.0",
        "docs": "/docs",
    }
