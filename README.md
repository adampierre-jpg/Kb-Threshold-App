# KB Threshold - Kettlebell Anaerobic Threshold Analyzer

A production-ready web application that analyzes kettlebell swing and snatch videos to determine the anaerobic threshold (ANT) point where fatigue causes sustained speed degradation.

**Essential Fitness** - Strength Training for Men 35+

## Architecture Overview

This app is designed to deploy on **Vercel** with:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Python serverless functions using MediaPipe for pose estimation

```
kb-threshold-app/
├── api/                      # Vercel Python serverless functions
│   ├── analyze.py            # POST /api/analyze endpoint
│   ├── health.py             # GET /api/health endpoint
│   ├── models/               # Pydantic schemas
│   └── services/             # Core analysis logic
│       ├── pose_estimator.py # MediaPipe pose detection
│       ├── rep_detector.py   # Rep cycle detection
│       ├── ant_calculator.py # ANT calculation
│       └── video_processor.py# Orchestrator
├── src/                      # React frontend
│   ├── components/           # UI components
│   ├── hooks/                # Custom React hooks
│   ├── types/                # TypeScript types
│   └── utils/                # Utility functions
├── vercel.json               # Vercel configuration
├── requirements.txt          # Python dependencies
└── package.json              # Node dependencies
```

## Deploy to Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/kb-threshold-app)

### Manual Deploy

1. Push this repo to GitHub
2. Import in [Vercel Dashboard](https://vercel.com/new)
3. Vercel auto-detects Vite + Python functions
4. Deploy!

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- pip

### Install Dependencies

```bash
# Frontend
npm install

# Python (for local API testing)
pip install -r requirements.txt
```

### Run Development Server

For Vercel dev (recommended):
```bash
npm i -g vercel
vercel dev
```

Or run frontend and backend separately:

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - Backend (optional, for local testing):**
```bash
cd api
python -m uvicorn analyze:handler --reload --port 8000
```

Open http://localhost:5173 (or http://localhost:3000 with `vercel dev`)

## API Reference

### POST /api/analyze

Analyze a kettlebell video for anaerobic threshold.

**Request:**
- Content-Type: `multipart/form-data`
- Fields:
  - `movement_type`: one of `snatch_left`, `snatch_right`, `swing_left`, `swing_right`, `two_arm_swing`
  - `video`: video file (MP4, MOV, max 100MB on Vercel)

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
  "rep_metrics": [...],
  "diagnostics": {...}
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

### 3. ANT Calculation

ANT is determined when:
1. Smoothed rep speed (3-rep moving average) drops ≥20% below baseline
2. The drop sustains for at least 2 consecutive reps

**Baseline**: Average peak speed of the first 5 valid reps.

## Vercel Limitations

- **Function timeout**: 60 seconds (Pro plan can extend to 300s)
- **Payload size**: ~100MB for video uploads
- **Cold starts**: First request may be slow due to MediaPipe loading

For videos longer than ~2 minutes, consider:
- Using Vercel Pro for extended timeouts
- Deploying the Python backend separately (Railway, Render, Fly.io)

## Video Recording Guidelines

For best results:

- **Angle**: Side view, perpendicular to the swing plane
- **Distance**: 8-12 feet to capture full range of motion
- **Framing**: Full body visible at all times
- **Lighting**: Well-lit from the front
- **Duration**: 10-60 reps (30 seconds to 2 minutes ideal)
- **Format**: MP4 or MOV, up to 100MB

## Real-Time Extension

The analysis core is designed for future real-time camera mode:

```python
from api.services import StreamingRepDetector, StreamingANTCalculator
from api.models import MovementType, PositionSample

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

## Troubleshooting

### "Function timed out"

- Video is too long for Vercel's 60s limit
- Try a shorter video (<2 minutes)
- Consider Vercel Pro or alternative backend hosting

### "Only X valid reps detected"

- Ensure clear view of the person performing the movement
- Check that the camera angle shows the full swing path
- Verify the person's wrists are visible throughout

### Local development issues

If `vercel dev` doesn't work, you can test the Python API directly:

```bash
# Install local dev dependencies
pip install uvicorn

# Run the API
cd api && python -c "
import sys
sys.path.insert(0, '.')
from analyze import handler
print('API ready')
"
```

## License

MIT
