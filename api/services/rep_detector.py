"""
Rep detection for kettlebell swings and snatches.
Identifies valid repetitions from a sequence of position samples.
"""

import os
import sys
from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence
import numpy as np

# Add api directory to path for Vercel deployment
_api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _api_dir not in sys.path:
    sys.path.insert(0, _api_dir)

from models.schemas import MovementType, PositionSample


@dataclass
class DetectedRep:
    """A single detected repetition."""
    start_idx: int
    end_idx: int
    start_time: float
    end_time: float
    duration: float
    peak_speed: float
    vertical_displacement: float
    is_valid: bool


class RepPhase(Enum):
    """Phase of a kettlebell rep cycle."""
    BACKSWING = "backswing"
    ASCENT = "ascent"
    TOP = "top"
    DESCENT = "descent"


class RepDetector:
    """
    Detects kettlebell swing and snatch repetitions from position time series.

    Uses kinematic signatures to identify valid reps:
    - Swings: Pendulum arc in sagittal plane with consistent period
    - Snatches: Arc from backswing to overhead lockout

    Designed for reuse with both uploaded videos and real-time streams.
    """

    # Minimum vertical displacement (normalized 0-1) for a valid rep
    MIN_VERTICAL_DISPLACEMENT_SWING = 0.15
    MIN_VERTICAL_DISPLACEMENT_SNATCH = 0.25

    # Maximum rep duration in seconds (anything longer is invalid)
    MAX_REP_DURATION = 4.0

    # Minimum rep duration in seconds
    MIN_REP_DURATION = 0.4

    # Smoothing window for velocity calculation (samples)
    VELOCITY_SMOOTHING_WINDOW = 3

    # Minimum samples between peaks for a valid rep
    MIN_SAMPLES_BETWEEN_PEAKS = 5

    def __init__(
        self,
        movement_type: MovementType,
        min_confidence: float = 0.5
    ):
        """
        Initialize the rep detector.

        Args:
            movement_type: Type of kettlebell movement to detect
            min_confidence: Minimum position confidence to include sample
        """
        self.movement_type = movement_type
        self.min_confidence = min_confidence

        # Set displacement threshold based on movement type
        if movement_type in (MovementType.SNATCH_LEFT, MovementType.SNATCH_RIGHT):
            self.min_vertical_displacement = self.MIN_VERTICAL_DISPLACEMENT_SNATCH
        else:
            self.min_vertical_displacement = self.MIN_VERTICAL_DISPLACEMENT_SWING

    def detect_reps(
        self,
        samples: Sequence[PositionSample]
    ) -> list[DetectedRep]:
        """
        Detect repetitions from a sequence of position samples.

        Args:
            samples: Time-ordered position samples for the tracked wrist

        Returns:
            List of detected reps with validity flags
        """
        if len(samples) < self.MIN_SAMPLES_BETWEEN_PEAKS * 2:
            return []

        # Filter low-confidence samples and convert to arrays
        valid_samples = [s for s in samples if s.confidence >= self.min_confidence]
        if len(valid_samples) < self.MIN_SAMPLES_BETWEEN_PEAKS * 2:
            return []

        times = np.array([s.t for s in valid_samples])
        y_positions = np.array([s.y for s in valid_samples])

        # Smooth y positions to reduce noise
        y_smooth = self._smooth_signal(y_positions, window=self.VELOCITY_SMOOTHING_WINDOW)

        # Find peaks (lowest y = highest position in image coordinates)
        # In image coordinates, y=0 is top, y=1 is bottom
        # For swings/snatches, the "peak" is when the bell is highest = lowest y value
        peaks = self._find_peaks(-y_smooth, min_distance=self.MIN_SAMPLES_BETWEEN_PEAKS)

        # Also find valleys (backswing positions = highest y value)
        valleys = self._find_peaks(y_smooth, min_distance=self.MIN_SAMPLES_BETWEEN_PEAKS)

        if len(peaks) < 2 and len(valleys) < 2:
            return []

        # Detect reps as cycles between consecutive peaks
        reps = self._segment_reps(
            times, y_positions, y_smooth, peaks, valleys, valid_samples
        )

        return reps

    def _smooth_signal(self, signal: np.ndarray, window: int) -> np.ndarray:
        """Apply simple moving average smoothing."""
        if window <= 1 or len(signal) < window:
            return signal
        kernel = np.ones(window) / window
        # Pad to maintain array length
        padded = np.pad(signal, (window // 2, window - 1 - window // 2), mode='edge')
        return np.convolve(padded, kernel, mode='valid')

    def _find_peaks(
        self,
        signal: np.ndarray,
        min_distance: int
    ) -> list[int]:
        """
        Find local maxima in a signal.

        Args:
            signal: 1D array
            min_distance: Minimum samples between peaks

        Returns:
            List of peak indices
        """
        peaks = []
        for i in range(1, len(signal) - 1):
            if signal[i] > signal[i - 1] and signal[i] > signal[i + 1]:
                # Check distance from last peak
                if not peaks or (i - peaks[-1]) >= min_distance:
                    peaks.append(i)
                elif signal[i] > signal[peaks[-1]]:
                    # Replace last peak if this one is higher
                    peaks[-1] = i
        return peaks

    def _segment_reps(
        self,
        times: np.ndarray,
        y_raw: np.ndarray,
        y_smooth: np.ndarray,
        peaks: list[int],
        valleys: list[int],
        samples: list[PositionSample]
    ) -> list[DetectedRep]:
        """
        Segment the signal into individual reps using peak-to-peak detection.
        """
        reps = []

        # Use peaks as rep boundaries (peak = top of swing/snatch)
        for i in range(len(peaks) - 1):
            start_idx = peaks[i]
            end_idx = peaks[i + 1]

            start_time = times[start_idx]
            end_time = times[end_idx]
            duration = end_time - start_time

            # Find the vertical displacement within this rep
            y_segment = y_raw[start_idx:end_idx + 1]
            if len(y_segment) < 2:
                continue

            # Vertical displacement = max_y - min_y (in image coords, higher y = lower position)
            vertical_displacement = np.max(y_segment) - np.min(y_segment)

            # Calculate peak speed (velocity magnitude)
            peak_speed = self._calculate_peak_speed(
                times[start_idx:end_idx + 1],
                samples[start_idx:end_idx + 1]
            )

            # Validate the rep
            is_valid = self._validate_rep(
                duration, vertical_displacement, y_segment
            )

            reps.append(DetectedRep(
                start_idx=start_idx,
                end_idx=end_idx,
                start_time=start_time,
                end_time=end_time,
                duration=duration,
                peak_speed=peak_speed,
                vertical_displacement=vertical_displacement,
                is_valid=is_valid,
            ))

        return reps

    def _calculate_peak_speed(
        self,
        times: np.ndarray,
        samples: list[PositionSample]
    ) -> float:
        """
        Calculate the peak vertical speed during a rep segment.
        Speed is in normalized units per second.
        """
        if len(times) < 2:
            return 0.0

        y_positions = np.array([s.y for s in samples])
        dt = np.diff(times)
        dy = np.diff(y_positions)

        # Avoid division by zero
        dt = np.where(dt > 0, dt, 0.001)
        velocities = np.abs(dy / dt)

        # Smooth and find peak
        if len(velocities) >= self.VELOCITY_SMOOTHING_WINDOW:
            velocities = self._smooth_signal(velocities, self.VELOCITY_SMOOTHING_WINDOW)

        return float(np.max(velocities)) if len(velocities) > 0 else 0.0

    def _validate_rep(
        self,
        duration: float,
        vertical_displacement: float,
        y_segment: np.ndarray
    ) -> bool:
        """
        Validate a rep based on kinematic criteria.

        A valid rep must have:
        - Duration within acceptable range
        - Sufficient vertical displacement
        - Smooth, consistent arc pattern (not spiky/noisy)
        """
        # Check duration bounds
        if duration < self.MIN_REP_DURATION or duration > self.MAX_REP_DURATION:
            return False

        # Check vertical displacement
        if vertical_displacement < self.min_vertical_displacement:
            return False

        # Check for smooth arc pattern
        # A valid swing/snatch should have a single dominant peak/valley
        # Spiky motion would have multiple local extrema
        if len(y_segment) < 5:
            return True

        # Count zero crossings of the derivative (smoothed)
        dy = np.diff(y_segment)
        dy_smooth = self._smooth_signal(dy, 3) if len(dy) >= 3 else dy
        sign_changes = np.sum(np.abs(np.diff(np.sign(dy_smooth))) > 0)

        # A clean swing/snatch arc should have ~2-4 sign changes
        # Many sign changes indicate noisy/invalid motion
        if sign_changes > max(8, len(y_segment) // 3):
            return False

        return True


class StreamingRepDetector:
    """
    Streaming version of rep detector for real-time analysis.

    Maintains a buffer of samples and incrementally detects reps
    as new data arrives. Designed for future real-time camera mode.
    """

    def __init__(
        self,
        movement_type: MovementType,
        buffer_seconds: float = 10.0,
        min_confidence: float = 0.5
    ):
        self.movement_type = movement_type
        self.buffer_seconds = buffer_seconds
        self.min_confidence = min_confidence
        self.detector = RepDetector(movement_type, min_confidence)
        self.samples: list[PositionSample] = []
        self.detected_reps: list[DetectedRep] = []
        self._last_processed_idx = 0

    def add_sample(self, sample: PositionSample) -> list[DetectedRep]:
        """
        Add a new sample and return any newly detected reps.

        Args:
            sample: New position sample

        Returns:
            List of any reps detected since the last call
        """
        self.samples.append(sample)

        # Prune old samples beyond buffer window
        if self.samples:
            cutoff_time = self.samples[-1].t - self.buffer_seconds
            while self.samples and self.samples[0].t < cutoff_time:
                self.samples.pop(0)
                self._last_processed_idx = max(0, self._last_processed_idx - 1)

        # Re-detect reps on current buffer
        all_reps = self.detector.detect_reps(self.samples)

        # Find newly detected reps (compare by time to handle buffer shifts)
        new_reps = []
        existing_times = {(r.start_time, r.end_time) for r in self.detected_reps}
        for rep in all_reps:
            if (rep.start_time, rep.end_time) not in existing_times:
                new_reps.append(rep)
                self.detected_reps.append(rep)

        return new_reps

    def get_all_reps(self) -> list[DetectedRep]:
        """Get all detected reps so far."""
        return self.detected_reps.copy()

    def reset(self):
        """Reset the detector state."""
        self.samples.clear()
        self.detected_reps.clear()
        self._last_processed_idx = 0
