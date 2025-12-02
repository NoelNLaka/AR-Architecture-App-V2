/**
 * AR.js Location-Based Engine
 * Uses GPS + compass for outdoor AR placement
 * Perfect for architectural visualization at real-world coordinates
 */

export class ARLocationEngine {
    constructor() {
        this.isSupported = false;
        this.isInitialized = false;
        this.isTracking = false;

        // GPS data
        this.currentLocation = null;
        this.targetLocation = null;
        this.watchId = null;

        // Device orientation (compass)
        this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };

        // Tracking state
        this.currentPose = null;
        this.distance = null;
        this.bearing = null;

        // Settings
        this.gpsAccuracyThreshold = 50; // meters
        this.minDistance = 5; // minimum distance to place model (meters)
        this.maxDistance = 1000; // maximum distance (meters)

        console.log('[ARLocationEngine] Initialized');
    }

    async checkSupport() {
        // Check for Geolocation API
        const hasGeolocation = 'geolocation' in navigator;

        // Check for DeviceOrientation API (compass)
        const hasOrientation = 'DeviceOrientationEvent' in window;

        this.isSupported = hasGeolocation && hasOrientation;

        console.log('[ARLocationEngine] GPS support:', hasGeolocation);
        console.log('[ARLocationEngine] Compass support:', hasOrientation);

        return this.isSupported;
    }

    async init() {
        if (!this.isSupported) {
            throw new Error('GPS or compass not supported');
        }

        // Setup device orientation listener
        this.setupOrientation();

        // Request GPS permission and start watching location
        await this.startGPSTracking();

        this.isInitialized = true;
        console.log('[ARLocationEngine] Initialized successfully');
    }

    setupOrientation() {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS 13+ requires permission
            DeviceOrientationEvent.requestPermission()
                .then(permission => {
                    if (permission === 'granted') {
                        this.bindOrientation();
                    }
                })
                .catch(console.error);
        } else {
            // Non-iOS or older iOS
            this.bindOrientation();
        }
    }

    bindOrientation() {
        window.addEventListener('deviceorientationabsolute', (event) => {
            this.deviceOrientation = {
                alpha: event.alpha || 0,  // Compass heading (0-360)
                beta: event.beta || 0,    // Front-to-back tilt
                gamma: event.gamma || 0   // Left-to-right tilt
            };
        }, true);

        // Fallback to regular deviceorientation if absolute not available
        window.addEventListener('deviceorientation', (event) => {
            if (!event.absolute) {
                this.deviceOrientation = {
                    alpha: event.alpha || 0,
                    beta: event.beta || 0,
                    gamma: event.gamma || 0
                };
            }
        });

        console.log('[ARLocationEngine] Compass bound');
    }

    async startGPSTracking() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not available'));
                return;
            }

            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            };

            // Get initial position
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.updateLocation(position);

                    // Start watching position
                    this.watchId = navigator.geolocation.watchPosition(
                        (pos) => this.updateLocation(pos),
                        (error) => console.warn('[ARLocationEngine] GPS error:', error),
                        options
                    );

                    resolve();
                },
                (error) => {
                    console.error('[ARLocationEngine] GPS permission denied:', error);
                    reject(error);
                },
                options
            );
        });
    }

    updateLocation(position) {
        this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
        };

        console.log('[ARLocationEngine] Location updated:', {
            lat: this.currentLocation.latitude.toFixed(6),
            lon: this.currentLocation.longitude.toFixed(6),
            accuracy: this.currentLocation.accuracy.toFixed(1) + 'm'
        });

        // Update tracking status
        this.updateTracking();
    }

    setTargetLocation(latitude, longitude, altitude = 0) {
        this.targetLocation = {
            latitude,
            longitude,
            altitude
        };

        console.log('[ARLocationEngine] Target set:', {
            lat: latitude.toFixed(6),
            lon: longitude.toFixed(6)
        });

        this.updateTracking();
    }

    updateTracking() {
        if (!this.currentLocation || !this.targetLocation) {
            this.isTracking = false;
            return;
        }

        // Calculate distance and bearing to target
        this.distance = this.calculateDistance(
            this.currentLocation.latitude,
            this.currentLocation.longitude,
            this.targetLocation.latitude,
            this.targetLocation.longitude
        );

        this.bearing = this.calculateBearing(
            this.currentLocation.latitude,
            this.currentLocation.longitude,
            this.targetLocation.latitude,
            this.targetLocation.longitude
        );

        // Check if tracking is valid
        const accuracyOk = this.currentLocation.accuracy <= this.gpsAccuracyThreshold;
        const distanceOk = this.distance >= this.minDistance && this.distance <= this.maxDistance;

        this.isTracking = accuracyOk && distanceOk;

        // Update pose for placement
        if (this.isTracking) {
            this.updatePose();
        }
    }

    updatePose() {
        // Calculate relative position based on GPS and compass
        const relativeHeading = (this.bearing - this.deviceOrientation.alpha + 360) % 360;
        const headingRad = (relativeHeading * Math.PI) / 180;

        // Convert distance and bearing to x, z coordinates
        // In AR space: x = east-west, z = north-south
        const x = this.distance * Math.sin(headingRad);
        const z = -this.distance * Math.cos(headingRad); // Negative because forward is -z

        // Altitude difference
        const y = this.targetLocation.altitude - (this.currentLocation.altitude || 0);

        this.currentPose = {
            position: { x, y, z },
            rotation: {
                x: this.deviceOrientation.beta * (Math.PI / 180),
                y: this.deviceOrientation.alpha * (Math.PI / 180),
                z: this.deviceOrientation.gamma * (Math.PI / 180)
            },
            distance: this.distance,
            bearing: this.bearing,
            accuracy: this.currentLocation.accuracy,
            confidence: Math.min(1.0, this.gpsAccuracyThreshold / this.currentLocation.accuracy)
        };
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        // Haversine formula for distance between two GPS coordinates
        const R = 6371e3; // Earth radius in meters
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    calculateBearing(lat1, lon1, lat2, lon2) {
        // Calculate bearing (direction) from point 1 to point 2
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) -
                  Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

        const θ = Math.atan2(y, x);
        const bearing = ((θ * 180) / Math.PI + 360) % 360; // Normalize to 0-360

        return bearing;
    }

    processFrame() {
        // No video processing needed for GPS-based AR
        // Just return current tracking state

        const result = {
            isTracking: this.isTracking,
            hasFeatures: this.currentLocation !== null,
            featureCount: this.isTracking ? 1 : 0,
            planeCount: 0,
            pose: this.currentPose,
            gpsData: {
                currentLocation: this.currentLocation,
                targetLocation: this.targetLocation,
                distance: this.distance,
                bearing: this.bearing
            }
        };

        return result;
    }

    reset() {
        this.targetLocation = null;
        this.currentPose = null;
        this.distance = null;
        this.bearing = null;
        this.isTracking = false;
        console.log('[ARLocationEngine] Reset');
    }

    dispose() {
        // Stop watching GPS
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        this.isInitialized = false;
        console.log('[ARLocationEngine] Disposed');
    }
}
