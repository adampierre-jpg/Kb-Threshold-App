import { useState, useRef, useCallback } from 'react';
import type { MovementType } from '../types';
import { MOVEMENT_LABELS } from '../types';
import { formatFileSize } from '../utils/format';

interface UploadFormProps {
  onSubmit: (file: File, movementType: MovementType) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ACCEPTED_TYPES = '.mp4,.mov,.m4v';

export function UploadForm({ onSubmit, disabled = false }: UploadFormProps) {
  const [movementType, setMovementType] = useState<MovementType>('two_arm_swing');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File): boolean => {
    setFileError(null);

    if (f.size > MAX_FILE_SIZE) {
      setFileError(`File too large. Maximum size: ${formatFileSize(MAX_FILE_SIZE)}`);
      return false;
    }

    const ext = f.name.toLowerCase().split('.').pop();
    if (!['mp4', 'mov', 'm4v'].includes(ext || '')) {
      setFileError('Unsupported format. Please use MP4 or MOV.');
      return false;
    }

    return true;
  }, []);

  const handleFile = useCallback((f: File) => {
    if (validateFile(f)) {
      setFile(f);
    }
  }, [validateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFile(droppedFile);
    }
  }, [handleFile]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
  }, [handleFile]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (file && !disabled) {
      onSubmit(file, movementType);
    }
  }, [file, movementType, disabled, onSubmit]);

  const movements: MovementType[] = [
    'snatch_left',
    'snatch_right',
    'swing_left',
    'swing_right',
    'two_arm_swing',
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Movement Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Select Movement Pattern
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {movements.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setMovementType(type)}
              disabled={disabled}
              className={`px-4 py-3 text-sm font-medium rounded-lg border transition-all ${
                movementType === type
                  ? 'bg-oxblood border-oxblood-400 text-white'
                  : 'bg-dark-300 border-dark-100 text-gray-300 hover:border-oxblood-400 hover:text-white'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {MOVEMENT_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* File Upload Area */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Upload Video
        </label>
        <div
          onDrop={handleDrop}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            dragActive
              ? 'border-oxblood bg-oxblood/10'
              : file
              ? 'border-oxblood-400 bg-dark-300'
              : 'border-dark-100 bg-dark-400 hover:border-dark-50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleInputChange}
            disabled={disabled}
            className="hidden"
          />

          {file ? (
            <div className="space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-oxblood/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-oxblood" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-medium">{file.name}</p>
              <p className="text-gray-400 text-sm">{formatFileSize(file.size)}</p>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setFileError(null);
                  }}
                  className="text-oxblood-300 text-sm hover:text-oxblood-200"
                >
                  Choose different file
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-dark-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-gray-300">
                <span className="text-oxblood-300 font-medium">Click to upload</span> or drag and drop
              </p>
              <p className="text-gray-500 text-sm">MP4 or MOV, up to 5 minutes, 1080p</p>
            </div>
          )}
        </div>

        {fileError && (
          <p className="mt-2 text-sm text-red-400">{fileError}</p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!file || disabled}
        className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all ${
          file && !disabled
            ? 'bg-oxblood hover:bg-oxblood-400 active:bg-oxblood-600'
            : 'bg-dark-200 cursor-not-allowed text-gray-500'
        }`}
      >
        Analyze Set
      </button>
    </form>
  );
}
