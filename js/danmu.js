// Danmu (floating comments) system
// Danmu (floating comments) system
class DanmuSystem {
    constructor() {
        this.container = null;
        this.isVisible = true;
        this.speed = 5; // 1-10 scale
        this.lanes = [];
        this.maxLanes = 10;
        this.danmuQueue = [];
        this.activeAnimations = new Set();
        this.roomManager = null;
        
        // Make this available globally
        window.danmuSystem = this;
        
        this.init();
    }

    init() {
        console.log('Initializing Danmu System...');
        
        this.container = document.getElementById('danmuContainer');
        if (!this.container) {
            console.error('Danmu container not found');
            return;
        }

        this.setupLanes();
        this.startProcessingQueue();
        this.bindEvents();
        
        console.log('Danmu system ready!');
    }

    setupLanes() {
        this.lanes = [];
        const containerHeight = window.innerHeight;
        const laneHeight = 40; // Height of each danmu lane
        this.maxLanes = Math.floor(containerHeight / laneHeight) - 2; // Leave some margin

        for (let i = 0; i < this.maxLanes; i++) {
            this.lanes.push({
                index: i,
                y: 50 + (i * laneHeight), // Start from top with margin
                occupied: false,
                lastDanmuTime: 0
            });
        }
    }

    bindEvents() {
        // Recalculate lanes on window resize
        window.addEventListener('resize', () => {
            this.setupLanes();
        });

        // Pause danmu when mouse hovers over container
        this.container.addEventListener('mouseenter', () => {
            this.pauseAllAnimations();
        });

        this.container.addEventListener('mouseleave', () => {
            this.resumeAllAnimations();
        });
    }

    addDanmu(danmuData) {
        // Add to queue for processing
        this.danmuQueue.push({
            ...danmuData,
            id: this.generateId(),
            timestamp: Date.now()
        });
    }

    startProcessingQueue() {
        setInterval(() => {
            this.processQueue();
        }, 100); // Process queue every 100ms
    }

    processQueue() {
        if (this.danmuQueue.length === 0 || !this.isVisible) {
            return;
        }

        const availableLane = this.findAvailableLane();
        if (availableLane !== null) {
            const danmu = this.danmuQueue.shift();
            this.createDanmuElement(danmu, availableLane);
        }
    }

    findAvailableLane() {
        const currentTime = Date.now();
        const minInterval = 2000; // Minimum 2 seconds between danmu in same lane

        for (let i = 0; i < this.lanes.length; i++) {
            const lane = this.lanes[i];
            if (!lane.occupied && (currentTime - lane.lastDanmuTime) > minInterval) {
                return i;
            }
        }

        // If no lane is available, use random lane (will overlap)
        return Math.floor(Math.random() * this.lanes.length);
    }

    createDanmuElement(danmu, laneIndex) {
        const danmuEl = document.createElement('div');
        danmuEl.className = 'danmu-item';
        danmuEl.dataset.id = danmu.id;
        
        // Set danmu content
        if (danmu.isQuick) {
            danmuEl.innerHTML = `
                <span class="danmu-emoji">${this.escapeHtml(danmu.message)}</span>
                <span class="danmu-user">${this.escapeHtml(danmu.username)}</span>
            `;
            danmuEl.classList.add('quick-danmu');
        } else {
            danmuEl.innerHTML = `
                <span class="danmu-text">${this.escapeHtml(danmu.message)}</span>
                <span class="danmu-user">- ${this.escapeHtml(danmu.username)}</span>
            `;
        }

        // Style the danmu
        this.styleDanmu(danmuEl, danmu, laneIndex);

        // Add to container
        this.container.appendChild(danmuEl);

        // Start animation
        this.animateDanmu(danmuEl, laneIndex);

        // Mark lane as occupied
        this.lanes[laneIndex].occupied = true;
        this.lanes[laneIndex].lastDanmuTime = Date.now();
    }

    styleDanmu(element, danmu, laneIndex) {
        const lane = this.lanes[laneIndex];
        
        element.style.cssText = `
            position: fixed;
            top: ${lane.y}px;
            right: -500px;
            color: ${danmu.color || '#ffffff'};
            font-size: ${danmu.isQuick ? '24px' : '16px'};
            font-weight: ${danmu.isQuick ? 'bold' : '500'};
            text-shadow: 
                -1px -1px 0 rgba(0,0,0,0.8),
                1px -1px 0 rgba(0,0,0,0.8),
                -1px 1px 0 rgba(0,0,0,0.8),
                1px 1px 0 rgba(0,0,0,0.8);
            white-space: nowrap;
            pointer-events: none;
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            background: rgba(0,0,0,0.3);
            border-radius: 20px;
            backdrop-filter: blur(2px);
            border: 1px solid rgba(255,255,255,0.1);
        `;

        // Special styling for quick danmu
        if (danmu.isQuick) {
            element.style.background = 'rgba(255,255,255,0.2)';
            element.style.transform = 'scale(1.2)';
        }
    }

    animateDanmu(element, laneIndex) {
        const containerWidth = window.innerWidth;
        const elementWidth = element.offsetWidth;
        const totalDistance = containerWidth + elementWidth;
        
        // Calculate duration based on speed setting
        const baseSpeed = 20; // pixels per second
        const speedMultiplier = this.speed / 5; // Convert 1-10 scale to multiplier
        const duration = (totalDistance / (baseSpeed * speedMultiplier)) * 1000;

        // Create animation
        const animation = element.animate([
            { right: `-${elementWidth}px` },
            { right: `${containerWidth}px` }
        ], {
            duration: duration,
            easing: 'linear',
            fill: 'forwards'
        });

        // Track animation
        this.activeAnimations.add(animation);

        // Handle animation completion
        animation.addEventListener('finish', () => {
            this.onDanmuComplete(element, laneIndex, animation);
        });

        // Handle animation cancellation
        animation.addEventListener('cancel', () => {
            this.activeAnimations.delete(animation);
        });

        return animation;
    }

    onDanmuComplete(element, laneIndex, animation) {
        // Remove element
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }

        // Free up the lane
        if (this.lanes[laneIndex]) {
            this.lanes[laneIndex].occupied = false;
        }

        // Remove from active animations
        this.activeAnimations.delete(animation);
    }

    pauseAllAnimations() {
        this.activeAnimations.forEach(animation => {
            if (animation.playState === 'running') {
                animation.pause();
            }
        });
    }

    resumeAllAnimations() {
        this.activeAnimations.forEach(animation => {
            if (animation.playState === 'paused') {
                animation.play();
            }
        });
    }

    setSpeed(speed) {
        this.speed = Math.max(1, Math.min(10, parseInt(speed)));
        
        // Update existing animations (restart them with new speed)
        const currentDanmus = this.container.querySelectorAll('.danmu-item');
        currentDanmus.forEach(danmu => {
            const existingAnimation = Array.from(this.activeAnimations).find(anim => 
                anim.effect && anim.effect.target === danmu
            );
            
            if (existingAnimation) {
                const currentTime = existingAnimation.currentTime;
                const progress = currentTime / existingAnimation.effect.getTiming().duration;
                
                existingAnimation.cancel();
                
                // Restart with new speed
                const containerWidth = window.innerWidth;
                const elementWidth = danmu.offsetWidth;
                const totalDistance = containerWidth + elementWidth;
                const baseSpeed = 20;
                const speedMultiplier = this.speed / 5;
                const newDuration = (totalDistance / (baseSpeed * speedMultiplier)) * 1000;
                
                const newAnimation = danmu.animate([
                    { right: `${-elementWidth + (totalDistance * progress)}px` },
                    { right: `${containerWidth}px` }
                ], {
                    duration: newDuration * (1 - progress),
                    easing: 'linear',
                    fill: 'forwards'
                });
                
                this.activeAnimations.add(newAnimation);
            }
        });
    }

    show() {
        this.isVisible = true;
        this.container.style.display = 'block';
    }

    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
    }

    clear() {
        // Clear all danmu
        this.container.innerHTML = '';
        this.activeAnimations.clear();
        
        // Reset lanes
        this.lanes.forEach(lane => {
            lane.occupied = false;
            lane.lastDanmuTime = 0;
        });
        
        // Clear queue
        this.danmuQueue = [];
    }

    addSpecialEffect(type, data) {
        switch (type) {
            case 'hearts':
                this.createHeartEffect();
                break;
            case 'fireworks':
                this.createFireworkEffect();
                break;
            case 'confetti':
                this.createConfettiEffect();
                break;
            default:
                console.warn('Unknown special effect:', type);
        }
    }

    createHeartEffect() {
        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                const heart = document.createElement('div');
                heart.className = 'special-effect heart-effect';
                heart.innerHTML = '❤️';
                heart.style.cssText = `
                    position: fixed;
                    left: ${Math.random() * window.innerWidth}px;
                    top: ${window.innerHeight}px;
                    font-size: ${20 + Math.random() * 20}px;
                    pointer-events: none;
                    z-index: 1001;
                `;
                
                this.container.appendChild(heart);
                
                // Animate heart floating up
                const animation = heart.animate([
                    { 
                        transform: 'translateY(0) rotate(0deg)',
                        opacity: 1
                    },
                    { 
                        transform: `translateY(-${window.innerHeight}px) rotate(${Math.random() * 360}deg)`,
                        opacity: 0
                    }
                ], {
                    duration: 3000 + Math.random() * 2000,
                    easing: 'ease-out'
                });
                
                animation.addEventListener('finish', () => {
                    if (heart.parentNode) {
                        heart.parentNode.removeChild(heart);
                    }
                });
            }, i * 100);
        }
    }

    createFireworkEffect() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd'];
        
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const centerX = Math.random() * window.innerWidth;
                const centerY = Math.random() * window.innerHeight * 0.6 + window.innerHeight * 0.2;
                
                // Create explosion particles
                for (let j = 0; j < 20; j++) {
                    const particle = document.createElement('div');
                    particle.className = 'special-effect firework-particle';
                    particle.style.cssText = `
                        position: fixed;
                        left: ${centerX}px;
                        top: ${centerY}px;
                        width: 4px;
                        height: 4px;
                        background: ${colors[Math.floor(Math.random() * colors.length)]};
                        border-radius: 50%;
                        pointer-events: none;
                        z-index: 1001;
                    `;
                    
                    this.container.appendChild(particle);
                    
                    const angle = (j / 20) * Math.PI * 2;
                    const distance = 100 + Math.random() * 100;
                    const endX = centerX + Math.cos(angle) * distance;
                    const endY = centerY + Math.sin(angle) * distance;
                    
                    const animation = particle.animate([
                        { 
                            transform: 'scale(1)',
                            opacity: 1,
                            left: centerX + 'px',
                            top: centerY + 'px'
                        },
                        { 
                            transform: 'scale(0)',
                            opacity: 0,
                            left: endX + 'px',
                            top: endY + 'px'
                        }
                    ], {
                        duration: 1000 + Math.random() * 500,
                        easing: 'ease-out'
                    });
                    
                    animation.addEventListener('finish', () => {
                        if (particle.parentNode) {
                            particle.parentNode.removeChild(particle);
                        }
                    });
                }
            }, i * 500);
        }
    }

    createConfettiEffect() {
        const shapes = ['🎉', '🎊', '✨', '⭐', '💫'];
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
        
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'special-effect confetti-effect';
                confetti.innerHTML = shapes[Math.floor(Math.random() * shapes.length)];
                confetti.style.cssText = `
                    position: fixed;
                    left: ${Math.random() * window.innerWidth}px;
                    top: -50px;
                    color: ${colors[Math.floor(Math.random() * colors.length)]};
                    font-size: ${10 + Math.random() * 15}px;
                    pointer-events: none;
                    z-index: 1001;
                `;
                
                this.container.appendChild(confetti);
                
                const animation = confetti.animate([
                    { 
                        transform: 'translateY(0) rotate(0deg)',
                        opacity: 1
                    },
                    { 
                        transform: `translateY(${window.innerHeight + 100}px) rotate(${360 + Math.random() * 360}deg)`,
                        opacity: 0.3
                    }
                ], {
                    duration: 3000 + Math.random() * 2000,
                    easing: 'ease-in'
                });
                
                animation.addEventListener('finish', () => {
                    if (confetti.parentNode) {
                        confetti.parentNode.removeChild(confetti);
                    }
                });
            }, i * 50);
        }
    }

    generateId() {
        return 'danmu_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize danmu system
window.danmuSystem = new DanmuSystem();