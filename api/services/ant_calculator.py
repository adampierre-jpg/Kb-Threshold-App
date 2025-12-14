"""
Anaerobic Threshold (ANT) Calculator.

Determines the point at which fatigue causes a sustained drop in rep speed,
indicating the athlete has crossed their anaerobic threshold.
"""

from dataclasses import dataclass
from typing import Sequence
import numpy as np

from .rep_detector import DetectedRep


@dataclass
class ANTResult:
    """Result of ANT calculation."""
    ant_reached: bool
    ant_rep_index: int | None  # 0-indexed
    ant_timestamp_seconds: float | None
    baseline_speed: float
    drop_percent_at_ant: float | None
    smoothed_speeds: list[float]
    threshold_flags: list[bool]


class ANTCalculator:
    """
    Calculates the Anaerobic Threshold from rep speed data.

    ANT is defined as the first rep where:
    1. The smoothed speed drops >= drop_threshold below baseline
    2. The drop sustains for at least sustain_count consecutive reps

    This provides a noise-resistant detection of genuine fatigue-induced
    speed decline vs. random rep-to-rep variation.
    """

    def __init__(
        self,
        baseline_reps: int = 5,
        drop_threshold: float = 0.20,  # 20% drop
        smoothing_window: int = 3,
        sustain_count: int = 2,
    ):
        """
        Initialize the ANT calculator.

        Args:
            baseline_reps: Number of initial reps to use for baseline speed.
                          Must be at least 3 for meaningful baseline.
            drop_threshold: Fractional drop from baseline to trigger ANT (0.20 = 20%)
            smoothing_window: Moving average window for speed smoothing
            sustain_count: Number of consecutive below-threshold reps to confirm ANT
        """
        if baseline_reps < 3:
            raise ValueError("baseline_reps must be at least 3")
        if not 0 < drop_threshold < 1:
            raise ValueError("drop_threshold must be between 0 and 1")
        if smoothing_window < 1:
            raise ValueError("smoothing_window must be at least 1")
        if sustain_count < 1:
            raise ValueError("sustain_count must be at least 1")

        self.baseline_reps = baseline_reps
        self.drop_threshold = drop_threshold
        self.smoothing_window = smoothing_window
        self.sustain_count = sustain_count

    def calculate(self, reps: Sequence[DetectedRep]) -> ANTResult:
        """
        Calculate the ANT from a sequence of detected reps.

        Only considers valid reps (is_valid=True) for the calculation.

        Args:
            reps: Sequence of detected reps from the rep detector

        Returns:
            ANTResult with threshold information
        """
        # Filter to valid reps only
        valid_reps = [r for r in reps if r.is_valid]

        if len(valid_reps) < self.baseline_reps + self.sustain_count:
            # Not enough reps to calculate ANT
            return ANTResult(
                ant_reached=False,
                ant_rep_index=None,
                ant_timestamp_seconds=None,
                baseline_speed=0.0,
                drop_percent_at_ant=None,
                smoothed_speeds=[],
                threshold_flags=[],
            )

        # Extract speeds from valid reps
        # Use peak_speed as the primary metric
        speeds = np.array([r.peak_speed for r in valid_reps])

        # Calculate baseline from first N reps
        baseline_speed = float(np.mean(speeds[: self.baseline_reps]))

        if baseline_speed <= 0:
            return ANTResult(
                ant_reached=False,
                ant_rep_index=None,
                ant_timestamp_seconds=None,
                baseline_speed=0.0,
                drop_percent_at_ant=None,
                smoothed_speeds=speeds.tolist(),
                threshold_flags=[False] * len(speeds),
            )

        # Apply smoothing to reduce noise
        smoothed_speeds = self._smooth(speeds, self.smoothing_window)

        # Calculate threshold line
        threshold_speed = baseline_speed * (1 - self.drop_threshold)

        # Mark reps below threshold
        below_threshold = smoothed_speeds < threshold_speed
        threshold_flags = below_threshold.tolist()

        # Find the first sustained drop
        ant_rep_index = self._find_sustained_drop(
            below_threshold, self.sustain_count
        )

        if ant_rep_index is not None:
            ant_timestamp = valid_reps[ant_rep_index].start_time
            current_speed = smoothed_speeds[ant_rep_index]
            drop_percent = (baseline_speed - current_speed) / baseline_speed
        else:
            ant_timestamp = None
            drop_percent = None

        return ANTResult(
            ant_reached=ant_rep_index is not None,
            ant_rep_index=ant_rep_index,
            ant_timestamp_seconds=ant_timestamp,
            baseline_speed=baseline_speed,
            drop_percent_at_ant=drop_percent,
            smoothed_speeds=smoothed_speeds.tolist(),
            threshold_flags=threshold_flags,
        )

    def _smooth(self, data: np.ndarray, window: int) -> np.ndarray:
        """
        Apply centered moving average smoothing.

        For edge cases, uses available data (asymmetric window).
        """
        if window <= 1 or len(data) < window:
            return data.copy()

        result = np.zeros_like(data, dtype=float)
        half_window = window // 2

        for i in range(len(data)):
            start = max(0, i - half_window)
            end = min(len(data), i + half_window + 1)
            result[i] = np.mean(data[start:end])

        return result

    def _find_sustained_drop(
        self,
        below_threshold: np.ndarray,
        sustain_count: int
    ) -> int | None:
        """
        Find the first rep where the threshold drop is sustained.

        Returns the index of the first rep in a sustained below-threshold sequence,
        or None if no such sequence exists.
        """
        consecutive_count = 0

        for i, is_below in enumerate(below_threshold):
            if is_below:
                consecutive_count += 1
                if consecutive_count >= sustain_count:
                    # Return the index where the sustained drop began
                    return i - sustain_count + 1
            else:
                consecutive_count = 0

        return None


class StreamingANTCalculator:
    """
    Streaming version of ANT calculator for real-time analysis.

    Incrementally calculates ANT as new reps are added.
    Designed for future real-time camera mode.
    """

    def __init__(
        self,
        baseline_reps: int = 5,
        drop_threshold: float = 0.20,
        smoothing_window: int = 3,
        sustain_count: int = 2,
    ):
        self.calculator = ANTCalculator(
            baseline_reps=baseline_reps,
            drop_threshold=drop_threshold,
            smoothing_window=smoothing_window,
            sustain_count=sustain_count,
        )
        self.reps: list[DetectedRep] = []
        self._last_result: ANTResult | None = None

    def add_rep(self, rep: DetectedRep) -> ANTResult:
        """
        Add a new rep and recalculate ANT.

        Args:
            rep: Newly detected rep

        Returns:
            Updated ANT result
        """
        self.reps.append(rep)
        self._last_result = self.calculator.calculate(self.reps)
        return self._last_result

    def add_reps(self, reps: Sequence[DetectedRep]) -> ANTResult:
        """Add multiple reps at once."""
        self.reps.extend(reps)
        self._last_result = self.calculator.calculate(self.reps)
        return self._last_result

    def get_current_result(self) -> ANTResult | None:
        """Get the most recent ANT result."""
        return self._last_result

    def reset(self):
        """Reset the calculator state."""
        self.reps.clear()
        self._last_result = None
