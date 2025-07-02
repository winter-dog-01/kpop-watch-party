// YouTube API integration
class YouTubePlayer {
    constructor() {
        this.player = null;
        this.isReady = false;
        this.currentVideoId = null;
        this.isHost = false;
        this.syncInProgress = false;
        this.lastSyncTime = 0;
        this.socket = null;
        this.roomManager = null;
        
        // Make this available globally
        window.youtubePlayer = this;
        
        this.init();
    }

    init() {
        console.log('Initializing YouTube Player...');
        
        // YouTube API will call this when ready
        window.onYouTubeIframeAPIReady = () => {
            console.log('YouTube API ready, creating player...');
            this.createPlayer();
        };

        // If API is already loaded
        if (window.YT && window.YT.Player) {
            console.log('YouTube API already loaded, creating player...');
            this.createPlayer();
        } else {
            console.log('Waiting for YouTube API to load...');
        }
    }

    setSocket(socket) {
        this.socket = socket;
    }

    setIsHost(isHost) {
        this.isHost = isHost;
    }

    createPlayer() {
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
                'rel': 0
            },
            events: {
                'onReady': (event) => this.onPlayerReady(event),
                'onStateChange': (event) => this.onPlayerStateChange(event),
                'onError': (event) => this.onPlayerError(event)
            }
        });
    }

    onPlayerReady(event) {
        this.isReady = true;
        console.log('YouTube player ready and connected!');
        
        // Connect to room manager if available
        if (window.roomManager) {
            this.setSocket(window.roomManager.socket);
            this.setIsHost(window.roomManager.isHost);
            this.roomManager = window.roomManager;
        }
        
        // Enable periodic sync checking
        this.startSyncMonitoring();
    }

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

        console.log('Player state changed:', stateNames[state] || state);

        // Only hosts can trigger sync events
        if (this.isHost && this.socket && !this.syncInProgress) {
            const currentTime = this.getCurrentTime();
            
            switch (state) {
                case YT.PlayerState.PLAYING:
                    this.socket.emit('videoAction', {
                        action: 'play',
                        time: currentTime,
                        videoId: this.currentVideoId
                    });
                    break;
                    
                case YT.PlayerState.PAUSED:
                    this.socket.emit('videoAction', {
                        action: 'pause',
                        time: currentTime,
                        videoId: this.currentVideoId
                    });
                    break;
            }
        }

        // Handle video end
        if (state === YT.PlayerState.ENDED) {
            this.onVideoEnded();
        }
    }

    onPlayerError(event) {
        const errorCodes = {
            2: 'Invalid video ID',
            5: 'HTML5 player error',
            100: 'Video not found or private',
            101: 'Video not allowed in embedded players',
            150: 'Video not allowed in embedded players'
        };

        const errorMessage = errorCodes[event.data] || 'Unknown error';
        console.error('YouTube player error:', errorMessage);
        
        if (window.roomManager) {
            window.roomManager.showError(`Video error: ${errorMessage}`);
        }
    }

    loadVideo(videoData) {
        if (!this.isReady) {
            console.warn('Player not ready yet');
            return;
        }

        this.currentVideoId = videoData.videoId;
        
        try {
            // Load the video
            this.player.loadVideoById({
                videoId: videoData.videoId,
                startSeconds: videoData.startTime || 0
            });

            // Update video info if available
            if (videoData.title) {
                this.updateVideoInfo(videoData);
            } else {
                // Fetch video info from YouTube API
                this.fetchVideoInfo(videoData.videoId);
            }

        } catch (error) {
            console.error('Error loading video:', error);
            if (window.roomManager) {
                window.roomManager.showError('Failed to load video');
            }
        }
    }

    async fetchVideoInfo(videoId) {
        try {
            // Use YouTube oEmbed API to get video info
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            
            if (response.ok) {
                const data = await response.json();
                this.updateVideoInfo({
                    videoId: videoId,
                    title: data.title,
                    author: data.author_name,
                    thumbnail: data.thumbnail_url
                });
            }
        } catch (error) {
            console.error('Error fetching video info:', error);
        }
    }

    updateVideoInfo(videoData) {
        const videoTitle = document.getElementById('videoTitle');
        if (videoTitle) {
            videoTitle.textContent = videoData.title || 'Unknown Video';
        }

        // Store video data for sync purposes
        this.currentVideoData = videoData;
    }

    sync(syncData) {
        if (!this.isReady || !this.currentVideoId) {
            return;
        }

        this.syncInProgress = true;
        
        try {
            const currentTime = this.getCurrentTime();
            const targetTime = syncData.time;
            const timeDiff = Math.abs(currentTime - targetTime);

            // Only sync if difference is significant (more than 2 seconds)
            if (timeDiff > 2) {
                this.player.seekTo(targetTime, true);
            }

            // Sync playback state
            if (syncData.isPlaying && this.getPlayerState() !== YT.PlayerState.PLAYING) {
                this.player.playVideo();
            } else if (!syncData.isPlaying && this.getPlayerState() === YT.PlayerState.PLAYING) {
                this.player.pauseVideo();
            }

            this.lastSyncTime = Date.now();
            
        } catch (error) {
            console.error('Error during sync:', error);
        } finally {
            // Reset sync flag after a delay
            setTimeout(() => {
                this.syncInProgress = false;
            }, 1000);
        }
    }

    startSyncMonitoring() {
        // Check for drift every 10 seconds
        setInterval(() => {
            if (this.isHost && this.socket && this.currentVideoId) {
                this.broadcastCurrentState();
            }
        }, 10000);

        // More frequent checks during playback
        setInterval(() => {
            if (this.isHost && this.socket && this.currentVideoId && this.isPlaying()) {
                this.broadcastCurrentState();
            }
        }, 5000);
    }

    broadcastCurrentState() {
        if (!this.socket || this.syncInProgress) return;

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
            console.error('Error broadcasting state:', error);
        }
    }

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

    seekTo(time) {
        if (this.isReady && this.player) {
            this.player.seekTo(time, true);
        }
    }

    setVolume(volume) {
        if (this.isReady && this.player) {
            this.player.setVolume(Math.max(0, Math.min(100, volume)));
        }
    }

    getVolume() {
        try {
            return this.player ? this.player.getVolume() : 50;
        } catch (error) {
            return 50;
        }
    }

    onVideoEnded() {
        if (this.isHost && this.socket) {
            this.socket.emit('videoAction', {
                action: 'ended',
                videoId: this.currentVideoId
            });
        }

        // Show video ended message
        if (window.roomManager) {
            window.roomManager.addChatMessage({
                type: 'system',
                message: 'Video ended',
                timestamp: Date.now()
            });
        }
    }

    // Handle external video actions (from other users)
    handleVideoAction(actionData) {
        if (this.isHost || !this.isReady) {
            return; // Hosts don't respond to external actions
        }

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
                    // Handle video end
                    break;
            }
        } catch (error) {
            console.error('Error handling video action:', error);
        } finally {
            setTimeout(() => {
                this.syncInProgress = false;
            }, 1000);
        }
    }

    // Utility methods
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

    getVideoProgress() {
        const currentTime = this.getCurrentTime();
        const duration = this.getDuration();
        return duration > 0 ? (currentTime / duration) * 100 : 0;
    }

    // Quality control
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

    // Event listeners for external control
    onSeek(callback) {
        this.onSeekCallback = callback;
    }

    onPlay(callback) {
        this.onPlayCallback = callback;
    }

    onPause(callback) {
        this.onPauseCallback = callback;
    }

    // Cleanup
    destroy() {
        if (this.player) {
            try {
                this.player.destroy();
            } catch (error) {
                console.error('Error destroying player:', error);
            }
            this.player = null;
        }
        this.isReady = false;
        this.currentVideoId = null;
    }
}

// Initialize YouTube player
window.youtubePlayer = new YouTubePlayer();

// Make it available globally for room manager
window.addEventListener('DOMContentLoaded', () => {
    if (window.roomManager) {
        window.youtubePlayer.setSocket(window.roomManager.socket);
    }
});