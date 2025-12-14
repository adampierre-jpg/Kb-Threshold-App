import { useState, useCallback } from 'react';
import type { MovementType, AnalysisResult, UploadStatus } from '../types';

interface UseAnalysisReturn {
  status: UploadStatus;
  progress: number;
  result: AnalysisResult | null;
  error: string | null;
  analyze: (file: File, movementType: MovementType) => Promise<void>;
  reset: () => void;
}

export function useAnalysis(): UseAnalysisReturn {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (file: File, movementType: MovementType) => {
    setStatus('uploading');
    setProgress(0);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('movement_type', movementType);

    try {
      // Use XMLHttpRequest for upload progress tracking
      const response = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const uploadProgress = (event.loaded / event.total) * 50;
            setProgress(uploadProgress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(new Response(xhr.responseText, {
              status: xhr.status,
              statusText: xhr.statusText,
              headers: { 'Content-Type': 'application/json' },
            }));
          } else {
            resolve(new Response(xhr.responseText, {
              status: xhr.status,
              statusText: xhr.statusText,
              headers: { 'Content-Type': 'application/json' },
            }));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error occurred'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });

        xhr.open('POST', '/api/analyze');
        xhr.send(formData);
      });

      setStatus('analyzing');
      setProgress(50);

      // Simulate analysis progress (backend doesn't provide real-time progress)
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 5, 95));
      }, 500);

      if (!response.ok) {
        clearInterval(progressInterval);
        const errorData = await response.json();
        throw new Error(errorData.detail || `Analysis failed (${response.status})`);
      }

      const data: AnalysisResult = await response.json();
      clearInterval(progressInterval);

      setProgress(100);
      setResult(data);
      setStatus('complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    progress,
    result,
    error,
    analyze,
    reset,
  };
}
