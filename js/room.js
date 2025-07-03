// 房間功能管理 - 無房主限制版本 Part 1
class RoomManager {
    constructor() {
        this.socket = null;
        this.roomData = null;
        this.users = new Map();
        this.isHost = false;
        this.isConnected = false;
        this.currentVideo = null;
        this.chatHistory = [];
        this.maxChatHistory = 100;
        this.hasJoinedRoom = false;
        
        // 速率限制
        this.lastChatTime = 0;
        this.lastDanmuTime = 0;
        this.chatCooldown = 1000; // 1秒
        //this.danmuCooldown = 2000; // 2秒
        
        // 全域可用
        window.roomManager = this;
        
        this.init();
    }

    init() {
        console.log('🏠 初始化房間管理器...');
        
        try {
            this.loadRoomData();
            this.initializeSocket();
            this.bindEvents();
            this.initializeUI();
            
            // 等待其他系統載入後再加入房間
            setTimeout(() => {
                this.joinRoom();
            }, 1000);
            
        } catch (error) {
            console.error('房間管理器初始化失敗:', error);
            this.showError('房間初始化失敗，請重新整理頁面');
        }
    }

    // 載入房間數據
    loadRoomData() {
        // 從 URL 獲取房間 ID
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('id');
        
        if (!roomId) {
            throw new Error('URL 中沒有房間 ID');
        }

        // 嘗試從 sessionStorage 獲取房間數據
        const storedData = sessionStorage.getItem('roomData');
        if (storedData) {
            try {
                this.roomData = JSON.parse(storedData);
                this.isHost = this.roomData.isHost || false;
                
                // 確保房間 ID 匹配
                if (this.roomData.roomId !== roomId) {
                    console.warn('房間 ID 不匹配，更新房間 ID');
                    this.roomData.roomId = roomId;
                }
                
                console.log('載入儲存的房間數據:', this.roomData);
            } catch (error) {
                console.error('解析房間數據失敗:', error);
                sessionStorage.removeItem('roomData');
                this.roomData = null;
            }
        }

        // 如果沒有儲存的數據，提示用戶輸入
        if (!this.roomData) {
            const username = prompt('請輸入你的暱稱:');
            if (!username || username.trim().length < 2) {
                alert('暱稱無效，將返回首頁');
                window.location.href = 'index.html';
                return;
            }

            this.roomData = {
                roomId: roomId,
                username: username.trim(),
                isHost: false
            };
        }

        console.log('當前房間數據:', this.roomData);
    }

    // 初始化 Socket 連接
    initializeSocket() {
        try {
            console.log('建立 Socket 連接...');
            this.socket = io();

            // 連接事件
            this.socket.on('connect', () => {
                console.log('✅ Socket 已連接:', this.socket.id);
                this.isConnected = true;
                this.updateConnectionStatus(true);
            });

            this.socket.on('disconnect', () => {
                console.log('❌ Socket 連接中斷');
                this.isConnected = false;
                this.updateConnectionStatus(false);
                this.showError('與服務器連接中斷，正在嘗試重新連接...');
            });

            this.socket.on('connect_error', (error) => {
                console.error('Socket 連接錯誤:', error);
                this.showError('無法連接到服務器，請檢查網路連接');
            });

            // 房間事件
            this.socket.on('joinedRoom', (data) => this.handleJoinedRoom(data));
            this.socket.on('userJoined', (user) => this.handleUserJoined(user));
            this.socket.on('userLeft', (data) => this.handleUserLeft(data));
            this.socket.on('usersUpdate', (users) => this.updateUsersList(users));

            // 聊天和彈幕事件
            this.socket.on('chatMessage', (message) => this.handleChatMessage(message));
            this.socket.on('danmuMessage', (danmu) => this.handleDanmuMessage(danmu));

            // 視頻同步事件
            this.socket.on('videoChanged', (videoData) => this.handleVideoChanged(videoData));
            this.socket.on('videoAction', (actionData) => this.handleVideoAction(actionData));
            this.socket.on('syncBroadcast', (syncData) => this.handleSyncBroadcast(syncData));

            // 房間自定義事件
            this.socket.on('roomCustomization', (customization) => this.handleRoomCustomization(customization));

            // 錯誤處理
            this.socket.on('error', (error) => {
                console.error('Socket 錯誤:', error);
                this.showError(error.message || '發生未知錯誤');
            });

        } catch (error) {
            console.error('Socket 初始化失敗:', error);
            throw error;
        }
    }

    // 綁定事件監聽器
    bindEvents() {
        // YouTube URL 載入
        const loadVideoBtn = document.getElementById('loadVideoBtn');
        if (loadVideoBtn) {
            loadVideoBtn.addEventListener('click', () => {
                this.loadVideo();
            });
        }

        const youtubeUrl = document.getElementById('youtubeUrl');
        if (youtubeUrl) {
            youtubeUrl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.loadVideo();
                }
            });
        }

        // 同步按鈕
        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                this.requestSync();
            });
        }

        // 聊天功能
        const sendChatBtn = document.getElementById('sendChatBtn');
        if (sendChatBtn) {
            sendChatBtn.addEventListener('click', () => {
                this.sendChatMessage();
            });
        }

        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendChatMessage();
                }
            });
        }

        // 彈幕功能
        const sendDanmuBtn = document.getElementById('sendDanmuBtn');
        if (sendDanmuBtn) {
            sendDanmuBtn.addEventListener('click', () => {
                this.sendDanmuMessage();
            });
        }

        const danmuInput = document.getElementById('danmuInput');
        if (danmuInput) {
            danmuInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendDanmuMessage();
                }
            });
        }

        // 快速彈幕按鈕
       // 快速彈幕按鈕
        document.querySelectorAll('.quick-danmu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const emoji = e.target.dataset.emoji;
                if (emoji) {
                    console.log('🎭 快速彈幕按鈕被點擊:', emoji);
                    this.sendQuickDanmu(emoji);
                }
            });
        });

        // 彈幕切換
        const toggleDanmuBtn = document.getElementById('toggleDanmuBtn');

        if (toggleDanmuBtn) {
            toggleDanmuBtn.addEventListener('click', () => {
                this.toggleDanmu();
            });
        }

        // 控制按鈕
        const customizeBtn = document.getElementById('customizeBtn');
        if (customizeBtn) {
            customizeBtn.addEventListener('click', () => {
                this.openCustomizeModal();
            });
        }

        const inviteBtn = document.getElementById('inviteBtn');
        if (inviteBtn) {
            inviteBtn.addEventListener('click', () => {
                this.openInviteModal();
            });
        }

        const leaveBtn = document.getElementById('leaveBtn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
                this.leaveRoom();
            });
        }

        // 彈窗事件
        this.bindModalEvents();

        // 頁面離開前清理
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    // 綁定彈窗事件
    bindModalEvents() {
        // 自定義彈窗
        const closeCustomizeModal = document.getElementById('closeCustomizeModal');
        if (closeCustomizeModal) {
            closeCustomizeModal.addEventListener('click', () => {
                this.closeModal('customizeModal');
            });
        }

        const backgroundUpload = document.getElementById('backgroundUpload');
        if (backgroundUpload) {
            backgroundUpload.addEventListener('change', (e) => {
                this.handleBackgroundUpload(e);
            });
        }

        const removeBackground = document.getElementById('removeBackground');
        if (removeBackground) {
            removeBackground.addEventListener('click', () => {
                this.removeBackground();
            });
        }

        const themeColor = document.getElementById('themeColor');
        if (themeColor) {
            themeColor.addEventListener('change', (e) => {
                this.updateThemeColor(e.target.value);
            });
        }

        const danmuSpeed = document.getElementById('danmuSpeed');
        if (danmuSpeed) {
            danmuSpeed.addEventListener('input', (e) => {
                this.updateDanmuSpeed(e.target.value);
            });
        }

        // 邀請彈窗
        const closeInviteModal = document.getElementById('closeInviteModal');
        if (closeInviteModal) {
            closeInviteModal.addEventListener('click', () => {
                this.closeModal('inviteModal');
            });
        }

        const copyShareBtn = document.getElementById('copyShareBtn');
        if (copyShareBtn) {
            copyShareBtn.addEventListener('click', () => {
                this.copyShareLink();
            });
        }

        // 點擊背景關閉彈窗
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }

    // 初始化 UI
    initializeUI() {
        // 設置房間標題和 ID
        const roomTitle = document.getElementById('roomTitle');
        const roomId = document.getElementById('roomId');
        
        if (roomTitle) roomTitle.textContent = '載入中...';
        if (roomId) roomId.textContent = `ID: ${this.roomData.roomId}`;

        // 更新連接狀態
        this.updateConnectionStatus(false);
        
        // 🔧 添加提示：所有用戶都可以使用功能
        this.addWelcomeMessage();
    }

    // 🆕 添加歡迎訊息
    addWelcomeMessage() {
        setTimeout(() => {
            this.addSystemMessage('🎉 歡迎來到 K-Pop 觀看派對！所有人都可以載入影片和自定義房間。');
        }, 2000);
    }

// 加入房間
joinRoom() {
    if (!this.isConnected) {
        console.log('等待 Socket 連接...');
        setTimeout(() => this.joinRoom(), 1000);
        return;
    }

    // 🔧 檢查是否是從首頁跳轉過來的，且已經驗證過密碼
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('id');
    
    if (roomId && this.roomData && this.roomData.roomId === roomId) {
        // 這是從首頁跳轉過來的，不需要密碼
        console.log('🚪 從首頁跳轉，無需密碼驗證');
        
        this.socket.emit('joinRoom', {
            roomId: this.roomData.roomId,
            username: this.roomData.username,
            password: null,  // 🔧 不發送密碼
            fromRedirect: true  // 🔧 告訴服務器這是跳轉過來的
        });
        return;
    }

    if (!this.roomData || !this.roomData.roomId) {
        console.error('❌ 沒有房間數據');
        this.showError('房間數據錯誤，將返回首頁');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return;
    }

    console.log('🚪 正常加入房間流程:', this.roomData);
    
    this.socket.emit('joinRoom', {
        roomId: this.roomData.roomId,
        username: this.roomData.username,
        password: this.roomData.password || null
    });
}
// 處理加入房間成功
handleJoinedRoom(data) {
    console.log('🏠 收到 joinedRoom 響應:', data);
    
    if (data.success) {
        this.hasJoinedRoom = true;
        console.log('✅ 成功加入房間:', data);

        // 🔧 確保更新房間信息
        this.roomData.roomId = data.room.id;
        this.roomData.roomName = data.room.name;
        this.isHost = data.isHost || false;

        // 更新房間信息顯示
        const roomTitle = document.getElementById('roomTitle');
        if (roomTitle) roomTitle.textContent = data.room.name;

        // 更新 sessionStorage 中的房間數據
        sessionStorage.setItem('roomData', JSON.stringify({
            ...this.roomData,
            isHost: this.isHost,
            roomName: data.room.name
        }));

        // 顯示房主標誌（如果是房主的話）
        if (data.isHost) {
            console.log('👑 顯示房主權限');
            const hostBadge = document.querySelector('.host-badge');
            if (hostBadge) {
                hostBadge.classList.remove('hidden');
            }
        }

        // 載入現有視頻
        if (data.room.currentVideo) {
            this.handleVideoChanged(data.room.currentVideo);
        }

        // 應用房間自定義
        if (data.room.customization) {
            this.handleRoomCustomization(data.room.customization);
        }

        this.showSuccess('成功加入房間！');

    } else {
        console.error('❌ 加入房間失敗:', data.message);
        this.showError(data.message || '加入房間失敗');
        
        // 3秒後返回首頁
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    }
}

    // 處理用戶加入
    handleUserJoined(user) {
        console.log('用戶加入:', user);
        this.users.set(user.id, user);
        this.updateUserCount();
        this.addSystemMessage(`${user.username} 加入了房間`);
    }

    // 處理用戶離開
    handleUserLeft(data) {
        console.log('用戶離開:', data);
        const user = this.users.get(data.userId);
        if (user) {
            this.users.delete(data.userId);
            this.updateUserCount();
            this.addSystemMessage(`${user.username} 離開了房間`);
        }
    }

    // 更新用戶列表
    updateUsersList(users) {
        console.log('更新用戶列表:', users);
        
        this.users.clear();
        users.forEach(user => {
            this.users.set(user.id, user);
        });

        this.updateUserCount();
        this.renderUsersList();
    }

    // 更新用戶數量顯示
    updateUserCount() {
        const count = this.users.size;
        const userCountElement = document.getElementById('userCount');
        if (userCountElement) {
            userCountElement.innerHTML = `👥 ${count} 人觀看`;
        }
    }

    // 渲染用戶列表
    renderUsersList() {
        const usersList = document.getElementById('usersList');
        if (!usersList) return;
        
        const usersArray = Array.from(this.users.values());

        if (usersArray.length === 0) {
            usersList.innerHTML = `
                <div class="loading-users">
                    <i class="fas fa-users"></i>
                    正在載入用戶...
                </div>
            `;
            return;
        }

        usersList.innerHTML = usersArray.map(user => `
            <div class="user-item ${user.isHost ? 'host' : ''}">
                <div class="user-name">${this.escapeHtml(user.username)}</div>
                <div class="user-status">
                    ${user.isHost ? '<i class="fas fa-crown" title="房主"></i>' : '<i class="fas fa-circle" title="在線"></i>'}
                </div>
            </div>
        `).join('');
    }
    // 房間功能管理 - 無房主限制版本 Part 2

    // 🔧 載入視頻 - 移除房主限制
    loadVideo() {
        const urlInput = document.getElementById('youtubeUrl');
        const url = urlInput.value.trim();

        if (!url) {
            this.showError('請輸入 YouTube 影片連結');
            return;
        }

        // 🔧 任何用戶都可以載入影片
        console.log('🎬 載入視頻...');
        console.log('當前用戶:', this.roomData.username);
        console.log('房間ID:', this.roomData.roomId);

        // 驗證 YouTube URL
        if (!this.isValidYouTubeUrl(url)) {
            this.showError('請輸入有效的 YouTube 影片連結');
            return;
        }

        const videoId = this.extractVideoId(url);
        if (!videoId) {
            this.showError('無法從連結中提取影片 ID');
            return;
        }

        console.log('✅ 開始載入視頻:', videoId);

        // 顯示載入狀態
        const loadBtn = document.getElementById('loadVideoBtn');
        const originalText = loadBtn.innerHTML;
        loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 載入中...';
        loadBtn.disabled = true;

        // 發送載入視頻請求
        this.socket.emit('changeVideo', {
            roomId: this.roomData.roomId,
            videoId: videoId,
            url: url,
            changedBy: this.roomData.username // 添加操作者信息
        });

        // 清空輸入框
        urlInput.value = '';

        // 恢復按鈕狀態
        setTimeout(() => {
            loadBtn.innerHTML = originalText;
            loadBtn.disabled = false;
        }, 3000);
    }

    // YouTube URL 驗證
    isValidYouTubeUrl(url) {
        const patterns = [
            /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
            /^https?:\/\/(www\.)?youtube\.com\/watch\?.*v=.+/,
            /^https?:\/\/youtu\.be\/.+/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    }

    // 提取 YouTube 視頻 ID
    extractVideoId(url) {
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

    // 處理視頻變更
    handleVideoChanged(videoData) {
        console.log('視頻已變更:', videoData);
        
        this.currentVideo = videoData;
        
        // 載入到 YouTube 播放器
        if (window.youtubePlayer) {
            window.youtubePlayer.loadVideo(videoData);
        }
        
        // 更新視頻資訊顯示
        const videoInfo = document.getElementById('videoInfo');
        const videoTitle = document.getElementById('videoTitle');
        
        if (videoInfo) videoInfo.style.display = 'flex';
        if (videoTitle) videoTitle.textContent = videoData.title || '載入中...';
        
        // 🔧 顯示是誰載入的視頻
        const changedBy = videoData.changedBy || '某位用戶';
        this.addSystemMessage(`${changedBy} 載入了影片: ${videoData.title || '新影片'}`);
    }

    // 處理視頻動作
    handleVideoAction(actionData) {
        console.log('收到視頻動作:', actionData);
        
        if (window.youtubePlayer) {
            window.youtubePlayer.handleVideoAction(actionData);
        }
    }

    // 處理同步廣播
    handleSyncBroadcast(syncData) {
        console.log('收到同步廣播:', syncData);
        
        if (window.youtubePlayer) {
            window.youtubePlayer.syncWithData(syncData);
        }
    }

    // 請求同步
    requestSync() {
        if (!this.socket) return;
        
        console.log('請求同步');
        this.socket.emit('requestSync', {
            roomId: this.roomData.roomId
        });
    }

    // 發送聊天訊息
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (!message) return;

        // 檢查速率限制
        const now = Date.now();
        if (now - this.lastChatTime < this.chatCooldown) {
            this.showError('發送太快了，請稍等一下');
            return;
        }

        if (message.length > 200) {
            this.showError('訊息太長了（最多 200 字）');
            return;
        }

        this.lastChatTime = now;

        this.socket.emit('chatMessage', {
            roomId: this.roomData.roomId,
            message: message
        });

        input.value = '';
    }

    // 處理聊天訊息
    handleChatMessage(messageData) {
        console.log('收到聊天訊息:', messageData);
        this.addChatMessage(messageData);
    }

    // 添加聊天訊息
    addChatMessage(messageData) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        
        if (messageData.type === 'system') {
            messageDiv.className = 'chat-message system-message';
            messageDiv.innerHTML = `
                <div class="message-content">${this.escapeHtml(messageData.message)}</div>
            `;
        } else {
            messageDiv.className = 'chat-message user-message';
            const timestamp = new Date(messageData.timestamp).toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-username">${this.escapeHtml(messageData.username)}</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-content">${this.escapeHtml(messageData.message)}</div>
            `;
        }

        chatMessages.appendChild(messageDiv);
        
        // 自動滾動到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // 限制聊天歷史數量
        this.chatHistory.push(messageData);
        if (this.chatHistory.length > this.maxChatHistory) {
            this.chatHistory.shift();
            const firstMessage = chatMessages.firstChild;
            if (firstMessage) {
                firstMessage.remove();
            }
        }
    }

    // 添加系統訊息
    addSystemMessage(message) {
        this.addChatMessage({
            type: 'system',
            message: message,
            timestamp: Date.now()
        });
    }

    // 發送彈幕訊息
  sendDanmuMessage() {
    const input = document.getElementById('danmuInput');
    const message = input.value.trim();

    if (!message) return;

    // 🔧 移除速率限制檢查
    // const now = Date.now();
    // if (now - this.lastDanmuTime < this.danmuCooldown) {
    //     this.showError('彈幕發送太快了，請稍等一下');
    //     return;
    // }

    if (message.length > 50) {
        this.showError('彈幕太長了（最多 50 字）');
        return;
    }

    // this.lastDanmuTime = now; // 🔧 註解掉時間記錄

    const colorInput = document.getElementById('danmuColor');
    const color = colorInput ? colorInput.value : '#ffffff';
    console.log('🎨 發送彈幕，顏色:', color);
    
    this.socket.emit('danmuMessage', {
        roomId: this.roomData.roomId,
        message: message,
        color: color
    });

    input.value = '';
}

    // 發送快速彈幕
    sendQuickDanmu(emoji) {
    // 🔧 移除速率限制檢查
    // const now = Date.now();
    // if (now - this.lastDanmuTime < this.danmuCooldown) {
    //     this.showError('彈幕發送太快了，請稍等一下');
    //     return;
    // }

    // this.lastDanmuTime = now; // 🔧 註解掉時間記錄

    this.socket.emit('danmuMessage', {
        roomId: this.roomData.roomId,
        message: emoji,
        color: '#ffffff',
        isQuick: true
    });

    // 添加視覺反饋
    const btn = document.querySelector(`[data-emoji="${emoji}"]`);
    if (btn) {
        btn.style.transform = 'scale(1.2)';
        setTimeout(() => {
            btn.style.transform = '';
        }, 200);
    }
}

    // 處理彈幕訊息
    handleDanmuMessage(danmuData) {
        console.log('收到彈幕:', danmuData);
        
        if (window.danmuSystem) {
            window.danmuSystem.addDanmu(danmuData);
        }
    }

    // 切換彈幕顯示
    toggleDanmu() {
        const btn = document.getElementById('toggleDanmu');
        if (!btn) return;
        
        if (window.danmuSystem) {
            if (window.danmuSystem.isVisible) {
                window.danmuSystem.hide();
                btn.classList.remove('active');
                btn.innerHTML = '<i class="fas fa-eye-slash"></i> 顯示彈幕';
            } else {
                window.danmuSystem.show();
                btn.classList.add('active');
                btn.innerHTML = '<i class="fas fa-eye"></i> 隱藏彈幕';
            }
        }
    }

    // 🔧 自定義功能 - 移除房主限制
    openCustomizeModal() {
        const modal = document.getElementById('customizeModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    // 🔧 背景上傳 - 移除房主限制
    handleBackgroundUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // 任何用戶都可以自定義背景
        if (!file.type.startsWith('image/')) {
            this.showError('請選擇圖片文件');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB 限制
            this.showError('圖片大小不能超過 5MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;
            this.updateBackground(imageData);
            
            // 廣播到其他用戶
            this.socket.emit('updateRoomCustomization', {
                roomId: this.roomData.roomId,
                type: 'background',
                data: imageData,
                changedBy: this.roomData.username
            });
            
            this.showSuccess('背景已更新！');
        };
        reader.readAsDataURL(file);
    }

    // 🔧 移除背景 - 移除房主限制
    removeBackground() {
        this.updateBackground(null);
        
        this.socket.emit('updateRoomCustomization', {
            roomId: this.roomData.roomId,
            type: 'background',
            data: null,
            changedBy: this.roomData.username
        });
        
        this.showSuccess('背景已移除');
    }

    updateBackground(imageData) {
        if (imageData) {
            document.body.style.backgroundImage = `url(${imageData})`;
            document.body.classList.add('custom-background');
        } else {
            document.body.style.backgroundImage = '';
            document.body.classList.remove('custom-background');
        }
    }

    // 🔧 更新主題顏色 - 移除房主限制
    updateThemeColor(color) {
    // 🔧 直接修改背景顏色
    document.body.style.background = `linear-gradient(135deg, ${color} 0%, ${this.adjustColor(color, -20)} 50%, ${this.adjustColor(color, 20)} 100%)`;
    document.documentElement.style.setProperty('--theme-color', color);
    
    this.socket.emit('updateRoomCustomization', {
        roomId: this.roomData.roomId,
        type: 'themeColor',
        data: color,
        changedBy: this.roomData.username
    });
    
    this.showSuccess('主題顏色已更新！');
}

// 🔧 添加顏色調整輔助函數
adjustColor(color, percent) {
    const num = parseInt(color.replace("#",""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

    // 🔧 更新彈幕速度 - 移除房主限制
    updateDanmuSpeed(speed) {
        const speedValue = parseInt(speed);
        const speedValueElement = document.getElementById('speedValue');
        if (speedValueElement) {
            speedValueElement.textContent = speedValue;
        }
        
        if (window.danmuSystem) {
            window.danmuSystem.setSpeed(speedValue);
        }

        // 任何用戶都可以調整彈幕速度
        this.socket.emit('updateRoomCustomization', {
            roomId: this.roomData.roomId,
            type: 'danmuSpeed',
            data: speedValue,
            changedBy: this.roomData.username
        });
    }

    // 🔧 處理房間自定義 - 顯示操作者
    handleRoomCustomization(customization) {
        console.log('應用房間自定義:', customization);
        
        if (customization.background !== undefined) {
            this.updateBackground(customization.background);
            if (customization.changedBy) {
                const message = customization.background ? 
                    `${customization.changedBy} 更新了背景` : 
                    `${customization.changedBy} 移除了背景`;
                this.addSystemMessage(message);
            }
        }
        
        if (customization.themeColor) {
            document.documentElement.style.setProperty('--theme-color', customization.themeColor);
            const themeColorInput = document.getElementById('themeColor');
            if (themeColorInput) {
                themeColorInput.value = customization.themeColor;
            }
            
            if (customization.changedBy) {
                this.addSystemMessage(`${customization.changedBy} 更新了主題顏色`);
            }
        }
        
        if (customization.danmuSpeed) {
            if (window.danmuSystem) {
                window.danmuSystem.setSpeed(customization.danmuSpeed);
            }
            const danmuSpeedInput = document.getElementById('danmuSpeed');
            const speedValueElement = document.getElementById('speedValue');
            if (danmuSpeedInput) danmuSpeedInput.value = customization.danmuSpeed;
            if (speedValueElement) speedValueElement.textContent = customization.danmuSpeed;
            
            if (customization.changedBy) {
                this.addSystemMessage(`${customization.changedBy} 調整了彈幕速度為 ${customization.danmuSpeed}`);
            }
        }
    }

    // 邀請功能
    openInviteModal() {
        const currentUrl = window.location.href;
        const shareLinkInput = document.getElementById('shareLink');
        const inviteModal = document.getElementById('inviteModal');
        
        if (shareLinkInput) shareLinkInput.value = currentUrl;
        if (inviteModal) inviteModal.classList.remove('hidden');
    }

    copyShareLink() {
        const linkInput = document.getElementById('shareLink');
        if (!linkInput) return;
        
        linkInput.select();
        linkInput.setSelectionRange(0, 99999);

        try {
            document.execCommand('copy');
            
            const copyBtn = document.getElementById('copyShareBtn');
            if (copyBtn) {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> 已複製';
                copyBtn.style.background = '#10b981';
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.background = '';
                }, 2000);
            }
            
            this.showSuccess('連結已複製到剪貼板');
        } catch (err) {
            this.showError('複製失敗，請手動複製連結');
        }
    }

    // 離開房間
leaveRoom() {
    if (confirm('確定要離開房間嗎？')) {
        this.hasJoinedRoom = false; // 🔧 添加這行
        this.cleanup();
        sessionStorage.removeItem('roomData');
        window.location.href = 'index.html';
    }
}

    // 關閉彈窗
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    // 更新連接狀態
    updateConnectionStatus(isConnected) {
        console.log('連接狀態:', isConnected ? '已連接' : '已斷開');
    }

    // 顯示訊息
    showMessage(message, type = 'info') {
        this.createToast(message, type);
    }

    showError(message) {
        console.error('Error:', message);
        this.createToast(message, 'error');
    }

    showSuccess(message) {
        console.log('Success:', message);
        this.createToast(message, 'success');
    }

    createToast(message, type) {
        // 移除現有相同類型的提示
        const existingToast = document.querySelector(`.toast.${type}`);
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'error' ? 'fas fa-exclamation-circle' : 
                    type === 'success' ? 'fas fa-check-circle' : 
                    'fas fa-info-circle';
        
        toast.innerHTML = `
            <i class="${icon}"></i>
            <span>${this.escapeHtml(message)}</span>
        `;

        // 樣式
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 10px;
            color: white;
            font-weight: 500;
            z-index: 3000;
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 400px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            cursor: pointer;
            font-family: 'Segoe UI', sans-serif;
            background: ${type === 'error' ? '#ef4444' : 
                        type === 'success' ? '#10b981' : '#3b82f6'};
        `;

        document.body.appendChild(toast);

        // 顯示動畫
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 100);

        // 自動隱藏
        const duration = type === 'error' ? 5000 : 3000;
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, duration);

        // 點擊關閉
        toast.addEventListener('click', () => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        });
    }

    // HTML 轉義
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 清理資源
    cleanup() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }
    }

    // 獲取房間統計
    getStats() {
        return {
            roomId: this.roomData?.roomId,
            username: this.roomData?.username,
            isHost: this.isHost,
            isConnected: this.isConnected,
            userCount: this.users.size,
            currentVideo: this.currentVideo,
            chatHistoryLength: this.chatHistory.length
        };
    }

} // RoomManager 類結束

// 🆕 輔助功能：一鍵清除所有自定義
function resetRoomCustomization() {
    if (window.roomManager) {
        // 重置背景
        window.roomManager.removeBackground();
        
        // 重置主題顏色
        window.roomManager.updateThemeColor('#6366f1');
        
        // 重置彈幕速度
        window.roomManager.updateDanmuSpeed(5);
        
        window.roomManager.showSuccess('房間已重置為預設樣式');
    }
}

// 分享功能
function shareToWhatsApp() {
    const linkInput = document.getElementById('shareLink');
    if (!linkInput) return;
    
    const link = linkInput.value;
    const text = `來加入我的 K-Pop 觀看派對！任何人都可以載入影片和自定義房間！${link}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function shareToLine() {
    const linkInput = document.getElementById('shareLink');
    if (!linkInput) return;
    
    const link = linkInput.value;
    const text = `來加入我的 K-Pop 觀看派對！任何人都可以載入影片和自定義房間！`;
    const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function shareToTelegram() {
    const linkInput = document.getElementById('shareLink');
    if (!linkInput) return;
    
    const link = linkInput.value;
    const text = `來加入我的 K-Pop 觀看派對！任何人都可以載入影片和自定義房間！`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// 🆕 快捷鍵功能
document.addEventListener('keydown', (e) => {
    // 只在非輸入狀態處理快捷鍵
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    switch (e.key.toLowerCase()) {
        case 'r': // R 鍵重置房間自定義
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                resetRoomCustomization();
            }
            break;
            
        case 'c': // C 鍵打開自定義面板
            e.preventDefault();
            if (window.roomManager) {
                window.roomManager.openCustomizeModal();
            }
            break;
            
        case 'i': // I 鍵打開邀請面板
            e.preventDefault();
            if (window.roomManager) {
                window.roomManager.openInviteModal();
            }
            break;
    }
});

// 頁面載入完成後初始化
let roomManager;
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM 載入完成，初始化房間管理器...');
    
    try {
        roomManager = new RoomManager();
        console.log('✅ 房間管理器初始化成功 - 無房主限制版本');
    } catch (error) {
        console.error('❌ 房間管理器初始化失敗:', error);
        
        // 顯示錯誤訊息
        document.body.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; text-align: center; padding: 20px; font-family: 'Segoe UI', sans-serif;">
                <div style="background: white; padding: 40px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); max-width: 500px;">
                    <h2 style="color: #ef4444; margin-bottom: 20px;">🔧 房間載入失敗</h2>
                    <p style="color: #666; margin-bottom: 20px; line-height: 1.6;">${error.message}</p>
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="location.reload()" style="padding: 12px 24px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">重新載入</button>
                        <button onclick="location.href='index.html'" style="padding: 12px 24px; background: #6b7280; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">返回首頁</button>
                        <button onclick="location.href='debug-room-creation.html'" style="padding: 12px 24px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">調試工具</button>
                    </div>
                </div>
            </div>
        `;
    }
});

// 頁面可見性變化時請求同步
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && roomManager && roomManager.isConnected) {
        roomManager.requestSync();
    }
});

// 🆕 性能監控
let performanceData = {
    startTime: Date.now(),
    messagesReceived: 0,
    videosLoaded: 0,
    customizationsApplied: 0
};

// 系統檢查和性能報告
setTimeout(() => {
    console.log('🔍 系統檢查:');
    console.log('- Socket.io:', typeof io !== 'undefined' ? '✅' : '❌');
    console.log('- 彈幕系統:', window.danmuSystem ? '✅' : '❌');
    console.log('- YouTube播放器:', window.youtubePlayer ? '✅' : '❌');
    console.log('- 房間管理器:', window.roomManager ? '✅' : '❌');
    
    if (window.roomManager) {
        const stats = window.roomManager.getStats();
        console.log('📊 房間統計:', stats);
        console.log('⚡ 性能數據:', performanceData);
        console.log('🎉 功能狀態: 所有用戶都可以使用完整功能！');
    }
    
    // 添加歡迎提示
    if (window.roomManager) {
        setTimeout(() => {
            window.roomManager.showSuccess('💡 提示：按 C 打開自定義面板，按 I 邀請朋友，按 Ctrl+R 重置樣式');
        }, 5000);
    }
}, 3000);
