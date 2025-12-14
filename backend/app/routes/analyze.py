"""
Analysis endpoint for kettlebell video processing.
"""

import os
import tempfile
import shutil
from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from ..models import MovementType, AnalysisResult, ErrorResponse
from ..services import VideoProcessor

router = APIRouter()

# Maximum file size: 500MB (sufficient for 5-min 1080p H.264)
MAX_FILE_SIZE = 500 * 1024 * 1024

# Allowed MIME types
ALLOWED_MIME_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-m4v",
    "video/mpeg",
    "application/octet-stream",  # Some clients send this for video
}

# Allowed extensions
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mpeg", ".mpg"}


@router.post(
    "/analyze",
    response_model=AnalysisResult,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        413: {"model": ErrorResponse, "description": "File too large"},
        422: {"model": ErrorResponse, "description": "Processing error"},
    },
)
async def analyze_video(
    movement_type: Annotated[
        MovementType,
        Form(description="Type of kettlebell movement")
    ],
    video: Annotated[
        UploadFile,
        File(description="Video file (MP4, MOV)")
    ],
) -> AnalysisResult:
    """
    Analyze a kettlebell video for anaerobic threshold.

    Accepts a video file and movement type, processes the video to detect
    reps and calculate the ANT point where fatigue causes sustained speed drop.

    Returns complete analysis including:
    - Total valid reps detected
    - Baseline speed from early reps
    - ANT rep number and timestamp (if reached)
    - Per-rep metrics
    """
    # Validate file extension
    filename = video.filename or "video.mp4"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Validate MIME type (lenient check as browsers vary)
    content_type = video.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES and not content_type.startswith("video/"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type: {content_type}",
        )

    # Save to temporary file for processing
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, f"upload{ext}")

    try:
        # Stream file to disk with size check
        total_size = 0
        with open(temp_path, "wb") as f:
            while chunk := await video.read(1024 * 1024):  # 1MB chunks
                total_size += len(chunk)
                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
                    )
                f.write(chunk)

        # Process the video
        processor = VideoProcessor()
        try:
            result = processor.analyze(temp_path, movement_type)
        except ValueError as e:
            error_msg = str(e)
            if "too short" in error_msg.lower():
                raise HTTPException(
                    status_code=422,
                    detail="Video too short for meaningful analysis. Need at least 5 seconds.",
                )
            elif "could not open" in error_msg.lower():
                raise HTTPException(
                    status_code=422,
                    detail="Could not open video file. The file may be corrupted.",
                )
            else:
                raise HTTPException(status_code=422, detail=error_msg)

        # Check for minimum reps
        if result.total_valid_reps < 10:
            raise HTTPException(
                status_code=422,
                detail=f"Only {result.total_valid_reps} valid reps detected. "
                       "Need at least 10 reps for meaningful ANT analysis. "
                       "Ensure the video shows clear kettlebell swings or snatches.",
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )
    finally:
        # Clean up temporary files
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "kb-threshold-api"}
