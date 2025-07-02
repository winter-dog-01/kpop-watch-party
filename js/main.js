// Homepage functionality
class HomePage {
    constructor() {
        this.socket = null;
        
        // Make this available globally
        window.homepage = this;
        
        this.init();
    }

    init() {
        this.initializeSocket();
        this.bindEvents();
        this.loadPublicRooms();
        this.handleURLParams();
    }

    initializeSocket() {
        console.log('Connecting to server...');
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('✅ Connected to server successfully!');
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Connection failed:', error);
            this.showError('Failed to connect to server. Please check if the server is running.');
        });

        this.socket.on('publicRoomsUpdate', (rooms) => {
            console.log('Received public rooms update:', rooms);
            this.updatePublicRoomsList(rooms);
        });

        this.socket.on('roomCreated', (data) => {
            console.log('Room created:', data);
            this.handleRoomCreated(data);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showError(error.message);
        });
    }

    bindEvents() {
        // Create room form
        document.getElementById('createRoomForm').addEventListener('submit', (e) => {
            this.handleCreateRoom(e);
        });

        // Join private room form
        document.getElementById('joinPrivateForm').addEventListener('submit', (e) => {
            this.handleJoinPrivateRoom(e);
        });

        // Room type selection
        document.querySelectorAll('input[name="roomType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.togglePrivateOptions(e.target.value);
            });
        });

        // Copy link button
        document.getElementById('copyLinkBtn').addEventListener('click', () => {
            this.copyInviteLink();
        });

        // Enter room button
        document.getElementById('enterRoomBtn').addEventListener('click', () => {
            this.enterRoom();
        });

        // Close modals
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }

    handleURLParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        const token = urlParams.get('token');
        
        if (roomId) {
            // Auto-fill room ID if coming from invite link
            document.getElementById('roomId').value = roomId;
            if (token) {
                // Store token for automatic join
                sessionStorage.setItem('inviteToken', token);
            }
        }
    }

    handleCreateRoom(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const roomData = {
            username: formData.get('username').trim(),
            roomName: formData.get('roomName').trim(),
            roomType: formData.get('roomType'),
            password: formData.get('roomPassword')?.trim() || null
        };

        // Validation
        if (!roomData.username || !roomData.roomName) {
            this.showError('Please fill in all required fields');
            return;
        }

        if (roomData.username.length < 2 || roomData.username.length > 20) {
            this.showError('Username must be between 2-20 characters');
            return;
        }

        if (roomData.roomName.length < 3 || roomData.roomName.length > 50) {
            this.showError('Room name must be between 3-50 characters');
            return;
        }

        this.showLoading('Creating your room...');
        this.socket.emit('createRoom', roomData);
    }

    handleJoinPrivateRoom(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const joinData = {
            username: formData.get('joinUsername').trim(),
            roomId: this.extractRoomIdFromInput(formData.get('roomId').trim()),
            password: formData.get('joinPassword')?.trim() || null
        };

        // Add invite token if available
        const inviteToken = sessionStorage.getItem('inviteToken');
        if (inviteToken) {
            joinData.inviteToken = inviteToken;
            sessionStorage.removeItem('inviteToken');
        }

        // Validation
        if (!joinData.username || !joinData.roomId) {
            this.showError('Please fill in all required fields');
            return;
        }

        if (joinData.username.length < 2 || joinData.username.length > 20) {
            this.showError('Username must be between 2-20 characters');
            return;
        }

        this.showLoading('Joining room...');
        this.socket.emit('joinRoom', joinData);
    }

    extractRoomIdFromInput(input) {
        // Extract room ID from URL or use as-is
        const urlMatch = input.match(/room=([^&]+)/);
        return urlMatch ? urlMatch[1] : input;
    }

    handleRoomCreated(data) {
        this.hideLoading();
        console.log('Room creation response:', data);
        
        if (data.success) {
            // Store room data for the room page
            const roomData = {
                roomId: data.roomId,
                username: data.username,
                isHost: true
            };
            
            sessionStorage.setItem('roomData', JSON.stringify(roomData));
            console.log('Stored room data:', roomData);

            if (data.roomType === 'private') {
                // For private rooms, show invite link modal
                this.showInviteLink(data.inviteLink, data.roomId);
            } else {
                // For public rooms, redirect immediately
                console.log('Redirecting to public room:', data.roomId);
                this.redirectToRoom(data.roomId);
            }
        } else {
            console.error('Room creation failed:', data.message);
            this.showError(data.message || 'Failed to create room');
        }
    }

    showInviteLink(inviteLink, roomId) {
        const modal = document.getElementById('inviteLinkModal');
        const linkInput = document.getElementById('inviteLink');
        
        linkInput.value = inviteLink;
        modal.classList.remove('hidden');
        
        // Store room ID for enter button
        modal.dataset.roomId = roomId;
    }

    copyInviteLink() {
        const linkInput = document.getElementById('inviteLink');
        linkInput.select();
        document.execCommand('copy');
        
        const copyBtn = document.getElementById('copyLinkBtn');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        copyBtn.style.background = '#10b981';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '';
        }, 2000);
    }

    enterRoom() {
        const modal = document.getElementById('inviteLinkModal');
        const roomId = modal.dataset.roomId;
        console.log('Enter room button clicked for room:', roomId);
        this.closeModal('inviteLinkModal');
        this.redirectToRoom(roomId);
    }

    redirectToRoom(roomId) {
        console.log('Redirecting to room:', roomId);
        // Add a small delay to ensure session storage is saved
        setTimeout(() => {
            const newUrl = `room.html?id=${roomId}`;
            console.log('Navigating to:', newUrl);
            window.location.href = newUrl;
        }, 500);
    }

    togglePrivateOptions(roomType) {
        const privateOptions = document.getElementById('privateOptions');
        if (roomType === 'private') {
            privateOptions.classList.remove('hidden');
        } else {
            privateOptions.classList.add('hidden');
        }
    }

    loadPublicRooms() {
        this.socket.emit('getPublicRooms');
    }

    updatePublicRoomsList(rooms) {
        const roomsList = document.getElementById('publicRoomsList');
        
        if (!rooms || rooms.length === 0) {
            roomsList.innerHTML = `
                <div class="no-rooms">
                    <p>No public rooms available. Be the first to create one!</p>
                </div>
            `;
            return;
        }

        roomsList.innerHTML = rooms.map(room => `
            <div class="room-item" onclick="homepage.joinPublicRoom('${room.id}', '${room.name}')">
                <div class="room-item-header">
                    <span class="room-name">${this.escapeHtml(room.name)}</span>
                    <span class="room-users">👥 ${room.userCount} viewer${room.userCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="room-status">
                    <span class="status-indicator"></span>
                    <span>Active • ${room.currentVideo ? 'Watching: ' + this.truncateText(room.currentVideo.title, 30) : 'No video'}</span>
                </div>
            </div>
        `).join('');
    }

    joinPublicRoom(roomId, roomName) {
        const username = prompt(`Enter your username to join "${roomName}":`);
        if (!username || username.trim().length < 2) {
            alert('Please enter a valid username (2+ characters)');
            return;
        }

        // Store room data
        sessionStorage.setItem('roomData', JSON.stringify({
            roomId: roomId,
            username: username.trim(),
            isHost: false
        }));

        this.redirectToRoom(roomId);
    }

    showLoading(message) {
        const modal = document.getElementById('loadingModal');
        const messageEl = modal.querySelector('p');
        messageEl.textContent = message;
        modal.classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingModal').classList.add('hidden');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    showError(message) {
        this.hideLoading();
        
        // Remove existing error messages
        const existingError = document.querySelector('.message.error');
        if (existingError) {
            existingError.remove();
        }

        // Create error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message error';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            ${this.escapeHtml(message)}
        `;

        // Insert at top of main content
        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(errorDiv, mainContent.firstChild);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    showSuccess(message) {
        // Remove existing messages
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create success message
        const successDiv = document.createElement('div');
        successDiv.className = 'message success';
        successDiv.innerHTML = `
            <i class="fas fa-check-circle"></i>
            ${this.escapeHtml(message)}
        `;

        // Insert at top of main content
        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(successDiv, mainContent.firstChild);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// Initialize homepage when DOM is loaded
let homepage;
document.addEventListener('DOMContentLoaded', () => {
    homepage = new HomePage();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && homepage) {
        // Refresh public rooms when page becomes visible
        homepage.loadPublicRooms();
    }
});

// Auto-refresh public rooms every 30 seconds
setInterval(() => {
    if (homepage && !document.hidden) {
        homepage.loadPublicRooms();
    }
}, 30000);