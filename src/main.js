/**
 * Main application - connects MediaPipe Pose to RepDetector
 * 
 * Debug/tuning interface to:
 * 1. Verify MediaPipe is tracking correctly
 * 2. Tune rep detection thresholds
 * 3. Test with live camera or video file
 */

import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import { RepDetector, Phase } from './lib/repDetector.js';

// ============================================
// GLOBALS
// ============================================
let poseLandmarker;
let repDetector;
let video;
let canvasCtx;
let drawingUtils;
let lastTimestamp = 0;
let isRunning = false;

// Debug data
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;

// Rep history for display
const repHistory = [];

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  console.log('Initializing...');
  
  // Set up canvas
  const canvas = document.getElementById('output-canvas');
  canvasCtx = canvas.getContext('2d');
  
  // Initialize MediaPipe
  await initMediaPipe();
  
  // Initialize Rep Detector with callbacks
  repDetector = new RepDetector({
    onPhaseChange: handlePhaseChange,
    onRepComplete: handleRepComplete,
    // Thresholds - these will need tuning
    lowThreshold: 0.1,
    floatThreshold: 0.25,
    forwardThreshold: 0.15,
    minDriveVelocity: 1.5,
    minDropVelocity: -1.5,
    minFramesInPhase: 2,
    stableFrames: 8
  });
  
  // Set up UI controls
  setupControls();
  
  console.log('Ready. Click "Start Camera" to begin.');
  updateStatus('Ready - Click "Start Camera"');
}

async function initMediaPipe() {
  updateStatus('Loading MediaPipe...');
  
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );
  
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  
  drawingUtils = new DrawingUtils(canvasCtx);
  
  console.log('MediaPipe loaded');
}

// ============================================
// CAMERA / VIDEO HANDLING
// ============================================
async function startCamera() {
  updateStatus('Starting camera...');
  
  video = document.getElementById('video');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    });
    
    video.srcObject = stream;
 video.addEventListener('loadeddata', async () => {
  await video.play();
  
  // Set canvas to match video
  const canvas = document.getElementById('output-canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  
  console.log('Video dimensions:', video.videoWidth, video.videoHeight);
  
  isRunning = true;
  requestAnimationFrame(processFrame);
  updateStatus('Running - get in READY position (KB on floor, hip hinged)');
  
  document.getElementById('start-btn').textContent = 'Stop';
});
    
  } catch (err) {
    console.error('Camera error:', err);
    updateStatus('Camera error: ' + err.message);
  }
}

function stopCamera() {
  isRunning = false;
  
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  
  document.getElementById('start-btn').textContent = 'Start Camera';
  updateStatus('Stopped');
}

// ============================================
// FRAME PROCESSING
// ============================================
function processFrame(timestamp) {
  if (!isRunning) return;
  
  // Calculate FPS
  frameCount++;
  if (timestamp - lastFpsUpdate > 1000) {
    currentFps = Math.round(frameCount * 1000 / (timestamp - lastFpsUpdate));
    frameCount = 0;
    lastFpsUpdate = timestamp;
    document.getElementById('fps').textContent = currentFps;
  }
  
  // Don't process same frame twice
  if (video.currentTime === lastTimestamp) {
    requestAnimationFrame(processFrame);
    return;
  }
  lastTimestamp = video.currentTime;
  
  // Run pose detection
  const results = poseLandmarker.detectForVideo(video, timestamp);
  
  // Draw video frame to canvas
  canvasCtx.drawImage(video, 0, 0);
  
  if (results.landmarks && results.landmarks.length > 0) {
    const landmarks = results.landmarks[0];
    
    // Draw pose skeleton
    drawPose(landmarks);
    
    // Process through rep detector
    const state = repDetector.processFrame(landmarks, timestamp);
    
    // Update debug display
    updateDebugDisplay(state, landmarks);
  }
  
  requestAnimationFrame(processFrame);
}

function drawPose(landmarks) {
  // Draw connections (skeleton)
  drawingUtils.drawConnectors(
    landmarks,
    PoseLandmarker.POSE_CONNECTIONS,
    { color: '#00FF00', lineWidth: 2 }
  );
  
  // Draw landmarks (joints)
  drawingUtils.drawLandmarks(landmarks, {
    color: '#FF0000',
    lineWidth: 1,
    radius: 3
  });
  
  // Highlight key landmarks
  const keyPoints = [15, 16, 23, 24]; // wrists and hips
  keyPoints.forEach(idx => {
    const lm = landmarks[idx];
    const x = lm.x * canvasCtx.canvas.width;
    const y = lm.y * canvasCtx.canvas.height;
    
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 8, 0, 2 * Math.PI);
    canvasCtx.fillStyle = idx < 20 ? '#FFFF00' : '#00FFFF';
    canvasCtx.fill();
  });
  
  // Draw hip center line (vertical reference)
  const hipY = ((landmarks[23].y + landmarks[24].y) / 2) * canvasCtx.canvas.height;
  const hipX = ((landmarks[23].x + landmarks[24].x) / 2) * canvasCtx.canvas.width;
  
  // Vertical line through hip
  canvasCtx.beginPath();
  canvasCtx.moveTo(hipX, 0);
  canvasCtx.lineTo(hipX, canvasCtx.canvas.height);
  canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  canvasCtx.lineWidth = 1;
  canvasCtx.stroke();
  
  // Horizontal line at hip level
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, hipY);
  canvasCtx.lineTo(canvasCtx.canvas.width, hipY);
  canvasCtx.stroke();
}

// ============================================
// DEBUG DISPLAY
// ============================================
function updateDebugDisplay(state, landmarks) {
  // Update phase indicator
  const phaseEl = document.getElementById('current-phase');
  phaseEl.textContent = state.phase;
  phaseEl.className = 'phase-indicator phase-' + state.phase.toLowerCase();
  
  // Update zone indicator
  const zoneEl = document.getElementById('current-zone');
  zoneEl.textContent = state.zone;
  zoneEl.className = 'zone-indicator zone-' + state.zone.toLowerCase().replace('_', '-');
  
  // Update metrics
  document.getElementById('rep-count').textContent = state.repCount;
  document.getElementById('relative-height').textContent = state.relativeHeight;
  document.getElementById('relative-x').textContent = state.relativeX;
  document.getElementById('velocity-y').textContent = state.velocityY;
  document.getElementById('torso-length').textContent = state.torsoLength;
  document.getElementById('frames-in-phase').textContent = state.framesInPhase;
  document.getElementById('is-stable').textContent = state.stable ? 'YES' : 'no';
  
  // Update position indicator (2D plot)
  updatePositionPlot(parseFloat(state.relativeX), parseFloat(state.relativeHeight), state.phase);
}

function updatePositionPlot(relX, relY, phase) {
  const plot = document.getElementById('position-plot');
  const dot = document.getElementById('position-dot');
  
  if (!plot || !dot) return;
  
  // Map relative positions to plot coordinates
  // X: -0.5 to 0.5 → 0% to 100%
  // Y: -0.5 to 0.8 → 100% to 0% (inverted because CSS top)
  const plotX = Math.min(100, Math.max(0, (relX + 0.5) * 100));
  const plotY = Math.min(100, Math.max(0, (0.8 - relY) / 1.3 * 100));
  
  dot.style.left = plotX + '%';
  dot.style.top = plotY + '%';
  
  // Color based on phase
  const colors = {
    READY: '#6b7280',
    HIKE: '#f59e0b',
    DRIVE: '#22c55e',
    FLOAT: '#3b82f6',
    DROP: '#ef4444',
    PARK: '#8b5cf6'
  };
  dot.style.background = colors[phase] || '#ffffff';
}

function handlePhaseChange(newPhase, oldPhase, repCount) {
  console.log(`Phase: ${oldPhase} → ${newPhase} (rep ${repCount})`);
  
  // Audio feedback
  if (newPhase === Phase.FLOAT) {
    playTone(600, 30);
  } else if (newPhase === Phase.HIKE && oldPhase === Phase.READY) {
    playTone(400, 50); // Starting first rep
  }
}

function handleRepComplete(repData) {
  console.log('Rep complete:', repData);
  
  repHistory.push(repData);
  
  // Update rep history display
  const historyEl = document.getElementById('rep-history');
  const repDiv = document.createElement('div');
  repDiv.className = 'rep-entry';
  repDiv.innerHTML = `
    <span class="rep-num">#${repData.rep}</span>
    <span class="rep-metric">${repData.driveTime?.toFixed(0) || '?'}ms</span>
    <span class="rep-metric">peak=${repData.peakVelocity.toFixed(1)}</span>
    <span class="rep-metric">h=${repData.peakHeight.toFixed(2)}</span>
  `;
  historyEl.insertBefore(repDiv, historyEl.firstChild);
  
  // Keep only last 20 reps in display
  while (historyEl.children.length > 20) {
    historyEl.removeChild(historyEl.lastChild);
  }
  
  // Audio feedback
  playTone(800, 50);
}

// ============================================
// UI CONTROLS
// ============================================
function setupControls() {
  // Start/Stop button
  document.getElementById('start-btn').addEventListener('click', () => {
    if (isRunning) {
      stopCamera();
    } else {
      startCamera();
    }
  });
  
  // Reset button
  document.getElementById('reset-btn').addEventListener('click', () => {
    repDetector.reset();
    repHistory.length = 0;
    document.getElementById('rep-history').innerHTML = '';
    console.log('Reset');
  });
  
  // Threshold sliders
  const sliders = [
    'lowThreshold', 
    'floatThreshold', 
    'forwardThreshold',
    'minDriveVelocity', 
    'minFramesInPhase',
    'stableFrames'
  ];
  
  sliders.forEach(name => {
    const slider = document.getElementById(name);
    const valueDisplay = document.getElementById(name + '-value');
    
    if (slider) {
      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        valueDisplay.textContent = value;
        repDetector.setConfig({ [name]: value });
        console.log(`Set ${name} = ${value}`);
      });
    }
  });
}

function updateStatus(message) {
  document.getElementById('status').textContent = message;
}

function playTone(frequency, duration) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.value = frequency;
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch (e) {
    // Audio not available
  }
}

// ============================================
// START
// ============================================
init();
