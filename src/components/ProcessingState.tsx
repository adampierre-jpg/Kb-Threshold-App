import type { UploadStatus } from '../types';

interface ProcessingStateProps {
  status: UploadStatus;
  progress: number;
}

export function ProcessingState({ status, progress }: ProcessingStateProps) {
  const statusText = status === 'uploading'
    ? 'Uploading video...'
    : 'Detecting reps and calculating speed. This may take up to 60 seconds for longer videos.';

  return (
    <div className="bg-dark-300 rounded-xl p-8 text-center">
      {/* Spinner */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <svg
          className="animate-spin w-20 h-20"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
          />
          <path
            className="text-oxblood"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-semibold">{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-dark-200 rounded-full h-2 mb-4 overflow-hidden">
        <div
          className="bg-oxblood h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status Text */}
      <p className="text-gray-300">{statusText}</p>

      {status === 'analyzing' && (
        <p className="text-gray-500 text-sm mt-2">
          Analyzing video frames with pose detection...
        </p>
      )}
    </div>
  );
}
