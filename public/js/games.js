// HushHub Mini-Game Platform Manager
class GameManager {
    constructor(app) {
        this.app = app;
        this.currentGameSession = null;
        this.gameInterface = null;
        this.gameTypes = {
            "tic-tac-toe": {
                name: "Tic Tac Toe",
                icon: "⭕",
                description: "Classic 3x3 grid strategy game",
                minPlayers: 2,
                maxPlayers: 2,
                estimatedDuration: "2-5 minutes",
                category: "strategy",
                difficulty: "easy",
                color: "#6366f1",
                gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                preview: "🟢❌⭕\n❌⭕🟢\n⭕🟢❌"
            },
            "rock-paper-scissors": {
                name: "Rock Paper Scissors", 
                icon: "✂️",
                description: "Best of 3 rounds classic game",
                minPlayers: 2,
                maxPlayers: 2,
                estimatedDuration: "1-2 minutes",
                category: "chance",
                difficulty: "easy",
                color: "#10b981",
                gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
                preview: "🗿 vs ✂️\n📄 vs 🗿\n✂️ vs 📄"
            },
            "math-quiz": {
                name: "Quick Math",
                icon: "🧮", 
                description: "Fast-paced math challenges",
                minPlayers: 1,
                maxPlayers: 8,
                estimatedDuration: "3-5 minutes",
                category: "knowledge",
                difficulty: "medium",
                color: "#f59e0b",
                gradient: "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)",
                preview: "12 × 7 = ?\nA) 84  B) 74\nC) 94  D) 64"
            },
            "word-association": {
                name: "Word Chain",
                icon: "🔤",
                description: "Creative word building together", 
                minPlayers: 2,
                maxPlayers: 6,
                estimatedDuration: "5-10 minutes",
                category: "creative",
                difficulty: "medium",
                color: "#ec4899",
                gradient: "linear-gradient(135deg, #ec4899 0%, #be185d 100%)",
                preview: "Cat → Tail → Light\n→ House → Exit\n→ Tomorrow..."
            },
            "drawing-guess": {
                name: "Drawing Guess",
                icon: "🎨",
                description: "Draw and guess with friends",
                minPlayers: 3,
                maxPlayers: 8,
                estimatedDuration: "10-15 minutes",
                category: "creative",
                difficulty: "hard",
                color: "#8b5cf6",
                gradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                preview: "🎨 Draw: 'House'\n👁️ Others guess\n⏱️ 60 seconds"
            }
        };
        
        this.nearbyGames = [];
        this.isInGame = false;
        this.setupGameEvents();
    }

    setupGameEvents() {
        // Socket events for games
        this.app.socket.on('game-created', (data) => {
            this.handleGameCreated(data);
        });

        this.app.socket.on('nearby-games', (games) => {
            this.updateGamesList(games);
        });

        this.app.socket.on('new-game-available', (game) => {
            this.handleNewGameAvailable(game);
        });

        this.app.socket.on('game-joined', (data) => {
            this.handleGameJoined(data);
        });

        this.app.socket.on('player-joined', (data) => {
            this.handlePlayerJoined(data);
        });

        this.app.socket.on('player-left', (data) => {
            this.handlePlayerLeft(data);
        });

        this.app.socket.on('player-ready', (data) => {
            this.handlePlayerReady(data);
        });

        this.app.socket.on('game-started', (data) => {
            this.handleGameStarted(data);
        });

        this.app.socket.on('game-move', (data) => {
            this.handleGameMove(data);
        });

        this.app.socket.on('game-ended', (data) => {
            this.handleGameEnded(data);
        });

        this.app.socket.on('game-error', (data) => {
            this.handleGameError(data);
        });
        
        // Add connection error handling
        this.app.socket.on('disconnect', () => {
            console.log('Disconnected from server - cleaning up games');
            this.isInGame = false;
            this.currentGameSession = null;
            this.closeGameInterface();
        });
        
        this.app.socket.on('connect_error', (error) => {
            console.error('Game connection error:', error);
            if (this.isInGame) {
                this.app.showNotification('Connection lost during game. Please reconnect.');
            }
        });
    }

    showGameCreationModal() {
        const modal = this.createGameCreationModal();
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 100);
    }

    createGameCreationModal() {
        const modal = document.createElement('div');
        modal.className = 'modal game-creation-modal';
        modal.id = 'game-creation-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🎮 Choose Your Game</h3>
                    <button class="btn-ghost close-game-creation">&times;</button>
                </div>
                <div class="game-selection">
                    ${Object.entries(this.gameTypes).map(([id, game]) => `
                        <div class="game-option enhanced" data-game-id="${id}" style="--game-gradient: ${game.gradient};">
                            <div class="game-option-inner">
                                <div class="game-icon-container">
                                    <div class="game-icon">${game.icon}</div>
                                    <div class="difficulty-badge difficulty-${game.difficulty}">${game.difficulty}</div>
                                </div>
                                <div class="game-info">
                                    <h4>${game.name}</h4>
                                    <p>${game.description}</p>
                                    <div class="game-preview">
                                        <pre>${game.preview}</pre>
                                    </div>
                                    <div class="game-meta">
                                        <div class="meta-item">
                                            <span class="meta-icon">👥</span>
                                            <span>${game.minPlayers}-${game.maxPlayers} players</span>
                                        </div>
                                        <div class="meta-item">
                                            <span class="meta-icon">⏱️</span>
                                            <span>${game.estimatedDuration}</span>
                                        </div>
                                        <span class="game-category category-${game.category}">${game.category}</span>
                                    </div>
                                </div>
                                <div class="game-select-indicator">
                                    <div class="select-checkmark">✓</div>
                                </div>
                            </div>
                            <div class="game-hover-glow"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="game-creation-form enhanced" id="game-creation-form" style="display: none;">
                    <div class="selected-game-summary" id="selected-game-summary"></div>
                    <div class="form-content">
                        <div class="input-group">
                            <label for="game-title">Game Title (Optional)</label>
                            <input type="text" id="game-title" placeholder="Enter a custom title...">
                        </div>
                        <div class="game-settings">
                            <label class="checkbox-label enhanced">
                                <input type="checkbox" id="auto-start" checked>
                                <span class="checkmark"></span>
                                <div class="checkbox-content">
                                    <span class="checkbox-title">Auto-start Game</span>
                                    <span class="checkbox-desc">Start automatically when minimum players join</span>
                                </div>
                            </label>
                        </div>
                        <div class="form-actions">
                            <button class="btn-ghost back-to-selection">
                                ← Back to Selection
                            </button>
                            <button class="btn-primary create-game-btn">
                                🚀 Create Game
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners
        modal.querySelector('.close-game-creation').addEventListener('click', () => {
            this.closeGameCreation();
        });
        
        modal.querySelector('.back-to-selection').addEventListener('click', () => {
            this.showGameSelection();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeGameCreation();
            }
        });
        
        // Game option selection
        modal.querySelectorAll('.game-option').forEach(option => {
            option.addEventListener('click', () => {
                this.selectGameType(option.dataset.gameId);
            });
        });
        
        // Create game button listener
        modal.querySelector('.create-game-btn').addEventListener('click', () => {
            this.createGame();
        });
        
        return modal;
    }

    selectGameType(gameId) {
        const modal = document.getElementById('game-creation-modal');
        const selection = modal.querySelector('.game-selection');
        const form = modal.querySelector('.game-creation-form');
        const summary = modal.querySelector('.selected-game-summary');
        
        // Highlight selected game with enhanced animation
        modal.querySelectorAll('.game-option').forEach(option => {
            option.classList.toggle('selected', option.dataset.gameId === gameId);
        });
        
        // Store selected game
        modal.dataset.selectedGame = gameId;
        
        // Create game summary
        const gameType = this.gameTypes[gameId];
        summary.innerHTML = `
            <div class="game-summary-card" style="--game-gradient: ${gameType.gradient};">
                <div class="game-summary-icon">${gameType.icon}</div>
                <div class="game-summary-info">
                    <h4>${gameType.name}</h4>
                    <p>${gameType.description}</p>
                    <div class="game-summary-meta">
                        <span class="difficulty-badge difficulty-${gameType.difficulty}">${gameType.difficulty}</span>
                        <span class="category-badge category-${gameType.category}">${gameType.category}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Animate transition
        selection.style.opacity = '0';
        selection.style.transform = 'translateX(-20px)';
        
        setTimeout(() => {
            selection.style.display = 'none';
            form.style.display = 'block';
            form.style.opacity = '0';
            form.style.transform = 'translateX(20px)';
            
            setTimeout(() => {
                form.style.opacity = '1';
                form.style.transform = 'translateX(0)';
            }, 50);
        }, 200);
        
        // Update form title
        const titleInput = document.getElementById('game-title');
        titleInput.placeholder = `${gameType.name} session (optional)`;
    }
    
    showGameSelection() {
        const modal = document.getElementById('game-creation-modal');
        const selection = modal.querySelector('.game-selection');
        const form = modal.querySelector('.game-creation-form');
        
        // Animate transition back
        form.style.opacity = '0';
        form.style.transform = 'translateX(20px)';
        
        setTimeout(() => {
            form.style.display = 'none';
            selection.style.display = 'block';
            selection.style.opacity = '0';
            selection.style.transform = 'translateX(-20px)';
            
            setTimeout(() => {
                selection.style.opacity = '1';
                selection.style.transform = 'translateX(0)';
            }, 50);
        }, 200);
    }

    createGame() {
        const modal = document.getElementById('game-creation-modal');
        const gameId = modal.dataset.selectedGame;
        const title = document.getElementById('game-title').value.trim();
        const autoStart = document.getElementById('auto-start').checked;
        
        if (!gameId) return;

        const gameType = this.gameTypes[gameId];
        
        const gameConfig = {
            type: gameId,
            title: title || gameType.name,
            maxPlayers: gameType.maxPlayers,
            autoStart: autoStart,
            timePerTurn: 30000 // 30 seconds default
        };
        
        console.log('Creating game:', gameConfig);
        this.app.socket.emit('create-game', gameConfig);

        this.closeGameCreation();
    }

    closeGameCreation() {
        const modal = document.getElementById('game-creation-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    }

    updateGamesList(games) {
        this.nearbyGames = games;
        const gamesList = document.getElementById('games-list');
        
        if (!gamesList) {
            console.warn('Games list element not found');
            return;
        }
        
        if (games.length === 0) {
            gamesList.innerHTML = `
                <div class="empty-state enhanced">
                    <div class="empty-icon">🎲</div>
                    <h3>No games nearby</h3>
                    <p>Be the first to create a game and invite nearby users to play!</p>
                    <div class="empty-actions">
                        <button class="btn-primary create-game-empty" onclick="window.gameManager?.showGameCreationModal()">
                            🎮 Create Game
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        gamesList.innerHTML = games.map(game => {
            const gameType = this.gameTypes[game.type];
            const statusClass = game.status === 'waiting' ? 'waiting' : 
                               game.status === 'active' ? 'active' : 'finished';
            
            return `
                <div class="game-card ${statusClass}" data-game-id="${game.id}">
                    <div class="game-card-header">
                        <span class="game-card-icon">${gameType?.icon || '🎮'}</span>
                        <div class="game-title-status">
                            <h4>${this.app.escapeHtml(game.title)}</h4>
                            <span class="game-status ${statusClass}">${this.getStatusText(game.status)}</span>
                        </div>
                        ${game.distance ? `<span class="game-distance">${game.distance}m</span>` : ''}
                    </div>
                    <div class="game-card-body">
                        <p>${gameType?.description || 'Fun game for everyone!'}</p>
                        <div class="game-players">
                            <div class="players-avatars">
                                ${game.players.slice(0, 4).map(p => `
                                    <span class="player-avatar ${p.isReady ? 'ready' : ''}" 
                                          title="${p.isAnonymous ? 'Anonymous' : (p.nickname || 'Anonymous')} ${p.avatar}">
                                        ${p.avatar}
                                    </span>
                                `).join('')}
                                ${game.players.length > 4 ? `<span class="more-players">+${game.players.length - 4}</span>` : ''}
                            </div>
                            <span class="players-count">
                                ${game.players.length}/${game.maxPlayers}
                            </span>
                        </div>
                        <div class="game-meta">
                            <span class="game-time">
                                ${this.app.formatTimeAgo(game.createdAt)}
                            </span>
                            <span class="game-duration">
                                ${game.estimatedDuration}
                            </span>
                        </div>
                        <div class="game-actions">
                            ${this.getGameActionButtons(game)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click event listeners
        this.attachGameCardListeners();
    }

    getStatusText(status) {
        switch(status) {
            case 'waiting': return 'Waiting for players';
            case 'active': return 'In progress';
            case 'finished': return 'Finished';
            default: return status;
        }
    }

    getGameActionButtons(game) {
        if (game.isCreator && game.status === 'waiting') {
            return `
                <button class="btn-primary start-game-btn" data-game-id="${game.id}">Start Game</button>
                <button class="btn-ghost leave-game-btn" data-game-id="${game.id}">Cancel</button>
            `;
        } else if (game.canJoin) {
            return `<button class="btn-primary join-game-btn" data-game-id="${game.id}">Join Game</button>`;
        } else if (game.status === 'active') {
            const playerInGame = game.players.some(p => p.id === this.app.currentUser?.id);
            if (playerInGame) {
                return `<button class="btn-primary open-game-btn" data-game-id="${game.id}">Open Game</button>`;
            } else {
                return `<button class="btn-ghost watch-game-btn" data-game-id="${game.id}">Watch</button>`;
            }
        }
        return '';
    }

    attachGameCardListeners() {
        // Join game buttons
        document.querySelectorAll('.join-game-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.joinGame(btn.dataset.gameId);
            });
        });

        // Start game buttons
        document.querySelectorAll('.start-game-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startGame(btn.dataset.gameId);
            });
        });

        // Leave game buttons
        document.querySelectorAll('.leave-game-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.leaveGame(btn.dataset.gameId);
            });
        });

        // Open game buttons
        document.querySelectorAll('.open-game-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openGameInterface(btn.dataset.gameId);
            });
        });
    }

    joinGame(gameId) {
        console.log('Joining game:', gameId);
        this.app.socket.emit('join-game', { gameId });
    }

    startGame(gameId) {
        console.log('Starting game:', gameId);
        this.app.socket.emit('start-game', { gameId });
    }

    leaveGame(gameId) {
        if (confirm('Are you sure you want to leave this game?')) {
            console.log('Leaving game:', gameId);
            this.app.socket.emit('leave-game', { gameId });
        }
    }

    openGameInterface(gameId) {
        const game = this.nearbyGames.find(g => g.id === gameId);
        if (game) {
            this.showGameInterface(game);
        }
    }

    // Event Handlers
    handleGameCreated(data) {
        console.log('Game created:', data);
        this.app.showNotification(`Game "${data.session.title}" created successfully!`);
        this.loadNearbyGames();
        
        // Join the game automatically as creator
        this.currentGameSession = data.session;
        this.showGameLobby(data.session);
    }

    handleNewGameAvailable(game) {
        this.app.showNotification(`🎮 New game available: ${game.title}`);
        this.loadNearbyGames();
    }

    handleGameJoined(data) {
        console.log('Joined game:', data);
        this.currentGameSession = data.session;
        this.isInGame = true;
        this.showGameLobby(data.session);
    }

    handlePlayerJoined(data) {
        console.log('Player joined:', data);
        if (this.gameInterface) {
            this.updateLobbyPlayers(data);
        }
        this.loadNearbyGames();
    }

    handlePlayerLeft(data) {
        console.log('Player left:', data);
        if (this.gameInterface) {
            this.updateLobbyPlayers(data);
        }
        
        if (data.gameStatus === 'cancelled' || data.gameStatus === 'finished') {
            this.handleGameEnded({ 
                gameId: data.gameId, 
                reason: data.gameStatus === 'cancelled' ? 'Game cancelled' : 'Insufficient players' 
            });
        }
        
        this.loadNearbyGames();
    }

    handlePlayerReady(data) {
        console.log('Player ready status changed:', data);
        if (this.gameInterface) {
            this.updatePlayerReadyStatus(data);
        }
    }

    handleGameStarted(data) {
        console.log('Game started:', data);
        this.app.showNotification('Game is starting!');
        
        if (this.currentGameSession && this.currentGameSession.id === data.gameId) {
            this.currentGameSession.status = 'active';
            this.currentGameSession.gameState = data.gameState;
            this.showGamePlayInterface(this.currentGameSession);
        }
    }

    handleGameMove(data) {
        console.log('Game move:', data);
        if (this.gameInterface && this.currentGameSession?.id === data.gameId) {
            this.updateGameState(data);
        }
    }

    handleGameEnded(data) {
        console.log('Game ended:', data);
        this.isInGame = false;
        
        let message = 'Game ended';
        if (data.winner) {
            const winner = this.currentGameSession?.players.find(p => p.id === data.winner);
            message = `🎉 ${winner?.nickname || 'Anonymous'} wins!`;
        } else if (data.reason) {
            message = data.reason;
        }
        
        this.app.showNotification(message);
        this.closeGameInterface();
        this.loadNearbyGames();
    }

    handleGameError(data) {
        console.error('Game error:', data);
        this.app.showNotification(`Game error: ${data.error}`);
    }

    // Game Interface Methods
    showGameLobby(gameSession) {
        this.closeGameInterface();
        
        const modal = document.createElement('div');
        modal.className = 'modal game-lobby-modal enhanced';
        modal.id = `game-lobby-${gameSession.id}`;
        
        const gameType = this.gameTypes[gameSession.type];
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header enhanced" style="--game-gradient: ${gameType.gradient};">
                    <div class="lobby-header-content">
                        <div class="game-title-section">
                            <span class="lobby-game-icon">${gameType?.icon || '🎮'}</span>
                            <div class="lobby-title-info">
                                <h3>${this.app.escapeHtml(gameSession.title)}</h3>
                                <p class="lobby-subtitle">${gameType?.description}</p>
                            </div>
                        </div>
                        <button class="btn-ghost close-game-lobby">&times;</button>
                    </div>
                    <div class="lobby-progress-bar">
                        <div class="progress-fill" style="width: ${(gameSession.players.length / gameSession.maxPlayers) * 100}%"></div>
                    </div>
                </div>
                
                <div class="game-lobby-body enhanced">
                    <div class="lobby-main-content">
                        <div class="game-info-panel">
                            <div class="game-details-grid">
                                <div class="detail-card">
                                    <span class="detail-icon">⏱️</span>
                                    <div class="detail-content">
                                        <span class="detail-label">Duration</span>
                                        <span class="detail-value">${gameType?.estimatedDuration}</span>
                                    </div>
                                </div>
                                <div class="detail-card">
                                    <span class="detail-icon">👥</span>
                                    <div class="detail-content">
                                        <span class="detail-label">Players</span>
                                        <span class="detail-value">${gameSession.players.length}/${gameSession.maxPlayers}</span>
                                    </div>
                                </div>
                                <div class="detail-card">
                                    <span class="detail-icon">🏷️</span>
                                    <div class="detail-content">
                                        <span class="detail-label">Category</span>
                                        <span class="detail-value">${gameType?.category}</span>
                                    </div>
                                </div>
                                <div class="detail-card">
                                    <span class="detail-icon">⚡</span>
                                    <div class="detail-content">
                                        <span class="detail-label">Difficulty</span>
                                        <span class="detail-value difficulty-${gameType?.difficulty}">${gameType?.difficulty}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="players-section">
                            <div class="players-header">
                                <h4>Players in Lobby</h4>
                                <div class="players-count-badge">
                                    ${gameSession.players.length}/${gameSession.maxPlayers}
                                </div>
                            </div>
                            <div class="players-grid enhanced" id="lobby-players-${gameSession.id}">
                                ${this.renderEnhancedLobbyPlayers(gameSession.players, gameSession.creatorId)}
                            </div>
                        </div>
                        
                        <div class="lobby-chat-section" id="lobby-chat-${gameSession.id}">
                            <div class="chat-header">
                                <h4>Lobby Chat</h4>
                                <button class="btn-ghost toggle-chat" title="Toggle Chat">💬</button>
                            </div>
                            <div class="chat-container">
                                <div class="chat-messages" id="lobby-chat-messages-${gameSession.id}">
                                    <div class="system-message">
                                        <span class="system-icon">🎮</span>
                                        <span>Welcome to the game lobby! Chat with other players while you wait.</span>
                                    </div>
                                </div>
                                <div class="chat-input-container">
                                    <input type="text" 
                                           id="lobby-chat-input-${gameSession.id}" 
                                           placeholder="Type a message..." 
                                           maxlength="200">
                                    <button class="btn-primary send-chat-btn" data-game-id="${gameSession.id}">
                                        Send
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="lobby-actions enhanced">
                        ${this.getEnhancedLobbyActions(gameSession)}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.gameInterface = modal;
        
        // Add event listeners
        modal.querySelector('.close-game-lobby').addEventListener('click', () => {
            this.closeGameInterface();
        });
        
        // Ready button listener
        const readyBtn = modal.querySelector('.ready-toggle-btn');
        if (readyBtn) {
            readyBtn.addEventListener('click', () => {
                this.toggleReady(gameSession.id);
            });
        }
        
        // Leave button listener
        const leaveBtn = modal.querySelector('.leave-lobby-btn');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
                this.leaveGame(gameSession.id);
            });
        }
        
        // Start game button listener
        const startBtn = modal.querySelector('.start-lobby-game-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startGame(gameSession.id);
            });
        }
        
        // Chat functionality
        this.setupLobbyChat(gameSession.id);
        
        // Toggle chat functionality
        const toggleChatBtn = modal.querySelector('.toggle-chat');
        if (toggleChatBtn) {
            toggleChatBtn.addEventListener('click', () => {
                this.toggleLobbyChat(gameSession.id);
            });
        }
        
        setTimeout(() => modal.classList.add('active'), 100);
    }

    setupLobbyChat(gameId) {
        const chatInput = document.getElementById(`lobby-chat-input-${gameId}`);
        const sendBtn = document.querySelector(`.send-chat-btn[data-game-id="${gameId}"]`);
        
        if (chatInput && sendBtn) {
            const sendMessage = () => {
                const message = chatInput.value.trim();
                if (message) {
                    this.sendLobbyMessage(gameId, message);
                    chatInput.value = '';
                }
            };
            
            sendBtn.addEventListener('click', sendMessage);
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }
    }
    
    sendLobbyMessage(gameId, message) {
        // For now, just add to local chat
        // In future, this could be sent via socket for real-time lobby chat
        this.addLobbyMessage(gameId, {
            sender: this.app.currentUser.nickname || 'Anonymous',
            avatar: this.app.currentUser.avatar,
            message: message,
            timestamp: Date.now(),
            isOwn: true
        });
    }
    
    addLobbyMessage(gameId, messageData) {
        const messagesContainer = document.getElementById(`lobby-chat-messages-${gameId}`);
        if (messagesContainer) {
            const messageEl = document.createElement('div');
            messageEl.className = `chat-message ${messageData.isOwn ? 'own' : 'other'}`;
            messageEl.innerHTML = `
                <div class="message-header">
                    <span class="message-avatar">${messageData.avatar}</span>
                    <span class="message-sender">${messageData.sender}</span>
                    <span class="message-time">${new Date(messageData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="message-content">${this.app.escapeHtml(messageData.message)}</div>
            `;
            messagesContainer.appendChild(messageEl);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
    
    toggleLobbyChat(gameId) {
        const chatSection = document.getElementById(`lobby-chat-${gameId}`);
        if (chatSection) {
            chatSection.classList.toggle('collapsed');
        }
    }

    renderLobbyPlayers(players, creatorId) {
        return players.map(player => `
            <div class="lobby-player ${player.isReady ? 'ready' : ''} ${player.id === creatorId ? 'creator' : ''}">
                <div class="player-avatar-large">${player.avatar}</div>
                <div class="player-info">
                    <div class="player-name">
                        ${player.isAnonymous ? 'Anonymous' : this.app.escapeHtml(player.nickname)}
                        ${player.id === creatorId ? '<span class="creator-badge">👑</span>' : ''}
                    </div>
                    <div class="player-status">
                        ${player.isReady ? '✅ Ready' : '⏳ Not ready'}
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderEnhancedLobbyPlayers(players, creatorId) {
        return players.map(player => `
            <div class="lobby-player enhanced ${player.isReady ? 'ready' : ''} ${player.id === creatorId ? 'creator' : ''}" data-player-id="${player.id}">
                <div class="player-avatar-container">
                    <div class="player-avatar-large">${player.avatar}</div>
                    <div class="player-status-indicator ${player.isReady ? 'ready' : 'waiting'}"></div>
                </div>
                <div class="player-info">
                    <div class="player-name">
                        ${player.isAnonymous ? 'Anonymous' : this.app.escapeHtml(player.nickname)}
                        ${player.id === creatorId ? '<span class="creator-badge">👑</span>' : ''}
                    </div>
                    <div class="player-status">
                        ${player.isReady ? '✅ Ready to play' : '⏳ Getting ready...'}
                    </div>
                    <div class="player-join-time">
                        Joined ${this.app.formatTimeAgo(player.joinedAt)}
                    </div>
                </div>
            </div>
        `).join('');
    }

    getLobbyActions(gameSession) {
        const currentPlayer = gameSession.players.find(p => p.id === this.app.currentUser?.id);
        const isCreator = gameSession.creatorId === this.app.currentUser?.id;
        const canStart = gameSession.players.length >= gameSession.minPlayers;
        
        let actions = '';
        
        if (currentPlayer) {
            actions += `
                <button class="btn-primary ready-toggle-btn ${currentPlayer.isReady ? 'ready' : ''}" 
                        data-game-id="${gameSession.id}">
                    ${currentPlayer.isReady ? '✅ Ready' : '⏳ Ready Up'}
                </button>
            `;
            
            if (isCreator && canStart) {
                actions += `
                    <button class="btn-secondary start-lobby-game-btn" data-game-id="${gameSession.id}">
                        🚀 Start Game
                    </button>
                `;
            }
            
            actions += `
                <button class="btn-ghost leave-lobby-btn" data-game-id="${gameSession.id}">
                    Leave Game
                </button>
            `;
        }
        
        return actions;
    }

    getEnhancedLobbyActions(gameSession) {
        const currentPlayer = gameSession.players.find(p => p.id === this.app.currentUser?.id);
        const isCreator = gameSession.creatorId === this.app.currentUser?.id;
        const canStart = gameSession.players.length >= gameSession.minPlayers;
        const allReady = gameSession.players.every(p => p.isReady);
        
        if (!currentPlayer) {
            return '<div class="lobby-actions-empty">Spectating...</div>';
        }
        
        return `
            <div class="primary-actions">
                <button class="btn-primary ready-toggle-btn enhanced ${currentPlayer.isReady ? 'ready' : ''}" 
                        data-game-id="${gameSession.id}">
                    <span class="btn-icon">${currentPlayer.isReady ? '✅' : '⏳'}</span>
                    <span class="btn-text">${currentPlayer.isReady ? 'Ready to Play!' : 'Mark as Ready'}</span>
                </button>
                
                ${isCreator && canStart ? `
                    <button class="btn-success start-lobby-game-btn enhanced ${allReady ? 'pulse' : ''}" 
                            data-game-id="${gameSession.id}"
                            ${!allReady ? 'title="Waiting for all players to be ready"' : ''}>
                        <span class="btn-icon">🚀</span>
                        <span class="btn-text">${allReady ? 'Start Game Now!' : 'Start Game'}</span>
                    </button>
                ` : ''}
            </div>
            
            <div class="secondary-actions">
                <button class="btn-ghost leave-lobby-btn" data-game-id="${gameSession.id}">
                    <span class="btn-icon">🚪</span>
                    <span class="btn-text">Leave Lobby</span>
                </button>
            </div>
            
            ${!canStart ? `
                <div class="lobby-status-message">
                    <span class="status-icon">⏳</span>
                    Need ${gameSession.minPlayers - gameSession.players.length} more player${gameSession.minPlayers - gameSession.players.length > 1 ? 's' : ''} to start
                </div>
            ` : ''}
            
            ${canStart && !allReady && !isCreator ? `
                <div class="lobby-status-message">
                    <span class="status-icon">⏳</span>
                    Waiting for all players to be ready...
                </div>
            ` : ''}
        `;
    }

    showGamePlayInterface(gameSession) {
        this.closeGameInterface();
        
        const modal = document.createElement('div');
        modal.className = 'modal game-play-modal';
        modal.id = `game-play-${gameSession.id}`;
        
        const gameType = this.gameTypes[gameSession.type];
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${gameType?.icon || '🎮'} ${this.app.escapeHtml(gameSession.title)}</h3>
                    <button class="btn-ghost close-game-play">&times;</button>
                </div>
                <div class="game-play-body">
                    <div class="game-status-bar">
                        ${this.renderGameStatusBar(gameSession)}
                    </div>
                    
                    <div class="game-interface" id="game-interface-${gameSession.id}">
                        ${this.renderGameInterface(gameSession)}
                    </div>
                    
                    <div class="game-players-sidebar">
                        ${this.renderGamePlayers(gameSession.players)}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.gameInterface = modal;
        
        // Add close button event listener
        modal.querySelector('.close-game-play').addEventListener('click', () => {
            this.closeGameInterface();
        });
        
        // Add game-specific event listeners
        this.attachGameInterfaceListeners(gameSession);
        
        setTimeout(() => modal.classList.add('active'), 100);
    }

    renderGameStatusBar(gameSession) {
        const currentTurn = gameSession.gameState.currentTurn;
        const currentPlayer = gameSession.players.find(p => p.id === currentTurn);
        
        return `
            <div class="turn-indicator">
                ${currentPlayer ? 
                    `<span>${currentPlayer.avatar} ${currentPlayer.isAnonymous ? 'Anonymous' : currentPlayer.nickname}'s turn</span>` :
                    '<span>Waiting...</span>'
                }
            </div>
            <div class="game-timer" id="game-timer-${gameSession.id}">
                <span>⏱️ 30s</span>
            </div>
        `;
    }

    renderGameInterface(gameSession) {
        switch (gameSession.type) {
            case 'tic-tac-toe':
                return this.renderTicTacToeInterface(gameSession);
            case 'rock-paper-scissors':
                return this.renderRPSInterface(gameSession);
            case 'math-quiz':
                return this.renderMathQuizInterface(gameSession);
            case 'word-association':
                return this.renderWordAssociationInterface(gameSession);
            case 'drawing-guess':
                return this.renderDrawingGuessInterface(gameSession);
            default:
                return '<p>Game interface not yet implemented</p>';
        }
    }

    renderTicTacToeInterface(gameSession) {
        const board = gameSession.gameState.gameData.board;
        const symbols = gameSession.gameState.gameData.symbols;
        const mySymbol = symbols[this.app.currentUser?.id];
        
        return `
            <div class="tic-tac-toe-game">
                <div class="game-board">
                    ${board.map((cell, index) => `
                        <button class="board-cell ${cell ? 'filled' : ''}" 
                                data-position="${index}" 
                                ${cell || gameSession.gameState.currentTurn !== this.app.currentUser?.id ? 'disabled' : ''}>
                            ${cell || ''}
                        </button>
                    `).join('')}
                </div>
                <div class="game-info">
                    <p>You are playing as: <strong>${mySymbol}</strong></p>
                    ${gameSession.gameState.currentTurn === this.app.currentUser?.id ? 
                        '<p class="your-turn">It\'s your turn!</p>' : 
                        '<p class="wait-turn">Wait for your turn</p>'
                    }
                </div>
            </div>
        `;
    }

    renderRPSInterface(gameSession) {
        const gameData = gameSession.gameState.gameData;
        const currentRound = gameData.currentRound;
        const maxRounds = gameData.maxRounds;
        const myChoice = gameData.choices[this.app.currentUser?.id];
        
        return `
            <div class="rps-game">
                <div class="round-info">
                    <h4>Round ${currentRound} of ${maxRounds}</h4>
                </div>
                
                <div class="rps-choices">
                    <button class="rps-choice ${myChoice === 'rock' ? 'selected' : ''}" 
                            data-choice="rock" ${myChoice ? 'disabled' : ''}>
                        🗿 Rock
                    </button>
                    <button class="rps-choice ${myChoice === 'paper' ? 'selected' : ''}" 
                            data-choice="paper" ${myChoice ? 'disabled' : ''}>
                        📄 Paper
                    </button>
                    <button class="rps-choice ${myChoice === 'scissors' ? 'selected' : ''}" 
                            data-choice="scissors" ${myChoice ? 'disabled' : ''}>
                        ✂️ Scissors
                    </button>
                </div>
                
                <div class="round-results">
                    ${gameData.rounds.map((round, index) => {
                        const player1Choice = Object.keys(round.choices)[0];
                        const player2Choice = Object.keys(round.choices)[1];
                        const choice1 = round.choices[player1Choice];
                        const choice2 = round.choices[player2Choice];
                        
                        return `
                            <div class="round-result">
                                <span class="round-number">Round ${round.round}:</span>
                                <span class="round-choices">${choice1} vs ${choice2}</span>
                                <span class="round-outcome ${round.winner ? 'winner' : 'tie'}">
                                    ${round.winner ? '🏆' : '🤝'} ${round.winner ? 'Win!' : 'Tie!'}
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                ${myChoice ? '<p class="waiting-opponent">Waiting for opponent...</p>' : 
                           '<p class="make-choice">Make your choice!</p>'}
            </div>
        `;
    }

    renderMathQuizInterface(gameSession) {
        const gameData = gameSession.gameState.gameData;
        const currentQ = gameData.currentQuestion;
        const question = gameData.questions[currentQ];
        
        if (!question) {
            return '<p>Loading question...</p>';
        }
        
        return `
            <div class="math-quiz-game">
                <div class="question-header">
                    <h4>Question ${currentQ + 1} of ${gameData.questions.length}</h4>
                </div>
                
                <div class="question-display">
                    <h3>${question.question} = ?</h3>
                </div>
                
                <div class="answer-options">
                    ${question.options.map((option, index) => `
                        <button class="answer-option" data-answer="${option}" data-index="${index}">
                            ${option}
                        </button>
                    `).join('')}
                </div>
                
                <div class="quiz-score">
                    Score: ${gameData.scores[this.app.currentUser?.id] || 0}
                </div>
            </div>
        `;
    }

    renderWordAssociationInterface(gameSession) {
        const gameData = gameSession.gameState.gameData;
        const isMyTurn = gameSession.gameState.currentTurn === this.app.currentUser?.id;
        
        return `
            <div class="word-association-game">
                <div class="current-word">
                    <h4>Current Word:</h4>
                    <span class="word-display">${gameData.currentWord || 'Start the chain!'}</span>
                </div>
                
                <div class="word-input ${!isMyTurn ? 'disabled' : ''}">
                    <input type="text" id="word-input-${gameSession.id}" 
                           placeholder="Add your word..." ${!isMyTurn ? 'disabled' : ''}>
                    <button class="btn-primary word-submit-btn" 
                            data-game-id="${gameSession.id}" ${!isMyTurn ? 'disabled' : ''}>
                        Submit
                    </button>
                </div>
                
                <div class="word-chain">
                    <h4>Word Chain (${gameData.words.length} words):</h4>
                    <div class="words-list">
                        ${gameData.words.map(word => `<span class="word-tag">${word}</span>`).join('')}
                    </div>
                </div>
                
                ${!isMyTurn ? '<p class="wait-turn">Wait for your turn</p>' : 
                             '<p class="your-turn">Your turn to add a word!</p>'}
            </div>
        `;
    }

    renderDrawingGuessInterface(gameSession) {
        const gameData = gameSession.gameState.gameData;
        const isDrawer = gameData.drawer === this.app.currentUser?.id;
        
        if (isDrawer) {
            return `
                <div class="drawing-game drawer">
                    <div class="word-to-draw">
                        <h4>Draw this word:</h4>
                        <span class="secret-word">${gameData.word}</span>
                    </div>
                    
                    <canvas id="drawing-canvas-${gameSession.id}" width="400" height="300"></canvas>
                    
                    <div class="drawing-tools">
                        <button class="tool-btn" data-tool="pen">✏️ Pen</button>
                        <button class="tool-btn" data-tool="eraser">🧽 Eraser</button>
                        <button class="tool-btn" data-tool="clear">🗑️ Clear</button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="drawing-game guesser">
                    <div class="drawing-display">
                        <canvas id="drawing-display-${gameSession.id}" width="400" height="300"></canvas>
                    </div>
                    
                    <div class="guess-input">
                        <input type="text" id="guess-input-${gameSession.id}" 
                               placeholder="What is being drawn?">
                        <button class="btn-primary guess-submit-btn" 
                                data-game-id="${gameSession.id}">
                            Guess
                        </button>
                    </div>
                    
                    <div class="guesses-list">
                        <h4>Guesses:</h4>
                        ${gameData.guesses.map(guess => `
                            <div class="guess-item">
                                <strong>${guess.playerId === this.app.currentUser?.id ? 'You' : 'Player'}:</strong>
                                ${guess.guess}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }

    renderGamePlayers(players) {
        return `
            <h4>Players</h4>
            <div class="game-players-list">
                ${players.map(player => `
                    <div class="game-player">
                        <span class="player-avatar">${player.avatar}</span>
                        <span class="player-name">
                            ${player.isAnonymous ? 'Anonymous' : this.app.escapeHtml(player.nickname)}
                        </span>
                        <span class="player-score">${player.score || 0}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    attachGameInterfaceListeners(gameSession) {
        // Tic Tac Toe listeners
        if (gameSession.type === 'tic-tac-toe') {
            document.querySelectorAll('.board-cell').forEach(cell => {
                cell.addEventListener('click', () => {
                    if (!cell.disabled) {
                        this.makeTicTacToeMove(gameSession.id, parseInt(cell.dataset.position));
                    }
                });
            });
        }
        
        // Rock Paper Scissors listeners
        if (gameSession.type === 'rock-paper-scissors') {
            document.querySelectorAll('.rps-choice').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (!btn.disabled) {
                        this.makeRPSMove(gameSession.id, btn.dataset.choice);
                    }
                });
            });
        }
        
        // Math Quiz listeners
        if (gameSession.type === 'math-quiz') {
            document.querySelectorAll('.answer-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.makeMathQuizMove(gameSession.id, parseInt(btn.dataset.answer), parseInt(btn.dataset.index));
                });
            });
        }
        
        // Word Association listeners
        if (gameSession.type === 'word-association') {
            const submitBtn = document.querySelector('.word-submit-btn');
            const wordInput = document.getElementById(`word-input-${gameSession.id}`);
            
            if (submitBtn && wordInput) {
                submitBtn.addEventListener('click', () => {
                    this.makeWordAssociationMove(gameSession.id, wordInput.value.trim());
                });
                
                wordInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.makeWordAssociationMove(gameSession.id, wordInput.value.trim());
                    }
                });
            }
        }
        
        // Drawing Guess listeners
        if (gameSession.type === 'drawing-guess') {
            this.setupDrawingCanvas(gameSession);
            
            const guessBtn = document.querySelector('.guess-submit-btn');
            const guessInput = document.getElementById(`guess-input-${gameSession.id}`);
            
            if (guessBtn && guessInput) {
                guessBtn.addEventListener('click', () => {
                    this.makeDrawingGuessMove(gameSession.id, guessInput.value.trim());
                });
                
                guessInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.makeDrawingGuessMove(gameSession.id, guessInput.value.trim());
                    }
                });
            }
        }
    }

    // Game Move Methods
    makeTicTacToeMove(gameId, position) {
        this.app.socket.emit('game-move', {
            gameId: gameId,
            move: { position: position }
        });
    }

    makeRPSMove(gameId, choice) {
        this.app.socket.emit('game-move', {
            gameId: gameId,
            move: { choice: choice }
        });
    }

    makeMathQuizMove(gameId, answer, questionIndex) {
        this.app.socket.emit('game-move', {
            gameId: gameId,
            move: { answer: answer, questionIndex: questionIndex }
        });
    }

    makeWordAssociationMove(gameId, word) {
        if (!word) return;
        
        this.app.socket.emit('game-move', {
            gameId: gameId,
            move: { word: word }
        });
        
        // Clear input
        const wordInput = document.getElementById(`word-input-${gameId}`);
        if (wordInput) wordInput.value = '';
    }

    makeDrawingGuessMove(gameId, guess) {
        if (!guess) return;
        
        this.app.socket.emit('game-move', {
            gameId: gameId,
            move: { 
                type: 'guess',
                data: { guess: guess }
            }
        });
        
        // Clear input
        const guessInput = document.getElementById(`guess-input-${gameId}`);
        if (guessInput) guessInput.value = '';
    }

    setupDrawingCanvas(gameSession) {
        const canvas = document.getElementById(`drawing-canvas-${gameSession.id}`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let currentTool = 'pen';
        
        // Drawing event listeners
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);
        
        // Touch events for mobile
        canvas.addEventListener('touchstart', handleTouch);
        canvas.addEventListener('touchmove', handleTouch);
        canvas.addEventListener('touchend', stopDrawing);
        
        function startDrawing(e) {
            isDrawing = true;
            draw(e);
        }
        
        function draw(e) {
            if (!isDrawing) return;
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            ctx.lineWidth = currentTool === 'eraser' ? 20 : 3;
            ctx.lineCap = 'round';
            ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = '#000';
            
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
            
            // Emit drawing data
            this.app.socket.emit('game-move', {
                gameId: gameSession.id,
                move: {
                    type: 'draw',
                    data: { x, y, tool: currentTool }
                }
            });
        }
        
        function stopDrawing() {
            if (isDrawing) {
                isDrawing = false;
                ctx.beginPath();
            }
        }
        
        function handleTouch(e) {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 
                                             e.type === 'touchmove' ? 'mousemove' : 'mouseup', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        }
        
        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentTool = btn.dataset.tool;
                
                if (currentTool === 'clear') {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    this.app.socket.emit('game-move', {
                        gameId: gameSession.id,
                        move: { type: 'clear' }
                    });
                    currentTool = 'pen';
                }
                
                // Update button states
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                if (currentTool !== 'clear') {
                    btn.classList.add('active');
                }
            });
        });
    }

    // Update Methods
    updateLobbyPlayers(data) {
        const playersContainer = document.getElementById(`lobby-players-${data.gameId}`);
        if (playersContainer && this.currentGameSession) {
            const game = this.nearbyGames.find(g => g.id === data.gameId) || this.currentGameSession;
            playersContainer.innerHTML = `
                <h4>Players (${data.totalPlayers}/${game.maxPlayers})</h4>
                <div class="players-grid">
                    ${this.renderLobbyPlayers(game.players, game.creatorId)}
                </div>
            `;
        }
    }

    updatePlayerReadyStatus(data) {
        const playerElement = document.querySelector(`[data-player-id="${data.playerId}"]`);
        if (playerElement) {
            playerElement.classList.toggle('ready', data.isReady);
        }
    }

    updateGameState(data) {
        if (this.currentGameSession) {
            this.currentGameSession.gameState = data.gameState;
            
            // Update the game interface
            const gameInterface = document.getElementById(`game-interface-${data.gameId}`);
            if (gameInterface) {
                gameInterface.innerHTML = this.renderGameInterface(this.currentGameSession);
                this.attachGameInterfaceListeners(this.currentGameSession);
            }
            
            // Update the status bar
            const statusBar = document.querySelector('.game-status-bar');
            if (statusBar) {
                statusBar.innerHTML = this.renderGameStatusBar(this.currentGameSession);
            }
        }
    }

    toggleReady(gameId) {
        const currentPlayer = this.currentGameSession?.players.find(p => p.id === this.app.currentUser?.id);
        if (currentPlayer) {
            this.app.socket.emit('player-ready', {
                gameId: gameId,
                isReady: !currentPlayer.isReady
            });
        }
    }

    closeGameInterface() {
        if (this.gameInterface) {
            this.gameInterface.classList.remove('active');
            setTimeout(() => {
                if (this.gameInterface) {
                    this.gameInterface.remove();
                    this.gameInterface = null;
                }
            }, 300);
        }
    }

    loadNearbyGames() {
        if (this.app.socket && this.app.socket.connected) {
            this.app.socket.emit('get-nearby-games');
        }
    }
}

// Initialize game manager when app is ready
document.addEventListener('DOMContentLoaded', () => {
    const checkApp = setInterval(() => {
        if (window.app && window.app.socket) {
            window.gameManager = new GameManager(window.app);
            
            // Override app's loadNearbyGames method
            window.app.loadNearbyGames = () => {
                window.gameManager.loadNearbyGames();
            };
            
            // Note: game creation button is handled in app.js to avoid conflicts
            
            clearInterval(checkApp);
        }
    }, 100);
});