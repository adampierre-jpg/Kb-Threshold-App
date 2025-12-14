"""
Vercel Serverless Function for kettlebell video analysis.
POST /api/analyze
"""

import os
import sys
import json
import tempfile
import shutil
import re
from http.server import BaseHTTPRequestHandler
import io

# Ensure api module is importable
api_dir = os.path.dirname(os.path.abspath(__file__))
if api_dir not in sys.path:
    sys.path.insert(0, api_dir)

from models.schemas import MovementType, AnalysisResult
from services.video_processor import VideoProcessor


MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB for Vercel (reduced from 500MB)
ALLOWED_EXTENSIONS = {'.mp4', '.mov', '.m4v'}


class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless function handler."""

    def do_POST(self):
        """Handle POST request for video analysis."""
        try:
            content_type = self.headers.get('Content-Type', '')

            if 'multipart/form-data' not in content_type:
                return self._send_error(400, 'Content-Type must be multipart/form-data')

            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))

            if content_length > MAX_FILE_SIZE:
                return self._send_error(413, f'File too large. Maximum: {MAX_FILE_SIZE // (1024*1024)}MB')

            body = self.rfile.read(content_length)

            # Parse multipart data
            parsed = self._parse_multipart(body, content_type)

            # Get movement type
            movement_type_str = parsed.get('movement_type')
            if not movement_type_str:
                return self._send_error(400, 'movement_type is required')

            try:
                movement_type = MovementType(movement_type_str)
            except ValueError:
                return self._send_error(400, f'Invalid movement_type: {movement_type_str}')

            # Get video file
            video_data = parsed.get('video')
            if not video_data:
                return self._send_error(400, 'video file is required')

            filename = video_data.get('filename', 'video.mp4')
            content = video_data.get('content', b'')

            # Validate extension
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                return self._send_error(400, f'Unsupported format. Allowed: {", ".join(ALLOWED_EXTENSIONS)}')

            # Save to temp file and process
            temp_dir = tempfile.mkdtemp()
            temp_path = os.path.join(temp_dir, f'upload{ext}')

            try:
                with open(temp_path, 'wb') as f:
                    f.write(content)

                # Process video
                processor = VideoProcessor()
                result = processor.analyze(temp_path, movement_type)

                # Check minimum reps
                if result.total_valid_reps < 10:
                    return self._send_error(
                        422,
                        f'Only {result.total_valid_reps} valid reps detected. '
                        'Need at least 10 reps for meaningful ANT analysis.'
                    )

                return self._send_json(200, result.model_dump())

            except ValueError as e:
                error_msg = str(e)
                if 'too short' in error_msg.lower():
                    return self._send_error(422, 'Video too short. Need at least 5 seconds.')
                elif 'could not open' in error_msg.lower():
                    return self._send_error(422, 'Could not open video file. File may be corrupted.')
                else:
                    return self._send_error(422, error_msg)
            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)

        except Exception as e:
            return self._send_error(500, f'Analysis failed: {str(e)}')

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self._send_cors_headers()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _parse_multipart(self, body: bytes, content_type: str) -> dict:
        """Parse multipart form data."""
        result = {}

        # Extract boundary
        boundary_match = re.search(r'boundary=([^;]+)', content_type)
        if not boundary_match:
            return result

        boundary = boundary_match.group(1).strip('"').encode()
        parts = body.split(b'--' + boundary)

        for part in parts:
            if not part or part in (b'', b'--', b'--\r\n', b'\r\n'):
                continue

            part = part.strip()
            if not part or part == b'--':
                continue

            # Split headers from content
            if b'\r\n\r\n' in part:
                headers_raw, content = part.split(b'\r\n\r\n', 1)
            elif b'\n\n' in part:
                headers_raw, content = part.split(b'\n\n', 1)
            else:
                continue

            headers_text = headers_raw.decode('utf-8', errors='ignore')

            # Remove trailing boundary markers
            if content.endswith(b'\r\n'):
                content = content[:-2]
            if content.endswith(b'\n'):
                content = content[:-1]

            # Parse content-disposition
            name_match = re.search(r'name="([^"]+)"', headers_text)
            filename_match = re.search(r'filename="([^"]+)"', headers_text)

            if name_match:
                field_name = name_match.group(1)
                if filename_match:
                    result[field_name] = {
                        'filename': filename_match.group(1),
                        'content': content
                    }
                else:
                    result[field_name] = content.decode('utf-8').strip()

        return result

    def _send_json(self, status: int, data: dict):
        """Send JSON response."""
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self._send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, message: str):
        """Send error response."""
        return self._send_json(status, {'error': 'Error', 'detail': message})

    def _send_cors_headers(self):
        """Send CORS headers."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
