const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');


// 配置
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 創建應用
const app = express();
const server = http.createServer(app);
function getBaseUrl() {
    if (NODE_ENV === 'production') {
        // Render 會自動設置這個環境變數
        return `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'https://kpop-watch-party-1.onrender.com'}`;
    } else {
        return `http://localhost:${PORT}`;
    }
}
// Socket.io 配置
const io = socketIo(server, {
    cors: {
        origin: NODE_ENV === 'production' ? 
            ["https://your-domain.onrender.com"] : 
            ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// 中間件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../')));

// 簡單的數據存儲
const rooms = new Map();
const users = new Map();

// 房間類
class Room {
    constructor(id, name, hostId, type = 'public', password = null) {
        this.id = id;
        this.name = name;
        this.hostId = hostId;
        this.type = type;
        this.password = password;
        this.users = new Map();
        this.currentVideo = null;
        this.customization = {
            background: null,
            themeColor: '#6366f1',
            danmuSpeed: 5
        };
        this.createdAt = new Date();
        this.lastActivity = new Date();
    }

    addUser(user) {
        this.users.set(user.id, user);
        this.lastActivity = new Date();
        return true;
    }

    removeUser(userId) {
        const removed = this.users.delete(userId);
        this.lastActivity = new Date();
        return removed;
    }

    getUsersArray() {
        return Array.from(this.users.values());
    }

    isEmpty() {
        return this.users.size === 0;
    }

    isHost(userId) {
        return this.hostId === userId;
    }

    updateCurrentVideo(videoData) {
        this.currentVideo = {
            videoId: videoData.videoId,
            title: videoData.title || '',
            url: videoData.url || '',
            startTime: videoData.startTime || 0,
            timestamp: Date.now(),
            changedBy: videoData.changedBy || '某位用戶' // 🆕 添加操作者信息
        };
        this.lastActivity = new Date();
    }

    updateCustomization(type, data, changedBy) {
        if (this.customization.hasOwnProperty(type)) {
            this.customization[type] = data;
            this.customization.lastChangedBy = changedBy || '某位用戶'; // 🆕 記錄操作者
            this.customization.lastChangedAt = Date.now();
            this.lastActivity = new Date();
        }
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            userCount: this.users.size,
            currentVideo: this.currentVideo ? this.currentVideo.title : null,
            createdAt: this.createdAt,
            lastActivity: this.lastActivity
        };
    }
}

// 用戶類
class User {
    constructor(socketId, username) {
        this.id = socketId;
        this.username = username;
        this.roomId = null;
        this.isHost = false;
        this.joinedAt = new Date();
        this.lastActivity = new Date();
    }

    updateActivity() {
        this.lastActivity = new Date();
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            isHost: this.isHost,
            joinedAt: this.joinedAt
        };
    }
}

// 工具函數
function generateRoomId() {
    return uuidv4().substring(0, 8).toUpperCase();
}

function validateUsername(username) {
    return username && 
           typeof username === 'string' && 
           username.trim().length >= 2 && 
           username.trim().length <= 20;
}

function validateRoomName(roomName) {
    return roomName && 
           typeof roomName === 'string' && 
           roomName.trim().length >= 3 && 
           roomName.trim().length <= 50;
}

function validateYouTubeVideoId(videoId) {
    return videoId && 
           typeof videoId === 'string' && 
           /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

function getPublicRooms() {
    return Array.from(rooms.values())
        .filter(room => room.type === 'public' && !room.isEmpty())
        .map(room => room.toJSON())
        .sort((a, b) => b.userCount - a.userCount);
}

function cleanupEmptyRooms() {
    for (const [roomId, room] of rooms.entries()) {
        if (room.isEmpty()) {
            console.log(`清理空房間: ${roomId}`);
            rooms.delete(roomId);
        }
    }
}

// 🆕 記錄房間操作
function logRoomAction(roomId, action, username, details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Room ${roomId} - ${action} by ${username} ${details}`);
}

// 定期清理空房間
setInterval(cleanupEmptyRooms, 5 * 60 * 1000); // 每5分鐘清理一次

// API 路由
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        users: users.size,
        version: 'no-host-restrictions' // 🆕 版本標識
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        totalRooms: rooms.size,
        totalUsers: users.size,
        publicRooms: getPublicRooms().length,
        uptime: process.uptime(),
        version: 'no-host-restrictions'
    });
});

// Socket.io 連接處理
// Socket.io 連接處理
io.on('connection', (socket) => {
    console.log(`👤 用戶連接: ${socket.id} (總連接數: ${io.engine.clientsCount})`);

    // 🔧 連接成功後立即發送公開房間列表
    setTimeout(() => {
        try {
            const publicRooms = getPublicRooms();
            console.log(`📤 向新用戶 ${socket.id} 發送公開房間列表: ${publicRooms.length} 個房間`);
            socket.emit('publicRooms', publicRooms);
        } catch (error) {
            console.error('發送初始房間列表失敗:', error);
        }
    }, 500);

    // 🔧 獲取公開房間列表
    socket.on('getPublicRooms', () => {
        try {
            const publicRooms = getPublicRooms();
            console.log(`📋 用戶 ${socket.id} 請求公開房間列表: ${publicRooms.length} 個房間`);
            socket.emit('publicRooms', publicRooms);
        } catch (error) {
            console.error('處理 getPublicRooms 請求失敗:', error);
            socket.emit('publicRooms', []);
        }
    });

    // 創建房間
    socket.on('createRoom', (data) => {
        try {
            console.log('收到創建房間請求:', data);

            const { username, roomName, roomType, password } = data;

            // 驗證數據
            if (!validateUsername(username)) {
                return socket.emit('roomCreated', { 
                    success: false, 
                    message: '無效的用戶名' 
                });
            }

            if (!validateRoomName(roomName)) {
                return socket.emit('roomCreated', { 
                    success: false, 
                    message: '無效的房間名稱' 
                });
            }

            if (roomType && !['public', 'private'].includes(roomType)) {
                return socket.emit('roomCreated', { 
                    success: false, 
                    message: '無效的房間類型' 
                });
            }

            // 創建房間
            const roomId = generateRoomId();
            const room = new Room(roomId, roomName, socket.id, roomType || 'public', password);
            rooms.set(roomId, room);

            // 創建用戶
            const user = new User(socket.id, username);
            user.roomId = roomId;
            user.isHost = true;
            users.set(socket.id, user);

            // 加入房間
            room.addUser(user);
            socket.join(roomId);

            logRoomAction(roomId, 'CREATED', username, `(${roomType})`);

            // 🔧 修復邀請連結 - 使用生產環境 URL
            const baseUrl = NODE_ENV === 'production' ? 
                `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'your-app.onrender.com'}` : 
                `http://localhost:${PORT}`;
            const inviteLink = `${baseUrl}/room.html?id=${roomId}`;

            // 響應創建成功
            socket.emit('roomCreated', {
                success: true,
                roomId: roomId,
                roomName: roomName,
                roomType: roomType,
                username: username,
                inviteLink: inviteLink
            });

            // 🔧 廣播公開房間列表更新（使用兩個事件名稱確保兼容）
            if (roomType === 'public') {
                const publicRooms = getPublicRooms();
                io.emit('publicRooms', publicRooms);
                io.emit('publicRoomsUpdate', publicRooms);
                console.log('📢 廣播公開房間列表更新:', publicRooms.length, '個房間');
            }

        } catch (error) {
            console.error('創建房間錯誤:', error);
            socket.emit('roomCreated', { 
                success: false, 
                message: '創建房間失敗' 
            });
        }
    });



    // 加入房間
    socket.on('joinRoom', (data) => {
        try {
            console.log('收到加入房間請求:', data);

            const { roomId, username, password } = data;

            // 驗證數據
            if (!validateUsername(username)) {
                return socket.emit('joinedRoom', { 
                    success: false, 
                    message: '無效的用戶名' 
                });
            }

            if (!roomId || typeof roomId !== 'string') {
                return socket.emit('joinedRoom', { 
                    success: false, 
                    message: '無效的房間 ID' 
                });
            }

            // 檢查房間是否存在
            const room = rooms.get(roomId);
            if (!room) {
                return socket.emit('joinedRoom', { 
                    success: false, 
                    message: '房間不存在' 
                });
            }

           // 🔧 檢查密碼（跳轉用戶和房主跳過驗證）
            const isFromRedirect = data.fromRedirect;
            const isRoomHost = room.isHost(socket.id);

            if (room.password && room.password !== password && !isFromRedirect && !isRoomHost) {
                return socket.emit('joinedRoom', { 
                    success: false, 
                    message: '房間密碼錯誤' 
                });
            }

            console.log(`用戶加入房間: ${username}, 跳轉用戶: ${isFromRedirect}, 房主: ${isRoomHost}`);

            // 如果用戶已在其他房間，先離開
            const existingUser = users.get(socket.id);
            if (existingUser && existingUser.roomId) {
                socket.leave(existingUser.roomId);
                const oldRoom = rooms.get(existingUser.roomId);
                if (oldRoom) {
                    oldRoom.removeUser(socket.id);
                    socket.to(existingUser.roomId).emit('userLeft', { 
                        userId: socket.id 
                    });
                }
            }

            // 創建或更新用戶
            const user = new User(socket.id, username);
            user.roomId = roomId;
            user.isHost = room.isHost(socket.id);
            users.set(socket.id, user);

            // 加入房間
            room.addUser(user);
            socket.join(roomId);

            logRoomAction(roomId, 'JOINED', username);

            // 通知用戶加入成功
            socket.emit('joinedRoom', {
                success: true,
                room: {
                    id: room.id,
                    name: room.name,
                    currentVideo: room.currentVideo,
                    customization: room.customization
                },
                isHost: user.isHost
            });

            // 通知房間內其他用戶
            socket.to(roomId).emit('userJoined', user.toJSON());

            // 發送用戶列表更新
            io.to(roomId).emit('usersUpdate', room.getUsersArray());

            // 更新公開房間列表
            // 🔧 更新公開房間列表
            if (room.type === 'public') {
                const publicRooms = getPublicRooms();
                io.emit('publicRooms', publicRooms);
                io.emit('publicRoomsUpdate', publicRooms);
                console.log('📢 用戶離開，更新公開房間列表:', publicRooms.length, '個房間');
            }

        } catch (error) {
            console.error('加入房間錯誤:', error);
            socket.emit('joinedRoom', { 
                success: false, 
                message: '加入房間失敗' 
            });
        }
    });

    // 獲取公開房間列表
    socket.on('getPublicRooms', () => {
        socket.emit('publicRooms', getPublicRooms());
    });

    // 聊天訊息
    socket.on('chatMessage', (data) => {
        try {
            const { roomId, message } = data;
            const user = users.get(socket.id);

            if (!user || user.roomId !== roomId) {
                return socket.emit('error', { message: '未加入房間' });
            }

            if (!message || typeof message !== 'string' || message.trim().length === 0) {
                return socket.emit('error', { message: '無效的訊息內容' });
            }

            const room = rooms.get(roomId);
            if (!room) {
                return socket.emit('error', { message: '房間不存在' });
            }

            user.updateActivity();

            const chatMessage = {
                username: user.username,
                message: message.trim(),
                timestamp: Date.now(),
                type: 'user'
            };

            // 廣播聊天訊息
            io.to(roomId).emit('chatMessage', chatMessage);

            console.log(`聊天訊息 ${roomId}: ${user.username}: ${message}`);

        } catch (error) {
            console.error('聊天訊息錯誤:', error);
            socket.emit('error', { message: '發送訊息失敗' });
        }
    });

    // 彈幕訊息
    socket.on('danmuMessage', (data) => {
        try {
            const { roomId, message, color, isQuick } = data;
            const user = users.get(socket.id);

            if (!user || user.roomId !== roomId) {
                return socket.emit('error', { message: '未加入房間' });
            }

            if (!message || typeof message !== 'string' || message.trim().length === 0) {
                return socket.emit('error', { message: '無效的彈幕內容' });
            }

            const room = rooms.get(roomId);
            if (!room) {
                return socket.emit('error', { message: '房間不存在' });
            }

            // 驗證顏色
            const validColor = color && /^#[0-9A-F]{6}$/i.test(color) ? color : '#ffffff';

            user.updateActivity();

            const danmuMessage = {
                username: user.username,
                message: message.trim(), // 🔧 修正：統一使用 message 而非 text
                color: validColor,
                isQuick: Boolean(isQuick),
                timestamp: Date.now()
            };

            // 廣播彈幕
            io.to(roomId).emit('danmuMessage', danmuMessage);

            console.log(`彈幕 ${roomId}: ${user.username}: ${message}`);

        } catch (error) {
            console.error('彈幕錯誤:', error);
            socket.emit('error', { message: '發送彈幕失敗' });
        }
    });

    // 🔧 更換視頻 - 移除房主限制
    socket.on('changeVideo', (data) => {
        try {
            const { roomId, videoId, url, changedBy } = data;
            const user = users.get(socket.id);
            const room = rooms.get(roomId);

            if (!user || !room || user.roomId !== roomId) {
                return socket.emit('error', { message: '你不在這個房間中' });
            }

            // 🔧 移除房主檢查 - 任何用戶都可以更換視頻
            // if (!room.isHost(socket.id)) {
            //     return socket.emit('error', { message: '只有房主可以更換視頻' });
            // }

            if (!validateYouTubeVideoId(videoId)) {
                return socket.emit('error', { message: '無效的 YouTube 視頻 ID' });
            }

            user.updateActivity();

            const videoData = {
                videoId: videoId,
                url: url,
                title: '', // 客戶端會獲取標題
                startTime: 0,
                changedBy: changedBy || user.username
            };

            room.updateCurrentVideo(videoData);

            // 廣播視頻變更
            io.to(roomId).emit('videoChanged', videoData);

            // 更新公開房間列表（顯示當前播放）
            if (room.type === 'public') {
                io.emit('publicRooms', getPublicRooms());
            }

            logRoomAction(roomId, 'VIDEO_CHANGED', user.username, `to ${videoId}`);

        } catch (error) {
            console.error('更換視頻錯誤:', error);
            socket.emit('error', { message: '更換視頻失敗' });
        }
    });

    // 🔧 視頻動作同步 - 移除房主限制
    socket.on('videoAction', (data) => {
        try {
            const { action, time, videoId } = data;
            const user = users.get(socket.id);

            if (!user || !user.roomId) {
                return;
            }

            const room = rooms.get(user.roomId);
            if (!room) {
                return;
            }

            // 🔧 移除房主檢查 - 任何用戶都可以控制播放
            // if (!room.isHost(socket.id)) {
            //     return; // 只有房主可以控制播放
            // }

            user.updateActivity();

            // 廣播視頻動作（除了發送者）
            socket.to(user.roomId).emit('videoAction', {
                action: action,
                time: time,
                videoId: videoId,
                timestamp: Date.now(),
                changedBy: user.username
            });

            logRoomAction(user.roomId, `VIDEO_${action.toUpperCase()}`, user.username, `at ${time}s`);

        } catch (error) {
            console.error('視頻動作錯誤:', error);
        }
    });

    // 🔧 同步廣播 - 移除房主限制
    socket.on('syncBroadcast', (data) => {
        try {
            const user = users.get(socket.id);

            if (!user || !user.roomId) {
                return;
            }

            const room = rooms.get(user.roomId);
            if (!room) {
                return;
            }

            // 🔧 移除房主檢查 - 任何用戶都可以廣播同步
            // if (!room.isHost(socket.id)) {
            //     return; // 只有房主可以廣播同步
            // }

            user.updateActivity();

            // 廣播同步信息（除了發送者）
            socket.to(user.roomId).emit('syncBroadcast', {
                videoId: data.videoId,
                time: data.time,
                isPlaying: data.isPlaying,
                timestamp: Date.now(),
                changedBy: user.username
            });

        } catch (error) {
            console.error('同步廣播錯誤:', error);
        }
    });

    // 請求同步
    socket.on('requestSync', (data) => {
        try {
            const { roomId } = data;
            const user = users.get(socket.id);

            if (!user || user.roomId !== roomId) {
                return;
            }

            const room = rooms.get(roomId);
            if (!room) {
                return;
            }

            user.updateActivity();

            // 🔧 向房間內所有用戶廣播同步請求，而不只是房主
            socket.to(user.roomId).emit('syncRequest', { 
                fromUser: user.username 
            });

        } catch (error) {
            console.error('請求同步錯誤:', error);
        }
    });

    // 🔧 房間自定義 - 移除房主限制
    socket.on('updateRoomCustomization', (data) => {
        try {
            const { roomId, type, data: customData, changedBy } = data;
            const user = users.get(socket.id);
            const room = rooms.get(roomId);

            if (!user || !room || user.roomId !== roomId) {
                return socket.emit('error', { message: '你不在這個房間中' });
            }

            // 🔧 移除房主檢查 - 任何用戶都可以自定義房間
            // if (!room.isHost(socket.id)) {
            //     return socket.emit('error', { message: '只有房主可以自定義房間' });
            // }

            // 驗證自定義類型
            const allowedTypes = ['background', 'themeColor', 'danmuSpeed'];
            if (!allowedTypes.includes(type)) {
                return socket.emit('error', { message: '無效的自定義類型' });
            }

            // 驗證數據
            if (type === 'themeColor' && !/^#[0-9A-F]{6}$/i.test(customData)) {
                return socket.emit('error', { message: '無效的顏色格式' });
            }

            if (type === 'danmuSpeed' && (customData < 1 || customData > 10)) {
                return socket.emit('error', { message: '無效的彈幕速度' });
            }

            if (type === 'background' && customData && typeof customData !== 'string') {
                return socket.emit('error', { message: '無效的背景數據' });
            }

            user.updateActivity();
            room.updateCustomization(type, customData, changedBy || user.username);

            // 廣播自定義更新
            io.to(roomId).emit('roomCustomization', { 
                [type]: customData,
                changedBy: changedBy || user.username
            });

            logRoomAction(roomId, `CUSTOMIZATION_${type.toUpperCase()}`, user.username);

        } catch (error) {
            console.error('房間自定義錯誤:', error);
            socket.emit('error', { message: '自定義失敗' });
        }
    });

    // 用戶斷開連接
    socket.on('disconnect', () => {
        try {
            console.log(`用戶斷開連接: ${socket.id}`);

            const user = users.get(socket.id);
            if (user && user.roomId) {
                const room = rooms.get(user.roomId);
                if (room) {
                    room.removeUser(socket.id);
                    
                    // 通知房間內其他用戶
                    socket.to(user.roomId).emit('userLeft', { 
                        userId: socket.id 
                    });
                    
                    // 發送更新的用戶列表
                    io.to(user.roomId).emit('usersUpdate', room.getUsersArray());
                    
                    // 如果房主離開，轉移房主權限
                    if (room.isHost(socket.id) && !room.isEmpty()) {
                        const newHost = Array.from(room.users.values())[0];
                        if (newHost) {
                            room.hostId = newHost.id;
                            newHost.isHost = true;
                            users.set(newHost.id, newHost);
                            
                            io.to(newHost.id).emit('hostTransferred', { 
                                isHost: true 
                            });
                            
                            socket.to(user.roomId).emit('chatMessage', {
                                type: 'system',
                                message: `${newHost.username} 成為新的房主`,
                                timestamp: Date.now()
                            });

                            logRoomAction(user.roomId, 'HOST_TRANSFERRED', newHost.username);
                        }
                    }
                    
                    // 更新公開房間列表
                    if (room.type === 'public') {
                        io.emit('publicRooms', getPublicRooms());
                    }

                    logRoomAction(user.roomId, 'LEFT', user.username);
                }
            }

            users.delete(socket.id);

        } catch (error) {
            console.error('斷開連接處理錯誤:', error);
        }
    });
});

// 錯誤處理
app.use((err, req, res, next) => {
    console.error('Express 錯誤:', err);
    res.status(500).json({ error: '服務器內部錯誤' });
});

// 404 處理
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../index.html'));
});

// 優雅關閉
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM，正在關閉服務器...');
    server.close(() => {
        console.log('服務器已關閉');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('收到 SIGINT，正在關閉服務器...');
    server.close(() => {
        console.log('服務器已關閉');
        process.exit(0);
    });
});

// 啟動服務器
server.listen(PORT, () => {
    console.log(`🚀 K-Pop Watch Party 服務器運行在端口 ${PORT} (無房主限制版本)`);
    console.log(`🌍 環境: ${NODE_ENV}`);
    console.log(`📝 健康檢查: http://localhost:${PORT}/health`);
    console.log(`✨ 特色: 所有用戶都可以載入影片和自定義房間！`);
});

// 導出供測試使用
module.exports = { app, server, io };
