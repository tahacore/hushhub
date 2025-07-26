class GeolocationManager {
    constructor() {
        this.currentPosition = null;
        this.watchId = null;
        this.nearbyUsers = new Map();
        this.proximityRadius = 50; // meters
        this.updateInterval = 5000; // 5 seconds
        this.callbacks = {
            onLocationUpdate: [],
            onUsersNearby: [],
            onLocationError: []
        };
    }

    // Add event listeners
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }

    // Trigger event callbacks
    trigger(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => callback(data));
        }
    }

    // Request location permission and start tracking
    async initialize() {
        if (!navigator.geolocation) {
            this.trigger('onLocationError', {
                code: 'NOT_SUPPORTED',
                message: 'Geolocation is not supported by this browser'
            });
            return false;
        }

        try {
            // Request permission
            const permission = await this.requestPermission();
            if (permission !== 'granted') {
                throw new Error('Location permission denied');
            }

            // Get initial position
            await this.getCurrentPosition();
            
            // Start watching position
            this.startWatching();
            
            return true;
        } catch (error) {
            this.trigger('onLocationError', {
                code: error.code || 'UNKNOWN',
                message: error.message
            });
            return false;
        }
    }

    // Request location permission
    async requestPermission() {
        if ('permissions' in navigator) {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            return result.state;
        }
        
        // Fallback: try to get position to trigger permission prompt
        try {
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    maximumAge: 0
                });
            });
            return 'granted';
        } catch (error) {
            return 'denied';
        }
    }

    // Get current position once
    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentPosition = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: Date.now()
                    };
                    
                    this.trigger('onLocationUpdate', this.currentPosition);
                    resolve(this.currentPosition);
                },
                (error) => {
                    reject(this.formatGeolocationError(error));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 30000
                }
            );
        });
    }

    // Start watching position changes
    startWatching() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
        }

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const newPosition = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: Date.now()
                };

                // Only update if position changed significantly
                if (this.hasPositionChanged(newPosition)) {
                    this.currentPosition = newPosition;
                    this.trigger('onLocationUpdate', this.currentPosition);
                    
                    // Emit location to server
                    if (window.socket && window.socket.connected) {
                        window.socket.emit('location-update', this.currentPosition);
                    }
                }
            },
            (error) => {
                this.trigger('onLocationError', this.formatGeolocationError(error));
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 30000
            }
        );
    }

    // Stop watching position
    stopWatching() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    // Check if position changed significantly
    hasPositionChanged(newPosition) {
        if (!this.currentPosition) return true;
        
        const distance = this.calculateDistance(
            this.currentPosition.latitude,
            this.currentPosition.longitude,
            newPosition.latitude,
            newPosition.longitude
        );
        
        // Update if moved more than 5 meters or accuracy improved significantly
        return distance > 5 || 
               (newPosition.accuracy < this.currentPosition.accuracy / 2);
    }

    // Calculate distance between two coordinates using Haversine formula
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    // Update nearby users list
    updateNearbyUsers(users) {
        if (!this.currentPosition) return;

        const nearbyUsers = users.filter(user => {
            if (user.id === window.currentUser?.id) return false;
            
            const distance = this.calculateDistance(
                this.currentPosition.latitude,
                this.currentPosition.longitude,
                user.location.latitude,
                user.location.longitude
            );
            
            user.distance = Math.round(distance);
            return distance <= this.proximityRadius;
        });

        // Sort by distance
        nearbyUsers.sort((a, b) => a.distance - b.distance);
        
        this.nearbyUsers.clear();
        nearbyUsers.forEach(user => {
            this.nearbyUsers.set(user.id, user);
        });

        this.trigger('onUsersNearby', Array.from(this.nearbyUsers.values()));
    }

    // Get formatted distance string
    getDistanceString(meters) {
        if (meters < 10) return 'Very close';
        if (meters < 25) return 'Nearby';
        if (meters < 50) return `${meters}m away`;
        return 'Far away';
    }

    // Format geolocation errors
    formatGeolocationError(error) {
        const errors = {
            1: { code: 'PERMISSION_DENIED', message: 'Location access denied by user' },
            2: { code: 'POSITION_UNAVAILABLE', message: 'Location information unavailable' },
            3: { code: 'TIMEOUT', message: 'Location request timed out' }
        };

        return errors[error.code] || { 
            code: 'UNKNOWN', 
            message: 'Unknown location error occurred' 
        };
    }

    // Get current position for external use
    getPosition() {
        return this.currentPosition;
    }

    // Get nearby users
    getNearbyUsers() {
        return Array.from(this.nearbyUsers.values());
    }

    // Check if user is nearby
    isUserNearby(userId) {
        return this.nearbyUsers.has(userId);
    }

    // Get specific user distance
    getUserDistance(userId) {
        const user = this.nearbyUsers.get(userId);
        return user ? user.distance : null;
    }

    // Update proximity radius
    setProximityRadius(radius) {
        this.proximityRadius = Math.max(10, Math.min(200, radius)); // 10m to 200m
    }

    // Cleanup
    destroy() {
        this.stopWatching();
        this.callbacks = {
            onLocationUpdate: [],
            onUsersNearby: [],
            onLocationError: []
        };
        this.nearbyUsers.clear();
        this.currentPosition = null;
    }
}

// Background location tracking
class BackgroundLocationTracker {
    constructor(geolocationManager) {
        this.geolocation = geolocationManager;
        this.isTracking = false;
        this.lastKnownLocation = null;
        this.trackingInterval = null;
    }

    startTracking() {
        if (this.isTracking) return;
        
        this.isTracking = true;
        
        // Track location even when app is in background
        this.trackingInterval = setInterval(() => {
            if (this.geolocation.currentPosition) {
                this.lastKnownLocation = { ...this.geolocation.currentPosition };
                
                // Store in localStorage for persistence
                localStorage.setItem('hushhub_last_location', JSON.stringify({
                    ...this.lastKnownLocation,
                    timestamp: Date.now()
                }));
            }
        }, 10000); // Every 10 seconds
    }

    stopTracking() {
        this.isTracking = false;
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }
    }

    getLastKnownLocation() {
        try {
            const stored = localStorage.getItem('hushhub_last_location');
            if (stored) {
                const location = JSON.parse(stored);
                // Only use if less than 5 minutes old
                if (Date.now() - location.timestamp < 5 * 60 * 1000) {
                    return location;
                }
            }
        } catch (error) {
            console.warn('Error reading stored location:', error);
        }
        return this.lastKnownLocation;
    }
}

// Export for use in other modules
window.GeolocationManager = GeolocationManager;
window.BackgroundLocationTracker = BackgroundLocationTracker;