const { Server } = require('socket.io');
const { createServer } = require('http');

// Store active users and their data (in production, use Redis or database)
let activeUsers = new Map();
let userSessions = new Map();
let activeThreads = new Map();
let activeGames = new Map();

// Utility functions
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

function getNearbyUsers(currentUser, radius = 50) {
    const nearby = [];
    
    for (const [userId, user] of activeUsers) {
        if (userId === currentUser.id || !user.location) continue;
        
        const distance = calculateDistance(
            currentUser.location.latitude,
            currentUser.location.longitude,
            user.location.latitude,
            user.location.longitude
        );
        
        if (distance <= radius) {
            nearby.push({
                id: user.id,
                nickname: user.nickname,
                isAnonymous: user.isAnonymous,
                avatar: user.avatar,
                distance: Math.round(distance),
                lastSeen: user.lastSeen
            });
        }
    }
    
    return nearby.sort((a, b) => a.distance - b.distance);
}

function generateAnonymousAvatar() {
    const avatars = ['🐸', '🦄', '🐱', '🐶', '🦊', '🐼', '🐨', '🦉', '🐰', '🐭'];
    return avatars[Math.floor(Math.random() * avatars.length)];
}

function generateUserId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Create HTTP server and Socket.io instance
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // User joins with nickname
    socket.on('join', (data) => {
        const userId = generateUserId();
        const user = {
            id: userId,
            socketId: socket.id,
            nickname: data.nickname,
            isAnonymous: data.isAnonymous || false,
            avatar: generateAnonymousAvatar(),
            location: null,
            lastSeen: Date.now(),
            joinedAt: Date.now()
        };

        activeUsers.set(userId, user);
        userSessions.set(socket.id, userId);
        
        socket.emit('joined', {
            userId: userId,
            user: {
                id: userId,
                nickname: user.nickname,
                isAnonymous: user.isAnonymous,
                avatar: user.avatar
            }
        });

        console.log(`User ${user.nickname} joined with ID: ${userId}`);
    });

    // Location update
    socket.on('location-update', (location) => {
        const userId = userSessions.get(socket.id);
        const user = activeUsers.get(userId);
        
        if (user) {
            user.location = {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                timestamp: location.timestamp
            };
            user.lastSeen = Date.now();
            
            // Get nearby users and emit to client
            const nearbyUsers = getNearbyUsers(user);
            socket.emit('nearby-users', nearbyUsers);
            
            // Notify nearby users about this user
            nearbyUsers.forEach(nearbyUser => {
                const nearbySocket = [...userSessions.entries()]
                    .find(([, id]) => id === nearbyUser.id)?.[0];
                
                if (nearbySocket) {
                    const socketInstance = io.sockets.sockets.get(nearbySocket);
                    if (socketInstance) {
                        const updatedNearby = getNearbyUsers(activeUsers.get(nearbyUser.id));
                        socketInstance.emit('nearby-users', updatedNearby);
                    }
                }
            });
        }
    });

    // Direct message
    socket.on('send-message', (data) => {
        const senderId = userSessions.get(socket.id);
        const sender = activeUsers.get(senderId);
        
        if (!sender) return;

        const recipientSocket = [...userSessions.entries()]
            .find(([, id]) => id === data.recipientId)?.[0];
        
        if (recipientSocket) {
            const message = {
                id: generateUserId(),
                senderId: senderId,
                senderNickname: data.isAnonymous ? null : sender.nickname,
                senderAvatar: sender.avatar,
                content: data.message,
                timestamp: Date.now(),
                isAnonymous: data.isAnonymous
            };

            // Send to recipient
            io.to(recipientSocket).emit('new-message', message);
            
            // Send confirmation to sender
            socket.emit('message-sent', {
                messageId: message.id,
                recipientId: data.recipientId
            });
        }
    });

    // Create thread
    socket.on('create-thread', (data) => {
        const creatorId = userSessions.get(socket.id);
        const creator = activeUsers.get(creatorId);
        
        if (!creator || !creator.location) return;

        const threadId = generateUserId();
        const thread = {
            id: threadId,
            title: data.title,
            content: data.content,
            creatorId: creatorId,
            creatorNickname: data.isAnonymous ? null : creator.nickname,
            creatorAvatar: creator.avatar,
            isAnonymous: data.isAnonymous,
            location: creator.location,
            createdAt: Date.now(),
            replies: [],
            participants: new Set([creatorId])
        };

        activeThreads.set(threadId, thread);

        // Notify nearby users about new thread
        const nearbyUsers = getNearbyUsers(creator);
        nearbyUsers.forEach(nearbyUser => {
            const nearbySocket = [...userSessions.entries()]
                .find(([, id]) => id === nearbyUser.id)?.[0];
            
            if (nearbySocket) {
                io.to(nearbySocket).emit('new-thread', {
                    id: thread.id,
                    title: thread.title,
                    content: thread.content,
                    creatorNickname: thread.creatorNickname,
                    creatorAvatar: thread.creatorAvatar,
                    isAnonymous: thread.isAnonymous,
                    createdAt: thread.createdAt,
                    repliesCount: thread.replies.length,
                    participantsCount: thread.participants.size
                });
            }
        });

        // Send confirmation to creator
        socket.emit('thread-created', { threadId: threadId });
    });

    // Join thread
    socket.on('join-thread', (threadId) => {
        const userId = userSessions.get(socket.id);
        const thread = activeThreads.get(threadId);
        
        if (thread && userId) {
            thread.participants.add(userId);
            socket.join(`thread_${threadId}`);
            
            // Send thread details and replies
            socket.emit('thread-details', {
                id: thread.id,
                title: thread.title,
                content: thread.content,
                creatorNickname: thread.creatorNickname,
                creatorAvatar: thread.creatorAvatar,
                isAnonymous: thread.isAnonymous,
                createdAt: thread.createdAt,
                replies: thread.replies.map(reply => ({
                    id: reply.id,
                    content: reply.content,
                    authorNickname: reply.authorNickname,
                    authorAvatar: reply.authorAvatar,
                    isAnonymous: reply.isAnonymous,
                    timestamp: reply.timestamp
                }))
            });
        }
    });

    // Reply to thread
    socket.on('reply-thread', (data) => {
        const userId = userSessions.get(socket.id);
        const user = activeUsers.get(userId);
        const thread = activeThreads.get(data.threadId);
        
        if (!thread || !user) return;

        const reply = {
            id: generateUserId(),
            content: data.content,
            authorId: userId,
            authorNickname: data.isAnonymous ? null : user.nickname,
            authorAvatar: user.avatar,
            isAnonymous: data.isAnonymous,
            timestamp: Date.now()
        };

        thread.replies.push(reply);
        thread.participants.add(userId);

        // Notify all thread participants
        io.to(`thread_${data.threadId}`).emit('thread-reply', reply);
    });

    // Toggle anonymous mode
    socket.on('toggle-anonymous', () => {
        const userId = userSessions.get(socket.id);
        const user = activeUsers.get(userId);
        
        if (user) {
            user.isAnonymous = !user.isAnonymous;
            socket.emit('anonymous-toggled', { isAnonymous: user.isAnonymous });
        }
    });

    // Get nearby threads
    socket.on('get-nearby-threads', () => {
        const userId = userSessions.get(socket.id);
        const user = activeUsers.get(userId);
        
        if (!user || !user.location) return;

        const nearbyThreads = [];
        
        for (const [threadId, thread] of activeThreads) {
            const distance = calculateDistance(
                user.location.latitude,
                user.location.longitude,
                thread.location.latitude,
                thread.location.longitude
            );
            
            if (distance <= 50) { // 50 meter radius
                nearbyThreads.push({
                    id: thread.id,
                    title: thread.title,
                    content: thread.content,
                    creatorNickname: thread.creatorNickname,
                    creatorAvatar: thread.creatorAvatar,
                    isAnonymous: thread.isAnonymous,
                    createdAt: thread.createdAt,
                    repliesCount: thread.replies.length,
                    participantsCount: thread.participants.size,
                    distance: Math.round(distance)
                });
            }
        }
        
        socket.emit('nearby-threads', nearbyThreads.sort((a, b) => b.createdAt - a.createdAt));
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const userId = userSessions.get(socket.id);
        
        if (userId) {
            const user = activeUsers.get(userId);
            if (user) {
                console.log(`User ${user.nickname} disconnected`);
                
                // Remove from nearby users for all other users
                if (user.location) {
                    const nearbyUsers = getNearbyUsers(user);
                    nearbyUsers.forEach(nearbyUser => {
                        const nearbySocket = [...userSessions.entries()]
                            .find(([, id]) => id === nearbyUser.id)?.[0];
                        
                        if (nearbySocket) {
                            const socketInstance = io.sockets.sockets.get(nearbySocket);
                            if (socketInstance) {
                                const updatedNearby = getNearbyUsers(activeUsers.get(nearbyUser.id));
                                socketInstance.emit('nearby-users', updatedNearby);
                            }
                        }
                    });
                }
            }
            
            activeUsers.delete(userId);
            userSessions.delete(socket.id);
        }
        
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

// Export for Vercel
module.exports = (req, res) => {
    if (req.url.startsWith('/socket.io/')) {
        // Handle Socket.io connections
        httpServer.emit('request', req, res);
    } else {
        res.status(404).json({ error: 'Not found' });
    }
};