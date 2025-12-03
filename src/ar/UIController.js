/**
 * UI Controller - Handles all user interface interactions
 */

export class UIController {
    constructor(app) {
        this.app = app;
        this.isDebugVisible = true; // Enable debug by default
        this.currentModelId = 'default-house';
        
        this.init();
    }

    init() {
        this.bindEvents();
        
        // Enable debug view by default for troubleshooting
        this.setDebugVisible(true);
        
        // Load default model
        this.loadModel('default-house');
    }

    bindEvents() {
        // Place model button
        document.getElementById('btn-place').addEventListener('click', () => {
            this.onPlaceModel();
        });
        
        // Reset button
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.onReset();
        });
        
        // Models panel button
        document.getElementById('btn-models').addEventListener('click', () => {
            this.showPanel('model-panel');
        });
        
        // Settings button
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.showPanel('settings-panel');
        });
        
        // Debug button
        document.getElementById('btn-debug').addEventListener('click', () => {
            this.toggleDebug();
        });
        
        // Close panel buttons
        document.getElementById('close-model-panel').addEventListener('click', () => {
            this.hidePanel('model-panel');
        });
        
        document.getElementById('close-settings-panel').addEventListener('click', () => {
            this.hidePanel('settings-panel');
        });
        
        // Model selection
        document.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const modelId = e.currentTarget.dataset.model;
                this.onModelSelect(modelId);
            });
        });
        
        // Custom model upload
        document.getElementById('model-upload').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.onCustomModelUpload(e.target.files[0]);
            }
        });
        
        // Scale slider
        document.getElementById('scale-slider').addEventListener('input', (e) => {
            const scale = parseFloat(e.target.value);
            document.getElementById('scale-value').textContent = scale.toFixed(1) + 'x';
            this.app.setModelScale(scale);
        });
        
        // Rotation slider
        document.getElementById('rotation-slider').addEventListener('input', (e) => {
            const rotation = parseInt(e.target.value);
            document.getElementById('rotation-value').textContent = rotation + '°';
            this.app.setModelRotation(rotation);
        });
        
        // Settings
        document.getElementById('setting-debug').addEventListener('change', (e) => {
            this.setDebugVisible(e.target.checked);
        });
        
        document.getElementById('setting-features').addEventListener('input', (e) => {
            const features = parseInt(e.target.value);
            this.app.arEngine.updateSettings({ maxFeatures: features });
        });
        
        document.getElementById('setting-sensitivity').addEventListener('input', (e) => {
            const sensitivity = parseInt(e.target.value);
            const threshold = 11 - sensitivity; // Invert for intuitive control
            this.app.arEngine.updateSettings({ ransacThreshold: threshold });
        });
        
        document.getElementById('setting-shadow').addEventListener('change', (e) => {
            this.app.sceneManager.setShadowEnabled(e.target.checked);
        });
        
        document.getElementById('setting-ambient').addEventListener('input', (e) => {
            const intensity = parseInt(e.target.value) / 100;
            this.app.sceneManager.setAmbientIntensity(intensity);
        });

        // AR Mode switching
        document.getElementById('setting-ar-mode').addEventListener('change', (e) => {
            this.onARModeChange(e.target.value);
        });

        // Set GPS target button
        document.getElementById('btn-set-gps-target').addEventListener('click', () => {
            this.onSetGPSTarget();
        });

        // Use My Location button
        document.getElementById('btn-use-my-location').addEventListener('click', () => {
            this.onUseMyLocation();
        });

        // Initialize AR mode selector based on current mode
        this.updateARModeUI();

        // Show GPS overlay if in location mode
        if (this.app.arMode === 'location') {
            this.showGPSOverlay();
        }

        // Touch gestures for model manipulation
        this.setupTouchGestures();
        
        // Panel backdrop clicks
        document.querySelectorAll('.panel').forEach(panel => {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) {
                    this.hidePanel(panel.id);
                }
            });
        });
    }

    setupTouchGestures() {
        const canvas = document.getElementById('ar-canvas');
        let lastTouchDistance = 0;
        let lastTouchAngle = 0;
        
        canvas.style.pointerEvents = 'auto';
        
        // Pinch to scale
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                lastTouchDistance = this.getTouchDistance(e.touches);
                lastTouchAngle = this.getTouchAngle(e.touches);
            }
        });
        
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                
                const currentDistance = this.getTouchDistance(e.touches);
                const currentAngle = this.getTouchAngle(e.touches);
                
                // Scale
                if (lastTouchDistance > 0) {
                    const scaleDelta = currentDistance / lastTouchDistance;
                    const currentScale = parseFloat(document.getElementById('scale-slider').value);
                    const newScale = Math.max(0.1, Math.min(5, currentScale * scaleDelta));
                    
                    document.getElementById('scale-slider').value = newScale;
                    document.getElementById('scale-value').textContent = newScale.toFixed(1) + 'x';
                    this.app.setModelScale(newScale);
                }
                
                // Rotation
                const angleDelta = currentAngle - lastTouchAngle;
                const currentRotation = parseInt(document.getElementById('rotation-slider').value);
                const newRotation = (currentRotation + angleDelta * (180 / Math.PI)) % 360;
                
                document.getElementById('rotation-slider').value = newRotation;
                document.getElementById('rotation-value').textContent = Math.round(newRotation) + '°';
                this.app.setModelRotation(newRotation);
                
                lastTouchDistance = currentDistance;
                lastTouchAngle = currentAngle;
            }
        });
    }

    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getTouchAngle(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.atan2(dy, dx);
    }

    async onPlaceModel() {
        if (this.app.placeModel()) {
            // Show success feedback
            const btn = document.getElementById('btn-place');
            btn.innerHTML = '<span>✅</span><span>Placed!</span>';
            
            setTimeout(() => {
                btn.innerHTML = '<span>📍</span><span>Place Model</span>';
            }, 1500);
        }
    }

    onReset() {
        this.app.resetModel();
        
        // Reset sliders
        document.getElementById('scale-slider').value = 1;
        document.getElementById('scale-value').textContent = '1.0x';
        document.getElementById('rotation-slider').value = 0;
        document.getElementById('rotation-value').textContent = '0°';
    }

    async onModelSelect(modelId) {
        if (modelId === 'custom') {
            document.getElementById('model-upload').click();
            return;
        }
        
        this.selectModelItem(modelId);
        await this.loadModel(modelId);
        this.hidePanel('model-panel');
    }

    async onCustomModelUpload(file) {
        const success = await this.app.loadCustomModel(file);
        
        if (success) {
            // Update UI
            this.selectModelItem('custom');
            const customItem = document.querySelector('[data-model="custom"]');
            customItem.querySelector('span').textContent = file.name;
            
            this.hidePanel('model-panel');
        } else {
            alert('Failed to load model. Please try a different file.');
        }
    }

    async loadModel(modelId) {
        const success = await this.app.loadModel(modelId);
        if (success) {
            this.currentModelId = modelId;
            this.onReset(); // Reset position when loading new model
        }
    }

    selectModelItem(modelId) {
        document.querySelectorAll('.model-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selected = document.querySelector(`[data-model="${modelId}"]`);
        if (selected) {
            selected.classList.add('selected');
        }
    }

    showPanel(panelId) {
        document.getElementById(panelId).classList.remove('hidden');
    }

    hidePanel(panelId) {
        document.getElementById(panelId).classList.add('hidden');
    }

    toggleDebug() {
        this.setDebugVisible(!this.isDebugVisible);
    }

    setDebugVisible(visible) {
        this.isDebugVisible = visible;
        document.getElementById('debug-info').classList.toggle('hidden', !visible);
        document.getElementById('setting-debug').checked = visible;
        this.app.arEngine.setDebugVisible(visible);
    }

    updateARModeUI() {
        // Set the dropdown to match current AR mode
        const modeSelect = document.getElementById('setting-ar-mode');
        const gpsSettings = document.getElementById('gps-settings');

        if (this.app.isOutdoorMode || this.app.arMode === 'location') {
            modeSelect.value = 'outdoor';
            gpsSettings.classList.remove('hidden');
        } else {
            modeSelect.value = 'indoor';
            gpsSettings.classList.add('hidden');
        }
    }

    onARModeChange(mode) {
        const gpsSettings = document.getElementById('gps-settings');

        if (mode === 'outdoor') {
            gpsSettings.classList.remove('hidden');

            // Show confirmation dialog
            const confirmSwitch = confirm(
                'Switching to Outdoor GPS mode requires a page reload. Continue?'
            );

            if (confirmSwitch) {
                // Reload with outdoor mode parameter
                window.location.href = window.location.pathname + '?mode=outdoor';
            } else {
                // User cancelled, revert dropdown
                document.getElementById('setting-ar-mode').value = 'indoor';
                gpsSettings.classList.add('hidden');
            }
        } else {
            gpsSettings.classList.add('hidden');

            // Show confirmation dialog
            const confirmSwitch = confirm(
                'Switching to Indoor mode requires a page reload. Continue?'
            );

            if (confirmSwitch) {
                // Reload without mode parameter (defaults to indoor)
                window.location.href = window.location.pathname;
            } else {
                // User cancelled, revert dropdown
                document.getElementById('setting-ar-mode').value = 'outdoor';
                gpsSettings.classList.remove('hidden');
            }
        }
    }

    onSetGPSTarget() {
        const latInput = document.getElementById('setting-gps-lat');
        const lonInput = document.getElementById('setting-gps-lon');
        const altInput = document.getElementById('setting-gps-alt');
        const statusDiv = document.getElementById('gps-status');

        const latitude = parseFloat(latInput.value);
        const longitude = parseFloat(lonInput.value);
        const altitude = parseFloat(altInput.value) || 0;

        // Validate inputs
        if (isNaN(latitude) || isNaN(longitude)) {
            statusDiv.className = 'gps-status error';
            statusDiv.textContent = 'Please enter valid coordinates';
            return;
        }

        if (latitude < -90 || latitude > 90) {
            statusDiv.className = 'gps-status error';
            statusDiv.textContent = 'Latitude must be between -90 and 90';
            return;
        }

        if (longitude < -180 || longitude > 180) {
            statusDiv.className = 'gps-status error';
            statusDiv.textContent = 'Longitude must be between -180 and 180';
            return;
        }

        // Check if we're in location mode
        if (this.app.arMode !== 'location') {
            statusDiv.className = 'gps-status error';
            statusDiv.textContent = 'GPS mode not active. Switch to Outdoor mode first.';
            return;
        }

        // Set target location
        try {
            this.app.arEngine.setTargetLocation(latitude, longitude, altitude);

            statusDiv.className = 'gps-status success';
            statusDiv.textContent = `Target set: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

            console.log('[UIController] GPS target set:', { latitude, longitude, altitude });
        } catch (error) {
            statusDiv.className = 'gps-status error';
            statusDiv.textContent = 'Failed to set target: ' + error.message;
        }
    }

    onUseMyLocation() {
        const statusDiv = document.getElementById('gps-status');

        if (this.app.arMode !== 'location') {
            statusDiv.className = 'gps-status error';
            statusDiv.textContent = 'GPS mode not active. Switch to Outdoor mode first.';
            return;
        }

        if (!this.app.arEngine.currentLocation) {
            statusDiv.className = 'gps-status info';
            statusDiv.textContent = 'Acquiring GPS location... Please wait.';
            return;
        }

        // Set current location as target
        const loc = this.app.arEngine.currentLocation;

        // Auto-fill the inputs
        document.getElementById('setting-gps-lat').value = loc.latitude.toFixed(6);
        document.getElementById('setting-gps-lon').value = loc.longitude.toFixed(6);
        document.getElementById('setting-gps-alt').value = loc.altitude?.toFixed(1) || 0;

        // Set as target
        this.app.arEngine.setTargetLocation(loc.latitude, loc.longitude, loc.altitude || 0);

        statusDiv.className = 'gps-status success';
        statusDiv.textContent = `Target set to your location (±${loc.accuracy.toFixed(1)}m accuracy)`;

        // Show current location info
        this.updateCurrentLocationInfo();
    }

    updateCurrentLocationInfo() {
        if (!this.app.arEngine || !this.app.arEngine.currentLocation) {
            return;
        }

        const loc = this.app.arEngine.currentLocation;
        const infoDiv = document.getElementById('current-location-info');
        const latLonSpan = document.getElementById('current-lat-lon');
        const accuracySpan = document.getElementById('current-accuracy');

        latLonSpan.textContent = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
        accuracySpan.textContent = `±${loc.accuracy.toFixed(1)}m`;

        infoDiv.classList.remove('hidden');
    }

    showGPSOverlay() {
        const overlay = document.getElementById('gps-ar-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
        }
    }

    hideGPSOverlay() {
        const overlay = document.getElementById('gps-ar-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    updateGPSVisualization(gpsData) {
        if (!gpsData || !gpsData.targetLocation || gpsData.distance === null) {
            return;
        }

        // Update compass needle
        const needle = document.getElementById('compass-needle');
        if (needle && gpsData.bearing !== null) {
            needle.setAttribute('transform', `rotate(${gpsData.bearing} 100 100)`);
        }

        // Update compass text
        document.getElementById('compass-bearing').textContent = `${Math.round(gpsData.bearing)}°`;
        document.getElementById('compass-distance').textContent = `${gpsData.distance.toFixed(1)}m`;

        // Update distance indicator
        const maxDistance = this.app.arEngine.maxDistance || 1000;
        const distancePercent = Math.min(100, (gpsData.distance / maxDistance) * 100);

        document.getElementById('distance-bar-fill').style.width = `${distancePercent}%`;
        document.getElementById('distance-value').textContent = `${gpsData.distance.toFixed(1)} m`;

        // Update direction text
        const direction = this.getDirectionText(gpsData.bearing);
        document.getElementById('distance-direction').textContent = direction;

        // Update current location info if visible
        if (gpsData.currentLocation) {
            this.updateCurrentLocationInfo();
        }
    }

    getDirectionText(bearing) {
        if (bearing === null) return 'away';

        const directions = [
            { min: 337.5, max: 360, text: 'North' },
            { min: 0, max: 22.5, text: 'North' },
            { min: 22.5, max: 67.5, text: 'Northeast' },
            { min: 67.5, max: 112.5, text: 'East' },
            { min: 112.5, max: 157.5, text: 'Southeast' },
            { min: 157.5, max: 202.5, text: 'South' },
            { min: 202.5, max: 247.5, text: 'Southwest' },
            { min: 247.5, max: 292.5, text: 'West' },
            { min: 292.5, max: 337.5, text: 'Northwest' }
        ];

        for (const dir of directions) {
            if (bearing >= dir.min && bearing < dir.max) {
                return dir.text;
            }
        }

        return 'away';
    }
}
