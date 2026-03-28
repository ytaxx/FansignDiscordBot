const fs = require('fs');
const path = require('path');

class ConcurrencyManager {
    constructor() {
        this.stateFile = path.join(__dirname, '../config/concurrency-state.json');
        this.loadState();
        this.saveInterval = setInterval(() => this.saveState(), 5000);
    }

    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                // Clean up stale entries older than 5 minutes
                const now = Date.now();
                Object.keys(state).forEach(key => {
                    if (now - state[key].timestamp > 300000) {
                        delete state[key];
                    }
                });
                this.state = state;
            } else {
                this.state = {
                    processing: 0,
                    cooldowns: {}
                };
            }
        } catch (error) {
            console.error('Error loading concurrency state:', error);
            this.state = {
                processing: 0,
                cooldowns: {}
            };
        }
    }

    saveState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state));
        } catch (error) {
            console.error('Error saving concurrency state:', error);
        }
    }

    isProcessingAvailable() {
        this.cleanupStaleProcessing();
        return this.state.processing < 3; // MAX_CONCURRENT
    }

    incrementProcessing() {
        this.cleanupStaleProcessing();
        this.state.processing++;
        this.state.lastProcessingUpdate = Date.now();
        return this.state.processing;
    }

    decrementProcessing() {
        this.cleanupStaleProcessing();
        if (this.state.processing > 0) {
            this.state.processing--;
        }
        this.state.lastProcessingUpdate = Date.now();
        return this.state.processing;
    }

    cleanupStaleProcessing() {
        // Reset processing count if last update was more than 5 minutes ago
        if (this.state.lastProcessingUpdate && Date.now() - this.state.lastProcessingUpdate > 300000) {
            this.state.processing = 0;
        }
    }

    isOnCooldown(userId) {
        const cooldown = this.state.cooldowns[userId];
        if (!cooldown) return false;
        
        const now = Date.now();
        if (now - cooldown.timestamp > cooldown.duration) {
            delete this.state.cooldowns[userId];
            return false;
        }
        return true;
    }

    setCooldown(userId, duration) {
        this.state.cooldowns[userId] = {
            timestamp: Date.now(),
            duration: duration
        };
    }

    getRemainingCooldown(userId) {
        const cooldown = this.state.cooldowns[userId];
        if (!cooldown) return 0;
        
        const remaining = cooldown.duration - (Date.now() - cooldown.timestamp);
        return remaining > 0 ? remaining : 0;
    }
}

module.exports = new ConcurrencyManager();
