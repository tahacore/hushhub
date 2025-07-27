const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const GameEngine = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    transports: ['websocket', 'polling'] // Allow fallback to polling
});

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Store active users and their locations
const activeUsers = new Map();
const userSessions = new Map();
const activeThreads = new Map();
const activeGames = new Map();

// Initialize Game Engine
const gameEngine = new GameEngine();

// Middleware
app.use(helmet({
    contentSecurityPolicy: NODE_ENV === 'production' ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            imgSrc: ["'self'", "data:", "blob:"],
            scriptSrcAttr: ["'none'"]
        }
    } : false,
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json());

// Add cache control headers to prevent caching during development/updates
app.use((req, res, next) => {
    if (NODE_ENV === 'production') {
        // Prevent caching of HTML, JS, and CSS files in production for immediate updates
        if (req.url.endsWith('.html') || req.url.endsWith('.js') || req.url.endsWith('.css') || req.url === '/') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
    next();
});

app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        users: activeUsers.size,
        threads: activeThreads.size,
        games: gameEngine.getAllActiveSessions().length,
        timestamp: new Date().toISOString()
    });
});

// Utility functions
function broadcastGameStateToRoom(gameSession) {
    if (!gameSession || !gameSession.id) {
        console.error('Cannot broadcast - invalid game session');
        return;
    }
    
    console.log(`📡 Broadcasting complete game state to room game_${gameSession.id}`);
    console.log(`📡 Broadcasting to ${gameSession.players.length} players:`, gameSession.players.map(p => p.nickname));
    
    // Enhanced state packet with sequence number and acknowledgment requirement
    const statePacket = {
        id: generateStateId(),
        gameId: gameSession.id,
        gameSession: gameSession,
        players: gameSession.players,
        status: gameSession.status,
        gameState: gameSession.gameState,
        totalPlayers: gameSession.players.length,
        timestamp: Date.now(),
        sequence: gameSession.stateSequence,
        requiresAck: true
    };
    
    // Track acknowledgments for this broadcast
    const ackTracker = {
        id: statePacket.id,
        gameId: gameSession.id,
        expectedAcks: gameSession.players.filter(p => p.isConnected).length,
        receivedAcks: new Set(),
        broadcastTime: Date.now(),
        retryCount: 0
    };
    
    gameSession.acknowledgments.set(statePacket.id, ackTracker);
    
    // Broadcast to all connected players with acknowledgment requirement
    gameSession.players.forEach(player => {
        if (player.isConnected) {
            const socketId = getPlayerSocketId(player.id);
            if (socketId) {
                io.to(socketId).emit('game-state-sync', statePacket, (ack) => {
                    handleGameStateAcknowledgment(statePacket.id, player.id, ack);
                });
            }
        }
    });
    
    // Set timeout for retrying failed acknowledgments
    setTimeout(() => {
        retryFailedGameStateBroadcast(statePacket.id);
    }, 3000); // 3 second timeout
    
    console.log(`📡 Game state broadcasted successfully for game ${gameSession.id} with sequence ${gameSession.stateSequence}`);
}

function generateStateId() {
    return 'state_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function handleGameStateAcknowledgment(stateId, playerId, ack) {
    // Find the game session that contains this state broadcast
    for (const [gameId, gameSession] of activeGames) {
        const ackTracker = gameSession.acknowledgments.get(stateId);
        if (ackTracker) {
            if (ack && ack.received) {
                ackTracker.receivedAcks.add(playerId);
                console.log(`✅ Received ack from player ${playerId} for state ${stateId} (${ackTracker.receivedAcks.size}/${ackTracker.expectedAcks})`);
                
                // Check if all acknowledgments received
                if (ackTracker.receivedAcks.size >= ackTracker.expectedAcks) {
                    console.log(`🎯 All acknowledgments received for state ${stateId}`);
                    gameSession.acknowledgments.delete(stateId);
                }
            } else {
                console.warn(`❌ Failed ack from player ${playerId} for state ${stateId}`);
            }
            break;
        }
    }
}

function retryFailedGameStateBroadcast(stateId) {
    // Find the game session and retry failed broadcasts
    for (const [gameId, gameSession] of activeGames) {
        const ackTracker = gameSession.acknowledgments.get(stateId);
        if (ackTracker && ackTracker.retryCount < 3) {
            const missingPlayers = gameSession.players.filter(p => 
                p.isConnected && !ackTracker.receivedAcks.has(p.id)
            );
            
            if (missingPlayers.length > 0) {
                console.log(`🔄 Retrying state broadcast ${stateId} for ${missingPlayers.length} players (attempt ${ackTracker.retryCount + 1})`);
                
                const statePacket = {
                    id: stateId,
                    gameId: gameSession.id,
                    gameSession: gameSession,
                    players: gameSession.players,
                    status: gameSession.status,
                    gameState: gameSession.gameState,
                    totalPlayers: gameSession.players.length,
                    timestamp: Date.now(),
                    sequence: gameSession.stateSequence,
                    requiresAck: true,
                    isRetry: true
                };
                
                missingPlayers.forEach(player => {
                    const socketId = getPlayerSocketId(player.id);
                    if (socketId) {
                        io.to(socketId).emit('game-state-sync', statePacket, (ack) => {
                            handleGameStateAcknowledgment(stateId, player.id, ack);
                        });
                    }
                });
                
                ackTracker.retryCount++;
                
                // Schedule another retry if needed
                if (ackTracker.retryCount < 3) {
                    setTimeout(() => {
                        retryFailedGameStateBroadcast(stateId);
                    }, 5000); // 5 second retry interval
                }
            } else {
                // All players have acknowledged, clean up
                gameSession.acknowledgments.delete(stateId);
            }
        } else if (ackTracker && ackTracker.retryCount >= 3) {
            // Max retries reached, give up and clean up
            console.warn(`⚠️ Max retries reached for state ${stateId}, giving up`);
            gameSession.acknowledgments.delete(stateId);
        }
    }
}

function getPlayerSocketId(playerId) {
    // Find socket ID for a player
    for (const [socketId, userId] of userSessions) {
        if (userId === playerId) {
            return socketId;
        }
    }
    return null;
}

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
    
    // Adaptive radius based on location accuracy and device type
    let adaptiveRadius = radius;
    if (currentUser.location && currentUser.location.accuracy) {
        // If accuracy is poor (>100m), increase radius significantly
        if (currentUser.location.accuracy > 100) {
            adaptiveRadius = Math.max(500, currentUser.location.accuracy * 2); // Desktop/poor GPS
        } else if (currentUser.location.accuracy > 50) {
            adaptiveRadius = 200; // Moderate accuracy
        } else {
            adaptiveRadius = 50; // Good GPS accuracy (mobile)
        }
    }
    
    console.log(`Finding nearby users for ${currentUser.nickname} with radius: ${adaptiveRadius}m (accuracy: ${currentUser.location?.accuracy}m)`);
    
    for (const [userId, user] of activeUsers) {
        if (userId === currentUser.id || !user.location) continue;
        
        const distance = calculateDistance(
            currentUser.location.latitude,
            currentUser.location.longitude,
            user.location.latitude,
            user.location.longitude
        );
        
        // Use adaptive radius for proximity detection
        if (distance <= adaptiveRadius) {
            nearby.push({
                id: user.id,
                nickname: user.nickname,
                isAnonymous: user.isAnonymous,
                avatar: user.avatar,
                distance: Math.round(distance),
                lastSeen: user.lastSeen,
                deviceType: user.location.accuracy > 100 ? 'desktop' : 'mobile' // Estimate device type
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

// Socket.IO connection handling
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
        
        console.log('Message received:', { 
            senderId, 
            senderNickname: sender?.nickname,
            recipientId: data.recipientId, 
            message: data.message 
        });
        
        if (!sender) {
            console.error('Sender not found:', senderId);
            return;
        }

        const recipientSocket = [...userSessions.entries()]
            .find(([, id]) => id === data.recipientId)?.[0];
        
        console.log('Recipient socket:', recipientSocket);
        console.log('Active sessions:', Array.from(userSessions.entries()));
        
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

            console.log('Sending message to recipient:', message);
            
            // Send to recipient
            io.to(recipientSocket).emit('new-message', message);
            
            // Send confirmation to sender
            socket.emit('message-sent', {
                messageId: message.id,
                recipientId: data.recipientId
            });
            
            console.log('Message sent successfully');
        } else {
            console.error('Recipient socket not found for recipient ID:', data.recipientId);
            socket.emit('message-error', {
                error: 'Recipient not found or offline'
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

    // Update nickname
    socket.on('update-nickname', (data) => {
        const userId = userSessions.get(socket.id);
        const user = activeUsers.get(userId);
        
        if (user && data.nickname) {
            const newNickname = data.nickname.trim().substring(0, 20); // Limit length
            user.nickname = newNickname;
            user.lastSeen = Date.now();
            
            console.log(`User ${userId} updated nickname to: ${newNickname}`);
            
            // Notify nearby users about the nickname change
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
            
            // Send confirmation to user
            socket.emit('nickname-updated', { nickname: newNickname });
        }
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

    // ===============================
    // GAME-RELATED EVENT HANDLERS
    // ===============================

    // Create new game session
    socket.on('create-game', (gameConfig) => {
        const userId = userSessions.get(socket.id);
        const user = activeUsers.get(userId);
        
        if (!user || !user.location) {
            socket.emit('game-error', { error: 'Location required to create games' });
            return;
        }

        try {
            const gameSession = gameEngine.createGameSession(gameConfig, user);
            
            console.log(`Game created: ${gameSession.id} by ${user.nickname}`);
            
            // IMPORTANT: Creator must join the game room immediately
            socket.join(`game_${gameSession.id}`);
            console.log(`Creator ${user.nickname} joined room game_${gameSession.id}`);
            
            // Send confirmation to creator with complete game state
            socket.emit('game-created', {
                gameId: gameSession.id,
                session: gameSession
            });
            
            // Notify nearby users about new game
            const nearbyUsers = getNearbyUsers(user);
            nearbyUsers.forEach(nearbyUser => {
                const nearbySocket = [...userSessions.entries()]
                    .find(([, id]) => id === nearbyUser.id)?.[0];
                
                if (nearbySocket) {
                    const socketInstance = io.sockets.sockets.get(nearbySocket);
                    if (socketInstance) {
                        socketInstance.emit('new-game-available', {
                            id: gameSession.id,
                            type: gameSession.type,
                            title: gameSession.title,
                            creator: gameSession.creatorId === nearbyUser.id ? null : {
                                nickname: user.isAnonymous ? null : user.nickname,
                                avatar: user.avatar
                            },
                            players: gameSession.players.length,
                            maxPlayers: gameSession.maxPlayers,
                            status: gameSession.status,
                            distance: nearbyUser.distance
                        });
                    }
                }
            });
            
        } catch (error) {
            console.error('Error creating game:', error);
            socket.emit('game-error', { error: error.message });
        }
    });

    // Join existing game session
    socket.on('join-game', (data) => {
        const { gameId } = data;
        const userId = userSessions.get(socket.id);
        const user = activeUsers.get(userId);
        
        if (!user) {
            socket.emit('game-error', { error: 'User not found' });
            return;
        }

        try {
            const gameSession = gameEngine.joinGameSession(gameId, user);
            
            console.log(`User ${user.nickname} joined game ${gameId}`);
            
            // Join socket room for this game
            socket.join(`game_${gameId}`);
            console.log(`Player ${user.nickname} joined room game_${gameId}`);
            
            // Send complete game session to the player who joined
            socket.emit('game-joined', {
                gameId: gameSession.id,
                session: gameSession,
                playerData: gameSession.players.find(p => p.id === userId)
            });
            
            // CRITICAL: Broadcast complete game state to ALL players in the room
            // This ensures everyone has the same synchronized view
            io.to(`game_${gameId}`).emit('player-joined', {
                gameId: gameSession.id,
                player: gameSession.players.find(p => p.id === userId),
                game: gameSession, // Include complete game state
                totalPlayers: gameSession.players.length,
                players: gameSession.players // Full player list for synchronization
            });
            
            // Also broadcast complete game state for extra synchronization
            broadcastGameStateToRoom(gameSession);
            
            console.log(`Broadcasted player-joined to room game_${gameId} with ${gameSession.players.length} players`);
            
            // If game started automatically, notify about game start
            if (gameSession.status === 'active') {
                io.to(`game_${gameId}`).emit('game-started', {
                    gameId: gameSession.id,
                    gameState: gameSession.gameState,
                    gameSession: gameSession,
                    players: gameSession.players
                });
                console.log(`Game ${gameId} auto-started with ${gameSession.players.length} players`);
            }
            
        } catch (error) {
            console.error('Error joining game:', error);
            socket.emit('game-error', { error: error.message });
        }
    });

    // Leave game session
    socket.on('leave-game', (data) => {
        const { gameId } = data;
        const userId = userSessions.get(socket.id);
        
        if (!userId) return;

        try {
            const gameSession = gameEngine.leaveGameSession(gameId, userId);
            
            if (gameSession) {
                console.log(`User ${userId} left game ${gameId}`);
                
                // Leave socket room
                socket.leave(`game_${gameId}`);
                
                // Notify remaining players
                io.to(`game_${gameId}`).emit('player-left', {
                    gameId: gameSession.id,
                    playerId: userId,
                    remainingPlayers: gameSession.players.length,
                    gameStatus: gameSession.status
                });
                
                // If game was cancelled or ended due to insufficient players
                if (gameSession.status === 'cancelled' || gameSession.status === 'finished') {
                    io.to(`game_${gameId}`).emit('game-ended', {
                        gameId: gameSession.id,
                        reason: gameSession.status === 'cancelled' ? 'Game cancelled' : 'Insufficient players',
                        finalState: gameSession.gameState
                    });
                }
            }
        } catch (error) {
            console.error('Error leaving game:', error);
            socket.emit('game-error', { error: error.message });
        }
    });

    // Set player ready status
    socket.on('player-ready', (data) => {
        const { gameId, isReady } = data;
        const userId = userSessions.get(socket.id);
        
        if (!userId) return;

        try {
            const gameSession = gameEngine.setPlayerReady(gameId, userId, isReady);
            
            if (gameSession) {
                // Notify all players about ready status change
                io.to(`game_${gameId}`).emit('player-ready', {
                    gameId: gameSession.id,
                    playerId: userId,
                    isReady: isReady,
                    allReady: gameSession.players.every(p => p.isReady)
                });
                
                // If game started automatically due to all players being ready
                if (gameSession.status === 'active') {
                    io.to(`game_${gameId}`).emit('game-started', {
                        gameId: gameSession.id,
                        gameState: gameSession.gameState,
                        players: gameSession.players
                    });
                }
            }
        } catch (error) {
            console.error('Error setting player ready:', error);
            socket.emit('game-error', { error: error.message });
        }
    });

    // Manual game start (for creator)
    socket.on('start-game', (data) => {
        const { gameId } = data;
        const userId = userSessions.get(socket.id);
        
        if (!userId) return;

        try {
            const gameSession = gameEngine.getGameSession(gameId);
            
            if (!gameSession) {
                socket.emit('game-error', { error: 'Game not found' });
                return;
            }
            
            if (gameSession.creatorId !== userId) {
                socket.emit('game-error', { error: 'Only game creator can start manually' });
                return;
            }
            
            const startedSession = gameEngine.startGame(gameId);
            
            if (startedSession) {
                console.log(`Manual game start: ${gameId} by creator ${userId}`);
                
                // Broadcast complete game state to ALL players in the room
                io.to(`game_${gameId}`).emit('game-started', {
                    gameId: startedSession.id,
                    gameState: startedSession.gameState,
                    gameSession: startedSession, // Include complete session for synchronization
                    players: startedSession.players,
                    status: startedSession.status,
                    startedAt: startedSession.startedAt
                });
                
                console.log(`Broadcasted game-started to room game_${gameId} for ${startedSession.players.length} players`);
                
                // Also broadcast complete game state for synchronization
                broadcastGameStateToRoom(startedSession);
            } else {
                socket.emit('game-error', { error: 'Could not start game' });
            }
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('game-error', { error: error.message });
        }
    });

    // Process game move
    socket.on('game-move', (data) => {
        const { gameId, move } = data;
        const userId = userSessions.get(socket.id);
        
        if (!userId) return;

        try {
            const result = gameEngine.processGameMove(gameId, userId, move);
            const { session, moveResult, winResult } = result;
            
            console.log(`Game move processed: ${gameId}, player: ${userId}, move:`, move);
            
            // Broadcast move to all players
            io.to(`game_${gameId}`).emit('game-move', {
                gameId: session.id,
                playerId: userId,
                move: move,
                moveResult: moveResult,
                gameState: session.gameState,
                currentTurn: session.gameState.currentTurn
            });
            
            // If game ended, broadcast game end
            if (winResult.hasWinner) {
                io.to(`game_${gameId}`).emit('game-ended', {
                    gameId: session.id,
                    winner: winResult.winner,
                    winCondition: winResult.condition,
                    finalState: session.gameState,
                    players: session.players
                });
            }
            
        } catch (error) {
            console.error('Error processing game move:', error);
            socket.emit('game-error', { error: error.message });
        }
    });

    // Get nearby games
    socket.on('get-nearby-games', () => {
        const userId = userSessions.get(socket.id);
        const user = activeUsers.get(userId);
        
        if (!user || !user.location) {
            socket.emit('nearby-games', []);
            return;
        }

        try {
            const nearbyGames = gameEngine.getNearbyGameSessions(user.location);
            
            // Filter out ended/cancelled games and format for client
            const formattedGames = nearbyGames
                .filter(game => game.status !== 'cancelled' && game.status !== 'finished')
                .map(game => ({
                    id: game.id,
                    type: game.type,
                    title: game.title,
                    status: game.status,
                    players: game.players.map(p => ({
                        id: p.id,
                        nickname: p.isAnonymous ? null : p.nickname,
                        avatar: p.avatar,
                        isAnonymous: p.isAnonymous,
                        isReady: p.isReady
                    })),
                    maxPlayers: game.maxPlayers,
                    minPlayers: game.minPlayers,
                    createdAt: game.createdAt,
                    distance: game.distance,
                    isCreator: game.creatorId === userId,
                    canJoin: game.status === 'waiting' && game.players.length < game.maxPlayers,
                    estimatedDuration: gameEngine.gameTypes[game.type]?.estimatedDuration || 'Unknown'
                }));
            
            console.log(`Found ${formattedGames.length} active nearby games for user ${user.nickname}`);
            socket.emit('nearby-games', formattedGames);
            
        } catch (error) {
            console.error('Error getting nearby games:', error);
            socket.emit('nearby-games', []);
        }
    });

    // Get game session details
    socket.on('get-game-details', (data) => {
        const { gameId } = data;
        const userId = userSessions.get(socket.id);
        
        if (!userId) return;

        try {
            const gameSession = gameEngine.getGameSession(gameId);
            
            if (!gameSession) {
                socket.emit('game-error', { error: 'Game not found' });
                return;
            }
            
            // Check if user is in the game or nearby
            const isPlayer = gameSession.players.some(p => p.id === userId);
            const user = activeUsers.get(userId);
            
            if (!isPlayer && user && user.location) {
                const distance = gameEngine.calculateDistance(
                    user.location.latitude,
                    user.location.longitude,
                    gameSession.creatorLocation.latitude,
                    gameSession.creatorLocation.longitude
                );
                
                if (distance > 50) { // 50 meter limit
                    socket.emit('game-error', { error: 'Game too far away' });
                    return;
                }
            }
            
            socket.emit('game-details', {
                gameId: gameSession.id,
                session: gameSession,
                isPlayer: isPlayer
            });
            
        } catch (error) {
            console.error('Error getting game details:', error);
            socket.emit('game-error', { error: error.message });
        }
    });

    // End game session (for creator)
    socket.on('end-game', (data) => {
        const { gameId } = data;
        const userId = userSessions.get(socket.id);
        
        if (!userId) return;

        try {
            const gameSession = gameEngine.getGameSession(gameId);
            
            if (!gameSession) {
                socket.emit('game-error', { error: 'Game not found' });
                return;
            }
            
            if (gameSession.creatorId !== userId) {
                socket.emit('game-error', { error: 'Only game creator can end the session' });
                return;
            }
            
            console.log(`Game ended by creator: ${gameId}`);
            
            // Mark game as cancelled
            gameSession.status = 'cancelled';
            gameSession.finishedAt = Date.now();
            
            // Notify all players in the room
            io.to(`game_${gameId}`).emit('game-ended', {
                gameId: gameSession.id,
                reason: 'Game ended by creator',
                finalState: gameSession.gameState
            });
            
            console.log(`Notified all players that game ${gameId} was ended`);
            
        } catch (error) {
            console.error('Error ending game:', error);
            socket.emit('game-error', { error: error.message });
        }
    });

    // ===============================
    // END GAME EVENT HANDLERS
    // ===============================

    // Handle disconnect
    socket.on('disconnect', (reason) => {
        const userId = userSessions.get(socket.id);
        
        if (userId) {
            const user = activeUsers.get(userId);
            if (user) {
                console.log(`User ${user.nickname} disconnected (reason: ${reason}) - removing immediately`);
                
                // Get nearby users before removing this user
                const nearbyUsers = user.location ? getNearbyUsers(user) : [];
                
                // IMMEDIATELY remove user from active users
                activeUsers.delete(userId);
                userSessions.delete(socket.id);
                
                console.log(`✅ User ${user.nickname} removed immediately from active users`);
                
                // Notify nearby users that this user has been removed
                nearbyUsers.forEach(nearbyUser => {
                    const nearbySocket = [...userSessions.entries()]
                        .find(([, id]) => id === nearbyUser.id)?.[0];
                    
                    if (nearbySocket) {
                        const socketInstance = io.sockets.sockets.get(nearbySocket);
                        if (socketInstance) {
                            // Send updated nearby users list without the disconnected user
                            const updatedNearby = getNearbyUsers(activeUsers.get(nearbyUser.id));
                            socketInstance.emit('nearby-users', updatedNearby);
                            console.log(`📡 Sent updated nearby users to ${nearbyUser.id} (removed ${user.nickname})`);
                        }
                    }
                });
            }
            
            // Enhanced game cleanup with graceful disconnection handling
            if (userId) {
                const activeSessions = gameEngine.getAllActiveSessions();
                activeSessions.forEach(gameSession => {
                    const isInGame = gameSession.players.some(p => p.id === userId);
                    if (isInGame) {
                        try {
                            console.log(`🔌 Player ${userId} disconnected from game ${gameSession.id}`);
                            
                            // Handle disconnection gracefully instead of immediately removing player
                            const updatedSession = gameEngine.handlePlayerDisconnection(userId, gameSession.id);
                            
                            if (updatedSession) {
                                // Leave socket rooms for this game
                                socket.leave(`game_${gameSession.id}`);
                                
                                // Check if game should continue or be paused
                                const connectedPlayers = gameEngine.getConnectedPlayers(gameSession.id);
                                
                                if (connectedPlayers.length === 0) {
                                    // All players disconnected, pause the game
                                    console.log(`⏸️ All players disconnected from game ${gameSession.id}, pausing game`);
                                    
                                    // Broadcast game paused state (in case anyone reconnects)
                                    io.to(`game_${gameSession.id}`).emit('game-paused', {
                                        gameId: gameSession.id,
                                        reason: 'All players disconnected',
                                        canResume: true,
                                        pausedAt: Date.now()
                                    });
                                    
                                } else if (gameSession.status === 'active' && connectedPlayers.length < gameSession.minPlayers) {
                                    // Not enough connected players for active game, pause
                                    console.log(`⏸️ Insufficient connected players in game ${gameSession.id}, pausing game`);
                                    
                                    io.to(`game_${gameSession.id}`).emit('game-paused', {
                                        gameId: gameSession.id,
                                        reason: 'Insufficient connected players',
                                        connectedPlayers: connectedPlayers.length,
                                        requiredPlayers: gameSession.minPlayers,
                                        canResume: true,
                                        pausedAt: Date.now()
                                    });
                                    
                                } else {
                                    // Game can continue, notify remaining players
                                    io.to(`game_${gameSession.id}`).emit('player-disconnected', {
                                        gameId: gameSession.id,
                                        playerId: userId,
                                        remainingPlayers: connectedPlayers.length,
                                        gameStatus: gameSession.status,
                                        reason: 'Player disconnected temporarily',
                                        currentTurn: gameSession.gameState?.currentTurn
                                    });
                                    
                                    // Broadcast updated game state
                                    broadcastGameStateToRoom(updatedSession);
                                }
                                
                                // For non-game users, user is already removed above
                                // For game users, handle gracefully but don't delay cleanup
                            }
                        } catch (error) {
                            console.error('Error handling game cleanup on disconnect:', error);
                        }
                    }
                });
            }
        }
        
        console.log(`Socket disconnected: ${socket.id} (reason: ${reason})`);
    });

    // Add reconnection handler
    socket.on('reconnect-game', (data) => {
        const { gameId } = data;
        const userId = userSessions.get(socket.id);
        
        if (!userId || !gameId) {
            socket.emit('reconnect-error', { error: 'Invalid reconnection data' });
            return;
        }
        
        console.log(`🔄 Player ${userId} attempting to reconnect to game ${gameId}`);
        
        try {
            const gameSession = gameEngine.handlePlayerReconnection(userId, gameId);
            
            if (gameSession) {
                console.log(`✅ Player ${userId} successfully reconnected to game ${gameId}`);
                
                // Rejoin socket room
                socket.join(`game_${gameId}`);
                
                // Send current game state
                socket.emit('game-state-recovery', {
                    gameId: gameSession.id,
                    gameSession: gameSession,
                    isReconnection: true,
                    yourTurn: gameSession.gameState?.currentTurn === userId,
                    reconnectedAt: Date.now()
                });
                
                // Notify other players about reconnection
                socket.to(`game_${gameId}`).emit('player-reconnected', {
                    gameId: gameSession.id,
                    playerId: userId,
                    player: gameSession.players.find(p => p.id === userId),
                    reconnectedAt: Date.now()
                });
                
                // Check if game can resume
                const connectedPlayers = gameEngine.getConnectedPlayers(gameId);
                if (connectedPlayers.length >= gameSession.minPlayers && gameSession.status === 'active') {
                    io.to(`game_${gameId}`).emit('game-resumed', {
                        gameId: gameSession.id,
                        connectedPlayers: connectedPlayers.length,
                        resumedAt: Date.now()
                    });
                }
                
                // Broadcast updated game state
                broadcastGameStateToRoom(gameSession);
                
            } else {
                socket.emit('reconnect-error', { 
                    error: 'Game not found or player not in game',
                    gameId: gameId 
                });
            }
        } catch (error) {
            console.error('Error handling game reconnection:', error);
            socket.emit('reconnect-error', { 
                error: error.message,
                gameId: gameId 
            });
        }
    });
});

// Cleanup functions for disconnected players and offline users
function cleanupDisconnectedPlayer(playerId, gameId) {
    const gameSession = gameEngine.getGameSession(gameId);
    if (!gameSession) return;
    
    const player = gameSession.players.find(p => p.id === playerId);
    if (player && !player.isConnected) {
        console.log(`🧹 Cleaning up disconnected player ${playerId} from game ${gameId} after grace period`);
        
        // Remove player from game after grace period
        const updatedSession = gameEngine.leaveGameSession(gameId, playerId);
        if (updatedSession) {
            // Notify remaining players
            io.to(`game_${gameId}`).emit('player-left', {
                gameId: gameId,
                playerId: playerId,
                remainingPlayers: updatedSession.players.length,
                gameStatus: updatedSession.status,
                reason: 'Player did not reconnect'
            });
            
            // If game was cancelled or ended due to player leaving
            if (updatedSession.status === 'cancelled' || updatedSession.status === 'finished') {
                io.to(`game_${gameId}`).emit('game-ended', {
                    gameId: gameId,
                    reason: updatedSession.status === 'cancelled' ? 'Game cancelled' : 'Insufficient players',
                    finalState: updatedSession.gameState
                });
            } else {
                // Broadcast updated game state
                broadcastGameStateToRoom(updatedSession);
            }
        }
    }
}

function cleanupOfflineUser(userId) {
    const user = activeUsers.get(userId);
    if (user && !user.isOnline) {
        console.log(`🧹 Cleaning up offline user ${userId} after grace period`);
        activeUsers.delete(userId);
        
        // Remove from any remaining socket sessions
        for (const [socketId, uId] of userSessions) {
            if (uId === userId) {
                userSessions.delete(socketId);
                break;
            }
        }
    }
}

// Cleanup old threads and games periodically
setInterval(() => {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours
    
    // Clean up old threads
    for (const [threadId, thread] of activeThreads) {
        if (now - thread.createdAt > maxAge) {
            activeThreads.delete(threadId);
        }
    }
    
    // Clean up old games using game engine
    gameEngine.cleanupOldSessions();
    
    // Clean up inactive users (no location update for 5 minutes)
    for (const [userId, user] of activeUsers) {
        if (now - user.lastSeen > 5 * 60 * 1000) {
            activeUsers.delete(userId);
            // Find and remove from userSessions
            for (const [socketId, uId] of userSessions) {
                if (uId === userId) {
                    userSessions.delete(socketId);
                    break;
                }
            }
        }
    }
}, 10 * 60 * 1000); // Run every 10 minutes

// Start server
server.listen(PORT, () => {
    console.log(`🤫 HushHub server running on port ${PORT}`);
    console.log(`📍 Location-based chat server ready`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    if (NODE_ENV === 'development') {
        console.log(`🔗 Local URL: http://localhost:${PORT}`);
    }
});