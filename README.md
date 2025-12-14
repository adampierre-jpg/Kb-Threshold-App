# KB Threshold - Kettlebell Anaerobic Threshold Analyzer

A production-ready web application that analyzes kettlebell swing and snatch videos to determine the anaerobic threshold (ANT) point where fatigue causes sustained speed degradation.

**Essential Fitness** - Strength Training for Men 35+

## Architecture Overview

```
kb-threshold-app/
├── frontend/                 # React + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── types/            # TypeScript types
│   │   └── utils/            # Utility functions
│   └── ...
├── backend/                  # Python FastAPI + MediaPipe
│   ├── app/
│   │   ├── models/           # Pydantic schemas
│   │   ├── routes/           # API endpoints
│   │   └── services/         # Core analysis logic
│   │       ├── pose_estimator.py    # MediaPipe pose detection
│   │       ├── rep_detector.py      # Rep cycle detection
│   │       ├── ant_calculator.py    # ANT calculation
│   │       └── video_processor.py   # Orchestrator
│   └── ...
└── README.md
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts
- **Backend**: Python 3.11, FastAPI, MediaPipe, OpenCV, NumPy
- **Analysis Pipeline**: MediaPipe Pose → Rep Detection → ANT Calculation

### Why This Stack?

- **Python backend**: Optimal for computer vision (MediaPipe, OpenCV) with excellent NumPy performance
- **React frontend**: Type-safe, component-based UI with great charting support
- **Vite**: Fast dev server with HMR and production builds
- **FastAPI**: Modern async Python API with automatic OpenAPI docs

## Installation

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- pip

### Backend Setup

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install
```

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

### Production Mode

**Backend:**
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

### Using Docker (Backend)

```bash
cd backend
docker build -t kb-threshold-api .
docker run -p 8000:8000 kb-threshold-api
```

## API Reference

### POST /api/analyze

Analyze a kettlebell video for anaerobic threshold.

**Request:**
- Content-Type: `multipart/form-data`
- Fields:
  - `movement_type`: one of `snatch_left`, `snatch_right`, `swing_left`, `swing_right`, `two_arm_swing`
  - `video`: video file (MP4, MOV, max 500MB)

**Response:**
```json
{
  "movement_type": "two_arm_swing",
  "total_valid_reps": 42,
  "video_duration_seconds": 180.5,
  "baseline_speed": 0.834,
  "ant_reached": true,
  "ant_rep_index": 27,
  "ant_timestamp_seconds": 115.2,
  "drop_percent_at_ant": 0.22,
  "rep_metrics": [
    {
      "rep_index": 0,
      "start_time": 2.1,
      "end_time": 3.8,
      "duration": 1.7,
      "peak_speed": 0.856,
      "is_valid": true,
      "is_below_threshold": false
    }
  ],
  "diagnostics": {
    "fps_used": 15.0,
    "frames_sampled": 2707,
    "invalid_reps_filtered": 3,
    "baseline_reps_used": 5
  }
}
```

### GET /api/health

Health check endpoint.

## How It Works

### 1. Pose Estimation

MediaPipe Pose extracts 33 body landmarks per frame. We track the wrist position (left or right based on movement type) as a proxy for kettlebell position.

### 2. Rep Detection

The rep detector identifies swing/snatch cycles using:
- **Vertical displacement**: Valid reps must have sufficient vertical movement
- **Duration bounds**: Reps too short (<0.4s) or too long (>4s) are filtered
- **Arc pattern**: Smooth pendulum motion vs. spiky noise

Detection uses peak-to-peak segmentation where peaks represent the top of each swing/snatch.

### 3. ANT Calculation

ANT is determined when:
1. Smoothed rep speed (3-rep moving average) drops ≥20% below baseline
2. The drop sustains for at least 2 consecutive reps

**Baseline**: Average peak speed of the first 5 valid reps.

This catches genuine fatigue-induced slowdown while filtering out random rep-to-rep variation.

## Video Recording Guidelines

For best results:

- **Angle**: Side view, perpendicular to the swing plane
- **Distance**: 8-12 feet to capture full range of motion
- **Framing**: Full body visible at all times (including overhead for snatches)
- **Lighting**: Well-lit from the front, avoid strong backlighting
- **Duration**: 10+ reps minimum, typical sets of 20-60 reps work well
- **Format**: MP4 or MOV, up to 5 minutes at 30fps, 1080p

## Real-Time Extension

The analysis core is designed for future real-time camera mode:

```python
from app.services import StreamingRepDetector, StreamingANTCalculator

# Initialize once
rep_detector = StreamingRepDetector(MovementType.TWO_ARM_SWING)
ant_calculator = StreamingANTCalculator()

# For each frame from camera:
sample = PositionSample(t=timestamp, x=wrist_x, y=wrist_y)
new_reps = rep_detector.add_sample(sample)
for rep in new_reps:
    ant_result = ant_calculator.add_rep(rep)
    if ant_result.ant_reached:
        print(f"ANT reached at rep {ant_result.ant_rep_index}")
```

## Configuration

### ANT Parameters

Edit `backend/app/services/video_processor.py`:

```python
BASELINE_REPS = 5       # Reps used to calculate baseline speed
DROP_THRESHOLD = 0.20   # 20% drop triggers ANT
SMOOTHING_WINDOW = 3    # Moving average window
SUSTAIN_COUNT = 2       # Consecutive below-threshold reps required
```

### Rep Detection Parameters

Edit `backend/app/services/rep_detector.py`:

```python
MIN_VERTICAL_DISPLACEMENT_SWING = 0.15   # Normalized displacement
MIN_VERTICAL_DISPLACEMENT_SNATCH = 0.25
MAX_REP_DURATION = 4.0   # seconds
MIN_REP_DURATION = 0.4   # seconds
```

## End-to-End Test

1. Start both backend and frontend servers
2. Navigate to http://localhost:5173
3. Select a movement type (e.g., "Two-Arm Swing")
4. Upload a test video (MP4/MOV of kettlebell swings)
5. Click "Analyze Set"
6. View results:
   - Summary cards with rep count and ANT info
   - Speed chart showing the threshold point
   - Rep-by-rep table with metrics

## Troubleshooting

### "Only X valid reps detected"

- Ensure clear view of the person performing the movement
- Check that the camera angle shows the full swing path
- Verify the person's wrists are visible throughout

### "No valid kettlebell swings/snatches detected"

- The video may show movements that don't match swing/snatch patterns
- Try a video with more pronounced vertical displacement
- Ensure good lighting so pose detection works reliably

### "Analysis taking too long"

- Videos are downsampled to 15fps for processing
- A 5-minute video may take 30-60 seconds to analyze
- Check backend console for progress updates

### MediaPipe installation issues

On some systems, you may need additional dependencies:
```bash
# Ubuntu/Debian
sudo apt-get install libgl1-mesa-glx

# macOS (usually works out of box)
# Windows (usually works out of box)
```

## License

MIT
