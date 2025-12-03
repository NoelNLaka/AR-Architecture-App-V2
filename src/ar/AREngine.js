/**
 * AR Engine - OpenCV.js based visual SLAM implementation
 * Handles feature detection, tracking, plane detection, and pose estimation
 */

export class AREngine {
    constructor() {
        // OpenCV matrices
        this.frame = null;
        this.grayFrame = null;
        this.prevGrayFrame = null;
        
        // Feature detection
        this.orb = null;
        this.keypoints = null;
        this.descriptors = null;
        this.prevKeypoints = null;
        this.prevDescriptors = null;
        
        // Tracking
        this.isTracking = false;
        this.trackedPoints = [];
        this.currentPose = null;
        
        // Plane detection
        this.detectedPlanes = [];
        this.groundPlane = null;
        
        // IMU data for sensor fusion
        this.imuData = {
            alpha: 0, // Z-axis rotation
            beta: 0,  // X-axis rotation
            gamma: 0  // Y-axis rotation
        };
        
        // Camera calibration (approximate for mobile)
        this.cameraMatrix = null;
        this.distCoeffs = null;
        
        // Settings
        this.settings = {
            maxFeatures: 500,
            qualityLevel: 0.01,
            minDistance: 10,
            blockSize: 3,
            useHarrisDetector: false,
            k: 0.04,
            ransacThreshold: 3.0,
            minInliers: 10
        };
        
        // Debug canvas
        this.debugCanvas = document.getElementById('debug-canvas');
        this.debugCtx = this.debugCanvas?.getContext('2d');
        this.showDebug = false;
    }

    async init() {
        // Initialize OpenCV matrices
        this.keypoints = new cv.KeyPointVector();
        this.descriptors = new cv.Mat();
        this.prevKeypoints = new cv.KeyPointVector();
        this.prevDescriptors = new cv.Mat();
        
        // Create ORB detector
        this.orb = new cv.ORB(this.settings.maxFeatures);
        
        // Create BFMatcher for descriptor matching
        this.matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
        
        // Initialize camera matrix (will be updated based on video dimensions)
        this.initCameraMatrix(1280, 720);
        
        // Setup IMU listener
        this.setupIMU();
        
        console.log('AR Engine initialized');
    }

    initCameraMatrix(width, height) {
        // Approximate camera intrinsics
        // Focal length ~= width for typical smartphone cameras
        const fx = width;
        const fy = width;
        const cx = width / 2;
        const cy = height / 2;
        
        this.cameraMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
            fx, 0, cx,
            0, fy, cy,
            0, 0, 1
        ]);
        
        // Assume no distortion for simplicity
        this.distCoeffs = cv.matFromArray(5, 1, cv.CV_64F, [0, 0, 0, 0, 0]);
    }

    setupIMU() {
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (event) => {
                this.imuData.alpha = event.alpha || 0;
                this.imuData.beta = event.beta || 0;
                this.imuData.gamma = event.gamma || 0;
            });
        }
    }

    processFrame(video) {
        const result = {
            isTracking: false,
            hasFeatures: false,
            featureCount: 0,
            planeCount: 0,
            pose: null,
            imu: this.imuData
        };

        try {
            // Validate video dimensions before processing
            if (!video.videoWidth || !video.videoHeight || video.videoWidth === 0 || video.videoHeight === 0) {
                console.warn('[AREngine] Invalid video dimensions:', video.videoWidth, 'x', video.videoHeight);
                return result;
            }

            // Initialize or recreate frame if video dimensions changed
            if (!this.frame ||
                this.frame.rows !== video.videoHeight ||
                this.frame.cols !== video.videoWidth) {

                console.log('[AREngine] Initializing frame matrices with dimensions:', video.videoWidth, 'x', video.videoHeight);

                // Clean up old matrices if they exist
                if (this.frame) this.frame.delete();
                if (this.grayFrame) this.grayFrame.delete();
                if (this.prevGrayFrame) this.prevGrayFrame.delete();

                this.frame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                this.grayFrame = new cv.Mat();
                this.prevGrayFrame = new cv.Mat();

                // Update debug canvas size
                if (this.debugCanvas) {
                    this.debugCanvas.width = video.videoWidth;
                    this.debugCanvas.height = video.videoHeight;
                }

                // Update camera matrix
                this.initCameraMatrix(video.videoWidth, video.videoHeight);
            }

            // Read frame from video
            const cap = new cv.VideoCapture(video);
            cap.read(this.frame);
            
            // Convert to grayscale
            cv.cvtColor(this.frame, this.grayFrame, cv.COLOR_RGBA2GRAY);
            
            // Detect features
            this.detectFeatures();
            result.featureCount = this.keypoints.size();
            result.hasFeatures = result.featureCount > 20;
            
            // Track features if we have previous frame
            if (this.prevGrayFrame.rows > 0 && this.prevKeypoints.size() > 0) {
                const trackingSuccess = this.trackFeatures();
                
                if (trackingSuccess) {
                    // Detect planes from tracked points
                    const planeDetected = this.detectPlane();
                    result.planeCount = this.detectedPlanes.length;
                    
                    if (planeDetected) {
                        // Estimate pose
                        const poseEstimated = this.estimatePose();
                        result.isTracking = poseEstimated;
                        result.pose = this.currentPose;
                    }
                }
            }
            
            // Store current frame for next iteration
            this.grayFrame.copyTo(this.prevGrayFrame);
            
            // Swap keypoints and descriptors
            const tempKp = this.prevKeypoints;
            this.prevKeypoints = this.keypoints;
            this.keypoints = tempKp;
            this.keypoints.delete();
            this.keypoints = new cv.KeyPointVector();
            
            const tempDesc = this.prevDescriptors;
            this.prevDescriptors = this.descriptors;
            this.descriptors = tempDesc;
            
            // Draw debug visualization
            if (this.showDebug) {
                this.drawDebug(result);
            }
            
        } catch (error) {
            console.error('Frame processing error:', error);
        }

        this.isTracking = result.isTracking;
        return result;
    }

    detectFeatures() {
        // Clear previous keypoints
        this.keypoints.delete();
        this.keypoints = new cv.KeyPointVector();
        this.descriptors.delete();
        this.descriptors = new cv.Mat();
        
        // Detect ORB keypoints and compute descriptors
        this.orb.detectAndCompute(this.grayFrame, new cv.Mat(), this.keypoints, this.descriptors);
    }

    trackFeatures() {
        if (this.prevKeypoints.size() === 0 || this.keypoints.size() === 0) {
            return false;
        }
        
        // Match features using BFMatcher
        const matches = new cv.DMatchVector();
        
        try {
            if (this.prevDescriptors.rows > 0 && this.descriptors.rows > 0) {
                this.matcher.match(this.prevDescriptors, this.descriptors, matches);
            }
        } catch (e) {
            console.warn('Matching failed:', e);
            matches.delete();
            return false;
        }
        
        if (matches.size() < this.settings.minInliers) {
            matches.delete();
            return false;
        }
        
        // Filter good matches
        this.trackedPoints = [];
        const goodMatches = [];
        
        // Find min distance
        let minDist = Infinity;
        for (let i = 0; i < matches.size(); i++) {
            const dist = matches.get(i).distance;
            if (dist < minDist) minDist = dist;
        }
        
        // Keep matches with distance < 3 * minDist
        const threshold = Math.max(3 * minDist, 30);
        
        for (let i = 0; i < matches.size(); i++) {
            const match = matches.get(i);
            if (match.distance < threshold) {
                const queryIdx = match.queryIdx;
                const trainIdx = match.trainIdx;
                
                const prevKp = this.prevKeypoints.get(queryIdx);
                const currKp = this.keypoints.get(trainIdx);
                
                this.trackedPoints.push({
                    prev: { x: prevKp.pt.x, y: prevKp.pt.y },
                    curr: { x: currKp.pt.x, y: currKp.pt.y }
                });
                
                goodMatches.push(match);
            }
        }
        
        matches.delete();
        return this.trackedPoints.length >= this.settings.minInliers;
    }

    detectPlane() {
        if (this.trackedPoints.length < 8) {
            return false;
        }
        
        // Convert tracked points to OpenCV format
        const srcPoints = [];
        const dstPoints = [];
        
        for (const pt of this.trackedPoints) {
            srcPoints.push(pt.prev.x, pt.prev.y);
            dstPoints.push(pt.curr.x, pt.curr.y);
        }
        
        const srcMat = cv.matFromArray(this.trackedPoints.length, 1, cv.CV_32FC2, srcPoints);
        const dstMat = cv.matFromArray(this.trackedPoints.length, 1, cv.CV_32FC2, dstPoints);
        
        try {
            // Find homography using RANSAC
            const mask = new cv.Mat();
            const H = cv.findHomography(srcMat, dstMat, cv.RANSAC, this.settings.ransacThreshold, mask);
            
            // Count inliers
            let inlierCount = 0;
            for (let i = 0; i < mask.rows; i++) {
                if (mask.data[i] > 0) inlierCount++;
            }
            
            srcMat.delete();
            dstMat.delete();
            mask.delete();
            
            if (inlierCount >= this.settings.minInliers && !H.empty()) {
                // Valid plane detected
                this.groundPlane = {
                    homography: H,
                    inliers: inlierCount,
                    center: this.calculatePlaneCenter()
                };
                
                this.detectedPlanes = [this.groundPlane];
                return true;
            }
            
            if (!H.empty()) H.delete();
            
        } catch (error) {
            console.warn('Plane detection error:', error);
            srcMat.delete();
            dstMat.delete();
        }
        
        return false;
    }

    calculatePlaneCenter() {
        if (this.trackedPoints.length === 0) {
            return { x: 0, y: 0 };
        }
        
        let sumX = 0, sumY = 0;
        for (const pt of this.trackedPoints) {
            sumX += pt.curr.x;
            sumY += pt.curr.y;
        }
        
        return {
            x: sumX / this.trackedPoints.length,
            y: sumY / this.trackedPoints.length
        };
    }

    estimatePose() {
        if (!this.groundPlane) {
            return false;
        }
        
        // Use homography to estimate camera pose
        // This is a simplified approach - full SLAM would use bundle adjustment
        
        const H = this.groundPlane.homography;
        
        if (!H || H.empty()) {
            return false;
        }
        
        try {
            // Decompose homography to get rotation and translation
            // Using a simplified method based on SVD
            
            const h1 = [H.doubleAt(0, 0), H.doubleAt(1, 0), H.doubleAt(2, 0)];
            const h2 = [H.doubleAt(0, 1), H.doubleAt(1, 1), H.doubleAt(2, 1)];
            const h3 = [H.doubleAt(0, 2), H.doubleAt(1, 2), H.doubleAt(2, 2)];
            
            // Normalize by camera matrix (simplified)
            const fx = this.cameraMatrix.doubleAt(0, 0);
            const fy = this.cameraMatrix.doubleAt(1, 1);
            
            // Estimate translation (simplified)
            const tx = h3[0] / fx;
            const ty = h3[1] / fy;
            const tz = 1.0; // Assume fixed distance
            
            // Combine with IMU for rotation
            const rotX = this.imuData.beta * (Math.PI / 180);
            const rotY = this.imuData.gamma * (Math.PI / 180);
            const rotZ = this.imuData.alpha * (Math.PI / 180);
            
            this.currentPose = {
                position: {
                    x: tx,
                    y: ty,
                    z: tz
                },
                rotation: {
                    x: rotX,
                    y: rotY,
                    z: rotZ
                },
                planeCenter: this.groundPlane.center
            };
            
            return true;
            
        } catch (error) {
            console.warn('Pose estimation error:', error);
            return false;
        }
    }

    drawDebug(result) {
        if (!this.debugCtx || !this.debugCanvas) return;
        
        const ctx = this.debugCtx;
        ctx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);
        
        // Draw tracked feature points
        ctx.fillStyle = '#00ff00';
        for (let i = 0; i < this.keypoints.size(); i++) {
            const kp = this.keypoints.get(i);
            ctx.beginPath();
            ctx.arc(kp.pt.x, kp.pt.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw tracking lines
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1;
        for (const pt of this.trackedPoints) {
            ctx.beginPath();
            ctx.moveTo(pt.prev.x, pt.prev.y);
            ctx.lineTo(pt.curr.x, pt.curr.y);
            ctx.stroke();
        }
        
        // Draw plane center
        if (this.groundPlane) {
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(this.groundPlane.center.x, this.groundPlane.center.y, 10, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw plane indicator
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.groundPlane.center.x, this.groundPlane.center.y, 50, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    setDebugVisible(visible) {
        this.showDebug = visible;
        if (this.debugCanvas) {
            this.debugCanvas.classList.toggle('visible', visible);
        }
    }

    updateSettings(settings) {
        Object.assign(this.settings, settings);
        
        // Recreate ORB if maxFeatures changed
        if (settings.maxFeatures) {
            this.orb.delete();
            this.orb = new cv.ORB(this.settings.maxFeatures);
        }
    }

    reset() {
        this.isTracking = false;
        this.trackedPoints = [];
        this.currentPose = null;
        this.detectedPlanes = [];
        this.groundPlane = null;

        // Safely reset frame data if initialized
        if (this.prevGrayFrame && this.prevGrayFrame.rows > 0) {
            this.prevGrayFrame.setTo([0, 0, 0, 0]);
        }
    }

    dispose() {
        // Clean up OpenCV resources
        this.frame?.delete();
        this.grayFrame?.delete();
        this.prevGrayFrame?.delete();
        this.keypoints?.delete();
        this.descriptors?.delete();
        this.prevKeypoints?.delete();
        this.prevDescriptors?.delete();
        this.cameraMatrix?.delete();
        this.distCoeffs?.delete();
        this.orb?.delete();
        this.matcher?.delete();
    }
}
