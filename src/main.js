/**
 * AR Architecture App - Main Entry Point
 * Markerless AR using OpenCV.js for SLAM and Three.js for rendering
 * 
 * Choose between two AR engine implementations:
 * - AREngine: Full ORB feature detection + descriptor matching (more accurate, slower)
 * - AREngineSimple: Lucas-Kanade optical flow (faster, better for mobile)
 */

// import { AREngineSimple as AREngine } from './ar/AREngineSimple.js'; // Using simpler engine by default
import { AREngine } from './ar/AREngine.js'; // ORB-SLAM engine with Kalman filtering for indoor tracking
import { WebXREngine } from './ar/WebXREngine.js'; // WebXR for best indoor AR (ARCore/ARKit)
import { ARLocationEngine } from './ar/ARLocationEngine.js'; // GPS-based outdoor AR for architecture
import { SceneManager } from './ar/SceneManager.js';
import { UIController } from './ar/UIController.js';
import { ModelLoader } from './ar/ModelLoader.js';

class ARArchitectureApp {
    constructor() {
        this.arEngine = null;
        this.sceneManager = null;
        this.uiController = null;
        this.modelLoader = null;
        this.isInitialized = false;
        this.currentModel = null;

        // AR Mode tracking
        this.arMode = null; // 'webxr', 'location', or 'opencv'
        this.isOutdoorMode = false; // User preference for indoor vs outdoor

        this.init();
    }

    async init() {
        try {
            // Check if user wants outdoor mode (GPS-based)
            // This can be set via URL parameter: ?mode=outdoor
            const urlParams = new URLSearchParams(window.location.search);
            this.isOutdoorMode = urlParams.get('mode') === 'outdoor';

            if (this.isOutdoorMode) {
                // User wants outdoor GPS-based AR
                console.log('[Main] Outdoor mode requested - using GPS-based AR');
                await this.initLocationMode();
            } else {
                // Indoor mode - try WebXR first, fall back to OpenCV
                this.updateLoadingStatus('Checking WebXR support...', 10);

                const webxrEngine = new WebXREngine();
                const webxrSupported = await webxrEngine.checkSupport();

                if (webxrSupported) {
                    console.log('[Main] Using WebXR for indoor AR tracking');
                    this.arMode = 'webxr';
                    this.arEngine = webxrEngine;
                    await this.arEngine.init();

                    // Initialize Three.js scene
                    this.updateLoadingStatus('Setting up 3D scene...', 40);
                    this.sceneManager = new SceneManager();
                    await this.sceneManager.init();

                    // Initialize model loader
                    this.updateLoadingStatus('Preparing model loader...', 70);
                    this.modelLoader = new ModelLoader(this.sceneManager);

                    // Initialize UI
                    this.updateLoadingStatus('Setting up controls...', 90);
                    this.uiController = new UIController(this);

                    this.updateLoadingStatus('Ready! Tap "Start AR" to begin', 100);
                    this.hideLoadingScreen();

                    // WebXR requires user interaction to start
                    this.showStartARButton();

                } else {
                    // Fall back to OpenCV-based tracking with Kalman filtering
                    console.log('[Main] WebXR not supported, using OpenCV with Kalman filtering');
                    await this.initOpenCVMode();
                }
            }

        } catch (error) {
            console.error('Initialization error:', error);
            // Fall back to OpenCV mode on any error
            console.log('[Main] Falling back to OpenCV mode');
            await this.initOpenCVMode();
        }
    }

    async initLocationMode() {
        this.updateLoadingStatus('Initializing GPS tracking...', 10);

        try {
            // Check GPS support
            const locationEngine = new ARLocationEngine();
            const supported = await locationEngine.checkSupport();

            if (!supported) {
                throw new Error('GPS or compass not supported. Falling back to indoor mode.');
            }

            this.arMode = 'location';
            this.arEngine = locationEngine;
            await this.arEngine.init();

            this.updateLoadingStatus('GPS tracking active', 40);

            // Initialize Three.js scene
            this.updateLoadingStatus('Setting up 3D scene...', 60);
            this.sceneManager = new SceneManager();
            await this.sceneManager.init();

            // Initialize model loader
            this.updateLoadingStatus('Preparing model loader...', 80);
            this.modelLoader = new ModelLoader(this.sceneManager);

            // Initialize UI
            this.updateLoadingStatus('Setting up controls...', 95);
            this.uiController = new UIController(this);

            this.updateLoadingStatus('Ready! Set target location to place model', 100);
            await this.delay(500);
            this.hideLoadingScreen();

            this.isInitialized = true;
            this.startLocationLoop();

            console.log('[Main] Location-based AR initialized successfully');

        } catch (error) {
            console.error('[Main] Location mode failed:', error);
            alert('GPS mode not available. Switching to indoor mode.');
            this.isOutdoorMode = false;
            await this.initOpenCVMode();
        }
    }

    async initOpenCVMode() {
        this.updateLoadingStatus('Waiting for OpenCV.js...', 10);

        // Wait for OpenCV to be ready
        if (!window.cvReady) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('OpenCV.js load timeout'));
                }, 30000);

                document.addEventListener('opencv-ready', () => {
                    clearTimeout(timeout);
                    resolve();
                }, { once: true });
            });
        }

        this.updateLoadingStatus('OpenCV.js loaded', 30);

        // Check for camera support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not supported. Please use a modern browser.');
        }

        // Initialize camera
        this.updateLoadingStatus('Accessing camera...', 40);
        await this.initCamera();

        // Initialize AR Engine with Kalman filtering
        this.updateLoadingStatus('Initializing AR tracking...', 60);
        this.arMode = 'opencv';
        this.arEngine = new AREngine();
        await this.arEngine.init();

        // Initialize Three.js scene
        this.updateLoadingStatus('Setting up 3D scene...', 75);
        this.sceneManager = new SceneManager();
        await this.sceneManager.init();

        // Initialize model loader
        this.updateLoadingStatus('Preparing model loader...', 85);
        this.modelLoader = new ModelLoader(this.sceneManager);

        // Initialize UI
        this.updateLoadingStatus('Setting up controls...', 95);
        this.uiController = new UIController(this);

        // Start the AR loop
        this.updateLoadingStatus('Ready!', 100);
        await this.delay(500);
        this.hideLoadingScreen();

        this.isInitialized = true;
        this.startARLoop();

        console.log('AR App initialized successfully (OpenCV mode with Kalman filtering)');
    }

    showStartARButton() {
        // Create and show a button to start WebXR session
        const startButton = document.createElement('button');
        startButton.id = 'start-ar-btn';
        startButton.textContent = 'Start AR';
        startButton.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 20px 40px;
            font-size: 18px;
            background: #4fc3f7;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            z-index: 10000;
        `;

        startButton.onclick = async () => {
            try {
                const canvas = document.getElementById('ar-canvas');
                await this.arEngine.startSession(canvas);
                startButton.remove();

                this.isInitialized = true;
                this.startWebXRLoop();

                console.log('WebXR AR session started');
            } catch (error) {
                console.error('Failed to start WebXR session:', error);
                alert('Failed to start AR: ' + error.message);
            }
        };

        document.body.appendChild(startButton);
    }

    async initCamera() {
        const video = document.getElementById('camera-feed');
        
        // Try rear camera first
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
                frameRate: { ideal: 30, min: 15 }
            },
            audio: false
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            
            return new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    video.play()
                        .then(resolve)
                        .catch(reject);
                };
                video.onerror = (e) => reject(new Error('Video error: ' + e.message));
                
                // Timeout for video initialization
                setTimeout(() => reject(new Error('Camera initialization timeout')), 10000);
            });
            
        } catch (error) {
            console.warn('Preferred camera not available:', error.message);
            
            // Fallback to any camera
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
                video.srcObject = fallbackStream;
                
                return new Promise((resolve) => {
                    video.onloadedmetadata = () => {
                        video.play().then(resolve);
                    };
                });
            } catch (fallbackError) {
                throw new Error('Camera access denied. Please allow camera permission and reload.');
            }
        }
    }

    startARLoop() {
        const video = document.getElementById('camera-feed');
        let lastTime = performance.now();
        let frameCount = 0;
        let fpsUpdateTime = lastTime;
        
        const loop = () => {
            if (!this.isInitialized) return;
            
            const now = performance.now();
            frameCount++;
            
            // Update FPS display every second
            if (now - fpsUpdateTime >= 1000) {
                const fps = Math.round(frameCount * 1000 / (now - fpsUpdateTime));
                document.getElementById('fps').textContent = fps;
                frameCount = 0;
                fpsUpdateTime = now;
            }
            
            // Process frame with OpenCV
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                try {
                    const trackingResult = this.arEngine.processFrame(video);
                    
                    // Log status periodically
                    if (frameCount === 1 || frameCount % 60 === 0) {
                        console.log('[Main] Frame', frameCount, 'Features:', trackingResult.featureCount, 'Tracking:', trackingResult.isTracking);
                    }
                    
                    // Update UI based on tracking status
                    this.updateTrackingStatus(trackingResult);

                    // Update 3D scene
                    if (trackingResult.isTracking && this.currentModel) {
                        // Always update camera pose for device orientation tracking
                        this.sceneManager.updateCameraPose(trackingResult.pose);

                        // Only update model pose indicator BEFORE placement
                        if (!this.sceneManager.isModelPlaced) {
                            this.sceneManager.updateModelPose(trackingResult.pose);
                        }
                    }
                    
                    // Update debug info
                    if (this.uiController?.isDebugVisible) {
                        this.updateDebugInfo(trackingResult);
                    }
                } catch (error) {
                    console.warn('Frame processing error:', error);
                }
            }
            
            // Render Three.js scene
            this.sceneManager.render();
            
            lastTime = now;
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
    }

    startWebXRLoop() {
        let frameCount = 0;
        let fpsUpdateTime = performance.now();

        const onXRFrame = (time, frame) => {
            if (!this.isInitialized || !this.arEngine.isSessionActive) {
                return;
            }

            const session = frame.session;
            session.requestAnimationFrame(onXRFrame);

            frameCount++;

            // Update FPS display every second
            const now = performance.now();
            if (now - fpsUpdateTime >= 1000) {
                const fps = Math.round(frameCount * 1000 / (now - fpsUpdateTime));
                document.getElementById('fps').textContent = fps;
                frameCount = 0;
                fpsUpdateTime = now;
            }

            // Process WebXR frame
            const trackingResult = this.arEngine.processFrame(frame);

            // Log status periodically
            if (frameCount === 1 || frameCount % 60 === 0) {
                console.log('[Main] WebXR Frame', frameCount, 'Tracking:', trackingResult.isTracking, 'Confidence:', trackingResult.pose?.confidence);
            }

            // Update UI based on tracking status
            this.updateTrackingStatus(trackingResult);

            // Update camera from WebXR viewer pose
            if (trackingResult.viewerTransform && this.sceneManager.camera) {
                const transform = trackingResult.viewerTransform;
                const position = transform.position;
                const orientation = transform.orientation;

                // Update camera position and rotation from WebXR
                this.sceneManager.camera.position.set(position.x, position.y, position.z);
                this.sceneManager.camera.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
            }

            // Update model pose indicator BEFORE placement
            if (trackingResult.isTracking && this.currentModel && !this.sceneManager.isModelPlaced) {
                this.sceneManager.updateModelPose(trackingResult.pose);
            }

            // Render Three.js scene
            this.sceneManager.render();
        };

        this.arEngine.xrSession.requestAnimationFrame(onXRFrame);
    }

    startLocationLoop() {
        let frameCount = 0;
        let fpsUpdateTime = performance.now();

        const loop = () => {
            if (!this.isInitialized) return;

            const now = performance.now();
            frameCount++;

            // Update FPS display every second
            if (now - fpsUpdateTime >= 1000) {
                const fps = Math.round(frameCount * 1000 / (now - fpsUpdateTime));
                document.getElementById('fps').textContent = fps;
                frameCount = 0;
                fpsUpdateTime = now;
            }

            // Process GPS tracking (no video needed)
            const trackingResult = this.arEngine.processFrame();

            // Log status periodically
            if (frameCount === 1 || frameCount % 60 === 0) {
                if (trackingResult.gpsData) {
                    console.log('[Main] GPS Frame', frameCount,
                        'Distance:', trackingResult.gpsData.distance?.toFixed(1) + 'm',
                        'Accuracy:', trackingResult.gpsData.currentLocation?.accuracy?.toFixed(1) + 'm');
                }
            }

            // Update UI based on GPS tracking status
            this.updateTrackingStatus(trackingResult);

            // Update camera rotation from device orientation
            if (trackingResult.pose) {
                this.sceneManager.updateCameraPose(trackingResult.pose);
            }

            // Render Three.js scene
            this.sceneManager.render();

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
        console.log('[Main] Location-based AR loop started');
    }

    updateTrackingStatus(result) {
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');
        const placeBtn = document.getElementById('btn-place');

        indicator.className = '';

        // Handle GPS-based tracking differently
        if (this.arMode === 'location') {
            if (result.gpsData && result.gpsData.distance !== null) {
                indicator.classList.add('status-tracking');
                const distance = result.gpsData.distance.toFixed(1);
                const accuracy = result.gpsData.currentLocation?.accuracy.toFixed(1);
                text.textContent = `Target: ${distance}m away (±${accuracy}m accuracy)`;
                placeBtn.disabled = false;
            } else {
                indicator.classList.add('status-searching');
                text.textContent = 'Acquiring GPS location...';
                placeBtn.disabled = true;
            }
        } else {
            // Indoor tracking (WebXR or OpenCV)
            if (result.isTracking) {
                indicator.classList.add('status-tracking');
                const confidence = result.pose?.confidence ? ` (${(result.pose.confidence * 100).toFixed(0)}%)` : '';
                text.textContent = 'Surface detected' + confidence;
                placeBtn.disabled = false;
            } else if (result.hasFeatures) {
                indicator.classList.add('status-searching');
                text.textContent = `Searching... (${result.featureCount} features)`;
                placeBtn.disabled = true;
            } else {
                indicator.classList.add('status-lost');
                text.textContent = 'Point at a textured surface';
                placeBtn.disabled = true;
            }
        }
    }

    updateDebugInfo(result) {
        document.getElementById('feature-count').textContent = result.featureCount || 0;
        document.getElementById('plane-count').textContent = result.planeCount || 0;
        
        if (result.pose) {
            const { x, y, z } = result.pose.position;
            document.getElementById('pose-info').textContent = 
                `X:${x.toFixed(3)} Y:${y.toFixed(3)} Z:${z.toFixed(1)}`;
        }
        
        if (result.imu) {
            document.getElementById('imu-info').textContent = 
                `α:${result.imu.alpha?.toFixed(0) || '-'}° β:${result.imu.beta?.toFixed(0) || '-'}° γ:${result.imu.gamma?.toFixed(0) || '-'}°`;
        }
    }

    async loadModel(modelId) {
        try {
            this.updateLoadingStatus('Loading model...', 50);
            this.currentModel = await this.modelLoader.loadModel(modelId);
            this.sceneManager.setModel(this.currentModel);
            return true;
        } catch (error) {
            console.error('Failed to load model:', error);
            return false;
        }
    }

    async loadCustomModel(file) {
        try {
            this.updateLoadingStatus('Loading custom model...', 30);
            this.showLoadingScreen();
            
            this.currentModel = await this.modelLoader.loadFromFile(file);
            this.sceneManager.setModel(this.currentModel);
            
            this.hideLoadingScreen();
            return true;
        } catch (error) {
            console.error('Failed to load custom model:', error);
            this.hideLoadingScreen();
            return false;
        }
    }

    placeModel() {
        console.log('[Main] placeModel called');
        console.log('[Main] currentModel:', !!this.currentModel);
        console.log('[Main] currentPose:', this.arEngine.currentPose);
        
        if (this.currentModel && this.arEngine.currentPose) {
            const result = this.sceneManager.placeModel(this.arEngine.currentPose);
            console.log('[Main] placeModel result:', result);
            return result;
        }
        
        console.warn('[Main] Cannot place - missing model or pose');
        return false;
    }

    resetModel() {
        this.sceneManager.resetModel();
        this.arEngine.reset();
    }

    setModelScale(scale) {
        this.sceneManager.setModelScale(scale);
    }

    setModelRotation(degrees) {
        this.sceneManager.setModelRotation(degrees);
    }

    updateLoadingStatus(message, progress) {
        const statusEl = document.getElementById('loading-status');
        const progressEl = document.getElementById('progress-fill');
        
        if (statusEl) statusEl.textContent = message;
        if (progressEl) progressEl.style.width = `${progress}%`;
    }

    showLoadingScreen() {
        document.getElementById('loading-screen').classList.remove('hidden');
    }

    hideLoadingScreen() {
        document.getElementById('loading-screen').classList.add('hidden');
    }

    showError(message) {
        const statusEl = document.getElementById('loading-status');
        if (statusEl) {
            statusEl.innerHTML = `
                <span style="color: #f44336;">Error: ${message}</span>
                <br><br>
                <button onclick="location.reload()" style="
                    background: #4fc3f7;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                ">Retry</button>
            `;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.arApp = new ARArchitectureApp();
    });
} else {
    window.arApp = new ARArchitectureApp();
}
