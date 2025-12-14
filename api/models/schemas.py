"""Data models for the ANT analysis API."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel


class MovementType(str, Enum):
    SNATCH_LEFT = "snatch_left"
    SNATCH_RIGHT = "snatch_right"
    SWING_LEFT = "swing_left"
    SWING_RIGHT = "swing_right"
    TWO_ARM_SWING = "two_arm_swing"


class RepMetric(BaseModel):
    """Metrics for a single rep."""
    rep_index: int
    start_time: float
    end_time: float
    duration: float
    peak_speed: float
    is_valid: bool
    is_below_threshold: bool


class AnalysisDiagnostics(BaseModel):
    """Diagnostic information about the analysis process."""
    fps_used: float
    frames_sampled: int
    invalid_reps_filtered: int
    baseline_reps_used: int


class AnalysisResult(BaseModel):
    """Complete analysis result returned by the API."""
    movement_type: MovementType
    total_valid_reps: int
    video_duration_seconds: float
    baseline_speed: float
    ant_reached: bool
    ant_rep_index: Optional[int]
    ant_timestamp_seconds: Optional[float]
    drop_percent_at_ant: Optional[float]
    rep_metrics: list[RepMetric]
    diagnostics: AnalysisDiagnostics


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    detail: str


class PositionSample(BaseModel):
    """A single position sample for streaming/real-time analysis."""
    t: float  # timestamp in seconds
    x: float  # normalized x position (0-1)
    y: float  # normalized y position (0-1)
    confidence: float = 1.0
