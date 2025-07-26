// Chat Management System
class ChatManager {
    constructor(app) {
        this.app = app;
        this.activeChats = new Map();
        this.messageHistory = new Map();
        this.typingIndicators = new Map();
        this.unreadCounts = new Map();
        
        this.setupChatEvents();
    }

    setupChatEvents() {
        // Socket events for chat
        this.app.socket.on('new-message', (message) => {
            this.handleIncomingMessage(message);
        });

        this.app.socket.on('user-typing', (data) => {
            this.showTypingIndicator(data.userId, data.isTyping);
        });

        this.app.socket.on('message-delivered', (data) => {
            this.markMessageAsDelivered(data.messageId);
        });

        this.app.socket.on('message-read', (data) => {
            this.markMessageAsRead(data.messageId);
        });

        // Typing indicator
        const messageInput = document.getElementById('message-input');
        let typingTimer;

        messageInput.addEventListener('input', () => {
            const chatModal = document.getElementById('chat-modal');
            const recipientId = chatModal.dataset.currentUserId;
            
            if (recipientId) {
                this.app.socket.emit('typing', { recipientId, isTyping: true });
                
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    this.app.socket.emit('typing', { recipientId, isTyping: false });
                }, 1000);
            }
        });
    }

    openChat(userId, userName, userAvatar) {
        const modal = document.getElementById('chat-modal');
        const chatWith = document.getElementById('chat-with');
        const messagesContainer = document.getElementById('chat-messages');
        
        // Set current chat
        modal.dataset.currentUserId = userId;
        chatWith.innerHTML = `
            <div class="chat-header-info">
                <span class="chat-avatar">${userAvatar}</span>
                <div class="chat-user-details">
                    <div class="chat-username">${userName}</div>
                    <div class="chat-status" id="chat-status-${userId}">Online</div>
                </div>
            </div>
        `;
        
        // Load message history
        this.loadMessageHistory(userId, messagesContainer);
        
        // Mark as read
        this.markChatAsRead(userId);
        
        // Show modal
        this.app.showModal('chat-modal');
        document.getElementById('message-input').focus();
    }

    loadMessageHistory(userId, container) {
        const history = this.messageHistory.get(userId) || [];
        container.innerHTML = '';
        
        history.forEach(message => {
            this.addMessageToChat(container, message);
        });
        
        if (history.length === 0) {
            container.innerHTML = `
                <div class="chat-welcome">
                    <div class="welcome-icon">👋</div>
                    <p>Say hello to start the conversation!</p>
                </div>
            `;
        }
    }

    sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        const modal = document.getElementById('chat-modal');
        const recipientId = modal.dataset.currentUserId;
        
        if (!message || !recipientId) return;

        const messageData = {
            id: this.generateMessageId(),
            content: message,
            recipientId: recipientId,
            isAnonymous: this.app.currentUser.isAnonymous,
            timestamp: Date.now(),
            status: 'sending'
        };

        // Add to local history
        this.addToMessageHistory(recipientId, {
            ...messageData,
            isOwn: true
        });

        // Add to UI
        const messagesContainer = document.getElementById('chat-messages');
        this.addMessageToChat(messagesContainer, {
            ...messageData,
            isOwn: true
        });

        // Send to server
        this.app.socket.emit('send-message', messageData);

        input.value = '';
    }

    handleIncomingMessage(message) {
        // Add to message history
        this.addToMessageHistory(message.senderId, {
            ...message,
            isOwn: false
        });

        // Show notification if chat is not open or app is in background
        const modal = document.getElementById('chat-modal');
        const isCurrentChat = modal.dataset.currentUserId === message.senderId;
        
        if (!isCurrentChat || document.hidden) {
            this.showMessageNotification(message);
            this.incrementUnreadCount(message.senderId);
        }

        // Add to UI if chat is open
        if (isCurrentChat) {
            const messagesContainer = document.getElementById('chat-messages');
            this.addMessageToChat(messagesContainer, {
                ...message,
                isOwn: false
            });
            
            // Mark as read
            this.markMessageAsRead(message.id);
        }
    }

    addMessageToChat(container, message) {
        // Remove welcome message if exists
        const welcome = container.querySelector('.chat-welcome');
        if (welcome) {
            welcome.remove();
        }

        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.isOwn ? 'own' : 'other'}`;
        messageEl.dataset.messageId = message.id;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const statusIcon = this.getMessageStatusIcon(message.status);
        
        messageEl.innerHTML = `
            <div class="message-content">
                ${!message.isOwn ? `<div class="sender">${message.senderNickname || 'Anonymous ' + message.senderAvatar}</div>` : ''}
                <div class="content">${this.formatMessageContent(message.content)}</div>
                <div class="message-meta">
                    <span class="time">${time}</span>
                    ${message.isOwn ? `<span class="status">${statusIcon}</span>` : ''}
                </div>
            </div>
        `;
        
        // Add animation
        messageEl.style.opacity = '0';
        messageEl.style.transform = 'translateY(20px)';
        container.appendChild(messageEl);
        
        // Animate in
        requestAnimationFrame(() => {
            messageEl.style.transition = 'opacity 0.3s, transform 0.3s';
            messageEl.style.opacity = '1';
            messageEl.style.transform = 'translateY(0)';
        });
        
        container.scrollTop = container.scrollHeight;
    }

    formatMessageContent(content) {
        // Basic message formatting
        let formatted = this.escapeHtml(content);
        
        // Convert URLs to links
        formatted = formatted.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );
        
        // Convert line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        
        // Basic emoji support (could be expanded)
        const emojiMap = {
            ':)': '😊',
            ':D': '😃',
            ':(': '😢',
            ':P': '😛',
            ';)': '😉',
            '<3': '❤️',
            ':thumbsup:': '👍',
            ':thumbsdown:': '👎'
        };
        
        Object.entries(emojiMap).forEach(([text, emoji]) => {
            formatted = formatted.replace(new RegExp(this.escapeRegex(text), 'g'), emoji);
        });
        
        return formatted;
    }

    getMessageStatusIcon(status) {
        const icons = {
            sending: '⏳',
            sent: '✓',
            delivered: '✓✓',
            read: '✓✓'
        };
        
        return icons[status] || '';
    }

    markMessageAsDelivered(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            const statusEl = messageEl.querySelector('.status');
            if (statusEl) {
                statusEl.textContent = '✓✓';
            }
        }
    }

    markMessageAsRead(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            const statusEl = messageEl.querySelector('.status');
            if (statusEl) {
                statusEl.textContent = '✓✓';
                statusEl.classList.add('read');
            }
        }
    }

    showTypingIndicator(userId, isTyping) {
        const modal = document.getElementById('chat-modal');
        const isCurrentChat = modal.dataset.currentUserId === userId;
        
        if (!isCurrentChat) return;

        const messagesContainer = document.getElementById('chat-messages');
        let typingEl = messagesContainer.querySelector('.typing-indicator');
        
        if (isTyping) {
            if (!typingEl) {
                typingEl = document.createElement('div');
                typingEl.className = 'typing-indicator';
                typingEl.innerHTML = `
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <div class="typing-text">typing...</div>
                `;
                messagesContainer.appendChild(typingEl);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        } else if (typingEl) {
            typingEl.remove();
        }
    }

    showMessageNotification(message) {
        const title = 'New Message';
        const body = `${message.senderNickname || 'Anonymous ' + message.senderAvatar}: ${message.content}`;
        
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title, {
                body: body,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-72x72.png',
                tag: 'hushhub-message',
                requireInteraction: false
            });
            
            notification.onclick = () => {
                window.focus();
                this.app.showScreen('main');
                this.app.switchTab('chat');
                notification.close();
            };
            
            setTimeout(() => notification.close(), 5000);
        }
        
        // Visual notification in app
        this.showInAppNotification(body);
    }

    showInAppNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'in-app-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">💬</span>
                <span class="notification-text">${this.escapeHtml(message)}</span>
            </div>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove after delay
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    addToMessageHistory(userId, message) {
        if (!this.messageHistory.has(userId)) {
            this.messageHistory.set(userId, []);
        }
        
        const history = this.messageHistory.get(userId);
        history.push(message);
        
        // Keep only last 100 messages per chat
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
    }

    incrementUnreadCount(userId) {
        const current = this.unreadCounts.get(userId) || 0;
        this.unreadCounts.set(userId, current + 1);
        this.updateUnreadBadges();
    }

    markChatAsRead(userId) {
        this.unreadCounts.set(userId, 0);
        this.updateUnreadBadges();
    }

    updateUnreadBadges() {
        // Update tab badge
        const chatTab = document.querySelector('[data-tab="chat"]');
        const totalUnread = Array.from(this.unreadCounts.values()).reduce((sum, count) => sum + count, 0);
        
        if (totalUnread > 0) {
            chatTab.innerHTML = `💬 Chat <span class="badge">${totalUnread}</span>`;
        } else {
            chatTab.innerHTML = '💬 Chat';
        }
    }

    generateMessageId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Initialize chat manager when app is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for app to be initialized
    const checkApp = setInterval(() => {
        if (window.app && window.app.socket) {
            window.chatManager = new ChatManager(window.app);
            
            // Override app's openChat method
            window.app.openChat = (userId, userName, userAvatar) => {
                window.chatManager.openChat(userId, userName, userAvatar);
            };
            
            // Override app's sendMessage method
            window.app.sendMessage = () => {
                window.chatManager.sendMessage();
            };
            
            clearInterval(checkApp);
        }
    }, 100);
});