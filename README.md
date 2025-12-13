# Kettlebell Rep Detector - Debug Prototype

Real-time rep detection for kettlebell swings using MediaPipe Pose.

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Swing Phases (Corrected)

```
READY → HIKE → DRIVE → FLOAT → DROP → HIKE → ... (repeat)
                                    ↘ PARK (if ending set)
```

| Phase | Position | Detection |
|-------|----------|-----------|
| **READY** | KB on floor ~2ft in front, hip hinged, hands on bell | Wrist LOW + FORWARD of hip |
| **HIKE** | KB swung back between legs, hips loaded | Wrist LOW + BEHIND hip |
| **DRIVE** | Hip snap, KB accelerating upward | Wrist moving UP with velocity |
| **FLOAT** | KB at peak (chest-to-eye level) | Wrist HIGH (above threshold) |
| **DROP** | KB descending | Wrist moving DOWN with velocity |
| **PARK** | Set complete, KB returned to floor | Wrist LOW + FORWARD + STABLE |

### Key Insight: X Position Matters

The difference between READY and HIKE is **horizontal position**, not just height:
- **READY**: Wrist is in front of hips (KB on floor ahead of you)
- **HIKE**: Wrist is behind/at hips (KB between your legs)

Both positions have the wrist LOW, but the X coordinate relative to hip distinguishes them.

## 2D Position Plot

The debug UI includes a real-time plot showing wrist position:

```
        HIGH (Float zone)
            ↑
BEHIND ←────┼────→ FORWARD  
(Hike)      │      (Ready/Park)
            ↓
           LOW
```

Watch the dot move through the zones as you swing.

## Tuning Guide

### Thresholds

| Threshold | Default | What it does |
|-----------|---------|--------------|
| `lowThreshold` | 0.1 | How far below hip = "low" (READY/HIKE) |
| `floatThreshold` | 0.25 | How far above hip = "high" (FLOAT) |
| `forwardThreshold` | 0.15 | X distance to distinguish READY from HIKE |
| `minDriveVelocity` | 1.5 | Speed to trigger DRIVE phase |
| `minFramesInPhase` | 2 | Frames before allowing transitions |
| `stableFrames` | 8 | Frames of stillness for READY/PARK |

### Common Issues

**Won't leave READY:**
- Check: Is wrist visible when hiked back?
- Try: Increase `forwardThreshold` so it recognizes the hike

**Goes straight to HIKE (skips READY):**
- Check: Are you starting in proper position with KB in front?
- Try: Decrease `forwardThreshold`

**Never reaches FLOAT:**
- Try: Lower `floatThreshold` to 0.15 or 0.2
- Check: Are you doing chest-height swings?

**Counts reps during setup:**
- Try: Increase `minFramesInPhase` to 4+
- Try: Increase `stableFrames` to 12+

**Doesn't detect end of set (PARK):**
- Try: Increase `stableFrames`
- Check: Are you holding still with KB parked?

## Camera Setup

```
      Camera (side view)
           │
           │  8-12 feet
           │
           ▼
    ┌─────────────┐
    │     You     │
    │   ┌───┐     │ ← Full body visible
    │   │ KB│     │
    │   └───┘     │ ← KB visible at all positions
    └─────────────┘
```

- **Angle**: Perpendicular to swing plane (side view)
- **Distance**: Far enough to see full ROM including KB overhead
- **Height**: About waist level
- **Lighting**: Well-lit, avoid backlight

## Files

```
kb-threshold-app/
├── index.html              # Debug UI
├── src/
│   ├── main.js             # MediaPipe + UI logic
│   ├── lib/
│   │   └── repDetector.js  # State machine (the core)
│   └── styles.css
├── package.json
└── vite.config.js
```

## How Rep Detection Works

1. **MediaPipe Pose** extracts 33 body landmarks per frame
2. **Wrist tracking** focuses on landmarks 15/16 (left/right wrist)
3. **Hip reference** uses landmarks 23/24 to establish body center
4. **Normalization** divides distances by torso length (shoulder-to-hip)
5. **State machine** transitions between phases based on:
   - Relative height (Y): wrist above/below hip
   - Relative X: wrist in front/behind hip
   - Velocity: direction and speed of movement
   - Stability: frames without significant movement

## Next Steps (After Tuning Works)

1. Add velocity tracking per rep for threshold detection
2. Add EMOM timer with protocol logic
3. Add anaerobic threshold detection (velocity drop %)
4. Add audio feedback during test
5. Add results summary screen

## Troubleshooting

**"Camera error: NotAllowedError"**
- Grant camera permission
- Use HTTPS in production (localhost exempt)

**Low FPS / laggy**
- Close other tabs
- Try Chrome (best MediaPipe support)
- Check if GPU acceleration is enabled

**Pose not detected**
- Ensure full body is in frame
- Improve lighting
- Step back from camera
