import { UploadForm, ProcessingState, ResultsDashboard, ErrorDisplay } from './components';
import { useAnalysis } from './hooks/useAnalysis';

export default function App() {
  const { status, progress, result, error, analyze, reset } = useAnalysis();

  const showForm = status === 'idle';
  const showProcessing = status === 'uploading' || status === 'analyzing';
  const showResults = status === 'complete' && result;
  const showError = status === 'error';

  return (
    <div className="min-h-screen bg-dark text-gray-100">
      {/* Header */}
      <header className="border-b border-dark-300">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-oxblood flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C9.24 2 7 4.24 7 7c0 1.1.36 2.14 1 3H6c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v5c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-5h1c1.1 0 2-.9 2-2v-2c0-1.1-.9-2-2-2h-2c.64-.86 1-1.9 1-3 0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">KB Threshold</h1>
              <p className="text-sm text-gray-500">Essential Fitness</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        {/* Intro (only show on upload form) */}
        {showForm && (
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Find Your Anaerobic Threshold
            </h2>
            <p className="text-gray-400 max-w-lg mx-auto">
              Upload a kettlebell swing or snatch set to discover when fatigue impacts your
              rep speed. Know your limits. Train smarter.
            </p>
          </div>
        )}

        {/* Upload Form */}
        {showForm && (
          <div className="bg-dark-400 rounded-2xl p-6 sm:p-8">
            <UploadForm
              onSubmit={analyze}
              disabled={false}
            />
          </div>
        )}

        {/* Processing State */}
        {showProcessing && (
          <ProcessingState status={status} progress={progress} />
        )}

        {/* Results Dashboard */}
        {showResults && (
          <ResultsDashboard result={result} onReset={reset} />
        )}

        {/* Error Display */}
        {showError && error && (
          <ErrorDisplay message={error} onRetry={reset} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-300 mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-gray-500 text-sm">
          <p>Essential Fitness - Strength Training for Men 35+</p>
        </div>
      </footer>
    </div>
  );
}
