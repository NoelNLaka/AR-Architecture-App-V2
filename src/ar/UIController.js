/**
 * UI Controller - Handles all user interface interactions
 */

export class UIController {
    constructor(app) {
        this.app = app;
        this.isDebugVisible = false; // Disable debug by default (was blocking camera)
        this.currentModelId = 'default-house';

        this.init();
    }

    init() {
        this.bindEvents();

        // Keep debug view hidden by default
        this.setDebugVisible(false);

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
}
