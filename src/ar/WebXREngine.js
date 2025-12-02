/**
 * WebXR AR Engine - Uses browser's WebXR Device API for AR
 * Provides better tracking than manual OpenCV SLAM
 * Falls back gracefully if WebXR is not supported
 */

export class WebXREngine {
    constructor() {
        this.xrSession = null;
        this.xrRefSpace = null;
        this.xrHitTestSource = null;
        this.isSupported = false;
        this.isSessionActive = false;

        // Tracking state
        this.isTracking = false;
        this.currentPose = null;
        this.hitTestResults = [];

        // Camera pose
        this.viewerPose = null;

        // Plane detection confidence
        this.planeConfidence = 0;

        console.log('[WebXREngine] Initialized');
    }

    async checkSupport() {
        if (!navigator.xr) {
            console.warn('[WebXREngine] WebXR not supported');
            return false;
        }

        try {
            this.isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            console.log('[WebXREngine] immersive-ar supported:', this.isSupported);
            return this.isSupported;
        } catch (error) {
            console.error('[WebXREngine] Error checking support:', error);
            return false;
        }
    }

    async init() {
        const supported = await this.checkSupport();

        if (!supported) {
            throw new Error('WebXR AR not supported on this device/browser');
        }

        console.log('[WebXREngine] Ready to start session');
        return true;
    }

    async startSession(canvas) {
        if (!this.isSupported) {
            throw new Error('WebXR not supported');
        }

        try {
            // Request AR session
            this.xrSession = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: document.body }
            });

            console.log('[WebXREngine] AR session started');

            // Setup reference space
            this.xrRefSpace = await this.xrSession.requestReferenceSpace('local');

            // Setup hit test source for plane detection
            const hitTestSource = await this.xrSession.requestHitTestSource({
                space: await this.xrSession.requestReferenceSpace('viewer')
            });
            this.xrHitTestSource = hitTestSource;

            // Session event handlers
            this.xrSession.addEventListener('end', () => {
                this.onSessionEnd();
            });

            this.isSessionActive = true;

            return this.xrSession;

        } catch (error) {
            console.error('[WebXREngine] Failed to start session:', error);
            throw error;
        }
    }

    processFrame(frame) {
        const result = {
            isTracking: false,
            hasFeatures: false,
            featureCount: 0,
            planeCount: 0,
            pose: null,
            hitTestResult: null
        };

        if (!this.isSessionActive || !frame) {
            return result;
        }

        try {
            // Get viewer pose (camera pose)
            this.viewerPose = frame.getViewerPose(this.xrRefSpace);

            if (!this.viewerPose) {
                return result;
            }

            // Get hit test results (plane detection)
            if (this.xrHitTestSource) {
                this.hitTestResults = frame.getHitTestResults(this.xrHitTestSource);

                if (this.hitTestResults.length > 0) {
                    const hit = this.hitTestResults[0];
                    const hitPose = hit.getPose(this.xrRefSpace);

                    if (hitPose) {
                        // Gradually build confidence
                        this.planeConfidence = Math.min(1.0, this.planeConfidence + 0.15);

                        // Extract position and orientation
                        const position = hitPose.transform.position;
                        const orientation = hitPose.transform.orientation;

                        this.currentPose = {
                            position: {
                                x: position.x,
                                y: position.y,
                                z: position.z
                            },
                            rotation: {
                                x: orientation.x,
                                y: orientation.y,
                                z: orientation.z,
                                w: orientation.w
                            },
                            matrix: hitPose.transform.matrix,
                            confidence: this.planeConfidence
                        };

                        result.isTracking = this.planeConfidence > 0.5;
                        result.hasFeatures = true;
                        result.featureCount = this.hitTestResults.length;
                        result.planeCount = this.hitTestResults.length;
                        result.pose = this.currentPose;
                        result.hitTestResult = hitPose;
                    }
                } else {
                    // No hit test results, decrease confidence
                    this.planeConfidence = Math.max(0, this.planeConfidence - 0.1);
                }
            }

            // Store viewer pose for camera updates
            if (this.viewerPose.views.length > 0) {
                const view = this.viewerPose.views[0];
                result.viewerTransform = view.transform;
            }

        } catch (error) {
            console.error('[WebXREngine] Frame processing error:', error);
        }

        this.isTracking = result.isTracking;
        return result;
    }

    getViewerPose() {
        return this.viewerPose;
    }

    onSessionEnd() {
        console.log('[WebXREngine] Session ended');
        this.isSessionActive = false;
        this.xrSession = null;
        this.xrRefSpace = null;
        this.xrHitTestSource = null;
        this.isTracking = false;
        this.planeConfidence = 0;
    }

    async endSession() {
        if (this.xrSession) {
            await this.xrSession.end();
        }
    }

    reset() {
        this.isTracking = false;
        this.currentPose = null;
        this.hitTestResults = [];
        this.planeConfidence = 0;
        console.log('[WebXREngine] Reset');
    }

    dispose() {
        this.endSession();
        console.log('[WebXREngine] Disposed');
    }
}
