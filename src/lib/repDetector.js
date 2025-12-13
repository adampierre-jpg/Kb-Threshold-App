/**
 * RepDetector - State machine for detecting kettlebell swing reps
 * 
 * SWING PHASES (CORRECTED):
 * 
 * 1. READY - Starting position:
 *    - KB on floor, ~2 foot lengths in front of athlete
 *    - One or both hands gripping KB
 *    - Hips loaded in hip hinge
 *    - Wrist is LOW and FORWARD of hips
 * 
 * 2. HIKE - Backswing / loaded position:
 *    - KB swings back between/behind legs
 *    - Hips fully loaded
 *    - Wrist is LOW and BEHIND hips
 * 
 * 3. DRIVE - Explosive hip extension:
 *    - Hip snap propels KB upward
 *    - Wrist ascending rapidly
 * 
 * 4. FLOAT - Peak of swing:
 *    - KB at chest-to-eye level (hardstyle)
 *    - Momentary weightlessness
 *    - Wrist at highest point
 * 
 * 5. DROP - Controlled descent:
 *    - KB falling back toward hike position
 *    - Wrist descending
 *    - Athlete preparing to absorb and redirect
 * 
 * FLOW:
 * First rep:  READY → HIKE → DRIVE → FLOAT → DROP → HIKE
 * Continuous: HIKE → DRIVE → FLOAT → DROP → HIKE (repeat)
 * End set:    DROP → PARK (optional - KB returned to floor)
 * 
 * KEY DETECTION INSIGHT:
 * - READY vs HIKE: Both have wrist LOW, but different X position
 *   - READY: wrist X is IN FRONT of hip X (KB on floor ahead)
 *   - HIKE: wrist X is AT or BEHIND hip X (KB between legs)
 */

export const Phase = {
  READY: 'READY',     // KB on floor in front, hip hinged, hands on bell
  HIKE: 'HIKE',       // KB hiked back between legs
  DRIVE: 'DRIVE',     // Explosive upward movement
  FLOAT: 'FLOAT',     // Peak height
  DROP: 'DROP',       // Descending
  PARK: 'PARK'        // Set complete, KB returned to floor (optional)
};

export class RepDetector {
  constructor(options = {}) {
    // Tunable thresholds
    this.config = {
      // Wrist must be this far below hip (as ratio of torso) to be "low"
      lowThreshold: options.lowThreshold ?? 0.1,
      
      // Wrist must be this far above hip to register as "float"
      floatThreshold: options.floatThreshold ?? 0.25,
      
      // Wrist X must be this far in front of hip X to be "forward" (READY position)
      // Measured as ratio of torso length
      forwardThreshold: options.forwardThreshold ?? 0.15,
      
      // Wrist X must be this far behind hip X to be "hiked"
      behindThreshold: options.behindThreshold ?? -0.05,
      
      // Minimum upward velocity to register as DRIVE
      minDriveVelocity: options.minDriveVelocity ?? 1.5,
      
      // Minimum downward velocity to register as DROP
      minDropVelocity: options.minDropVelocity ?? -1.5,
      
      // Frames to wait before allowing phase transitions (noise reduction)
      minFramesInPhase: options.minFramesInPhase ?? 2,
      
      // Smoothing window for position data
      smoothingWindow: options.smoothingWindow ?? 3,
      
      // Stability threshold - velocity below this is "stable"
      stableVelocity: options.stableVelocity ?? 0.5,
      
      // Frames wrist must be stable to detect READY or PARK
      stableFrames: options.stableFrames ?? 8,
    };

    this.reset();
    
    // Callbacks
    this.onPhaseChange = options.onPhaseChange || (() => {});
    this.onRepComplete = options.onRepComplete || (() => {});
  }

  reset() {
    this.phase = Phase.READY;
    this.repCount = 0;
    this.framesInPhase = 0;
    this.stableFrameCount = 0;
    
    // Position history for smoothing
    this.wristHistory = [];
    this.hipHistory = [];
    
    // Current rep tracking
    this.currentRep = this.createEmptyRep();
    
    // Reference measurements
    this.torsoLength = null;
    
    // For detecting which direction we're swinging (left/right hand)
    this.swingSide = null; // 'left' or 'right' - detected from first hike
  }

  createEmptyRep() {
    return {
      startTime: null,      // When hike began
      driveStartTime: null, // When drive began
      floatTime: null,      // When float was reached
      endTime: null,        // When rep completed (back to hike)
      peakHeight: -Infinity,
      velocities: [],
      peakVelocity: 0
    };
  }

  /**
   * Process a single frame of pose data
   * @param {Object} landmarks - MediaPipe pose landmarks (33 points)
   * @param {number} timestamp - Current time in milliseconds
   * @returns {Object} Current state info
   */
  processFrame(landmarks, timestamp) {
    if (!landmarks || landmarks.length < 25) {
      return this.getState();
    }

    // Extract key landmarks (MediaPipe indices)
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    // Average hip position
    const hipY = (leftHip.y + rightHip.y) / 2;
    const hipX = (leftHip.x + rightHip.x) / 2;
    
    // Average shoulder position
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;

    // Calculate torso length for normalization
    if (!this.torsoLength && leftHip.visibility > 0.5 && leftShoulder.visibility > 0.5) {
      this.torsoLength = Math.abs(hipY - shoulderY);
    }

    // Determine which wrist to track
    // Use the one that's more visible and/or more active
    const wrist = this.selectWrist(leftWrist, rightWrist, hipX);

    // Add to history for smoothing
    this.wristHistory.push({ 
      x: wrist.x, 
      y: wrist.y, 
      time: timestamp,
      visibility: wrist.visibility 
    });
    this.hipHistory.push({ x: hipX, y: hipY, time: timestamp });
    
    // Keep history limited
    while (this.wristHistory.length > this.config.smoothingWindow) {
      this.wristHistory.shift();
      this.hipHistory.shift();
    }

    // Get smoothed positions
    const smoothedWrist = this.getSmoothedPosition(this.wristHistory);
    const smoothedHip = this.getSmoothedPosition(this.hipHistory);
    
    // Calculate relative positions (normalized by torso length)
    const relativeHeight = this.torsoLength 
      ? (smoothedHip.y - smoothedWrist.y) / this.torsoLength
      : 0;
    
    // Positive = wrist in front of hip, Negative = wrist behind hip
    // Note: In side view, X increases to the right
    // We need to know which way athlete is facing
    const relativeX = this.torsoLength
      ? (smoothedWrist.x - smoothedHip.x) / this.torsoLength
      : 0;

    // Calculate velocities
    const velocityY = this.calculateVelocityY();
    const velocityX = this.calculateVelocityX();
    
    // Check stability
    if (Math.abs(velocityY) < this.config.stableVelocity && 
        Math.abs(velocityX) < this.config.stableVelocity) {
      this.stableFrameCount++;
    } else {
      this.stableFrameCount = 0;
    }

    // Determine wrist zone
    const zone = this.classifyWristZone(relativeHeight, relativeX);

    // Run state machine
    const previousPhase = this.phase;
    this.updatePhase(relativeHeight, relativeX, velocityY, velocityX, timestamp, zone);
    
    if (this.phase !== previousPhase) {
      this.framesInPhase = 0;
      this.onPhaseChange(this.phase, previousPhase, this.repCount);
    } else {
      this.framesInPhase++;
    }

    // Track peak height and velocity during drive/float
    if (this.phase === Phase.DRIVE || this.phase === Phase.FLOAT) {
      if (relativeHeight > this.currentRep.peakHeight) {
        this.currentRep.peakHeight = relativeHeight;
        this.currentRep.floatTime = timestamp;
      }
      if (velocityY > 0) {
        this.currentRep.velocities.push(velocityY);
        if (velocityY > this.currentRep.peakVelocity) {
          this.currentRep.peakVelocity = velocityY;
        }
      }
    }

    return this.getState(relativeHeight, relativeX, velocityY, zone);
  }

  selectWrist(leftWrist, rightWrist, hipX) {
    // If we've already determined swing side, use that wrist
    if (this.swingSide === 'left') return leftWrist;
    if (this.swingSide === 'right') return rightWrist;
    
    // Otherwise use the more visible one
    if (leftWrist.visibility > rightWrist.visibility + 0.1) {
      return leftWrist;
    } else if (rightWrist.visibility > leftWrist.visibility + 0.1) {
      return rightWrist;
    }
    
    // If similar visibility, use the one further from hip in X (more likely holding KB)
    const leftDist = Math.abs(leftWrist.x - hipX);
    const rightDist = Math.abs(rightWrist.x - hipX);
    return leftDist > rightDist ? leftWrist : rightWrist;
  }

  getSmoothedPosition(history) {
    if (history.length === 0) return { x: 0, y: 0 };
    const sumX = history.reduce((acc, p) => acc + p.x, 0);
    const sumY = history.reduce((acc, p) => acc + p.y, 0);
    return { 
      x: sumX / history.length,
      y: sumY / history.length 
    };
  }

  calculateVelocityY() {
    if (this.wristHistory.length < 2) return 0;
    
    const current = this.wristHistory[this.wristHistory.length - 1];
    const previous = this.wristHistory[this.wristHistory.length - 2];
    
    const dt = (current.time - previous.time) / 1000;
    if (dt === 0) return 0;
    
    // Negative dy when moving up (Y is inverted), so we flip it
    const dy = previous.y - current.y;
    return dy / dt;
  }

  calculateVelocityX() {
    if (this.wristHistory.length < 2) return 0;
    
    const current = this.wristHistory[this.wristHistory.length - 1];
    const previous = this.wristHistory[this.wristHistory.length - 2];
    
    const dt = (current.time - previous.time) / 1000;
    if (dt === 0) return 0;
    
    const dx = current.x - previous.x;
    return dx / dt;
  }

  /**
   * Classify where the wrist is relative to the body
   */
  classifyWristZone(relativeHeight, relativeX) {
    const isLow = relativeHeight < this.config.lowThreshold;
    const isHigh = relativeHeight > this.config.floatThreshold;
    const isForward = Math.abs(relativeX) > this.config.forwardThreshold;
    const isBehind = Math.abs(relativeX) <= this.config.forwardThreshold;
    
    // Determine zone
    if (isHigh) return 'HIGH';
    if (isLow && isForward) return 'LOW_FORWARD'; // KB on floor or in front (READY/PARK)
    if (isLow && isBehind) return 'LOW_BEHIND';   // KB between legs (HIKE)
    return 'MID';
  }

  updatePhase(relativeHeight, relativeX, velocityY, velocityX, timestamp, zone) {
    // Must be in phase for minimum frames before transitioning (reduces noise)
    const canTransition = this.framesInPhase >= this.config.minFramesInPhase;
    
    switch (this.phase) {
      case Phase.READY:
        // In READY: wrist is low and forward (KB on floor in front, hip hinged)
        // Transition to HIKE when wrist moves back (toward/past hip X)
        if (canTransition && zone === 'LOW_BEHIND') {
          this.phase = Phase.HIKE;
          this.currentRep.startTime = timestamp;
        }
        break;

      case Phase.HIKE:
        // In HIKE: wrist is low and behind/between legs
        // Transition to DRIVE when wrist starts moving up with velocity
        if (canTransition && velocityY > this.config.minDriveVelocity) {
          this.phase = Phase.DRIVE;
          this.currentRep.driveStartTime = timestamp;
        }
        break;

      case Phase.DRIVE:
        // In DRIVE: wrist moving upward
        // Transition to FLOAT when wrist reaches peak height
        if (canTransition && zone === 'HIGH') {
          this.phase = Phase.FLOAT;
        }
        // Or if velocity reverses before reaching HIGH (short swing)
        else if (canTransition && velocityY < this.config.minDropVelocity) {
          this.phase = Phase.DROP;
        }
        break;

      case Phase.FLOAT:
        // In FLOAT: wrist at peak
        // Transition to DROP when wrist starts descending
        if (canTransition && velocityY < this.config.minDropVelocity) {
          this.phase = Phase.DROP;
        }
        break;

      case Phase.DROP:
        // In DROP: wrist descending
        // Transition to HIKE when wrist returns to low-behind position (next rep)
        if (canTransition && zone === 'LOW_BEHIND') {
          this.completeRep(timestamp);
          this.phase = Phase.HIKE;
          this.currentRep.startTime = timestamp;
        }
        // Or transition to PARK if wrist returns to low-forward and stabilizes
        else if (zone === 'LOW_FORWARD' && this.stableFrameCount > this.config.stableFrames) {
          this.completeRep(timestamp);
          this.phase = Phase.PARK;
        }
        break;

      case Phase.PARK:
        // In PARK: set is complete, KB on floor
        // Transition back to READY if stable, or to HIKE if starting new set
        if (this.stableFrameCount > this.config.stableFrames) {
          this.phase = Phase.READY;
        }
        break;
    }
  }

  completeRep(timestamp) {
    this.currentRep.endTime = timestamp;
    this.repCount++;
    
    const repData = {
      rep: this.repCount,
      duration: this.currentRep.endTime - this.currentRep.startTime,
      driveTime: this.currentRep.floatTime 
        ? this.currentRep.floatTime - this.currentRep.driveStartTime 
        : null,
      peakVelocity: this.currentRep.peakVelocity,
      avgVelocity: this.currentRep.velocities.length > 0
        ? this.currentRep.velocities.reduce((a, b) => a + b, 0) / this.currentRep.velocities.length
        : 0,
      peakHeight: this.currentRep.peakHeight,
      timestamp: timestamp
    };

    this.onRepComplete(repData);
    
    // Reset for next rep
    this.currentRep = this.createEmptyRep();
  }

  getState(relativeHeight = 0, relativeX = 0, velocityY = 0, zone = 'UNKNOWN') {
    return {
      phase: this.phase,
      repCount: this.repCount,
      framesInPhase: this.framesInPhase,
      relativeHeight: relativeHeight.toFixed(3),
      relativeX: relativeX.toFixed(3),
      velocityY: velocityY.toFixed(2),
      zone: zone,
      stable: this.stableFrameCount > this.config.stableFrames,
      torsoLength: this.torsoLength?.toFixed(3) || 'calibrating'
    };
  }

  // Adjust thresholds on the fly (for tuning UI)
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

export default RepDetector;
