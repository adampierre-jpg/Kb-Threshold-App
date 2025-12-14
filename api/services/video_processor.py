"""
Video processing orchestrator.
Combines pose estimation, rep detection, and ANT calculation into a single pipeline.
"""

import os
import sys
import cv2
from typing import Callable

# Add api directory to path for Vercel deployment
_api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _api_dir not in sys.path:
    sys.path.insert(0, _api_dir)

from models.schemas import (
    MovementType,
    PositionSample,
    RepMetric,
    AnalysisDiagnostics,
    AnalysisResult,
)
from services.pose_estimator import PoseEstimator, FramePose
from services.rep_detector import RepDetector, DetectedRep
from services.ant_calculator import ANTCalculator, ANTResult


class VideoProcessor:
    """
    Main orchestrator for video-based kettlebell analysis.

    Pipeline:
    1. Extract poses from video frames (PoseEstimator)
    2. Convert to position samples for the relevant wrist
    3. Detect reps (RepDetector)
    4. Calculate ANT (ANTCalculator)
    """

    # Target FPS for analysis (downsample to reduce processing time)
    TARGET_FPS = 15.0

    # ANT configuration
    BASELINE_REPS = 5
    DROP_THRESHOLD = 0.20  # 20% drop
    SMOOTHING_WINDOW = 3
    SUSTAIN_COUNT = 2

    def __init__(
        self,
        progress_callback: Callable[[float, str], None] | None = None
    ):
        """
        Initialize the video processor.

        Args:
            progress_callback: Optional callback(progress, message) for progress updates.
                              progress is 0.0-1.0, message is a status string.
        """
        self.progress_callback = progress_callback

    def analyze(
        self,
        video_path: str,
        movement_type: MovementType
    ) -> AnalysisResult:
        """
        Analyze a video file for kettlebell ANT.

        Args:
            video_path: Path to the video file
            movement_type: Type of kettlebell movement

        Returns:
            Complete analysis result

        Raises:
            ValueError: If video cannot be opened or is too short
            FileNotFoundError: If video file doesn't exist
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")

        # Get video metadata
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0
        cap.release()

        if duration < 5:
            raise ValueError("Video too short. Need at least 5 seconds.")

        self._report_progress(0.0, "Starting pose estimation...")

        # Step 1: Extract poses from video
        samples = self._extract_positions(video_path, movement_type, frame_count)

        self._report_progress(0.7, "Detecting repetitions...")

        # Step 2: Detect reps
        detector = RepDetector(movement_type)
        detected_reps = detector.detect_reps(samples)

        self._report_progress(0.85, "Calculating anaerobic threshold...")

        # Step 3: Calculate ANT
        calculator = ANTCalculator(
            baseline_reps=self.BASELINE_REPS,
            drop_threshold=self.DROP_THRESHOLD,
            smoothing_window=self.SMOOTHING_WINDOW,
            sustain_count=self.SUSTAIN_COUNT,
        )
        ant_result = calculator.calculate(detected_reps)

        self._report_progress(0.95, "Generating results...")

        # Build final result
        valid_reps = [r for r in detected_reps if r.is_valid]
        invalid_count = len(detected_reps) - len(valid_reps)

        rep_metrics = self._build_rep_metrics(valid_reps, ant_result)

        result = AnalysisResult(
            movement_type=movement_type,
            total_valid_reps=len(valid_reps),
            video_duration_seconds=duration,
            baseline_speed=ant_result.baseline_speed,
            ant_reached=ant_result.ant_reached,
            ant_rep_index=ant_result.ant_rep_index,
            ant_timestamp_seconds=ant_result.ant_timestamp_seconds,
            drop_percent_at_ant=ant_result.drop_percent_at_ant,
            rep_metrics=rep_metrics,
            diagnostics=AnalysisDiagnostics(
                fps_used=self.TARGET_FPS,
                frames_sampled=len(samples),
                invalid_reps_filtered=invalid_count,
                baseline_reps_used=min(self.BASELINE_REPS, len(valid_reps)),
            ),
        )

        self._report_progress(1.0, "Analysis complete.")
        return result

    def _extract_positions(
        self,
        video_path: str,
        movement_type: MovementType,
        total_frames: int
    ) -> list[PositionSample]:
        """
        Extract wrist positions from video using pose estimation.
        """
        samples: list[PositionSample] = []

        # Determine which wrist to track based on movement type
        use_left = movement_type in (
            MovementType.SNATCH_LEFT,
            MovementType.SWING_LEFT,
        )
        use_right = movement_type in (
            MovementType.SNATCH_RIGHT,
            MovementType.SWING_RIGHT,
        )
        use_both = movement_type == MovementType.TWO_ARM_SWING

        with PoseEstimator(model_complexity=1) as estimator:
            frame_idx = 0
            for pose in estimator.process_video(video_path, self.TARGET_FPS):
                # Report progress (pose estimation is ~70% of total work)
                if total_frames > 0:
                    progress = 0.7 * (frame_idx / (total_frames / (30 / self.TARGET_FPS)))
                    progress = min(0.7, progress)
                    self._report_progress(progress, f"Processing frame {frame_idx}...")

                sample = self._pose_to_sample(
                    pose, use_left, use_right, use_both
                )
                if sample:
                    samples.append(sample)

                frame_idx += 1

        return samples

    def _pose_to_sample(
        self,
        pose: FramePose,
        use_left: bool,
        use_right: bool,
        use_both: bool
    ) -> PositionSample | None:
        """
        Convert a FramePose to a PositionSample for the relevant wrist(s).
        """
        if not pose.frame_valid:
            return None

        if use_both:
            # For two-arm swing, average both wrists
            if pose.left_wrist and pose.right_wrist:
                x = (pose.left_wrist[0] + pose.right_wrist[0]) / 2
                y = (pose.left_wrist[1] + pose.right_wrist[1]) / 2
                conf = (pose.left_wrist_confidence + pose.right_wrist_confidence) / 2
                return PositionSample(t=pose.timestamp, x=x, y=y, confidence=conf)
            elif pose.left_wrist:
                return PositionSample(
                    t=pose.timestamp,
                    x=pose.left_wrist[0],
                    y=pose.left_wrist[1],
                    confidence=pose.left_wrist_confidence,
                )
            elif pose.right_wrist:
                return PositionSample(
                    t=pose.timestamp,
                    x=pose.right_wrist[0],
                    y=pose.right_wrist[1],
                    confidence=pose.right_wrist_confidence,
                )
        elif use_left and pose.left_wrist:
            return PositionSample(
                t=pose.timestamp,
                x=pose.left_wrist[0],
                y=pose.left_wrist[1],
                confidence=pose.left_wrist_confidence,
            )
        elif use_right and pose.right_wrist:
            return PositionSample(
                t=pose.timestamp,
                x=pose.right_wrist[0],
                y=pose.right_wrist[1],
                confidence=pose.right_wrist_confidence,
            )

        return None

    def _build_rep_metrics(
        self,
        valid_reps: list[DetectedRep],
        ant_result: ANTResult
    ) -> list[RepMetric]:
        """
        Build rep metrics list from detected reps and ANT result.
        """
        metrics = []
        threshold_flags = ant_result.threshold_flags

        for i, rep in enumerate(valid_reps):
            is_below = threshold_flags[i] if i < len(threshold_flags) else False

            metrics.append(RepMetric(
                rep_index=i,
                start_time=rep.start_time,
                end_time=rep.end_time,
                duration=rep.duration,
                peak_speed=rep.peak_speed,
                is_valid=True,  # Only valid reps are in this list
                is_below_threshold=is_below,
            ))

        return metrics

    def _report_progress(self, progress: float, message: str):
        """Report progress if callback is set."""
        if self.progress_callback:
            self.progress_callback(progress, message)


def analyze_position_stream(
    samples: list[PositionSample],
    movement_type: MovementType,
    baseline_reps: int = 5,
    drop_threshold: float = 0.20,
) -> tuple[list[DetectedRep], ANTResult]:
    """
    Analyze a stream of position samples directly.

    This is the core analysis function that can be reused for both:
    - Upload mode: Pass all samples at once after extracting from video
    - Real-time mode: Build up samples incrementally and call periodically

    Args:
        samples: List of position samples
        movement_type: Type of kettlebell movement
        baseline_reps: Number of initial reps for baseline
        drop_threshold: Fractional drop to trigger ANT

    Returns:
        Tuple of (detected_reps, ant_result)
    """
    detector = RepDetector(movement_type)
    detected_reps = detector.detect_reps(samples)

    calculator = ANTCalculator(
        baseline_reps=baseline_reps,
        drop_threshold=drop_threshold,
    )
    ant_result = calculator.calculate(detected_reps)

    return detected_reps, ant_result
