// Main App Controller
class HushHubApp {
    constructor() {
        this.socket = null;
        this.geolocation = null;
        this.backgroundTracker = null;
        this.currentUser = null;
        this.currentScreen = 'loading';
        this.nearbyUsers = [];
        this.activeChats = new Map();
        
        this.init();
    }

    async init() {
        console.log('🤫 Initializing HushHub...');
        
        // Show loading screen
        this.showScreen('loading');
        
        // Register service worker
        await this.registerServiceWorker();
        
        // Initialize geolocation
        this.geolocation = new GeolocationManager();
        this.backgroundTracker = new BackgroundLocationTracker(this.geolocation);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Check for stored user session
        const storedUser = this.getStoredUser();
        if (storedUser) {
            this.currentUser = storedUser;
            await this.connectToServer();
        } else {
            this.showScreen('nickname');
        }
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered:', registration);
            } catch (error) {
                console.warn('Service Worker registration failed:', error);
            }
        }
    }

    setupEventListeners() {
        // Nickname form
        const nicknameForm = document.getElementById('nickname-form');
        nicknameForm.addEventListener('submit', (e) => this.handleNicknameSubmit(e));

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Modal controls
        this.setupModalControls();

        // Location permission
        document.getElementById('enable-location').addEventListener('click', () => {
            this.enableLocation();
        });

        document.getElementById('deny-location').addEventListener('click', () => {
            this.hideModal('location-modal');
            this.showLocationDeniedMessage();
        });

        // Anonymous toggle
        document.getElementById('toggle-anonymous').addEventListener('click', () => {
            this.toggleAnonymousMode();
        });

        // Thread creation
        document.getElementById('create-thread-btn').addEventListener('click', () => {
            this.showModal('thread-modal');
        });

        document.getElementById('thread-form').addEventListener('submit', (e) => {
            this.handleThreadSubmit(e);
        });

        // Geolocation events
        this.geolocation.on('onLocationUpdate', (position) => {
            this.handleLocationUpdate(position);
        });

        this.geolocation.on('onUsersNearby', (users) => {
            this.updateNearbyUsersList(users);
        });

        this.geolocation.on('onLocationError', (error) => {
            this.handleLocationError(error);
        });

        // Visibility change (app going to background/foreground)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.backgroundTracker.startTracking();
            } else {
                this.backgroundTracker.stopTracking();
                if (this.geolocation.currentPosition) {
                    this.geolocation.startWatching();
                }
            }
        });
    }

    setupModalControls() {
        // Chat modal
        document.getElementById('close-chat').addEventListener('click', () => {
            this.hideModal('chat-modal');
        });

        document.getElementById('send-btn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Thread modal
        document.getElementById('close-thread').addEventListener('click', () => {
            this.hideModal('thread-modal');
        });

        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    async handleNicknameSubmit(e) {
        e.preventDefault();
        
        const nickname = document.getElementById('nickname-input').value.trim();
        const isAnonymous = document.getElementById('anonymous-mode').checked;
        
        if (!nickname) return;

        this.currentUser = {
            nickname: nickname,
            isAnonymous: isAnonymous
        };

        this.storeUser(this.currentUser);
        this.showScreen('loading');
        
        await this.connectToServer();
    }

    async connectToServer() {
        try {
            // Connect to Socket.IO server
            this.socket = io();
            window.socket = this.socket;
            
            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.socket.emit('join', this.currentUser);
            });

            this.socket.on('joined', (data) => {
                this.currentUser = { ...this.currentUser, ...data.user };
                window.currentUser = this.currentUser;
                this.updateUserDisplay();
                this.requestLocationPermission();
            });

            this.socket.on('nearby-users', (users) => {
                this.nearbyUsers = users;
                this.updateNearbyUsersList(users);
            });

            this.socket.on('new-message', (message) => {
                this.handleIncomingMessage(message);
            });

            this.socket.on('message-sent', (data) => {
                this.handleMessageSent(data);
            });

            this.socket.on('anonymous-toggled', (data) => {
                this.currentUser.isAnonymous = data.isAnonymous;
                this.updateUserDisplay();
            });

            this.socket.on('new-thread', (thread) => {
                this.handleNewThread(thread);
            });

            this.socket.on('thread-created', (data) => {
                this.handleThreadCreated(data);
            });

            this.socket.on('nearby-threads', (threads) => {
                this.updateThreadsList(threads);
            });

            this.socket.on('thread-details', (thread) => {
                this.showThreadDetails(thread);
            });

            this.socket.on('thread-reply', (reply) => {
                this.handleThreadReply(reply);
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.showConnectionError();
            });

        } catch (error) {
            console.error('Connection error:', error);
            this.showConnectionError();
        }
    }

    async requestLocationPermission() {
        this.showModal('location-modal');
    }

    async enableLocation() {
        this.hideModal('location-modal');
        
        const success = await this.geolocation.initialize();
        if (success) {
            this.showScreen('main');
            this.backgroundTracker.startTracking();
            this.updateLocationStatus(true);
        } else {
            this.showLocationError();
        }
    }

    handleLocationUpdate(position) {
        this.updateLocationStatus(true);
        
        // Send location to server
        if (this.socket && this.socket.connected) {
            this.socket.emit('location-update', position);
        }
    }

    handleLocationError(error) {
        console.error('Location error:', error);
        this.updateLocationStatus(false);
        this.showLocationError(error.message);
    }

    updateLocationStatus(hasLocation) {
        const indicator = document.getElementById('location-indicator');
        const nearbyCount = document.getElementById('nearby-count');
        
        if (hasLocation) {
            indicator.textContent = '📍';
            nearbyCount.textContent = `${this.nearbyUsers.length} nearby`;
        } else {
            indicator.textContent = '📍❌';
            nearbyCount.textContent = 'Location disabled';
        }
    }

    updateNearbyUsersList(users) {
        const usersList = document.getElementById('users-list');
        
        if (users.length === 0) {
            usersList.innerHTML = `
                <div class="empty-state">
                    <span class="icon">🔍</span>
                    <p>No users nearby</p>
                </div>
            `;
            return;
        }

        usersList.innerHTML = users.map(user => `
            <div class="user-card" onclick="app.openChat('${user.id}', '${user.nickname || 'Anonymous ' + user.avatar}')">
                <div class="user-avatar">
                    ${user.avatar}
                    <div class="online-indicator"></div>
                </div>
                <div class="user-info">
                    <h4>${user.nickname || 'Anonymous ' + user.avatar}</h4>
                    <div class="user-distance">${this.geolocation.getDistanceString(user.distance)}</div>
                </div>
            </div>
        `).join('');
    }

    openChat(userId, userName) {
        const modal = document.getElementById('chat-modal');
        const chatWith = document.getElementById('chat-with');
        const messagesContainer = document.getElementById('chat-messages');
        
        chatWith.textContent = `Chat with ${userName}`;
        messagesContainer.innerHTML = '';
        messagesContainer.dataset.userId = userId;
        
        this.showModal('chat-modal');
        document.getElementById('message-input').focus();
    }

    sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        const messagesContainer = document.getElementById('chat-messages');
        const recipientId = messagesContainer.dataset.userId;
        
        if (!message || !recipientId) return;

        // Add message to UI immediately
        this.addMessageToChat(messagesContainer, {
            content: message,
            isOwn: true,
            timestamp: Date.now()
        });

        // Send to server
        this.socket.emit('send-message', {
            recipientId: recipientId,
            message: message,
            isAnonymous: this.currentUser.isAnonymous
        });

        input.value = '';
    }

    handleIncomingMessage(message) {
        // Show notification
        this.showNotification(`New message from ${message.senderNickname || 'Anonymous ' + message.senderAvatar}`);
        
        // If chat is open with this user, add to chat
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer.dataset.userId === message.senderId) {
            this.addMessageToChat(messagesContainer, {
                content: message.content,
                isOwn: false,
                senderName: message.senderNickname || 'Anonymous ' + message.senderAvatar,
                timestamp: message.timestamp
            });
        }
    }

    handleMessageSent(data) {
        console.log('Message sent successfully:', data);
    }

    addMessageToChat(container, message) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.isOwn ? 'own' : 'other'}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageEl.innerHTML = `
            ${!message.isOwn ? `<div class="sender">${message.senderName}</div>` : ''}
            <div class="content">${this.escapeHtml(message.content)}</div>
            <div class="time">${time}</div>
        `;
        
        container.appendChild(messageEl);
        container.scrollTop = container.scrollHeight;
    }

    toggleAnonymousMode() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('toggle-anonymous');
        }
    }

    updateUserDisplay() {
        const nickname = document.getElementById('user-nickname');
        const anonymousStatus = document.getElementById('anonymous-status');
        
        if (this.currentUser.isAnonymous) {
            nickname.textContent = `Anonymous ${this.currentUser.avatar}`;
            anonymousStatus.textContent = '👤';
        } else {
            nickname.textContent = this.currentUser.nickname;
            anonymousStatus.textContent = '🙋';
        }
    }

    handleThreadSubmit(e) {
        e.preventDefault();
        
        const title = document.getElementById('thread-title').value.trim();
        const content = document.getElementById('thread-content').value.trim();
        const isAnonymous = document.getElementById('thread-anonymous').checked;
        
        if (!title || !content) return;

        this.socket.emit('create-thread', {
            title: title,
            content: content,
            isAnonymous: isAnonymous
        });

        this.hideModal('thread-modal');
        document.getElementById('thread-form').reset();
    }

    handleNewThread(thread) {
        // Show notification about new thread
        this.showNotification(`New discussion: ${thread.title}`);
        
        // If on threads tab, refresh the list
        const threadsTab = document.getElementById('threads-tab');
        if (threadsTab.classList.contains('active')) {
            this.loadNearbyThreads();
        }
    }

    handleThreadCreated(data) {
        this.showNotification('Discussion created successfully!');
        this.loadNearbyThreads();
    }

    updateThreadsList(threads) {
        const threadsList = document.getElementById('threads-list');
        
        if (threads.length === 0) {
            threadsList.innerHTML = `
                <div class="empty-state">
                    <span class="icon">💭</span>
                    <p>No discussions nearby. Start one!</p>
                </div>
            `;
            return;
        }

        threadsList.innerHTML = threads.map(thread => `
            <div class="thread-card" onclick="app.joinThread('${thread.id}')">
                <h4>${this.escapeHtml(thread.title)}</h4>
                <div class="thread-content">${this.escapeHtml(thread.content)}</div>
                <div class="thread-meta">
                    <span class="thread-author">
                        ${thread.isAnonymous ? 'Anonymous ' + thread.creatorAvatar : this.escapeHtml(thread.creatorNickname)}
                    </span>
                    <span class="thread-stats">
                        ${thread.repliesCount} replies • ${thread.participantsCount} participants
                    </span>
                    <span class="thread-time">
                        ${this.formatTimeAgo(thread.createdAt)}
                    </span>
                </div>
            </div>
        `).join('');
    }

    joinThread(threadId) {
        this.socket.emit('join-thread', threadId);
    }

    showThreadDetails(thread) {
        // Create thread detail modal dynamically
        const threadDetailModal = this.createThreadDetailModal(thread);
        document.body.appendChild(threadDetailModal);
        
        // Show the modal
        setTimeout(() => threadDetailModal.classList.add('active'), 100);
    }

    createThreadDetailModal(thread) {
        const modal = document.createElement('div');
        modal.className = 'modal thread-detail-modal';
        modal.id = `thread-detail-${thread.id}`;
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${this.escapeHtml(thread.title)}</h3>
                    <button class="btn-ghost close-thread-detail">&times;</button>
                </div>
                <div class="thread-detail-body">
                    <div class="thread-original-post">
                        <div class="post-author">
                            <span class="author-avatar">${thread.creatorAvatar}</span>
                            <span class="author-name">
                                ${thread.isAnonymous ? 'Anonymous' : this.escapeHtml(thread.creatorNickname)}
                            </span>
                            <span class="post-time">${this.formatTimeAgo(thread.createdAt)}</span>
                        </div>
                        <div class="post-content">${this.escapeHtml(thread.content)}</div>
                    </div>
                    
                    <div class="thread-replies" id="thread-replies-${thread.id}">
                        ${thread.replies.map(reply => this.createReplyHTML(reply)).join('')}
                    </div>
                    
                    <div class="thread-reply-form">
                        <textarea 
                            id="reply-content-${thread.id}" 
                            placeholder="Write a reply..." 
                            rows="3"
                        ></textarea>
                        <div class="reply-form-actions">
                            <label class="checkbox-label">
                                <input type="checkbox" id="reply-anonymous-${thread.id}">
                                <span class="checkmark"></span>
                                Reply anonymously
                            </label>
                            <button class="btn-primary" onclick="app.replyToThread('${thread.id}')">
                                Reply
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners
        modal.querySelector('.close-thread-detail').addEventListener('click', () => {
            this.closeThreadDetail(thread.id);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeThreadDetail(thread.id);
            }
        });
        
        return modal;
    }

    createReplyHTML(reply) {
        return `
            <div class="thread-reply">
                <div class="reply-author">
                    <span class="author-avatar">${reply.authorAvatar}</span>
                    <span class="author-name">
                        ${reply.isAnonymous ? 'Anonymous' : this.escapeHtml(reply.authorNickname)}
                    </span>
                    <span class="reply-time">${this.formatTimeAgo(reply.timestamp)}</span>
                </div>
                <div class="reply-content">${this.escapeHtml(reply.content)}</div>
            </div>
        `;
    }

    replyToThread(threadId) {
        const content = document.getElementById(`reply-content-${threadId}`).value.trim();
        const isAnonymous = document.getElementById(`reply-anonymous-${threadId}`).checked;
        
        if (!content) return;

        this.socket.emit('reply-thread', {
            threadId: threadId,
            content: content,
            isAnonymous: isAnonymous
        });

        document.getElementById(`reply-content-${threadId}`).value = '';
    }

    handleThreadReply(reply) {
        const repliesContainer = document.querySelector(`#thread-replies-${reply.threadId}`);
        if (repliesContainer) {
            repliesContainer.innerHTML += this.createReplyHTML(reply);
            repliesContainer.scrollTop = repliesContainer.scrollHeight;
        }
    }

    closeThreadDetail(threadId) {
        const modal = document.getElementById(`thread-detail-${threadId}`);
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    }

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-tab`);
        });

        // Load tab-specific data
        if (tabName === 'threads') {
            this.loadNearbyThreads();
        } else if (tabName === 'games') {
            this.loadNearbyGames();
        }
    }

    loadNearbyThreads() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('get-nearby-threads');
        }
    }

    loadNearbyGames() {
        // TODO: Implement games loading
        console.log('Loading nearby games...');
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.toggle('active', screen.id === `${screenName}-screen`);
        });
        this.currentScreen = screenName;
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    showNotification(message) {
        // Simple notification - could be enhanced with proper notification API
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('HushHub', { body: message });
        } else {
            console.log('Notification:', message);
        }
    }

    showLocationError(message = 'Location access is required for HushHub to work') {
        alert(message);
    }

    showConnectionError() {
        alert('Connection to server lost. Please refresh the page.');
    }

    showLocationDeniedMessage() {
        alert('Location access is required to find nearby users. You can enable it later in settings.');
    }

    storeUser(user) {
        try {
            localStorage.setItem('hushhub_user', JSON.stringify(user));
        } catch (error) {
            console.warn('Failed to store user data:', error);
        }
    }

    getStoredUser() {
        try {
            const stored = localStorage.getItem('hushhub_user');
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.warn('Failed to get stored user:', error);
            return null;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HushHubApp();
});

// Handle PWA install prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show install button (could be added to UI)
    console.log('PWA install prompt available');
});

window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    deferredPrompt = null;
});