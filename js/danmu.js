// 彈幕系統
class DanmuSystem {
    constructor() {
        this.container = null;
        this.isVisible = true;
        this.speed = 5; // 1-10 速度等級
        this.lanes = [];
        this.maxLanes = 12;
        this.danmuQueue = [];
        this.activeAnimations = new Set();
        this.colors = [
            '#ffffff', '#ff6b6b', '#4ecdc4', '#45b7d1', 
            '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8',
            '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3'
        ];
        
        // 全域可用
        window.danmuSystem = this;
        
        this.init();
    }

    init() {
        console.log('🎭 初始化彈幕系統...');
        
        this.container = document.getElementById('danmuContainer');
        if (!this.container) {
            console.error('找不到彈幕容器');
            return;
        }

        this.setupLanes();
        this.startProcessingQueue();
        this.bindEvents();
        
        console.log('✅ 彈幕系統已準備就緒');
    }

    // 設置彈幕軌道
    setupLanes() {
        this.lanes = [];
        const containerHeight = window.innerHeight;
        const laneHeight = 45; // 每條軌道高度
        const topMargin = 80; // 頂部邊距（避開導航）
        const bottomMargin = 100; // 底部邊距

        this.maxLanes = Math.floor((containerHeight - topMargin - bottomMargin) / laneHeight);

        for (let i = 0; i < this.maxLanes; i++) {
            this.lanes.push({
                index: i,
                y: topMargin + (i * laneHeight),
                occupied: false,
                lastDanmuTime: 0,
                occupiedUntil: 0
            });
        }

        console.log(`設置了 ${this.maxLanes} 條彈幕軌道`);
    }

    // 綁定事件
    bindEvents() {
        // 窗口大小變化時重新計算軌道
        window.addEventListener('resize', () => {
            this.setupLanes();
        });

        // 鼠標懸停暫停彈幕
        this.container.addEventListener('mouseenter', () => {
            this.pauseAllAnimations();
        });

        this.container.addEventListener('mouseleave', () => {
            this.resumeAllAnimations();
        });

        // 鍵盤快捷鍵
        document.addEventListener('keydown', (e) => {
            // 只在不是輸入框時響應
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                if (e.key === 'd' || e.key === 'D') {
                    this.toggle();
                }
            }
        });
    }

    // 添加彈幕
    addDanmu(danmuData) {
        if (!this.isVisible) return;

        const danmu = {
            id: this.generateId(),
            text: danmuData.text || danmuData.message,
            username: danmuData.username,
            color: danmuData.color || this.getRandomColor(),
            isQuick: danmuData.isQuick || false,
            timestamp: Date.now(),
            ...danmuData
        };

        this.danmuQueue.push(danmu);
    }

    // 開始處理彈幕隊列
    startProcessingQueue() {
        setInterval(() => {
            this.processQueue();
        }, 150); // 每150ms處理一次隊列
    }

    // 處理彈幕隊列
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

    // 尋找可用軌道
    findAvailableLane() {
        const currentTime = Date.now();
        
        // 尋找完全空閒的軌道
        for (let i = 0; i < this.lanes.length; i++) {
            const lane = this.lanes[i];
            if (!lane.occupied && currentTime > lane.occupiedUntil) {
                return i;
            }
        }

        // 如果沒有完全空閒的軌道，尋找最早可用的
        let earliestLane = 0;
        let earliestTime = this.lanes[0].occupiedUntil;
        
        for (let i = 1; i < this.lanes.length; i++) {
            if (this.lanes[i].occupiedUntil < earliestTime) {
                earliestTime = this.lanes[i].occupiedUntil;
                earliestLane = i;
            }
        }

        return earliestLane;
    }

  // 創建彈幕元素
// 創建彈幕元素
createDanmuElement(danmu, laneIndex) {
    const danmuEl = document.createElement('div');
    danmuEl.className = 'danmu-item';
    danmuEl.dataset.id = danmu.id;
    
    // 🔧 根據是否為快速彈幕決定顯示內容
    if (danmu.isQuick) {
        // 快速彈幕只顯示表情符號，不顯示用戶名
        danmuEl.textContent = danmu.text || danmu.message;
    } else {
        // 普通彈幕顯示用戶名和內容
        danmuEl.textContent = `${danmu.username}: ${danmu.text || danmu.message}`;
    }

    // 應用樣式
    this.styleDanmu(danmuEl, danmu, laneIndex);

    // 添加到容器
    this.container.appendChild(danmuEl);

    // 開始動畫
    this.animateDanmu(danmuEl, laneIndex);

    // 標記軌道被佔用
    const lane = this.lanes[laneIndex];
    lane.occupied = true;
    lane.lastDanmuTime = Date.now();
    
    const estimatedDuration = this.calculateDuration(danmuEl);
    lane.occupiedUntil = Date.now() + estimatedDuration;
}
// 設置彈幕樣式
styleDanmu(element, danmu, laneIndex) {
    const lane = this.lanes[laneIndex];
    const danmuColor = danmu.color || '#ffffff';
    
    element.style.cssText = `
        position: fixed;
        top: ${lane.y}px;
        right: -100px;
        color: ${danmuColor};
        font-size: ${danmu.isQuick ? '24px' : '18px'};
        font-weight: 700;
        white-space: nowrap;
        pointer-events: none;
        z-index: 1000;
        font-family: 'Microsoft JhengHei', Arial, sans-serif;
        background: none;
        border: none;
        padding: 0;
        text-shadow: none;
    `;

    // 🔧 移除所有可能的背景和框架樣式
    element.style.background = 'none';
    element.style.backgroundColor = 'transparent';
    element.style.border = 'none';
    element.style.borderRadius = '0';
    element.style.padding = '0';
    element.style.backdropFilter = 'none';
    element.style.boxShadow = 'none';

    // 快速彈幕特殊樣式（只調整大小，不加陰影）
    if (danmu.isQuick) {
        element.style.fontSize = '28px';
    }
}
    // 計算彈幕持續時間
    calculateDuration(element) {
        const containerWidth = window.innerWidth;
        const elementWidth = element.offsetWidth || 200; // 預設寬度
        const totalDistance = containerWidth + elementWidth + 100;
        
        // 根據速度設置計算持續時間
        const baseSpeed = 100; // 像素/秒
        const speedMultiplier = this.speed / 5;
        const duration = (totalDistance / (baseSpeed * speedMultiplier)) * 1000;
        
        return Math.max(3000, Math.min(15000, duration)); // 3-15秒之間
    }

  // 動畫彈幕
animateDanmu(element, laneIndex) {
    const containerWidth = window.innerWidth;
    const elementWidth = element.offsetWidth;
    
    // 🔧 設置初始位置，確保元素完全在右側外面
    element.style.right = `-${elementWidth + 50}px`;
    element.style.opacity = '1';
    
    // 🔧 強制瀏覽器計算佈局
    element.offsetHeight;
    
    const totalDistance = containerWidth + elementWidth + 100;
    const duration = this.calculateDuration(element);

    // 🔧 使用 transform 而不是 right 屬性來避免重新佈局
    const animation = element.animate([
        { 
            transform: `translateX(${elementWidth + 50}px)`,
            opacity: 1
        },
        { 
            transform: `translateX(-${containerWidth + 50}px)`,
            opacity: 1
        }
    ], {
        duration: duration,
        easing: 'linear',
        fill: 'forwards'
    });

    // 追蹤動畫
    this.activeAnimations.add(animation);

    // 動畫完成處理
    animation.addEventListener('finish', () => {
        this.onDanmuComplete(element, laneIndex, animation);
    });

    // 動畫取消處理
    animation.addEventListener('cancel', () => {
        this.activeAnimations.delete(animation);
    });

    return animation;
}
    // 彈幕完成處理
    onDanmuComplete(element, laneIndex, animation) {
        // 移除元素
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }

        // 釋放軌道
        if (this.lanes[laneIndex]) {
            this.lanes[laneIndex].occupied = false;
        }

        // 移除動畫追蹤
        this.activeAnimations.delete(animation);
    }

    // 暫停所有動畫
    pauseAllAnimations() {
        this.activeAnimations.forEach(animation => {
            if (animation.playState === 'running') {
                animation.pause();
            }
        });
    }

    // 恢復所有動畫
    resumeAllAnimations() {
        this.activeAnimations.forEach(animation => {
            if (animation.playState === 'paused') {
                animation.play();
            }
        });
    }

    // 設置彈幕速度
    setSpeed(speed) {
        this.speed = Math.max(1, Math.min(10, parseInt(speed)));
        console.log(`彈幕速度設置為: ${this.speed}`);
        
        // 更新現有動畫的速度（重新啟動）
        const currentDanmus = [...this.container.querySelectorAll('.danmu-item')];
        currentDanmus.forEach(danmu => {
            const animations = this.activeAnimations;
            for (let animation of animations) {
                if (animation.effect && animation.effect.target === danmu) {
                    // 計算當前進度
                    const progress = animation.currentTime / animation.effect.getTiming().duration;
                    
                    // 取消舊動畫
                    animation.cancel();
                    
                    // 創建新動畫
                    const laneIndex = parseInt(danmu.style.top) / 45; // 粗略計算軌道
                    this.animateDanmu(danmu, laneIndex);
                    break;
                }
            }
        });
    }

    // 切換彈幕顯示
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    // 顯示彈幕
    show() {
        this.isVisible = true;
        this.container.style.display = 'block';
        console.log('彈幕已顯示');
    }

    // 隱藏彈幕
    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
        console.log('彈幕已隱藏');
    }

    // 清空所有彈幕
    clear() {
        // 清空容器
        this.container.innerHTML = '';
        
        // 清空動畫追蹤
        this.activeAnimations.clear();
        
        // 重置軌道
        this.lanes.forEach(lane => {
            lane.occupied = false;
            lane.lastDanmuTime = 0;
            lane.occupiedUntil = 0;
        });
        
        // 清空隊列
        this.danmuQueue = [];
        
        console.log('彈幕已清空');
    }

    // 添加特效彈幕
    addSpecialEffect(type, username) {
        switch (type) {
            case 'hearts':
                this.createHeartRain(username);
                break;
            case 'fireworks':
                this.createFireworks(username);
                break;
            case 'stars':
                this.createStarfall(username);
                break;
            default:
                console.warn('未知的特效類型:', type);
        }
    }

    // 愛心雨特效
    createHeartRain(username) {
        const hearts = ['❤️', '💖', '💕', '💗', '💝'];
        
        for (let i = 0; i < 15; i++) {
            setTimeout(() => {
                const heart = document.createElement('div');
                heart.className = 'special-effect heart-rain';
                heart.innerHTML = hearts[Math.floor(Math.random() * hearts.length)];
                heart.style.cssText = `
                    position: fixed;
                    left: ${Math.random() * window.innerWidth}px;
                    top: -50px;
                    font-size: ${20 + Math.random() * 15}px;
                    pointer-events: none;
                    z-index: 1001;
                    animation: heartFall ${3 + Math.random() * 2}s ease-in forwards;
                `;
                
                this.container.appendChild(heart);
                
                setTimeout(() => {
                    if (heart.parentNode) {
                        heart.parentNode.removeChild(heart);
                    }
                }, 5000);
            }, i * 100);
        }

        // 添加特效彈幕
        this.addDanmu({
            text: '💖 送出愛心雨！',
            username: username,
            color: '#ff69b4',
            isQuick: true
        });
    }

    // 煙火特效
    createFireworks(username) {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffeaa7', '#dda0dd'];
        
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const centerX = Math.random() * window.innerWidth;
                const centerY = Math.random() * window.innerHeight * 0.6 + window.innerHeight * 0.2;
                
                // 創建爆炸粒子
                for (let j = 0; j < 25; j++) {
                    const particle = document.createElement('div');
                    particle.className = 'special-effect firework-particle';
                    particle.style.cssText = `
                        position: fixed;
                        left: ${centerX}px;
                        top: ${centerY}px;
                        width: 6px;
                        height: 6px;
                        background: ${colors[Math.floor(Math.random() * colors.length)]};
                        border-radius: 50%;
                        pointer-events: none;
                        z-index: 1001;
                        box-shadow: 0 0 10px currentColor;
                    `;
                    
                    this.container.appendChild(particle);
                    
                    const angle = (j / 25) * Math.PI * 2;
                    const distance = 80 + Math.random() * 120;
                    const endX = centerX + Math.cos(angle) * distance;
                    const endY = centerY + Math.sin(angle) * distance;
                    
                    const animation = particle.animate([
                        { 
                            left: centerX + 'px',
                            top: centerY + 'px',
                            opacity: 1,
                            transform: 'scale(1)'
                        },
                        { 
                            left: endX + 'px',
                            top: endY + 'px',
                            opacity: 0,
                            transform: 'scale(0)'
                        }
                    ], {
                        duration: 800 + Math.random() * 400,
                        easing: 'ease-out'
                    });
                    
                    animation.addEventListener('finish', () => {
                        if (particle.parentNode) {
                            particle.parentNode.removeChild(particle);
                        }
                    });
                }
            }, i * 600);
        }

        // 添加特效彈幕
        this.addDanmu({
            text: '🎆 放煙火慶祝！',
            username: username,
            color: '#ffd700',
            isQuick: true
        });
    }

    // 星雨特效
    createStarfall(username) {
        const stars = ['⭐', '✨', '💫', '🌟'];
        
        for (let i = 0; i < 20; i++) {
            setTimeout(() => {
                const star = document.createElement('div');
                star.className = 'special-effect starfall';
                star.innerHTML = stars[Math.floor(Math.random() * stars.length)];
                star.style.cssText = `
                    position: fixed;
                    left: ${Math.random() * window.innerWidth}px;
                    top: -30px;
                    font-size: ${15 + Math.random() * 10}px;
                    pointer-events: none;
                    z-index: 1001;
                    animation: starFall ${4 + Math.random() * 2}s ease-in forwards;
                    filter: drop-shadow(0 0 5px gold);
                `;
                
                this.container.appendChild(star);
                
                setTimeout(() => {
                    if (star.parentNode) {
                        star.parentNode.removeChild(star);
                    }
                }, 6000);
            }, i * 150);
        }

        // 添加特效彈幕
        this.addDanmu({
            text: '✨ 星雨降臨！',
            username: username,
            color: '#ffd700',
            isQuick: true
        });
    }

    // 獲取隨機顏色
    getRandomColor() {
        return this.colors[Math.floor(Math.random() * this.colors.length)];
    }

    // 生成唯一ID
    generateId() {
        return 'danmu_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // HTML轉義
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 獲取統計信息
    getStats() {
        return {
            activeAnimations: this.activeAnimations.size,
            queueLength: this.danmuQueue.length,
            totalLanes: this.lanes.length,
            occupiedLanes: this.lanes.filter(lane => lane.occupied).length,
            isVisible: this.isVisible,
            speed: this.speed
        };
    }
}

// 添加CSS動畫
const style = document.createElement('style');
style.textContent = `
    @keyframes heartFall {
        0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(${window.innerHeight + 100}px) rotate(720deg);
            opacity: 0;
        }
    }
    
    @keyframes starFall {
        0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(${window.innerHeight + 100}px) rotate(360deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 初始化彈幕系統
window.danmuSystem = new DanmuSystem();
