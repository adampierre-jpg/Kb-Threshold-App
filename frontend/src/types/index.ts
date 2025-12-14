export type MovementType =
  | 'snatch_left'
  | 'snatch_right'
  | 'swing_left'
  | 'swing_right'
  | 'two_arm_swing';

export interface RepMetric {
  rep_index: number;
  start_time: number;
  end_time: number;
  duration: number;
  peak_speed: number;
  is_valid: boolean;
  is_below_threshold: boolean;
}

export interface AnalysisDiagnostics {
  fps_used: number;
  frames_sampled: number;
  invalid_reps_filtered: number;
  baseline_reps_used: number;
}

export interface AnalysisResult {
  movement_type: MovementType;
  total_valid_reps: number;
  video_duration_seconds: number;
  baseline_speed: number;
  ant_reached: boolean;
  ant_rep_index: number | null;
  ant_timestamp_seconds: number | null;
  drop_percent_at_ant: number | null;
  rep_metrics: RepMetric[];
  diagnostics: AnalysisDiagnostics;
}

export interface AnalysisError {
  error: string;
  detail: string;
}

export type UploadStatus = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  snatch_left: 'Snatch Left',
  snatch_right: 'Snatch Right',
  swing_left: 'Swing Left',
  swing_right: 'Swing Right',
  two_arm_swing: 'Two-Arm Swing',
};
