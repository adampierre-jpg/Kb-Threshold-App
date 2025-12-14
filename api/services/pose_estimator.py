"""
Pose estimation service using MediaPipe.
Extracts wrist/hand positions from video frames for kettlebell tracking.
"""

import cv2
import numpy as np
import mediapipe as mp
from typing import Generator
from dataclasses import dataclass


@dataclass
class FramePose:
    """Pose data extracted from a single frame."""
    timestamp: float
    left_wrist: tuple[float, float] | None  # (x, y) normalized 0-1
    right_wrist: tuple[float, float] | None
    left_wrist_confidence: float
    right_wrist_confidence: float
    frame_valid: bool


class PoseEstimator:
    """
    Extracts body pose keypoints from video frames using MediaPipe Pose.

    Designed for reuse: the same estimation logic can be applied to
    video frames (upload mode) or live camera frames (real-time mode).
    """

    # MediaPipe landmark indices for wrists
    LEFT_WRIST_IDX = 15
    RIGHT_WRIST_IDX = 16
    LEFT_SHOULDER_IDX = 11
    RIGHT_SHOULDER_IDX = 12
    LEFT_HIP_IDX = 23
    RIGHT_HIP_IDX = 24

    # Minimum confidence threshold for valid pose detection
    MIN_VISIBILITY = 0.5

    def __init__(self, model_complexity: int = 1):
        """
        Initialize the pose estimator.

        Args:
            model_complexity: MediaPipe model complexity (0, 1, or 2).
                             Higher = more accurate but slower.
        """
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=model_complexity,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def process_frame(self, frame: np.ndarray, timestamp: float) -> FramePose:
        """
        Process a single frame and extract wrist positions.

        Args:
            frame: BGR image from OpenCV
            timestamp: Frame timestamp in seconds

        Returns:
            FramePose with extracted wrist positions
        """
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.pose.process(rgb_frame)

        if not results.pose_landmarks:
            return FramePose(
                timestamp=timestamp,
                left_wrist=None,
                right_wrist=None,
                left_wrist_confidence=0.0,
                right_wrist_confidence=0.0,
                frame_valid=False,
            )

        landmarks = results.pose_landmarks.landmark

        # Extract wrist positions
        left_wrist_lm = landmarks[self.LEFT_WRIST_IDX]
        right_wrist_lm = landmarks[self.RIGHT_WRIST_IDX]

        left_valid = left_wrist_lm.visibility >= self.MIN_VISIBILITY
        right_valid = right_wrist_lm.visibility >= self.MIN_VISIBILITY

        return FramePose(
            timestamp=timestamp,
            left_wrist=(left_wrist_lm.x, left_wrist_lm.y) if left_valid else None,
            right_wrist=(right_wrist_lm.x, right_wrist_lm.y) if right_valid else None,
            left_wrist_confidence=left_wrist_lm.visibility,
            right_wrist_confidence=right_wrist_lm.visibility,
            frame_valid=left_valid or right_valid,
        )

    def process_video(
        self,
        video_path: str,
        target_fps: float | None = None
    ) -> Generator[FramePose, None, None]:
        """
        Process all frames from a video file.

        Args:
            video_path: Path to the video file
            target_fps: If set, downsample to this frame rate. None = use native fps.

        Yields:
            FramePose for each processed frame
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        native_fps = cap.get(cv2.CAP_PROP_FPS)

        # Determine frame skip for downsampling
        if target_fps and target_fps < native_fps:
            frame_skip = int(native_fps / target_fps)
        else:
            frame_skip = 1
            target_fps = native_fps

        frame_idx = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                # Skip frames for downsampling
                if frame_idx % frame_skip != 0:
                    frame_idx += 1
                    continue

                timestamp = frame_idx / native_fps
                yield self.process_frame(frame, timestamp)
                frame_idx += 1
        finally:
            cap.release()

    def close(self):
        """Release MediaPipe resources."""
        self.pose.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
