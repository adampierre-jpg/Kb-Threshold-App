interface ErrorDisplayProps {
  message: string;
  onRetry: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  return (
    <div className="bg-dark-300 rounded-xl p-8 text-center">
      {/* Error Icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      {/* Error Message */}
      <h3 className="text-xl font-semibold text-white mb-2">Analysis Failed</h3>
      <p className="text-gray-400 mb-6 max-w-md mx-auto">{message}</p>

      {/* Suggestions */}
      <div className="text-left bg-dark-400 rounded-lg p-4 mb-6 max-w-md mx-auto">
        <p className="text-sm text-gray-400 mb-2">Common fixes:</p>
        <ul className="text-sm text-gray-500 space-y-1 list-disc list-inside">
          <li>Ensure the video shows clear kettlebell movements</li>
          <li>Check that the person is fully visible in frame</li>
          <li>Try a video with at least 10+ reps</li>
          <li>Use good lighting and a steady camera angle</li>
        </ul>
      </div>

      {/* Retry Button */}
      <button
        onClick={onRetry}
        className="px-6 py-3 bg-oxblood hover:bg-oxblood-400 text-white font-semibold rounded-xl transition-all"
      >
        Try Again
      </button>
    </div>
  );
}
