/**
 * Scene Manager - Three.js scene setup and rendering
 * Handles 3D model rendering overlaid on camera feed
 */

import * as THREE from 'three';

export class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.model = null;
        this.modelGroup = null;
        this.groundPlane = null;
        this.shadowPlane = null;
        this.lights = {};
        
        // Model state
        this.isModelPlaced = false;
        this.modelScale = 1.0;
        this.modelRotation = 0;
        this.placedPosition = new THREE.Vector3();
        
        // Screen dimensions
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
        
        // Last known pose for placement
        this.lastPose = null;

        // World tracking
        this.worldTrackingEnabled = false;
        this.initialCameraPosition = new THREE.Vector3(0, 1.5, 0);
        this.initialCameraRotation = new THREE.Euler(0, 0, 0);

        // Animation
        this.mixer = null;
        this.clock = new THREE.Clock();
    }

    async init() {
        const canvas = document.getElementById('ar-canvas');
        
        // Create scene
        this.scene = new THREE.Scene();
        
        // Create camera
        // Using a perspective camera positioned to look down at the scene
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 1000);
        
        // Position camera to simulate looking at the ground from phone height
        this.camera.position.set(0, 1.5, 0);
        this.camera.lookAt(0, 0, -3);
        
        // Create renderer with transparency
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        // Setup lighting
        this.setupLighting();
        
        // Create model group for transformations
        this.modelGroup = new THREE.Group();
        this.modelGroup.visible = false; // IMPORTANT: Hide by default
        this.scene.add(this.modelGroup);
        
        // Create shadow receiving plane
        this.createShadowPlane();
        
        // Create ground indicator
        this.createGroundIndicator();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
        
        console.log('[SceneManager] Initialized');
    }

    setupLighting() {
        // Ambient light
        this.lights.ambient = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this.lights.ambient);
        
        // Directional light (sun)
        this.lights.sun = new THREE.DirectionalLight(0xffffff, 1.0);
        this.lights.sun.position.set(5, 10, 5);
        this.lights.sun.castShadow = true;
        this.lights.sun.shadow.mapSize.width = 1024;
        this.lights.sun.shadow.mapSize.height = 1024;
        this.lights.sun.shadow.camera.near = 0.5;
        this.lights.sun.shadow.camera.far = 50;
        this.lights.sun.shadow.camera.left = -10;
        this.lights.sun.shadow.camera.right = 10;
        this.lights.sun.shadow.camera.top = 10;
        this.lights.sun.shadow.camera.bottom = -10;
        this.scene.add(this.lights.sun);
        
        // Hemisphere light
        this.lights.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x545454, 0.4);
        this.scene.add(this.lights.hemisphere);
    }

    createShadowPlane() {
        const geometry = new THREE.PlaneGeometry(50, 50);
        const material = new THREE.ShadowMaterial({ opacity: 0.3 });
        
        this.shadowPlane = new THREE.Mesh(geometry, material);
        this.shadowPlane.rotation.x = -Math.PI / 2;
        this.shadowPlane.position.y = 0;
        this.shadowPlane.receiveShadow = true;
        this.shadowPlane.visible = false;
        this.scene.add(this.shadowPlane);
    }

    createGroundIndicator() {
        // Animated ring indicator
        const geometry = new THREE.RingGeometry(0.2, 0.3, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        this.groundIndicator = new THREE.Mesh(geometry, material);
        this.groundIndicator.rotation.x = -Math.PI / 2;
        this.groundIndicator.visible = false;
        this.scene.add(this.groundIndicator);
        
        // Grid helper
        this.gridHelper = new THREE.GridHelper(1.5, 8, 0x00ffff, 0x006666);
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.opacity = 0.4;
        this.gridHelper.visible = false;
        this.scene.add(this.gridHelper);
    }

    setModel(model) {
        console.log('[SceneManager] setModel called');
        
        // Remove existing model
        if (this.model) {
            this.modelGroup.remove(this.model);
            this.disposeObject(this.model);
        }
        
        this.model = model;
        this.isModelPlaced = false;
        
        // IMPORTANT: Ensure model group is hidden
        this.modelGroup.visible = false;
        
        if (model) {
            // Calculate bounding box
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            console.log('[SceneManager] Model original size:', size);
            console.log('[SceneManager] Model center:', center);
            
            // Center model horizontally, place bottom at y=0
            model.position.x = -center.x;
            model.position.z = -center.z;
            model.position.y = -box.min.y;
            
            // Scale to reasonable size (~1 meter for preview)
            const maxDim = Math.max(size.x, size.y, size.z);
            const targetSize = 0.8;
            const scale = targetSize / maxDim;
            model.scale.setScalar(scale);
            model.userData.baseScale = scale;
            
            console.log('[SceneManager] Model scale:', scale);
            
            // Enable shadows
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            this.modelGroup.add(model);
            
            // IMPORTANT: Keep hidden until placed
            this.modelGroup.visible = false;
            
            console.log('[SceneManager] Model configured');
            console.log('[SceneManager] modelGroup.visible:', this.modelGroup.visible);
        }
    }

    placeModel(pose) {
        if (!this.model) {
            console.warn('[SceneManager] No model to place');
            return false;
        }

        console.log('[SceneManager] placeModel called with pose:', pose);

        // Place model at screen center (where crosshair is) not at plane center
        // Crosshair is at 50% of screen width and height
        const screenX = this.screenWidth / 2;
        const screenY = this.screenHeight / 2;

        console.log('[SceneManager] Screen center (crosshair):', screenX, screenY);
        console.log('[SceneManager] Screen size:', this.screenWidth, this.screenHeight);

        // Convert screen coordinates to normalized device coordinates (-1 to 1)
        // At center: (0, 0) in NDC
        const ndcX = 0;
        const ndcY = 0;

        console.log('[SceneManager] NDC:', ndcX, ndcY);

        // Create raycaster from screen center
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

        // Intersect with virtual ground plane at y=0
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectionPoint = new THREE.Vector3();

        const intersected = raycaster.ray.intersectPlane(groundPlane, intersectionPoint);

        if (intersected) {
            console.log('[SceneManager] Intersection point:', intersectionPoint);

            // Position model at intersection (where crosshair points)
            this.modelGroup.position.set(
                intersectionPoint.x,
                0,
                intersectionPoint.z
            );
        } else {
            // Fallback: place in front of camera
            console.log('[SceneManager] No intersection, using fallback position');
            this.modelGroup.position.set(0, 0, -2);
        }

        // Apply rotation
        this.modelGroup.rotation.y = this.modelRotation * (Math.PI / 180);

        // Show model
        this.modelGroup.visible = true;

        // Show and position shadow plane
        this.shadowPlane.visible = true;
        this.shadowPlane.position.x = this.modelGroup.position.x;
        this.shadowPlane.position.z = this.modelGroup.position.z;

        // Hide indicators
        this.groundIndicator.visible = false;
        this.gridHelper.visible = false;

        this.isModelPlaced = true;
        this.placedPosition.copy(this.modelGroup.position);

        console.log('[SceneManager] Model placed at:', this.modelGroup.position);
        console.log('[SceneManager] Model visible:', this.modelGroup.visible);

        return true;
    }

    updateModelPose(pose) {
        if (!pose) return;
        
        // Store last pose for placement
        this.lastPose = pose;
        
        const screenX = pose.planeCenter.x;
        const screenY = pose.planeCenter.y;
        
        // Convert to NDC
        const ndcX = (screenX / this.screenWidth) * 2 - 1;
        const ndcY = -(screenY / this.screenHeight) * 2 + 1;
        
        // Raycast to ground
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
        
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectionPoint = new THREE.Vector3();
        
        if (raycaster.ray.intersectPlane(groundPlane, intersectionPoint)) {
            if (!this.isModelPlaced) {
                // Update indicator position
                this.groundIndicator.position.set(
                    intersectionPoint.x,
                    0.01,
                    intersectionPoint.z
                );
                this.groundIndicator.visible = true;
                
                this.gridHelper.position.set(
                    intersectionPoint.x,
                    0,
                    intersectionPoint.z
                );
                this.gridHelper.visible = true;
            }
        }
    }

    resetModel() {
        console.log('[SceneManager] Resetting model');
        
        this.isModelPlaced = false;
        this.modelGroup.visible = false;
        this.shadowPlane.visible = false;
        this.groundIndicator.visible = false;
        this.gridHelper.visible = false;
        this.placedPosition.set(0, 0, 0);
        this.modelGroup.position.set(0, 0, 0);
    }

    setModelScale(scale) {
        this.modelScale = scale;
        if (this.model && this.model.userData.baseScale) {
            const newScale = this.model.userData.baseScale * scale;
            this.model.scale.setScalar(newScale);
        }
    }

    setModelRotation(degrees) {
        this.modelRotation = degrees;
        if (this.modelGroup) {
            this.modelGroup.rotation.y = degrees * (Math.PI / 180);
        }
    }

    setAmbientIntensity(intensity) {
        if (this.lights.ambient) {
            this.lights.ambient.intensity = intensity;
        }
    }

    setShadowEnabled(enabled) {
        if (this.shadowPlane) {
            this.shadowPlane.material.opacity = enabled ? 0.3 : 0;
        }
    }

    render() {
        const delta = this.clock.getDelta();
        
        if (this.mixer) {
            this.mixer.update(delta);
        }
        
        // Animate indicator
        if (this.groundIndicator && this.groundIndicator.visible) {
            this.groundIndicator.rotation.z += delta;
            this.groundIndicator.material.opacity = 0.5 + Math.sin(Date.now() * 0.005) * 0.3;
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    updateCameraFromPose(cameraPose) {
        if (!this.worldTrackingEnabled || !cameraPose) return;

        // Update camera position
        this.camera.position.set(
            cameraPose.position.x,
            cameraPose.position.y,
            cameraPose.position.z
        );

        // Update camera rotation
        // Note: DeviceOrientation coordinate system needs adjustment for Three.js
        // We invert some axes to match the expected camera behavior
        this.camera.rotation.order = 'YXZ'; // Important: set rotation order
        this.camera.rotation.set(
            -cameraPose.rotation.x, // Pitch (inverted for correct tilt)
            cameraPose.rotation.y,   // Yaw (compass heading)
            -cameraPose.rotation.z   // Roll (inverted for correct tilt)
        );
    }

    enableWorldTracking() {
        this.worldTrackingEnabled = true;
        // Store initial camera state
        this.initialCameraPosition.copy(this.camera.position);
        this.initialCameraRotation.copy(this.camera.rotation);
        console.log('[SceneManager] World tracking enabled');
    }

    disableWorldTracking() {
        this.worldTrackingEnabled = false;
        // Reset camera to initial position
        this.camera.position.copy(this.initialCameraPosition);
        this.camera.rotation.copy(this.initialCameraRotation);
        this.camera.lookAt(0, 0, -3);
        console.log('[SceneManager] World tracking disabled');
    }

    onResize() {
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
        
        this.camera.aspect = this.screenWidth / this.screenHeight;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(this.screenWidth, this.screenHeight);
    }

    disposeObject(obj) {
        obj.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    dispose() {
        this.disposeObject(this.scene);
        this.renderer.dispose();
    }
}
