const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

// 添加生產環境配置
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

console.log(`🌍 Environment: ${NODE_ENV}`);
console.log(`🔗 Base URL: ${BASE_URL}`);

// Socket.io 配置，適合 Render 部署
const io = socketIo(server, {
    cors: {
        origin: NODE_ENV === 'production' ? [BASE_URL] : ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            frameSrc: ["https://www.youtube.com"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});
app.use(limiter);

// Serve static files from parent directory (where index.html is)
app.use(express.static(path.join(__dirname, '..')));

// Also serve from current directory for any server-specific files
app.use('/server', express.static(__dirname));

// In-memory storage (use Redis or MongoDB in production)
const rooms = new Map();
const users = new Map();

// Room management
class Room {
    constructor(id, name, type, hostId, password = null) {
        this.id = id;
        this.name = name;
        this.type = type; // 'public' or 'private'
        this.hostId = hostId;
        this.password = password;
        this.users = new Map();
        this.currentVideo = null;
        this.customization = {
            background: null,
            themeColor: '#6b46c1',
            danmuSpeed: 5
        };
        this.inviteToken = this.generateInviteToken();
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
    }

    generateInviteToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    addUser(user) {
        this.users.set(user.id, user);
        this.updateActivity();
    }

    removeUser(userId) {
        this.users.delete(userId);
        this.updateActivity();
        
        // If host leaves, assign new host
        if (userId === this.hostId && this.users.size > 0) {
            this.hostId = Array.from(this.users.keys())[0];
        }
    }

    updateActivity() {
        this.lastActivity = Date.now();
    }

    getUserCount() {
        return this.users.size;
    }

    isHost(userId) {
        return userId === this.hostId;
    }

    toPublicInfo() {
        return {
            id: this.id,
            name: this.name,
            userCount: this.getUserCount(),
            currentVideo: this.currentVideo ? {
                title: this.currentVideo.title,
                thumbnail: this.currentVideo.thumbnail
            } : null,
            hasPassword: !!this.password
        };
    }
}

class User {
    constructor(id, username, socketId) {
        this.id = id;
        this.username = username;
        this.socketId = socketId;
        this.roomId = null;
        this.isHost = false;
        this.joinedAt = Date.now();
    }
}

// Utility functions
function generateRoomId() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
}

function generateUserId() {
    return crypto.randomBytes(16).toString('hex');
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, 100); // Limit length and trim
}

function validateRoomName(name) {
    return name && name.length >= 3 && name.length <= 50;
}

function validateUsername(username) {
    return username && username.length >= 2 && username.length <= 20;
}

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    
    return null;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create room
    socket.on('createRoom', (data) => {
        try {
            const { username, roomName, roomType, password } = data;
            
            // Validate input
            if (!validateUsername(sanitizeInput(username))) {
                socket.emit('error', { message: 'Invalid username' });
                return;
            }
            
            if (!validateRoomName(sanitizeInput(roomName))) {
                socket.emit('error', { message: 'Invalid room name' });
                return;
            }

            // Create user
            const userId = generateUserId();
            const user = new User(userId, sanitizeInput(username), socket.id);
            users.set(socket.id, user);

            // Create room
            const roomId = generateRoomId();
            const room = new Room(
                roomId, 
                sanitizeInput(roomName), 
                roomType, 
                userId, 
                password ? sanitizeInput(password) : null
            );
            
            rooms.set(roomId, room);
            room.addUser(user);
            user.roomId = roomId;
            user.isHost = true;

            // Join socket room
            socket.join(roomId);

            // Generate invite link
            const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            const inviteLink = `${baseUrl}/room.html?id=${roomId}&token=${room.inviteToken}`;

            socket.emit('roomCreated', {
                success: true,
                roomId: roomId,
                username: user.username,
                roomType: roomType,
                inviteLink: inviteLink
            });

            // Update public rooms list
            if (roomType === 'public') {
                broadcastPublicRooms();
            }

            console.log(`Room created: ${roomId} by ${username}`);

        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', { message: 'Failed to create room' });
        }
    });

    // Join room
    socket.on('joinRoom', (data) => {
        try {
            const { roomId, username, password, inviteToken } = data;
            
            if (!validateUsername(sanitizeInput(username))) {
                socket.emit('error', { message: 'Invalid username' });
                return;
            }

            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('joinedRoom', { 
                    success: false, 
                    message: 'Room not found' 
                });
                return;
            }

            // Check password for private rooms
            if (room.type === 'private' && room.password) {
                if (!password || password !== room.password) {
                    // Check invite token as alternative
                    if (!inviteToken || inviteToken !== room.inviteToken) {
                        socket.emit('joinedRoom', { 
                            success: false, 
                            message: 'Invalid password or invite link' 
                        });
                        return;
                    }
                }
            }

            // Remove user from previous room if any
            const existingUser = users.get(socket.id);
            if (existingUser && existingUser.roomId) {
                leaveRoom(socket, existingUser.roomId);
            }

            // Create or update user
            const userId = existingUser ? existingUser.id : generateUserId();
            const user = new User(userId, sanitizeInput(username), socket.id);
            users.set(socket.id, user);

            // Join room
            room.addUser(user);
            user.roomId = roomId;
            socket.join(roomId);

            // Send room data
            socket.emit('joinedRoom', {
                success: true,
                room: {
                    id: room.id,
                    name: room.name,
                    currentVideo: room.currentVideo,
                    customization: room.customization
                },
                isHost: room.isHost(userId)
            });

            // Notify other users
            socket.to(roomId).emit('userJoined', {
                id: user.id,
                username: user.username,
                isHost: room.isHost(user.id)
            });

            // Send users list
            const roomUsers = Array.from(room.users.values()).map(u => ({
                id: u.id,
                username: u.username,
                isHost: room.isHost(u.id)
            }));
            io.to(roomId).emit('usersUpdate', roomUsers);

            // Update public rooms if applicable
            if (room.type === 'public') {
                broadcastPublicRooms();
            }

            console.log(`User ${username} joined room ${roomId}`);

        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // Get public rooms
    socket.on('getPublicRooms', () => {
        sendPublicRooms(socket);
    });

    // Chat message
    socket.on('chatMessage', (data) => {
        try {
            const user = users.get(socket.id);
            if (!user || !user.roomId) return;

            const room = rooms.get(user.roomId);
            if (!room) return;

            const message = sanitizeInput(data.message);
            if (!message || message.length > 500) return;

            const messageData = {
                id: crypto.randomBytes(8).toString('hex'),
                username: user.username,
                message: message,
                timestamp: Date.now(),
                userId: user.id
            };

            io.to(user.roomId).emit('chatMessage', messageData);
            room.updateActivity();

        } catch (error) {
            console.error('Error handling chat message:', error);
        }
    });

    // Danmu message
    socket.on('danmuMessage', (data) => {
        try {
            const user = users.get(socket.id);
            if (!user || !user.roomId) return;

            const room = rooms.get(user.roomId);
            if (!room) return;

            const message = sanitizeInput(data.message);
            if (!message || message.length > 100) return;

            const danmuData = {
                id: crypto.randomBytes(8).toString('hex'),
                username: user.username,
                message: message,
                color: data.color || '#ffffff',
                timestamp: Date.now(),
                userId: user.id,
                isQuick: data.isQuick || false
            };

            io.to(user.roomId).emit('danmuMessage', danmuData);
            room.updateActivity();

        } catch (error) {
            console.error('Error handling danmu message:', error);
        }
    });

    // Video controls
    socket.on('changeVideo', async (data) => {
        try {
            const user = users.get(socket.id);
            if (!user || !user.roomId) return;

            const room = rooms.get(user.roomId);
            if (!room || !room.isHost(user.id)) {
                socket.emit('error', { message: 'Only hosts can change videos' });
                return;
            }

            const videoId = extractVideoId(data.url);
            if (!videoId) {
                socket.emit('error', { message: 'Invalid YouTube URL' });
                return;
            }

            // Fetch video info (simplified - in production use YouTube API)
            const videoData = {
                videoId: videoId,
                url: data.url,
                title: data.title || 'Unknown Video',
                startTime: 0,
                loadedBy: user.username,
                loadedAt: Date.now()
            };

            room.currentVideo = videoData;
            room.updateActivity();

            io.to(user.roomId).emit('videoChanged', videoData);

            // Update public rooms if applicable
            if (room.type === 'public') {
                broadcastPublicRooms();
            }

        } catch (error) {
            console.error('Error changing video:', error);
            socket.emit('error', { message: 'Failed to change video' });
        }
    });

    // Video actions (play, pause, seek)
    socket.on('videoAction', (data) => {
        try {
            const user = users.get(socket.id);
            if (!user || !user.roomId) return;

            const room = rooms.get(user.roomId);
            if (!room || !room.isHost(user.id)) return;

            // Broadcast to all users except sender
            socket.to(user.roomId).emit('videoAction', {
                action: data.action,
                time: data.time,
                videoId: data.videoId,
                timestamp: Date.now()
            });

            room.updateActivity();

        } catch (error) {
            console.error('Error handling video action:', error);
        }
    });

    // Sync request
    socket.on('requestSync', (data) => {
        try {
            const user = users.get(socket.id);
            if (!user || !user.roomId) return;

            const room = rooms.get(user.roomId);
            if (!room) return;

            // Find host and request current state
            const host = Array.from(room.users.values()).find(u => room.isHost(u.id));
            if (host && host.socketId !== socket.id) {
                io.to(host.socketId).emit('syncRequest', { requesterId: socket.id });
            }

        } catch (error) {
            console.error('Error handling sync request:', error);
        }
    });

    // Sync broadcast (from host)
    socket.on('syncBroadcast', (data) => {
        try {
            const user = users.get(socket.id);
            if (!user || !user.roomId) return;

            const room = rooms.get(user.roomId);
            if (!room || !room.isHost(user.id)) return;

            socket.to(user.roomId).emit('videoSync', {
                time: data.time,
                isPlaying: data.isPlaying,
                videoId: data.videoId,
                timestamp: data.timestamp
            });

        } catch (error) {
            console.error('Error handling sync broadcast:', error);
        }
    });

    // Room customization
    socket.on('updateRoomCustomization', (data) => {
        try {
            const user = users.get(socket.id);
            if (!user || !user.roomId) return;

            const room = rooms.get(user.roomId);
            if (!room || !room.isHost(user.id)) {
                socket.emit('error', { message: 'Only hosts can customize the room' });
                return;
            }

            // Update customization
            switch (data.type) {
                case 'background':
                    room.customization.background = data.data;
                    break;
                case 'themeColor':
                    room.customization.themeColor = data.data;
                    break;
                case 'danmuSpeed':
                    room.customization.danmuSpeed = parseInt(data.data) || 5;
                    break;
            }

            // Broadcast to all users in room
            io.to(user.roomId).emit('roomCustomization', room.customization);
            room.updateActivity();

        } catch (error) {
            console.error('Error updating room customization:', error);
        }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        try {
            const user = users.get(socket.id);
            if (user && user.roomId) {
                leaveRoom(socket, user.roomId);
            }
            users.delete(socket.id);
            console.log('User disconnected:', socket.id);

        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Helper functions
function leaveRoom(socket, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const user = users.get(socket.id);
    if (!user) return;

    room.removeUser(user.id);
    socket.leave(roomId);

    // Notify other users
    socket.to(roomId).emit('userLeft', user.id);

    // Update users list
    const roomUsers = Array.from(room.users.values()).map(u => ({
        id: u.id,
        username: u.username,
        isHost: room.isHost(u.id)
    }));
    io.to(roomId).emit('usersUpdate', roomUsers);

    // Delete empty rooms
    if (room.getUserCount() === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
    }

    // Update public rooms
    broadcastPublicRooms();
}

function sendPublicRooms(socket) {
    const publicRooms = Array.from(rooms.values())
        .filter(room => room.type === 'public' && room.getUserCount() > 0)
        .map(room => room.toPublicInfo())
        .sort((a, b) => b.userCount - a.userCount);

    socket.emit('publicRoomsUpdate', publicRooms);
}

function broadcastPublicRooms() {
    const publicRooms = Array.from(rooms.values())
        .filter(room => room.type === 'public' && room.getUserCount() > 0)
        .map(room => room.toPublicInfo())
        .sort((a, b) => b.userCount - a.userCount);

    io.emit('publicRoomsUpdate', publicRooms);
}

// Cleanup inactive rooms (run every 5 minutes)
setInterval(() => {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [roomId, room] of rooms.entries()) {
        if (now - room.lastActivity > inactiveThreshold) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (inactive)`);
        }
    }

    broadcastPublicRooms();
}, 5 * 60 * 1000);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/room.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'room.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        rooms: rooms.size, 
        users: users.size,
        uptime: process.uptime()
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 服務器運行在端口 ${PORT}`);
    console.log(`🌐 訪問地址: ${BASE_URL}`);
    console.log(`📱 本地測試: http://localhost:${PORT}`);
    
    if (NODE_ENV === 'production') {
        console.log('🎉 生產環境部署成功！');
    } else {
        console.log('🛠️  開發模式運行中');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = { app, server, io };