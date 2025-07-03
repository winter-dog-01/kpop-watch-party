// 首頁主要功能
class HomePage {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.tempUsername = null; // 🔧 添加臨時用戶名儲存
        this.init();
    }

    init() {
        console.log('🎵 K-Pop Watch Party 初始化中...');
        
        this.initializeSocket();
        this.bindEvents();
        this.loadPublicRooms();
        this.checkURLParams();
        this.updateStats();
    }

initializeSocket() {
    try {
        console.log('🔗 正在建立 Socket 連接...');
        
        // 🔧 改善 Socket.io 連接配置
        this.socket = io({
            transports: ['websocket', 'polling'],
            timeout: 20000,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            autoConnect: true
        });
        
        this.socket.on('connect', () => {
            console.log('✅ 已連接到服務器, Socket ID:', this.socket.id);
            this.isConnected = true;
            this.showConnectionStatus('已連接', 'success');
            
            // 🔧 連接成功後立即載入公開房間列表
            setTimeout(() => {
                console.log('📋 載入公開房間列表...');
                this.loadPublicRooms();
            }, 1000);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ 與服務器斷開連接, 原因:', reason);
            this.isConnected = false;
            this.showConnectionStatus('連接中斷', 'error');
            this.updatePublicRoomsListOffline();
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ 連接錯誤:', error);
            this.isConnected = false;
            this.showMessage('無法連接到服務器，請檢查網路連接', 'error');
            this.updatePublicRoomsListOffline();
        });

        // 🔧 重連事件
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 重新連接成功 (嘗試 ${attemptNumber} 次)`);
            this.isConnected = true;
            this.showMessage('重新連接成功！', 'success');
            this.loadPublicRooms();
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`🔄 嘗試重新連接... (第 ${attemptNumber} 次)`);
        });

        this.socket.on('reconnect_error', (error) => {
            console.error('🔄 重連失敗:', error);
        });

        this.socket.on('reconnect_failed', () => {
            console.error('🔄 重連完全失敗');
            this.showMessage('無法重新連接到服務器', 'error');
        });

        // 監聽房間創建結果
        this.socket.on('roomCreated', (data) => {
            this.handleRoomCreated(data);
        });

        // 監聽公開房間更新
        this.socket.on('publicRooms', (rooms) => {
            console.log('🏠 收到公開房間列表:', rooms);
            this.updatePublicRoomsList(rooms);
        });

        this.socket.on('publicRoomsUpdate', (rooms) => {
            console.log('🔄 公開房間列表更新:', rooms);
            this.updatePublicRoomsList(rooms);
        });

        // 監聽加入房間結果
        this.socket.on('joinedRoom', (data) => {
            console.log('🔧 收到 joinedRoom 事件:', data);
            this.handleJoinResult(data);
        });

    } catch (error) {
        console.error('Socket 初始化失敗:', error);
        this.showMessage('無法初始化連接，請重新整理頁面', 'error');
        this.updatePublicRoomsListOffline();
    }
}

// 🔧 添加離線狀態顯示方法
updatePublicRoomsListOffline() {
    const roomsList = document.getElementById('publicRoomsList');
    if (roomsList) {
        roomsList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5; color: #ef4444;"></i>
                <p style="color: #ef4444;">未連接到服務器</p>
                <p style="font-size: 0.9rem; opacity: 0.7;">正在嘗試重新連接...</p>
                <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    重新載入頁面
                </button>
            </div>
        `;
    }
}
    // 綁定事件監聽器
    bindEvents() {
        // 檢查元素是否存在再綁定事件
        const createRoomForm = document.getElementById('createRoomForm');
        if (createRoomForm) {
            createRoomForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreateRoom();
            });
        }

        const joinPrivateForm = document.getElementById('joinPrivateForm');
        if (joinPrivateForm) {
            joinPrivateForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleJoinRoom();
            });
        }

        // 房間類型切換
        const roomTypeRadios = document.querySelectorAll('input[name="roomType"]');
        console.log('🔧 找到房間類型選項數量:', roomTypeRadios.length);

        roomTypeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                console.log('🔧 房間類型變更:', e.target.value);
                this.togglePasswordField(e.target.value);
            });
        });

        // 重新整理房間列表
        const refreshBtn = document.getElementById('refreshRooms');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadPublicRooms();
            });
        }

        // 彈窗相關
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
                this.copyInviteLink();
            });
        }

        const enterRoomBtn = document.getElementById('enterRoomBtn');
        if (enterRoomBtn) {
            enterRoomBtn.addEventListener('click', () => {
                this.enterRoom();
            });
        }

        const closeModalBtn = document.getElementById('closeModalBtn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // 點擊彈窗背景關閉
        const modal = document.getElementById('inviteLinkModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'inviteLinkModal') {
                    this.closeModal();
                }
            });
        }
    }

    // 處理創建房間
    handleCreateRoom() {
        const username = document.getElementById('username')?.value?.trim();
        const roomName = document.getElementById('roomName')?.value?.trim();
        const roomTypeEl = document.querySelector('input[name="roomType"]:checked');
        const roomType = roomTypeEl?.value || 'public';
        
        // 🔧 修復密碼欄位讀取
        let password = '';
        if (roomType === 'private') {
            const passwordEl = document.getElementById('roomPassword');
            password = passwordEl?.value?.trim() || '';
            console.log('🔧 私人房間密碼:', password ? '已設置' : '未設置');
        }

        console.log('🔧 表單數據:', { username, roomName, roomType, hasPassword: !!password });

        // 驗證輸入
        if (!this.validateInput(username, roomName)) {
            return;
        }

        if (!this.isConnected) {
            this.showMessage('未連接到服務器，請稍後再試', 'error');
            return;
        }

        // 顯示載入狀態
        const submitBtn = document.querySelector('#createRoomForm button[type="submit"]');
        if (submitBtn) {
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 創建中...';
            submitBtn.disabled = true;

            // 恢復按鈕狀態（3秒後）
            setTimeout(() => {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }, 3000);
        }

        // 發送創建房間請求
        this.socket.emit('createRoom', {
            username,
            roomName,
            roomType,
            password: password || null
        });
    }

    // 處理加入房間
    handleJoinRoom() {
        const username = document.getElementById('joinUsername')?.value?.trim();
        const roomInput = document.getElementById('roomId')?.value?.trim();
        const password = document.getElementById('joinPassword')?.value?.trim();

        // 驗證輸入
        if (!username || !roomInput) {
            this.showMessage('請填寫暱稱和房間代碼', 'error');
            return;
        }

        if (username.length < 2 || username.length > 20) {
            this.showMessage('暱稱長度必須在 2-20 字符之間', 'error');
            return;
        }

        if (!this.isConnected) {
            this.showMessage('未連接到服務器，請稍後再試', 'error');
            return;
        }

        // 提取房間ID（支援完整URL或純代碼）
        const roomId = this.extractRoomId(roomInput);

        // 顯示載入狀態
        const submitBtn = document.querySelector('#joinPrivateForm button[type="submit"]');
        if (submitBtn) {
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加入中...';
            submitBtn.disabled = true;

            setTimeout(() => {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }, 3000);
        }

        // 發送加入房間請求
        this.socket.emit('joinRoom', {
            username,
            roomId,
            password: password || null
        });
    }

    // 驗證輸入
    validateInput(username, roomName) {
        if (!username || !roomName) {
            this.showMessage('請填寫所有必填欄位', 'error');
            return false;
        }

        if (username.length < 2 || username.length > 20) {
            this.showMessage('暱稱長度必須在 2-20 字符之間', 'error');
            return false;
        }

        if (roomName.length < 3 || roomName.length > 50) {
            this.showMessage('房間名稱長度必須在 3-50 字符之間', 'error');
            return false;
        }

        // 檢查特殊字符
        const invalidChars = /[<>\"'&]/;
        if (invalidChars.test(username) || invalidChars.test(roomName)) {
            this.showMessage('暱稱和房間名稱不能包含特殊字符', 'error');
            return false;
        }

        return true;
    }

    // 提取房間ID
    extractRoomId(input) {
        // 如果是完整URL，提取房間ID
        const urlPattern = /room\.html\?id=([^&]+)/;
        const match = input.match(urlPattern);
        return match ? match[1] : input;
    }

    // 處理房間創建結果
    handleRoomCreated(data) {
        if (data.success) {
            console.log('房間創建成功:', data);

            // 儲存房間資訊到 sessionStorage（包含密碼）
            const roomData = {
                roomId: data.roomId,
                username: data.username,
                isHost: true,
                roomName: data.roomName,
                roomType: data.roomType
            };

            // 🔧 如果是私人房間，也要儲存密碼
            if (data.roomType === 'private') {
                const passwordEl = document.getElementById('roomPassword');
                roomData.password = passwordEl?.value?.trim() || '';
                console.log('🔧 儲存私人房間密碼到 sessionStorage');
            }

            sessionStorage.setItem('roomData', JSON.stringify(roomData));

            if (data.roomType === 'private') {
                // 私人房間顯示邀請連結
                this.showSuccessModal(data.inviteLink, data.roomId);
            } else {
                // 公開房間直接進入
                this.redirectToRoom(data.roomId);
            }

            this.showMessage('房間創建成功！', 'success');
            this.loadPublicRooms(); // 重新載入公開房間列表
        } else {
            this.showMessage(data.message || '創建房間失敗', 'error');
        }
    }

  // 處理加入房間結果
// 處理加入房間結果
handleJoinResult(data) {
    console.log('🔧 處理加入房間結果:', data);

    if (data.success) {
        console.log('✅ 成功加入房間:', data);
        
        // 🔧 優先使用臨時儲存的用戶名
        const currentUsername = this.tempUsername || 
                               this.getCurrentUsername() || 
                               data.username || 
                               '用戶';
        
        console.log('🔧 使用的用戶名:', currentUsername);
        
        // 儲存房間資訊
        sessionStorage.setItem('roomData', JSON.stringify({
            roomId: data.room.id,
            username: currentUsername,
            isHost: false,
            roomName: data.room.name
        }));

        // 🔧 清除臨時用戶名
        this.tempUsername = null;

        this.redirectToRoom(data.room.id);
        this.showMessage('成功加入房間！', 'success');
    } else {
        console.error('❌ 加入房間失敗:', data.message);
        this.showMessage(data.message || '加入房間失敗', 'error');
        
        // 🔧 失敗時也清除臨時用戶名
        this.tempUsername = null;
    }
}

// 🔧 修改 getCurrentUsername 方法
getCurrentUsername() {
    // 優先從加入私人房間的輸入框獲取
    const joinUsername = document.getElementById('joinUsername')?.value?.trim();
    if (joinUsername) return joinUsername;
    
    // 如果沒有，返回空（公開房間會從 prompt 獲取）
    return '';
}

// 🔧 添加獲取當前用戶名的方法
getCurrentUsername() {
    return document.getElementById('joinUsername')?.value?.trim() || '';
}

// 載入公開房間列表
loadPublicRooms() {
    console.log('📋 載入公開房間列表, 連接狀態:', this.isConnected);
    
    if (!this.isConnected) {
        console.warn('⚠️ 未連接到服務器，跳過載入房間列表');
        this.updatePublicRoomsListOffline();
        return;
    }

    if (!this.socket) {
        console.error('❌ Socket 對象不存在');
        this.updatePublicRoomsListOffline();
        return;
    }

    const roomsList = document.getElementById('publicRoomsList');
    if (roomsList) {
        roomsList.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>正在載入房間...</p>
            </div>
        `;
    }

    try {
        console.log('📤 發送 getPublicRooms 請求');
        this.socket.emit('getPublicRooms');
        
        // 🔧 設置超時處理
        setTimeout(() => {
            if (!this.isConnected) {
                console.warn('⏰ 載入房間列表超時');
                this.updatePublicRoomsListOffline();
            }
        }, 5000);
        
    } catch (error) {
        console.error('❌ 發送 getPublicRooms 請求失敗:', error);
        this.updatePublicRoomsListOffline();
    }
}

    // 更新公開房間列表
    updatePublicRoomsList(rooms) {
    const roomsList = document.getElementById('publicRoomsList');
    if (!roomsList) return;
    
    if (!rooms || rooms.length === 0) {
        roomsList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-home" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                <p>目前沒有公開房間</p>
                <p style="font-size: 0.9rem; opacity: 0.7;">成為第一個創建房間的人！</p>
            </div>
        `;
        return;
    }

    // 🔧 修改為使用 data 屬性而不是 onclick
    roomsList.innerHTML = rooms.map(room => `
        <div class="room-item" 
             data-room-id="${room.id}" 
             data-room-name="${this.escapeHtml(room.name)}"
             style="cursor: pointer;">
            <div class="room-header">
                <div class="room-name">${this.escapeHtml(room.name)}</div>
                <div class="room-users">
                    <i class="fas fa-users"></i>
                    ${room.userCount}
                </div>
            </div>
            <div class="room-status">
                <div class="status-dot"></div>
                <span>正在播放: ${room.currentVideo ? this.escapeHtml(room.currentVideo) : '尚未開始'}</span>
            </div>
        </div>
    `).join('');

    // 🔧 添加點擊事件監聽器
    const roomItems = roomsList.querySelectorAll('.room-item[data-room-id]');
    roomItems.forEach(item => {
        item.addEventListener('click', () => {
            const roomId = item.dataset.roomId;
            const roomName = item.dataset.roomName;
            console.log('點擊公開房間:', roomId, roomName);
            this.joinPublicRoom(roomId, roomName);
        });
    });
}
    // 加入公開房間
    // 加入公開房間
joinPublicRoom(roomId, roomName) {
    console.log('🏠 嘗試加入公開房間:', roomId, roomName);
    
    const username = prompt(`加入房間「${roomName}」\n\n請輸入你的暱稱:`);
    
    if (!username) {
        console.log('用戶取消加入房間');
        return;
    }

    if (username.length < 2 || username.length > 20) {
        alert('暱稱長度必須在 2-20 字符之間');
        return;
    }

    // 🔧 檢查連接狀態
    if (!this.isConnected) {
        this.showMessage('未連接到服務器，請稍後再試', 'error');
        return;
    }
    // 🔧 儲存用戶名到臨時變數
    this.tempUsername = username.trim();
    
    console.log('🚀 發送加入房間請求:', {
        username: username.trim(),
        roomId: roomId,
        password: null
    });

    // 🔧 直接通過 socket 加入房間
    this.socket.emit('joinRoom', {
        username: username.trim(),
        roomId: roomId,
        password: null
    });
}

    // 🔧 修復切換密碼欄位顯示
    togglePasswordField(roomType) {
        const privateOptions = document.getElementById('privateOptions');
        console.log('🔧 切換密碼欄位, roomType:', roomType, 'privateOptions元素:', privateOptions);
        
        if (privateOptions) {
            if (roomType === 'private') {
                privateOptions.classList.remove('hidden');
                console.log('✅ 顯示私人房間選項');
            } else {
                privateOptions.classList.add('hidden');
                console.log('✅ 隱藏私人房間選項');
            }
        } else {
            console.error('❌ 找不到 privateOptions 元素');
        }
    }

    // 顯示成功彈窗
    showSuccessModal(inviteLink, roomId) {
        const modal = document.getElementById('inviteLinkModal');
        const linkInput = document.getElementById('inviteLink');
        const enterBtn = document.getElementById('enterRoomBtn');
        
        if (modal && linkInput && enterBtn) {
            linkInput.value = inviteLink;
            enterBtn.dataset.roomId = roomId;
            modal.classList.remove('hidden');
        }
    }

    // 關閉彈窗
    closeModal() {
        const modal = document.getElementById('inviteLinkModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    // 複製邀請連結
    copyInviteLink() {
        const linkInput = document.getElementById('inviteLink');
        if (!linkInput) return;

        linkInput.select();
        linkInput.setSelectionRange(0, 99999);

        try {
            document.execCommand('copy');
            
            const copyBtn = document.getElementById('copyLinkBtn');
            if (copyBtn) {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                copyBtn.style.background = '#10b981';
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.background = '';
                }, 2000);
            }
            
            this.showMessage('邀請連結已複製到剪貼板', 'success');
        } catch (err) {
            console.error('複製失敗:', err);
            this.showMessage('複製失敗，請手動複製連結', 'error');
        }
    }

    // 進入房間
    enterRoom() {
        const enterBtn = document.getElementById('enterRoomBtn');
        const roomId = enterBtn?.dataset?.roomId;
        
        if (roomId) {
            this.closeModal();
            this.redirectToRoom(roomId);
        }
    }

    // 重定向到房間頁面
    redirectToRoom(roomId) {
        const url = `room.html?id=${encodeURIComponent(roomId)}`;
        console.log('重定向到房間:', url);
        window.location.href = url;
    }

    // 檢查URL參數（處理邀請連結）
    checkURLParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        
        if (roomId) {
            const roomCodeInput = document.getElementById('roomId');
            if (roomCodeInput) {
                roomCodeInput.value = roomId;
            }
            
            // 滾動到加入房間區域
            const joinSection = document.querySelector('.join-private-section');
            if (joinSection) {
                joinSection.scrollIntoView({ behavior: 'smooth' });
            }
            
            // 焦點到暱稱輸入框
            setTimeout(() => {
                const joinUsernameInput = document.getElementById('joinUsername');
                if (joinUsernameInput) {
                    joinUsernameInput.focus();
                }
            }, 500);
        }
    }

    // 更新統計數據
    updateStats() {
        // 模擬統計數據更新
        const updateStatsData = () => {
            if (this.isConnected && this.socket) {
                // 可以從服務器獲取實際統計數據
                // this.socket.emit('getStats');
            }
            
            // 暫時使用模擬數據
            const totalRoomsEl = document.getElementById('totalRooms');
            const totalUsersEl = document.getElementById('totalUsers');
            
            if (totalRoomsEl && totalUsersEl) {
                // 這裡可以設置真實的統計數據
                totalRoomsEl.textContent = Math.floor(Math.random() * 50) + 10;
                totalUsersEl.textContent = Math.floor(Math.random() * 200) + 50;
            }
        };

        updateStatsData();
        setInterval(updateStatsData, 30000); // 每30秒更新一次
    }

    // 顯示連接狀態
    showConnectionStatus(message, type) {
        console.log(`連接狀態: ${message} (${type})`);
    }

    // 顯示訊息
    showMessage(message, type = 'info') {
        // 移除現有訊息
        const existingMessage = document.querySelector('.toast-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // 創建新訊息
        const messageDiv = document.createElement('div');
        messageDiv.className = `toast-message ${type}`;
        
        const icon = type === 'error' ? 'fas fa-exclamation-circle' : 
                    type === 'success' ? 'fas fa-check-circle' : 
                    'fas fa-info-circle';
        
        messageDiv.innerHTML = `
            <i class="${icon}"></i>
            ${this.escapeHtml(message)}
        `;

        // 添加樣式
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            border-radius: 12px;
            color: white;
            font-weight: 600;
            z-index: 4000;
            display: flex;
            align-items: center;
            gap: 12px;
            max-width: 400px;
            box-shadow: 0 12px 24px rgba(0,0,0,0.15);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            cursor: pointer;
            background: ${type === 'error' ? '#ef4444' : 
                        type === 'success' ? '#10b981' : '#3b82f6'};
        `;

        document.body.appendChild(messageDiv);

        // 顯示動畫
        setTimeout(() => {
            messageDiv.style.transform = 'translateX(0)';
        }, 100);

        // 自動移除
        const duration = type === 'error' ? 5000 : 3000;
        setTimeout(() => {
            messageDiv.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 300);
        }, duration);

        // 點擊移除
        messageDiv.addEventListener('click', () => {
            messageDiv.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 300);
        });
    }

    // HTML轉義
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 格式化時間
    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// 頁面載入完成後初始化
let homepage;
document.addEventListener('DOMContentLoaded', () => {
    homepage = new HomePage();
});

// 導出供全域使用
window.homepage = homepage;
