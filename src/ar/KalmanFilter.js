/**
 * Simple Kalman Filter for AR pose smoothing
 * Reduces jitter and noise in position/rotation estimates
 */

export class KalmanFilter {
    constructor(processNoise = 0.01, measurementNoise = 0.1) {
        // State: [value, velocity]
        this.x = 0;  // Estimated value
        this.v = 0;  // Estimated velocity

        // Covariance matrix (2x2 for position and velocity)
        this.P = [[1, 0], [0, 1]];

        // Process noise (how much we trust the model)
        this.Q = processNoise;

        // Measurement noise (how much we trust the measurements)
        this.R = measurementNoise;

        // Time step
        this.dt = 1 / 30; // Assume 30 FPS
    }

    predict() {
        // Predict next state
        // x = x + v * dt
        this.x = this.x + this.v * this.dt;

        // Update covariance
        // P = P + Q
        this.P[0][0] += this.Q;
        this.P[0][1] += 0;
        this.P[1][0] += 0;
        this.P[1][1] += this.Q;
    }

    update(measurement) {
        // Innovation (difference between measurement and prediction)
        const y = measurement - this.x;

        // Innovation covariance
        const S = this.P[0][0] + this.R;

        // Kalman gain
        const K = [this.P[0][0] / S, this.P[1][0] / S];

        // Update state estimate
        this.x = this.x + K[0] * y;
        this.v = this.v + K[1] * y;

        // Update covariance
        const P00 = this.P[0][0];
        const P01 = this.P[0][1];
        const P10 = this.P[1][0];
        const P11 = this.P[1][1];

        this.P[0][0] = (1 - K[0]) * P00;
        this.P[0][1] = (1 - K[0]) * P01;
        this.P[1][0] = P10 - K[1] * P00;
        this.P[1][1] = P11 - K[1] * P01;

        return this.x;
    }

    filter(measurement) {
        // Convenience method: predict then update
        this.predict();
        return this.update(measurement);
    }

    reset() {
        this.x = 0;
        this.v = 0;
        this.P = [[1, 0], [0, 1]];
    }
}

/**
 * Kalman Filter for 3D pose (position + rotation)
 */
export class PoseKalmanFilter {
    constructor(processNoise = 0.01, measurementNoise = 0.1) {
        // Position filters (x, y, z)
        this.posX = new KalmanFilter(processNoise, measurementNoise);
        this.posY = new KalmanFilter(processNoise, measurementNoise);
        this.posZ = new KalmanFilter(processNoise, measurementNoise);

        // Rotation filters (x, y, z in radians)
        this.rotX = new KalmanFilter(processNoise * 0.5, measurementNoise * 0.5);
        this.rotY = new KalmanFilter(processNoise * 0.5, measurementNoise * 0.5);
        this.rotZ = new KalmanFilter(processNoise * 0.5, measurementNoise * 0.5);
    }

    filter(pose) {
        if (!pose) return null;

        const filteredPose = {
            position: {
                x: this.posX.filter(pose.position.x),
                y: this.posY.filter(pose.position.y),
                z: this.posZ.filter(pose.position.z)
            },
            rotation: {
                x: this.rotX.filter(pose.rotation.x),
                y: this.rotY.filter(pose.rotation.y),
                z: this.rotZ.filter(pose.rotation.z)
            }
        };

        // Copy other properties
        if (pose.planeCenter) {
            filteredPose.planeCenter = pose.planeCenter;
        }
        if (pose.confidence !== undefined) {
            filteredPose.confidence = pose.confidence;
        }

        return filteredPose;
    }

    reset() {
        this.posX.reset();
        this.posY.reset();
        this.posZ.reset();
        this.rotX.reset();
        this.rotY.reset();
        this.rotZ.reset();
    }
}
