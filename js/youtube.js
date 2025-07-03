// YouTube API 整合
class YouTubePlayer {
    constructor() {
        this.player = null;
        this.isReady = false;
        this.currentVideoId = null;
        this.isHost = false;
        this.socket = null;
        this.roomManager = null;
        this.syncInProgress = false;
        this.lastSyncTime = 0;
        this.syncTolerance = 3; // 同步容差秒數
        this.heartbeatInterval = null;
        
        // 播放狀態
        this.playerState = {
            currentTime: 0,
            duration: 0,
            isPlaying: false,
            volume: 50
        };
        
        // 全域可用
        window.youtubePlayer = this;
        
        this.init();
    }

    init() {
        console.log('🎬 初始化 YouTube 播放器...');
        
        // YouTube API 準備就緒回調
        window.onYouTubeIframeAPIReady = () => {
            console.log('YouTube API 已載入');
            this.createPlayer();
        };

        // 如果 API 已經載入
        if (window.YT && window.YT.Player) {
            console.log('YouTube API 已存在，直接創建播放器');
            this.createPlayer();
        } else {
            console.log('等待 YouTube API 載入...');
        }
    }

    // 創建播放器
    createPlayer() {
        try {
            this.player = new YT.Player('youtubePlayer', {
                height: '100%',
                width: '100%',
                playerVars: {
                    'autoplay': 0,
                    'controls': 1,
                    'disablekb': 0,
                    'enablejsapi': 1,
                    'fs': 1,
                    'iv_load_policy': 3,
                    'modestbranding': 1,
                    'playsinline': 1,
                    'rel': 0,
                    'origin': window.location.origin
                },
                events: {
                    'onReady': (event) => this.onPlayerReady(event),
                    'onStateChange': (event) => this.onPlayerStateChange(event),
                    'onError': (event) => this.onPlayerError(event)
                }
            });
        } catch (error) {
            console.error('創建 YouTube 播放器失敗:', error);
            this.showError('無法創建 YouTube 播放器');
        }
    }

    // 播放器準備就緒
    onPlayerReady(event) {
        console.log('✅ YouTube 播放器已準備就緒');
        this.isReady = true;
        
        // 設置初始音量
        this.player.setVolume(this.playerState.volume);
        
        // 開始心跳檢測
        this.startHeartbeat();
        
        // 連接到房間管理器
        this.connectToRoomManager();
    }

    // 播放狀態變化
    onPlayerStateChange(event) {
        const state = event.data;
        const stateNames = {
            '-1': 'unstarted',
            '0': 'ended',
            '1': 'playing',
            '2': 'paused',
            '3': 'buffering',
            '5': 'cued'
        };

        console.log('播放器狀態變化:', stateNames[state] || state);

        // 更新內部狀態
        this.updatePlayerState();

        // 只有房主才能廣播狀態變化
        if (this.isHost && this.socket && !this.syncInProgress) {
            this.broadcastPlayerAction(state);
        }

        // 處理特殊狀態
        this.handleStateChange(state);
    }

    // 播放器錯誤處理
    onPlayerError(event) {
        const errorCodes = {
            2: '無效的影片 ID',
            5: 'HTML5 播放器錯誤', 
            100: '影片不存在或為私人影片',
            101: '影片不允許嵌入播放',
            150: '影片不允許嵌入播放'
        };

        const errorMessage = errorCodes[event.data] || '未知錯誤';
        console.error('YouTube 播放器錯誤:', errorMessage, event.data);
        this.showError(`影片載入錯誤: ${errorMessage}`);
    }

    // 載入影片
    loadVideo(videoData) {
        if (!this.isReady) {
            console.warn('播放器尚未準備就緒');
            setTimeout(() => this.loadVideo(videoData), 1000);
            return;
        }

        try {
            this.currentVideoId = videoData.videoId;
            
            console.log('載入影片:', videoData);
            
            // 載入影片
            this.player.loadVideoById({
                videoId: videoData.videoId,
                startSeconds: videoData.startTime || 0
            });

            // 更新界面
            this.updateVideoInfo(videoData);
            
            // 顯示影片信息區域
            document.getElementById('videoInfo').classList.remove('hidden');

        } catch (error) {
            console.error('載入影片失敗:', error);
            this.showError('載入影片失敗');
        }
    }

    // 更新影片信息
    updateVideoInfo(videoData) {
        const titleElement = document.getElementById('videoTitle');
        if (titleElement) {
            titleElement.textContent = videoData.title || '載入中...';
        }

        // 如果沒有標題，嘗試獲取
        if (!videoData.title && this.currentVideoId) {
            this.fetchVideoTitle(this.currentVideoId);
        }
    }

    // 獲取影片標題
    async fetchVideoTitle(videoId) {
        try {
            // 使用 YouTube oEmbed API
            const response = await fetch(
                `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
            );
            
            if (response.ok) {
                const data = await response.json();
                const titleElement = document.getElementById('videoTitle');
                if (titleElement) {
                    titleElement.textContent = data.title;
                }
                
                // 通知房間管理器更新標題
                if (this.roomManager) {
                    this.roomManager.updateVideoTitle(data.title);
                }
            }
        } catch (error) {
            console.error('獲取影片標題失敗:', error);
        }
    }

    // 同步播放狀態
    syncWithData(syncData) {
        if (!this.isReady || !this.currentVideoId || this.isHost) {
            return;
        }

        console.log('收到同步數據:', syncData);

        this.syncInProgress = true;

        try {
            const currentTime = this.getCurrentTime();
            const targetTime = syncData.time;
            const timeDiff = Math.abs(currentTime - targetTime);

            // 檢查是否需要跳轉
            if (timeDiff > this.syncTolerance) {
                console.log(`時間差異 ${timeDiff.toFixed(2)}s，執行跳轉到 ${targetTime.toFixed(2)}s`);
                this.seekTo(targetTime);
            }

            // 同步播放狀態
            setTimeout(() => {
                if (syncData.isPlaying && !this.isPlaying()) {
                    console.log('同步播放');
                    this.play();
                } else if (!syncData.isPlaying && this.isPlaying()) {
                    console.log('同步暫停');
                    this.pause();
                }
            }, 500); // 等待跳轉完成

            this.lastSyncTime = Date.now();
            
            // 更新同步狀態顯示
            this.updateSyncStatus('已同步');

        } catch (error) {
            console.error('同步失敗:', error);
            this.updateSyncStatus('同步失敗', 'error');
        } finally {
            // 重置同步標記
            setTimeout(() => {
                this.syncInProgress = false;
            }, 1000);
        }
    }

    // 廣播播放器動作
    broadcastPlayerAction(state) {
        if (!this.socket) return;

        const currentTime = this.getCurrentTime();
        let action = '';

        switch (state) {
            case YT.PlayerState.PLAYING:
                action = 'play';
                break;
            case YT.PlayerState.PAUSED:
                action = 'pause';
                break;
            case YT.PlayerState.ENDED:
                action = 'ended';
                break;
            default:
                return; // 不廣播其他狀態
        }

        console.log(`廣播動作: ${action} at ${currentTime.toFixed(2)}s`);

        this.socket.emit('videoAction', {
            action: action,
            time: currentTime,
            videoId: this.currentVideoId,
            timestamp: Date.now()
        });
    }

    // 處理狀態變化
    handleStateChange(state) {
        switch (state) {
            case YT.PlayerState.PLAYING:
                this.updateSyncStatus('播放中');
                break;
            case YT.PlayerState.PAUSED:
                this.updateSyncStatus('已暫停');
                break;
            case YT.PlayerState.ENDED:
                this.updateSyncStatus('播放結束');
                if (this.roomManager) {
                    this.roomManager.onVideoEnded();
                }
                break;
            case YT.PlayerState.BUFFERING:
                this.updateSyncStatus('緩衝中...');
                break;
        }
    }

    // 更新播放器狀態
    updatePlayerState() {
        if (!this.isReady) return;

        try {
            this.playerState = {
                currentTime: this.getCurrentTime(),
                duration: this.getDuration(),
                isPlaying: this.isPlaying(),
                volume: this.getVolume()
            };
        } catch (error) {
            console.error('更新播放器狀態失敗:', error);
        }
    }

    // 開始心跳檢測
    startHeartbeat() {
        // 清除現有心跳
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        // 房主定期廣播狀態
        if (this.isHost) {
            this.heartbeatInterval = setInterval(() => {
                this.broadcastCurrentState();
            }, 5000); // 每5秒廣播一次
        }

        // 所有用戶定期更新狀態
        setInterval(() => {
            this.updatePlayerState();
        }, 1000);
    }

    // 廣播當前狀態
    broadcastCurrentState() {
        if (!this.socket || !this.currentVideoId || this.syncInProgress) {
            return;
        }

        try {
            const currentTime = this.getCurrentTime();
            const isPlaying = this.isPlaying();

            this.socket.emit('syncBroadcast', {
                videoId: this.currentVideoId,
                time: currentTime,
                isPlaying: isPlaying,
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('廣播狀態失敗:', error);
        }
    }

    // 連接到房間管理器
    connectToRoomManager() {
        const checkRoomManager = () => {
            if (window.roomManager) {
                this.roomManager = window.roomManager;
                this.socket = this.roomManager.socket;
                this.isHost = this.roomManager.isHost;
                
                console.log('已連接到房間管理器');
                console.log('是否為房主:', this.isHost);
                
                // 重新啟動心跳
                this.startHeartbeat();
            } else {
                setTimeout(checkRoomManager, 500);
            }
        };
        checkRoomManager();
    }

    // 播放控制方法
    play() {
        if (this.isReady && this.player) {
            this.player.playVideo();
        }
    }

    pause() {
        if (this.isReady && this.player) {
            this.player.pauseVideo();
        }
    }

    stop() {
        if (this.isReady && this.player) {
            this.player.stopVideo();
        }
    }

    seekTo(seconds) {
        if (this.isReady && this.player) {
            this.player.seekTo(seconds, true);
        }
    }

    setVolume(volume) {
        if (this.isReady && this.player) {
            const vol = Math.max(0, Math.min(100, volume));
            this.player.setVolume(vol);
            this.playerState.volume = vol;
        }
    }

    // 獲取播放器信息
    getCurrentTime() {
        try {
            return this.player ? this.player.getCurrentTime() : 0;
        } catch (error) {
            return 0;
        }
    }

    getDuration() {
        try {
            return this.player ? this.player.getDuration() : 0;
        } catch (error) {
            return 0;
        }
    }

    getVolume() {
        try {
            return this.player ? this.player.getVolume() : 50;
        } catch (error) {
            return 50;
        }
    }

    getPlayerState() {
        try {
            return this.player ? this.player.getPlayerState() : -1;
        } catch (error) {
            return -1;
        }
    }

    isPlaying() {
        return this.getPlayerState() === YT.PlayerState.PLAYING;
    }

    isPaused() {
        return this.getPlayerState() === YT.PlayerState.PAUSED;
    }

    isBuffering() {
        return this.getPlayerState() === YT.PlayerState.BUFFERING;
    }

    // URL 處理
    extractVideoId(url) {
        if (!url) return null;

        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
            /youtube\.com\/v\/([^&\n?#]+)/,
            /youtu\.be\/([^&\n?#]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1].split('&')[0].split('#')[0].split('?')[0];
            }
        }

        return null;
    }

    isValidYouTubeUrl(url) {
        const videoId = this.extractVideoId(url);
        return videoId !== null && videoId.length === 11;
    }

    // 處理外部視頻動作
    handleVideoAction(actionData) {
        if (this.isHost || !this.isReady) {
            return; // 房主不響應外部動作
        }

        console.log('處理外部視頻動作:', actionData);

        this.syncInProgress = true;

        try {
            switch (actionData.action) {
                case 'play':
                    this.seekTo(actionData.time);
                    setTimeout(() => this.play(), 100);
                    break;

                case 'pause':
                    this.seekTo(actionData.time);
                    this.pause();
                    break;

                case 'seek':
                    this.seekTo(actionData.time);
                    break;

                case 'ended':
                    // 處理播放結束
                    break;
            }
        } catch (error) {
            console.error('處理視頻動作失敗:', error);
        } finally {
            setTimeout(() => {
                this.syncInProgress = false;
            }, 1000);
        }
    }

    // 更新同步狀態顯示
    updateSyncStatus(message, type = 'success') {
        const statusElement = document.getElementById('syncStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `sync-status ${type}`;

            // 自動恢復默認狀態
            if (type !== 'default') {
                setTimeout(() => {
                    statusElement.textContent = '已同步';
                    statusElement.className = 'sync-status';
                }, 3000);
            }
        }
    }

    // 請求同步
    requestSync() {
        if (this.socket) {
            console.log('請求同步');
            this.socket.emit('requestSync', {
                roomId: this.roomManager?.roomData?.roomId
            });
            this.updateSyncStatus('同步中...', 'info');
        }
    }

    // 格式化時間
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // 獲取播放進度百分比
    getProgress() {
        const duration = this.getDuration();
        const currentTime = this.getCurrentTime();
        return duration > 0 ? (currentTime / duration) * 100 : 0;
    }

    // 品質控制
    getAvailableQualityLevels() {
        try {
            return this.player ? this.player.getAvailableQualityLevels() : [];
        } catch (error) {
            return [];
        }
    }

    setPlaybackQuality(quality) {
        if (this.isReady && this.player) {
            this.player.setPlaybackQuality(quality);
        }
    }

    getPlaybackQuality() {
        try {
            return this.player ? this.player.getPlaybackQuality() : 'auto';
        } catch (error) {
            return 'auto';
        }
    }

    // 錯誤處理和用戶提示
    showError(message) {
        console.error('YouTube Player Error:', message);
        if (this.roomManager) {
            this.roomManager.showMessage(message, 'error');
        }
    }

    showSuccess(message) {
        console.log('YouTube Player Success:', message);
        if (this.roomManager) {
            this.roomManager.showMessage(message, 'success');
        }
    }

    // 鍵盤快捷鍵
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 只在不是輸入框時響應
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                switch (e.key.toLowerCase()) {
                    case ' ': // 空格鍵播放/暫停
                        e.preventDefault();
                        if (this.isHost) {
                            if (this.isPlaying()) {
                                this.pause();
                            } else {
                                this.play();
                            }
                        }
                        break;

                    case 'arrowleft': // 左箭頭後退10秒
                        e.preventDefault();
                        if (this.isHost) {
                            this.seekTo(Math.max(0, this.getCurrentTime() - 10));
                        }
                        break;

                    case 'arrowright': // 右箭頭前進10秒
                        e.preventDefault();
                        if (this.isHost) {
                            this.seekTo(this.getCurrentTime() + 10);
                        }
                        break;

                    case 'arrowup': // 上箭頭增加音量
                        e.preventDefault();
                        this.setVolume(Math.min(100, this.getVolume() + 10));
                        break;

                    case 'arrowdown': // 下箭頭減少音量
                        e.preventDefault();
                        this.setVolume(Math.max(0, this.getVolume() - 10));
                        break;

                    case 'm': // M鍵靜音/取消靜音
                        e.preventDefault();
                        if (this.getVolume() > 0) {
                            this.previousVolume = this.getVolume();
                            this.setVolume(0);
                        } else {
                            this.setVolume(this.previousVolume || 50);
                        }
                        break;

                    case 's': // S鍵請求同步
                        e.preventDefault();
                        this.requestSync();
                        break;
                }
            }
        });
    }

    // 銷毀播放器
    destroy() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        if (this.player) {
            try {
                this.player.destroy();
            } catch (error) {
                console.error('銷毀播放器失敗:', error);
            }
        }

        this.player = null;
        this.isReady = false;
        this.currentVideoId = null;
    }

    // 獲取播放器統計信息
    getStats() {
        return {
            isReady: this.isReady,
            currentVideoId: this.currentVideoId,
            isHost: this.isHost,
            syncInProgress: this.syncInProgress,
            lastSyncTime: this.lastSyncTime,
            playerState: this.playerState,
            currentTime: this.getCurrentTime(),
            duration: this.getDuration(),
            isPlaying: this.isPlaying()
        };
    }
}

// 初始化 YouTube 播放器
window.youtubePlayer = new YouTubePlayer();

// 設置鍵盤快捷鍵
document.addEventListener('DOMContentLoaded', () => {
    if (window.youtubePlayer) {
        window.youtubePlayer.setupKeyboardShortcuts();
    }
});
