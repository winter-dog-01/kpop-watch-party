// Room functionality - Part 1
class RoomManager {
    constructor() {
        this.socket = null;
        this.roomData = null;
        this.users = new Map();
        this.isHost = false;
        this.danmuVisible = true;
        this.customBackground = null;
        this.lastChatTime = 0;
        this.lastDanmuTime = 0;
        
        // Make this available globally so other files can access it
        window.roomManager = this;
        
        this.init();
    }

    init() {
        this.loadRoomData();
        this.initializeSocket();
        this.bindEvents();
        this.initializeUI();
        this.initializeKeyboardShortcuts();
        this.initializeRateLimiting();
        
        // Wait for other systems to load, then join room
        setTimeout(() => {
            this.joinRoom();
        }, 1000);
        
        // Bind cleanup handlers
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        window.addEventListener('focus', this.focusHandler);
    }

    loadRoomData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('id');
            
            if (!roomId) {
                console.error('No room ID in URL');
                alert('Invalid room URL - missing room ID');
                window.location.href = 'index.html';
                return;
            }

            console.log('Loading room data for room ID:', roomId);

            // Try to get room data from session storage
            const storedData = sessionStorage.getItem('roomData');
            if (storedData) {
                try {
                    this.roomData = JSON.parse(storedData);
                    this.isHost = this.roomData.isHost || false;
                    console.log('Loaded stored room data:', this.roomData);
                } catch (error) {
                    console.error('Error parsing stored room data:', error);
                    sessionStorage.removeItem('roomData');
                    this.roomData = null;
                }
            }
            
            if (!this.roomData) {
                // Prompt for username if no stored data
                const username = prompt('Enter your username:');
                if (!username || username.trim().length < 2) {
                    alert('Please enter a valid username (at least 2 characters)');
                    window.location.href = 'index.html';
                    return;
                }
                
                this.roomData = {
                    roomId: roomId,
                    username: username.trim(),
                    isHost: false
                };
                
                console.log('Created new room data:', this.roomData);
            }
        } catch (error) {
            console.error('Error in loadRoomData:', error);
            throw error;
        }
    }

    initializeSocket() {
        try {
            console.log('Initializing socket connection...');
            
            if (typeof io === 'undefined') {
                throw new Error('Socket.io not available. Make sure the server is running.');
            }
            
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('✅ Socket connected successfully:', this.socket.id);
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ Socket connection error:', error);
                this.showError('Failed to connect to server. Please check if the server is running.');
            });

            this.socket.on('joinedRoom', (data) => {
                console.log('Received joinedRoom event:', data);
                this.handleJoinedRoom(data);
            });

            this.socket.on('userJoined', (user) => {
                console.log('User joined:', user);
                this.handleUserJoined(user);
            });

            this.socket.on('userLeft', (userId) => {
                console.log('User left:', userId);
                this.handleUserLeft(userId);
            });

            this.socket.on('usersUpdate', (users) => {
                console.log('Users update:', users);
                this.updateUsersList(users);
            });

            this.socket.on('chatMessage', (message) => {
                console.log('Received chat message:', message);
                this.handleChatMessage(message);
            });

            this.socket.on('danmuMessage', (danmu) => {
                console.log('Received danmu message:', danmu);
                this.handleDanmuMessage(danmu);
            });

            this.socket.on('videoChanged', (videoData) => {
                console.log('Video changed:', videoData);
                this.handleVideoChanged(videoData);
            });

            this.socket.on('videoSync', (syncData) => {
                console.log('Video sync:', syncData);
                this.handleVideoSync(syncData);
            });

            this.socket.on('roomCustomization', (customization) => {
                console.log('Room customization:', customization);
                this.handleRoomCustomization(customization);
            });

            this.socket.on('videoAction', (actionData) => {
                console.log('Video action:', actionData);
                this.handleVideoAction(actionData);
            });

            this.socket.on('syncRequest', (data) => {
                console.log('Sync request:', data);
                this.handleSyncRequest(data);
            });

            this.socket.on('error', (error) => {
                console.error('Socket error:', error);
                this.showError(error.message);
            });

            this.socket.on('disconnect', () => {
                console.log('Socket disconnected');
                this.showError('Disconnected from server. Trying to reconnect...');
            });

            this.socket.on('reconnect', () => {
                console.log('Socket reconnected');
                this.showSuccess('Reconnected to server!');
                // Rejoin room on reconnect
                this.joinRoom();
            });
            
        } catch (error) {
            console.error('Error initializing socket:', error);
            throw error;
        }
    }

    bindEvents() {
        // Chat functionality
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        document.getElementById('sendChatBtn').addEventListener('click', () => {
            this.sendChatMessage();
        });

        // Danmu functionality
        document.getElementById('danmuInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendDanmuMessage();
            }
        });

        document.getElementById('sendDanmuBtn').addEventListener('click', () => {
            this.sendDanmuMessage();
        });

        // Quick danmu buttons
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const emoji = e.target.dataset.emoji;
                this.sendQuickDanmu(emoji);
            });
        });

        // Video controls
        document.getElementById('loadVideoBtn').addEventListener('click', () => {
            this.loadVideo();
        });

        document.getElementById('youtubeUrl').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadVideo();
            }
        });

        document.getElementById('syncBtn').addEventListener('click', () => {
            this.requestSync();
        });

        // Toggle danmu visibility
        document.getElementById('toggleDanmu').addEventListener('click', () => {
            this.toggleDanmu();
        });

        // Header controls
        document.getElementById('customizeBtn').addEventListener('click', () => {
            this.openCustomizeModal();
        });

        document.getElementById('inviteBtn').addEventListener('click', () => {
            this.openInviteModal();
        });

        document.getElementById('leaveBtn').addEventListener('click', () => {
            this.leaveRoom();
        });

        // Modal controls
        this.bindModalEvents();

        // Window events
        window.addEventListener('beforeunload', () => {
            this.socket.disconnect();
        });

        window.addEventListener('focus', () => {
            this.requestSync();
        });
    }

    bindModalEvents() {
        // Customize modal
        document.getElementById('closeCustomizeModal').addEventListener('click', () => {
            this.closeModal('customizeModal');
        });

        document.getElementById('backgroundUpload').addEventListener('change', (e) => {
            this.handleBackgroundUpload(e);
        });

        document.getElementById('removeBackground').addEventListener('click', () => {
            this.removeBackground();
        });

        document.getElementById('themeColor').addEventListener('change', (e) => {
            this.updateThemeColor(e.target.value);
        });

        document.getElementById('danmuSpeed').addEventListener('input', (e) => {
            this.updateDanmuSpeed(e.target.value);
            document.getElementById('speedValue').textContent = e.target.value;
        });

        // Invite modal
        document.getElementById('closeInviteModal').addEventListener('click', () => {
            this.closeModal('inviteModal');
        });

        document.getElementById('copyShareBtn').addEventListener('click', () => {
            this.copyShareLink();
        });

        // Close modals on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }

    initializeUI() {
        // Set room title
        document.getElementById('roomTitle').textContent = 'Loading...';
        document.getElementById('roomId').textContent = `Room ID: ${this.roomData.roomId}`;
        
        // Initialize danmu system
        if (window.danmuSystem) {
            window.danmuSystem.init();
        }
    }

    joinRoom() {
        this.socket.emit('joinRoom', {
            roomId: this.roomData.roomId,
            username: this.roomData.username,
            password: this.roomData.password || null,
            inviteToken: this.roomData.inviteToken || null
        });
    }

    handleJoinedRoom(data) {
        if (data.success) {
            document.getElementById('roomTitle').textContent = data.room.name;
            this.isHost = data.isHost;
            
            // Update UI based on host status
            if (this.isHost) {
                this.enableHostControls();
            }

            // Connect YouTube player to this room manager
            this.initializeYouTubeIntegration();

            // Connect danmu system
            this.initializeDanmuIntegration();

            // Load existing video if any
            if (data.room.currentVideo) {
                this.handleVideoChanged(data.room.currentVideo);
            }

            // Apply room customization
            if (data.room.customization) {
                this.handleRoomCustomization(data.room.customization);
            }

            this.showSuccess('Successfully joined the room!');
        } else {
            this.showError(data.message || 'Failed to join room');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
        }
    }

    enableHostControls() {
        // Add host indicator
        const hostBadge = document.createElement('span');
        hostBadge.className = 'host-badge';
        hostBadge.innerHTML = '👑 Host';
        document.querySelector('.room-details').appendChild(hostBadge);
    }

    handleUserJoined(user) {
        this.users.set(user.id, user);
        this.updateUserCount();
        this.addChatMessage({
            type: 'system',
            message: `${user.username} joined the room`,
            timestamp: Date.now()
        });
    }

    handleUserLeft(userId) {
        const user = this.users.get(userId);
        if (user) {
            this.users.delete(userId);
            this.updateUserCount();
            this.addChatMessage({
                type: 'system',
                message: `${user.username} left the room`,
                timestamp: Date.now()
            });
        }
    }

    updateUsersList(users) {
        this.users.clear();
        users.forEach(user => {
            this.users.set(user.id, user);
        });
        
        this.updateUserCount();
        this.renderUsersList();
    }

    updateUserCount() {
        const count = this.users.size;
        document.getElementById('userCount').textContent = `👥 ${count} viewer${count !== 1 ? 's' : ''}`;
    }

    renderUsersList() {
        const usersList = document.getElementById('usersList');
        const usersArray = Array.from(this.users.values());
        
        usersList.innerHTML = usersArray.map(user => `
            <div class="user-item ${user.isHost ? 'host' : ''}">
                <span class="user-name">${this.escapeHtml(user.username)}</span>
                ${user.isHost ? '<span class="host-crown">👑</span>' : ''}
            </div>
        `).join('');
    }
    // Enhanced chat message sending with validation
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        if (message.length > 500) {
            this.showError('Message too long (max 500 characters)');
            return;
        }

        // Simple rate limiting
        const now = Date.now();
        if (this.lastChatTime && (now - this.lastChatTime) < 500) {
            this.showError('Please wait before sending another message');
            return;
        }
        this.lastChatTime = now;

        this.socket.emit('chatMessage', {
            roomId: this.roomData.roomId,
            message: message
        });

        input.value = '';
    }

    handleChatMessage(messageData) {
        this.addChatMessage(messageData);
    }

    // Enhanced danmu message sending with rate limiting
    sendDanmuMessage() {
        const input = document.getElementById('danmuInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        if (message.length > 100) {
            this.showError('Danmu message too long (max 100 characters)');
            return;
        }

        // Simple rate limiting
        const now = Date.now();
        if (this.lastDanmuTime && (now - this.lastDanmuTime) < 1000) {
            this.showError('Please wait before sending another danmu');
            return;
        }
        this.lastDanmuTime = now;

        this.socket.emit('danmuMessage', {
            roomId: this.roomData.roomId,
            message: message,
            color: this.getRandomDanmuColor()
        });

        input.value = '';
    }

    sendQuickDanmu(emoji) {
        this.socket.emit('danmuMessage', {
            roomId: this.roomData.roomId,
            message: emoji,
            color: this.getRandomDanmuColor(),
            isQuick: true
        });
    }

    handleDanmuMessage(danmuData) {
        if (this.danmuVisible && window.danmuSystem) {
            window.danmuSystem.addDanmu(danmuData);
        }
    }

    getRandomDanmuColor() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    toggleDanmu() {
        this.danmuVisible = !this.danmuVisible;
        const btn = document.getElementById('toggleDanmu');
        
        if (this.danmuVisible) {
            btn.innerHTML = '<i class="fas fa-eye"></i> Hide Danmu';
            btn.classList.add('active');
            if (window.danmuSystem) {
                window.danmuSystem.show();
            }
        } else {
            btn.innerHTML = '<i class="fas fa-eye-slash"></i> Show Danmu';
            btn.classList.remove('active');
            if (window.danmuSystem) {
                window.danmuSystem.hide();
            }
        }
    }

    // Enhanced video loading with validation
    loadVideo() {
        const urlInput = document.getElementById('youtubeUrl');
        const url = urlInput.value.trim();
        
        if (!url) {
            this.showError('Please enter a YouTube URL');
            return;
        }

        // More comprehensive URL validation
        if (!this.isValidYouTubeUrl(url)) {
            this.showError('Please enter a valid YouTube URL');
            return;
        }

        const videoId = this.extractVideoId(url);
        if (!videoId) {
            this.showError('Could not extract video ID from URL');
            return;
        }

        if (!this.isHost) {
            this.showError('Only the host can change videos');
            return;
        }

        // Show loading state
        const loadBtn = document.getElementById('loadVideoBtn');
        const originalText = loadBtn.innerHTML;
        loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        loadBtn.disabled = true;

        this.socket.emit('changeVideo', {
            roomId: this.roomData.roomId,
            videoId: videoId,
            url: url
        });

        // Reset button after 3 seconds
        setTimeout(() => {
            loadBtn.innerHTML = originalText;
            loadBtn.disabled = false;
        }, 3000);

        // Clear input
        urlInput.value = '';
    }

    isValidYouTubeUrl(url) {
        const patterns = [
            /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
            /^https?:\/\/(www\.)?youtube\.com\/watch\?.*v=.+/,
            /^https?:\/\/youtu\.be\/.+/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    }

    // Enhanced video URL extraction with more patterns
    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
            /youtube\.com\/v\/([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v%3D([^&\n?#]+)/,
            /youtu\.be\/([^&\n?#]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                // Clean the video ID (remove any remaining parameters)
                return match[1].split('&')[0].split('#')[0].split('?')[0];
            }
        }
        
        return null;
    }

    handleVideoChanged(videoData) {
        if (window.youtubePlayer) {
            window.youtubePlayer.loadVideo(videoData);
        }
        
        // Update video info
        document.getElementById('videoInfo').style.display = 'flex';
        document.getElementById('videoTitle').textContent = videoData.title || 'Loading...';
        
        this.addChatMessage({
            type: 'system',
            message: `Video changed: ${videoData.title || 'New video'}`,
            timestamp: Date.now()
        });
    }

    requestSync() {
        this.socket.emit('requestSync', {
            roomId: this.roomData.roomId
        });
    }

    handleVideoSync(syncData) {
        if (window.youtubePlayer) {
            window.youtubePlayer.sync(syncData);
        }
        
        const syncStatus = document.getElementById('syncStatus');
        syncStatus.textContent = 'Synced';
        syncStatus.style.color = '#10b981';
        
        setTimeout(() => {
            syncStatus.textContent = 'In Sync';
        }, 2000);
    }

    openCustomizeModal() {
        document.getElementById('customizeModal').classList.remove('hidden');
    }

    openInviteModal() {
        const currentUrl = window.location.href;
        document.getElementById('shareLink').value = currentUrl;
        document.getElementById('inviteModal').classList.remove('hidden');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    // Enhanced background upload with preview
    handleBackgroundUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showError('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.showError('Image too large (max 5MB)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;
            
            // Validate that it's actually an image
            const img = new Image();
            img.onload = () => {
                this.updateBackground(imageData);
                
                if (this.isHost) {
                    this.socket.emit('updateRoomCustomization', {
                        roomId: this.roomData.roomId,
                        type: 'background',
                        data: imageData
                    });
                    this.showSuccess('Background updated successfully!');
                } else {
                    this.showError('Only hosts can change the background');
                }
            };
            
            img.onerror = () => {
                this.showError('Invalid image file');
            };
            
            img.src = imageData;
        };
        
        reader.onerror = () => {
            this.showError('Failed to read image file');
        };
        
        reader.readAsDataURL(file);
    }

    removeBackground() {
        this.updateBackground(null);
        
        if (this.isHost) {
            this.socket.emit('updateRoomCustomization', {
                roomId: this.roomData.roomId,
                type: 'background',
                data: null
            });
        } else {
            this.showError('Only hosts can change the background');
        }
    }

    updateBackground(imageData) {
        if (imageData) {
            document.body.style.backgroundImage = `url(${imageData})`;
        } else {
            document.body.style.backgroundImage = '';
        }
    }

    // Enhanced theme color update with validation
    updateThemeColor(color) {
        // Validate hex color
        if (!/^#[0-9A-F]{6}$/i.test(color)) {
            this.showError('Invalid color format');
            return;
        }

        document.documentElement.style.setProperty('--theme-color', color);
        
        if (this.isHost) {
            this.socket.emit('updateRoomCustomization', {
                roomId: this.roomData.roomId,
                type: 'themeColor',
                data: color
            });
            this.showSuccess('Theme color updated!');
        } else {
            this.showError('Only hosts can change the theme color');
        }
    }

    // Enhanced danmu speed update
    updateDanmuSpeed(speed) {
        const speedValue = Math.max(1, Math.min(10, parseInt(speed)));
        
        if (window.danmuSystem) {
            window.danmuSystem.setSpeed(speedValue);
        }
        
        if (this.isHost) {
            this.socket.emit('updateRoomCustomization', {
                roomId: this.roomData.roomId,
                type: 'danmuSpeed',
                data: speedValue
            });
        } else {
            this.showError('Only hosts can change danmu settings');
        }
    }

    // Enhanced room customization handler
    handleRoomCustomization(customization) {
        if (customization.background) {
            this.updateBackground(customization.background);
        }
        
        if (customization.themeColor) {
            document.documentElement.style.setProperty('--theme-color', customization.themeColor);
            const colorInput = document.getElementById('themeColor');
            if (colorInput) {
                colorInput.value = customization.themeColor;
            }
        }
        
        if (customization.danmuSpeed) {
            if (window.danmuSystem) {
                window.danmuSystem.setSpeed(customization.danmuSpeed);
            }
            const speedInput = document.getElementById('danmuSpeed');
            const speedValue = document.getElementById('speedValue');
            if (speedInput && speedValue) {
                speedInput.value = customization.danmuSpeed;
                speedValue.textContent = customization.danmuSpeed;
            }
        }
    }

    copyShareLink() {
        const linkInput = document.getElementById('shareLink');
        linkInput.select();
        document.execCommand('copy');
        
        const copyBtn = document.getElementById('copyShareBtn');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        copyBtn.style.background = '#10b981';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '';
        }, 2000);
    }

    leaveRoom() {
        if (confirm('Are you sure you want to leave this room?')) {
            this.socket.disconnect();
            sessionStorage.removeItem('roomData');
            window.location.href = 'index.html';
        }
    }

    // Initialize YouTube player integration
    initializeYouTubeIntegration() {
        // Wait for YouTube player to be ready
        const connectYouTube = () => {
            if (window.youtubePlayer && window.youtubePlayer.isReady) {
                console.log('Connecting YouTube player to room manager');
                window.youtubePlayer.setSocket(this.socket);
                window.youtubePlayer.setIsHost(this.isHost);
                
                // Set up the connection
                window.youtubePlayer.roomManager = this;
            } else {
                console.log('Waiting for YouTube player...');
                setTimeout(connectYouTube, 500);
            }
        };
        connectYouTube();
    }

    // Initialize danmu system integration
    initializeDanmuIntegration() {
        const connectDanmu = () => {
            if (window.danmuSystem) {
                console.log('Connecting danmu system to room manager');
                window.danmuSystem.roomManager = this;
            } else {
                console.log('Waiting for danmu system...');
                setTimeout(connectDanmu, 500);
            }
        };
        connectDanmu();
    }

    handleVideoAction(actionData) {
        if (window.youtubePlayer) {
            window.youtubePlayer.handleVideoAction(actionData);
        }
    }

    handleSyncRequest(data) {
        // Host responds to sync requests with current state
        if (this.isHost && window.youtubePlayer) {
            const currentTime = window.youtubePlayer.getCurrentTime();
            const isPlaying = window.youtubePlayer.isPlaying();
            
            this.socket.emit('syncBroadcast', {
                videoId: window.youtubePlayer.currentVideoId,
                time: currentTime,
                isPlaying: isPlaying,
                timestamp: Date.now()
            });
        }
    }

    // Enhanced user experience methods
    addChatMessage(messageData) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${messageData.type || 'user'}`;
        
        const timestamp = new Date(messageData.timestamp).toLocaleTimeString();
        
        if (messageData.type === 'system') {
            messageDiv.innerHTML = `
                <div class="system-message">
                    <span class="timestamp">${timestamp}</span>
                    <span class="message">${this.escapeHtml(messageData.message)}</span>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="user-message">
                    <div class="message-header">
                        <span class="username">${this.escapeHtml(messageData.username)}</span>
                        <span class="timestamp">${timestamp}</span>
                    </div>
                    <div class="message-content">${this.escapeHtml(messageData.message)}</div>
                </div>
            `;
        }

        chatMessages.appendChild(messageDiv);
        
        // Auto-scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Limit chat history to prevent memory issues
        const messages = chatMessages.children;
        if (messages.length > 100) {
            messages[0].remove();
        }

        // Add visual feedback for new messages
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(10px)';
        setTimeout(() => {
            messageDiv.style.transition = 'all 0.3s ease';
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        }, 50);
    }

    // Enhanced error and success handling
    showError(message) {
        console.error(message);
        this.createToast('error', message);
    }

    showSuccess(message) {
        console.log(message);
        this.createToast('success', message);
    }

    createToast(type, message) {
        // Remove existing toasts of the same type
        const existingToast = document.querySelector(`.toast.${type}`);
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i>
            <span>${this.escapeHtml(message)}</span>
        `;
        
        document.body.appendChild(toast);
        
        // Show animation
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Auto remove
        const duration = type === 'error' ? 5000 : 3000;
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, duration);

        // Click to dismiss
        toast.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        });
    }

    // Keyboard shortcuts
    initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when not typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key.toLowerCase()) {
                case ' ': // Space for play/pause
                    e.preventDefault();
                    if (this.isHost && window.youtubePlayer) {
                        if (window.youtubePlayer.isPlaying()) {
                            window.youtubePlayer.pause();
                        } else {
                            window.youtubePlayer.play();
                        }
                    }
                    break;
                    
                case 'd': // Toggle danmu
                    e.preventDefault();
                    this.toggleDanmu();
                    break;
                    
                case 's': // Request sync
                    e.preventDefault();
                    this.requestSync();
                    break;
                    
                case 'f': // Focus chat input
                    e.preventDefault();
                    document.getElementById('chatInput').focus();
                    break;
            }
        });
    }

    // Initialize rate limiting timestamps
    initializeRateLimiting() {
        this.lastChatTime = 0;
        this.lastDanmuTime = 0;
    }

    // Additional utility methods
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

    // Enhanced cleanup and memory management
    destroy() {
        // Clean up socket listeners
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }

        // Clean up YouTube player
        if (window.youtubePlayer) {
            window.youtubePlayer.destroy();
        }

        // Clean up danmu system
        if (window.danmuSystem) {
            window.danmuSystem.clear();
        }

        // Clear session storage
        sessionStorage.removeItem('roomData');

        // Remove event listeners
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        window.removeEventListener('focus', this.focusHandler);
    }

    // Before unload handler
    beforeUnloadHandler = () => {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    // Focus handler
    focusHandler = () => {
        this.requestSync();
    }

    // Complete the escapeHtml method
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize room when DOM is loaded
let roomManager;
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Room Manager...');
    
    try {
        roomManager = new RoomManager();
        console.log('✅ Room Manager initialized successfully!');
    } catch (error) {
        console.error('❌ Room Manager initialization failed:', error);
        
        // Show error to user
        document.body.innerHTML = `
            <div style="padding: 20px; background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 5px; margin: 20px;">
                <h3>Room Manager Error</h3>
                <p>Failed to initialize room manager: ${error.message}</p>
                <p>Please check the browser console for more details.</p>
                <button onclick="location.reload()">Reload Page</button>
            </div>
        `;
    }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && roomManager) {
        // Request sync when page becomes visible
        roomManager.requestSync();
    }
});

// Global cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (roomManager) {
        roomManager.destroy();
    }
});