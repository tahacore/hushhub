// HushHub Mini-Game Platform Manager with Enhanced State Synchronization
class GameManager {
    constructor(app) {
        this.app = app;
        this.currentGameSession = null;
        this.gameInterface = null;
        this.nearbyGames = [];
        this.isInGame = false;
        
        // Enhanced state synchronization properties
        this.lastKnownSequence = 0;
        this.pendingMoves = new Map();
        this.stateCache = new Map();
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 5;
        this.reconnectionTimer = null;
        this.heartbeatInterval = null;
        this.isReconnecting = false;
        
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
        console.log('🔧 Setting up game events for socket:', this.app.socket);
        
        // Track all socket events for debugging
        const originalEmit = this.app.socket.emit;
        this.app.socket.emit = function(event, data) {
            console.log('📤 EMITTING EVENT:', event, data);
            return originalEmit.call(this, event, data);
        };
        
        // Remove any existing listeners to prevent duplicates
        this.app.socket.removeAllListeners('game-created');
        this.app.socket.removeAllListeners('nearby-games');
        this.app.socket.removeAllListeners('new-game-available');
        this.app.socket.removeAllListeners('game-joined');
        this.app.socket.removeAllListeners('player-joined');
        this.app.socket.removeAllListeners('player-left');
        this.app.socket.removeAllListeners('player-ready');
        this.app.socket.removeAllListeners('game-started');
        this.app.socket.removeAllListeners('game-move');
        this.app.socket.removeAllListeners('game-ended');
        this.app.socket.removeAllListeners('game-cancelled');
        this.app.socket.removeAllListeners('game-error');
        
        // Socket events for games
        this.app.socket.on('game-created', (data) => {
            console.log('🎮 game-created event received:', data);
            this.handleGameCreated(data);
        });

        this.app.socket.on('nearby-games', (games) => {
            console.log('🎮 nearby-games event received:', games?.length, 'games');
            this.updateGamesList(games);
        });

        this.app.socket.on('new-game-available', (game) => {
            console.log('🎮 new-game-available event received:', game);
            this.handleNewGameAvailable(game);
        });

        this.app.socket.on('game-joined', (data) => {
            console.log('🎮 game-joined event received:', data);
            this.handleGameJoined(data);
        });

        this.app.socket.on('player-joined', (data) => {
            console.log('🎮 player-joined event received:', data);
            this.handlePlayerJoined(data);
        });

        this.app.socket.on('player-left', (data) => {
            console.log('🎮 player-left event received:', data);
            this.handlePlayerLeft(data);
        });

        this.app.socket.on('player-ready', (data) => {
            console.log('🎮 player-ready event received:', data);
            this.handlePlayerReady(data);
        });

        this.app.socket.on('game-started', (data) => {
            console.log('🎮 🚀 GAME-STARTED EVENT RECEIVED!!! 🚀🎮');
            console.log('🎮 Event data:', data);
            console.log('🎮 Current game session before handling:', this.currentGameSession);
            this.handleGameStarted(data);
        });

        this.app.socket.on('game-move', (data) => {
            console.log('🎮 game-move event received:', data);
            this.handleGameMove(data);
        });

        this.app.socket.on('game-ended', (data) => {
            console.log('🎮 game-ended event received:', data);
            this.handleGameEnded(data);
        });

        this.app.socket.on('game-cancelled', (data) => {
            console.log('🎮 game-cancelled event received:', data);
            this.handleGameEnded({
                gameId: data.gameId,
                reason: 'Game was cancelled'
            });
        });

        this.app.socket.on('game-error', (data) => {
            console.log('🎮 game-error event received:', data);
            this.handleGameError(data);
        });
        
        // Add game-state-sync event handler for complete synchronization
        this.app.socket.on('game-state-sync', (data) => {
            console.log('🎮 📡 game-state-sync event received:', data);
            this.handleGameStateSync(data);
        });
        
        // Add connection error handling
        this.app.socket.on('disconnect', (reason) => {
            console.log('🔌 Disconnected from server - handling game cleanup:', reason);
            this.handleConnectionLoss(reason);
        });
        
        this.app.socket.on('connect_error', (error) => {
            console.error('🔌 Game connection error:', error);
            this.handleConnectionError(error);
        });
        
        this.app.socket.on('reconnect', (attemptNumber) => {
            console.log('🔌 Reconnected to server after', attemptNumber, 'attempts');
            this.handleReconnection();
        });
        
        this.app.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log('🔌 Reconnection attempt', attemptNumber);
            this.showReconnectionProgress(attemptNumber);
        });
        
        this.app.socket.on('reconnect_failed', () => {
            console.error('🔌 Reconnection failed');
            this.handleReconnectionFailure();
        });
        
        // Enhanced game event handlers
        this.app.socket.on('game-state-recovery', (data) => {
            console.log('🔄 Game state recovery received:', data);
            this.handleGameStateRecovery(data);
        });
        
        this.app.socket.on('game-paused', (data) => {
            console.log('⏸️ Game paused:', data);
            this.handleGamePaused(data);
        });
        
        this.app.socket.on('game-resumed', (data) => {
            console.log('▶️ Game resumed:', data);
            this.handleGameResumed(data);
        });
        
        this.app.socket.on('player-disconnected', (data) => {
            console.log('🔌 Player disconnected:', data);
            this.handlePlayerDisconnected(data);
        });
        
        this.app.socket.on('player-reconnected', (data) => {
            console.log('🔌 Player reconnected:', data);
            this.handlePlayerReconnected(data);
        });
    }
    
    handleConnectionLoss(reason) {
        console.log('🔌 Handling connection loss:', reason);
        
        if (this.isInGame && this.currentGameSession) {
            this.isReconnecting = true;
            
            // Show reconnection UI
            this.showReconnectionInterface();
            
            // Store current game state for recovery
            this.storeGameStateForRecovery();
            
            // Start reconnection attempts
            this.startReconnectionProcess();
        }
    }
    
    handleConnectionError(error) {
        if (this.isInGame) {
            this.app.showNotification('Connection lost during game. Attempting to reconnect...');
            
            // Queue moves locally while disconnected
            this.enableOfflineMode();
        }
    }
    
    handleReconnection() {
        console.log('🔄 Successfully reconnected to server');
        this.isReconnecting = false;
        this.reconnectionAttempts = 0;
        
        if (this.reconnectionTimer) {
            clearTimeout(this.reconnectionTimer);
            this.reconnectionTimer = null;
        }
        
        // Attempt to recover game state
        if (this.currentGameSession) {
            this.attemptGameStateRecovery();
        }
        
        this.hideReconnectionInterface();
        this.app.showNotification('Reconnected! Syncing game state...');
    }
    
    handleReconnectionFailure() {
        this.isReconnecting = false;
        this.reconnectionAttempts = 0;
        
        if (this.isInGame) {
            this.app.showNotification('Unable to reconnect. Game session may be lost.');
            
            // Offer manual retry option
            this.showManualReconnectOption();
        }
    }
    
    startReconnectionProcess() {
        if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
            this.handleReconnectionFailure();
            return;
        }
        
        this.reconnectionAttempts++;
        console.log(`🔄 Starting reconnection attempt ${this.reconnectionAttempts}/${this.maxReconnectionAttempts}`);
        
        // Use exponential backoff for reconnection attempts
        const backoffDelay = Math.min(1000 * Math.pow(2, this.reconnectionAttempts - 1), 10000);
        
        this.reconnectionTimer = setTimeout(() => {
            if (this.app.socket && !this.app.socket.connected) {
                console.log('🔄 Attempting manual reconnection...');
                this.app.socket.connect();
            }
            
            // Schedule next attempt if this one fails
            setTimeout(() => {
                if (!this.app.socket.connected && this.isReconnecting) {
                    this.startReconnectionProcess();
                }
            }, 5000);
        }, backoffDelay);
    }
    
    attemptGameStateRecovery() {
        if (this.currentGameSession && this.app.socket && this.app.socket.connected) {
            console.log('🔄 Attempting to recover game state for:', this.currentGameSession.id);
            
            this.app.socket.emit('reconnect-game', {
                gameId: this.currentGameSession.id,
                lastKnownSequence: this.lastKnownSequence,
                timestamp: Date.now()
            });
        }
    }
    
    handleGameStateRecovery(data) {
        console.log('🔄 Processing game state recovery:', data);
        
        if (data.isReconnection) {
            this.app.showNotification('Game state recovered successfully!');
        }
        
        // Update local state with recovered data
        this.currentGameSession = data.gameSession;
        this.lastKnownSequence = data.gameSession.stateSequence || 0;
        
        // Update interface if open
        if (this.gameInterface) {
            this.updateGameInterfaceFromState(data.gameSession);
        } else if (this.isInGame) {
            // Reopen game interface if it was closed during disconnection
            this.showGamePlayInterface(data.gameSession);
        }
        
        // Resume heartbeat
        this.startHeartbeat();
    }
    
    handleGamePaused(data) {
        this.app.showNotification(`Game paused: ${data.reason}`);
        
        // Show pause overlay
        if (this.gameInterface) {
            this.showPauseOverlay(data);
        }
    }
    
    handleGameResumed(data) {
        this.app.showNotification('Game resumed!');
        
        // Hide pause overlay
        if (this.gameInterface) {
            this.hidePauseOverlay();
        }
    }
    
    handlePlayerDisconnected(data) {
        const player = this.currentGameSession?.players?.find(p => p.id === data.playerId);
        const playerName = player?.nickname || 'A player';
        
        this.app.showNotification(`${playerName} disconnected temporarily`);
        
        // Update player status in UI
        if (this.gameInterface) {
            this.updatePlayerConnectionStatus(data.playerId, false);
        }
    }
    
    handlePlayerReconnected(data) {
        const player = data.player;
        const playerName = player?.nickname || 'A player';
        
        this.app.showNotification(`${playerName} reconnected!`);
        
        // Update player status in UI
        if (this.gameInterface) {
            this.updatePlayerConnectionStatus(data.playerId, true);
        }
    }
    
    showReconnectionInterface() {
        // Create reconnection overlay
        const overlay = document.createElement('div');
        overlay.id = 'reconnection-overlay';
        overlay.className = 'reconnection-overlay';
        overlay.innerHTML = `
            <div class="reconnection-content">
                <div class="reconnection-icon">🔌</div>
                <h3>Connection Lost</h3>
                <p>Attempting to reconnect...</p>
                <div class="reconnection-spinner"></div>
                <div class="reconnection-status">Attempt <span id="attempt-count">1</span> of ${this.maxReconnectionAttempts}</div>
                <button class="manual-reconnect-btn" onclick="window.gameManager?.attemptGameStateRecovery()">
                    Try Now
                </button>
            </div>
        `;
        
        document.body.appendChild(overlay);
    }
    
    hideReconnectionInterface() {
        const overlay = document.getElementById('reconnection-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
    showReconnectionProgress(attemptNumber) {
        const attemptCount = document.getElementById('attempt-count');
        if (attemptCount) {
            attemptCount.textContent = attemptNumber;
        }
    }
    
    showManualReconnectOption() {
        const overlay = document.getElementById('reconnection-overlay');
        if (overlay) {
            const content = overlay.querySelector('.reconnection-content');
            content.innerHTML = `
                <div class="reconnection-icon">❌</div>
                <h3>Reconnection Failed</h3>
                <p>Unable to restore connection automatically.</p>
                <div class="manual-options">
                    <button class="btn-primary" onclick="window.gameManager?.forceReconnect()">
                        Try Again
                    </button>
                    <button class="btn-ghost" onclick="window.gameManager?.exitGame()">
                        Exit Game
                    </button>
                </div>
            `;
        }
    }
    
    forceReconnect() {
        this.reconnectionAttempts = 0;
        this.isReconnecting = true;
        this.startReconnectionProcess();
        this.showReconnectionInterface();
    }
    
    exitGame() {
        this.isInGame = false;
        this.currentGameSession = null;
        this.closeGameInterface();
        this.hideReconnectionInterface();
        this.app.showNotification('Exited game due to connection issues');
    }
    
    storeGameStateForRecovery() {
        if (this.currentGameSession) {
            try {
                localStorage.setItem('hushhub_game_recovery', JSON.stringify({
                    gameSession: this.currentGameSession,
                    lastKnownSequence: this.lastKnownSequence,
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.warn('Failed to store game state for recovery:', error);
            }
        }
    }
    
    loadGameStateFromRecovery() {
        try {
            const stored = localStorage.getItem('hushhub_game_recovery');
            if (stored) {
                const recovery = JSON.parse(stored);
                
                // Only use if less than 10 minutes old
                if (Date.now() - recovery.timestamp < 10 * 60 * 1000) {
                    return recovery;
                }
            }
        } catch (error) {
            console.warn('Failed to load game state from recovery:', error);
        }
        return null;
    }
    
    enableOfflineMode() {
        console.log('🔌 Enabling offline mode for game moves');
        // Store moves locally until reconnection
        this.offlineMode = true;
    }
    
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isInGame && this.app.socket && this.app.socket.connected) {
                this.app.socket.emit('game-heartbeat', {
                    gameId: this.currentGameSession?.id,
                    timestamp: Date.now()
                });
            }
        }, 30000); // 30 second heartbeat
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
        console.log('🚀 START GAME CALLED - gameId:', gameId);
        console.log('🚀 Current game session before start:', this.currentGameSession);
        console.log('🚀 Socket connected:', this.app.socket?.connected);
        console.log('🚀 Is in game:', this.isInGame);
        
        if (!this.app.socket || !this.app.socket.connected) {
            console.error('❌ Cannot start game - socket not connected');
            this.app.showNotification('Connection lost. Please refresh and try again.');
            return;
        }
        
        console.log('🚀 Emitting start-game event to server...');
        this.app.socket.emit('start-game', { gameId });
        
        // Add a timeout to check if we receive the game-started event
        let gameStartTimeout = setTimeout(() => {
            if (this.currentGameSession && this.currentGameSession.id === gameId && this.currentGameSession.status !== 'active') {
                console.warn('⚠️ Game start timeout - did not receive game-started event within 5 seconds');
                console.log('⚠️ Current session status:', this.currentGameSession.status);
                console.log('⚠️ Attempting to check game status manually...');
                
                // Fallback: request game status manually
                this.app.socket.emit('get-game-status', { gameId });
                
                // Listen for the response
                this.app.socket.once('game-status-response', (statusData) => {
                    console.log('📊 Received game status response:', statusData);
                    if (statusData.status === 'active' && statusData.gameState) {
                        console.log('🔧 Manual game start - forcing game interface');
                        this.currentGameSession.status = 'active';
                        this.currentGameSession.gameState = statusData.gameState;
                        this.showGamePlayInterface(this.currentGameSession);
                    }
                });
            }
        }, 5000);
        
        // Clear timeout if game starts normally
        this.gameStartTimeoutId = gameStartTimeout;
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
            console.log('🎮 Opening game interface for game:', game);
            console.log('🎮 Game status:', game.status);
            
            this.currentGameSession = game;
            this.isInGame = true;
            
            // If game is active, request current game details from server to get complete gameState
            if (game.status === 'active') {
                console.log('🎮 Game is active - requesting current game details from server');
                this.app.socket.emit('get-game-details', { gameId: gameId });
                
                // Set up a one-time listener for the response
                this.app.socket.once('game-details', (gameDetails) => {
                    console.log('🎮 Received game details from server:', gameDetails);
                    if (gameDetails.gameId === gameId) {
                        this.currentGameSession = gameDetails.session;
                        this.showGamePlayInterface(gameDetails.session);
                    }
                });
            } else {
                // For waiting games, show interface directly
                this.showGamePlayInterface(game);
            }
        } else {
            console.error('🎮 Game not found in nearby games:', gameId);
        }
    }

    // Event Handlers
    handleGameCreated(data) {
        console.log('🎮 GAME CREATED EVENT:', data);
        
        // Prevent duplicate handling - check if we already have this game session
        if (this.currentGameSession && this.currentGameSession.id === data.session.id) {
            console.log('🔄 Game already created, skipping duplicate handling');
            return;
        }
        
        this.app.showNotification(`Game "${data.session.title}" created successfully!`);
        this.loadNearbyGames();
        
        // Set current game session as creator
        console.log('🎮 Setting current game session as creator:', data.session);
        this.currentGameSession = data.session;
        this.isInGame = true;
        
        // Show game interface directly (no lobby) with waiting state
        console.log('🎮 Opening game interface directly for creator');
        this.showGamePlayInterface(data.session);
    }

    handleNewGameAvailable(game) {
        this.app.showInAppNotification(`🎮 New game available: ${game.title}`);
        this.loadNearbyGames();
    }

    handleGameJoined(data) {
        console.log('🎮 GAME JOINED EVENT:', data);
        const playerName = data.player?.nickname || data.player?.name || 'A player';
        this.app.showInAppNotification(`🎯 ${playerName} joined the game!`);
        console.log('🎮 Setting current game session as joiner:', data.session);
        this.currentGameSession = data.session;
        this.isInGame = true;
        
        // Always show game play interface - no more lobby
        console.log('🎮 Opening game play interface for joiner');
        this.showGamePlayInterface(data.session);
    }

    handlePlayerJoined(data) {
        console.log('🎮 player-joined event received:', data);
        const playerName = data.player?.nickname || data.player?.name || 'A player';
        this.app.showInAppNotification(`🎯 ${playerName} joined the game!`);
        
        // Update current game session if this is the game we're in
        if (this.currentGameSession && this.currentGameSession.id === data.gameId) {
            console.log('🎮 Updating current game session for player joined');
            
            // Update the current game session with the new player data
            if (data.game) {
                console.log('🎮 Using game data from event:', data.game);
                this.currentGameSession = { ...this.currentGameSession, ...data.game };
            } else if (data.player) {
                console.log('🎮 Adding individual player to session:', data.player);
                // Add the new player to the current session
                const playerExists = this.currentGameSession.players.find(p => p.id === data.player.id);
                if (!playerExists) {
                    this.currentGameSession.players.push(data.player);
                }
            }
            
            // If we have the game interface open, update it completely
            if (this.gameInterface) {
                console.log('🎮 Game interface found, updating with new player data');
                const waitingState = this.gameInterface.querySelector('.game-waiting-state');
                if (waitingState) {
                    console.log('🎮 Found waiting state - re-rendering with new data');
                    // Re-render the entire waiting state with updated player count
                    const gamePlayBody = this.gameInterface.querySelector('.game-play-body');
                    if (gamePlayBody) {
                        gamePlayBody.innerHTML = this.renderWaitingState(this.currentGameSession);
                        console.log('🎮 Waiting state re-rendered with updated player count');
                    }
                } else {
                    console.log('🎮 No waiting state found, interface might be in active game mode');
                }
            } else {
                console.log('🎮 No game interface open to update');
            }
        } else {
            console.log('🎮 Player joined event not for current game or no current game');
        }
        
        // Always refresh the games list to show updated player counts
        this.loadNearbyGames();
    }

    handlePlayerLeft(data) {
        console.log('🎮 player-left event received:', data);
        const playerName = data.player?.nickname || data.player?.name || 'A player';
        this.app.showInAppNotification(`👋 ${playerName} left the game`);
        
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
        // Note: Player ready status handling removed since we no longer use lobby system
        // Game will start automatically when all players are ready, handled by server
    }

    handleGameStarted(data) {
        console.log('🎮 🚀 GAME-STARTED EVENT HANDLER CALLED!!! 🚀🎮');
        console.log('🎮 Game started event received:', data);
        
        // Add notification here since we removed it from app.js
        this.app.showInAppNotification(`🚀 Game started! Get ready to play!`);
        
        // Clear any pending timeout
        if (this.gameStartTimeoutId) {
            console.log('🔧 Clearing game start timeout');
            clearTimeout(this.gameStartTimeoutId);
            this.gameStartTimeoutId = null;
        }
        
        // Update current game session for all players
        if (this.currentGameSession && this.currentGameSession.id === data.gameId) {
            console.log('🔧 Updating current game session status and gameState');
            this.currentGameSession.status = 'active';
            this.currentGameSession.gameState = data.gameState;
            
            // If we have a game interface open, update it to show active state
            if (this.gameInterface) {
                console.log('🔧 Updating existing game interface to active state');
                const gamePlayBody = this.gameInterface.querySelector('.game-play-body');
                if (gamePlayBody) {
                    gamePlayBody.innerHTML = this.renderActiveGameState(this.currentGameSession);
                    this.attachGameInterfaceListeners(this.currentGameSession);
                }
            } else {
                console.log('🔧 No interface open, creating new active game interface');
                this.showGamePlayInterface(this.currentGameSession);
            }
        } else if (data.gameSession) {
            console.log('🔧 Using game session from event data');
            // If we don't have the current session, use the one from the event
            this.currentGameSession = data.gameSession;
            this.currentGameSession.status = 'active';
            this.currentGameSession.gameState = data.gameState;
            this.showGamePlayInterface(this.currentGameSession);
        } else {
            console.log('🔧 Trying to find game in nearby games');
            // Fallback: try to find the game in nearby games and open it
            const game = this.nearbyGames.find(g => g.id === data.gameId);
            if (game) {
                game.status = 'active';
                game.gameState = data.gameState;
                this.currentGameSession = game;
                this.showGamePlayInterface(game);
            } else {
                console.log('🔧 Game not found, requesting game data');
                // Last resort: emit a request for the game data
                this.app.socket.emit('get-game-details', { gameId: data.gameId });
            }
        }
    }

    handleGameMove(data) {
        console.log('Game move:', data);
        if (this.gameInterface && this.currentGameSession?.id === data.gameId) {
            this.updateGameState(data);
        }
    }

    handleGameEnded(data) {
        console.log('🎮 game-ended event received:', data);
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
        
        // Clear current game session
        this.currentGameSession = null;
        
        // Refresh games list to remove ended games
        this.loadNearbyGames();
    }

    handleGameError(data) {
        console.error('Game error:', data);
        this.app.showNotification(`Game error: ${data.error}`);
    }
    
    handleGameStateSync(data) {
        console.log('🎮 📡 ENHANCED GAME STATE SYNC - Processing state synchronization:', data);
        
        // Send acknowledgment back to server
        if (data.requiresAck && this.app.socket && this.app.socket.connected) {
            this.app.socket.emit('game-state-ack', {
                stateId: data.id,
                gameId: data.gameId,
                received: true,
                clientSequence: this.lastKnownSequence,
                timestamp: Date.now()
            });
        }
        
        // Update current game session with the synchronized data
        if (this.currentGameSession && this.currentGameSession.id === data.gameId) {
            console.log('🎮 📡 Processing state update for current game');
            console.log('🎮 📡 Server sequence:', data.sequence, 'Client sequence:', this.lastKnownSequence);
            
            // Check for sequence number to detect conflicts or missed updates
            if (data.sequence) {
                if (data.sequence < this.lastKnownSequence) {
                    console.warn('🎮 📡 Received older state, ignoring:', data.sequence, 'vs', this.lastKnownSequence);
                    return;
                }
                
                if (data.sequence > this.lastKnownSequence + 1) {
                    console.warn('🎮 📡 Missed state updates detected, requesting full sync');
                    this.requestFullGameStateSync(data.gameId);
                    return;
                }
                
                this.lastKnownSequence = data.sequence;
            }
            
            // Store previous state for potential rollback
            const previousState = this.cloneGameState(this.currentGameSession);
            
            try {
                // Apply server state with conflict resolution
                this.reconcileGameState(data.gameSession, previousState);
                
                console.log('🎮 📡 State reconciliation completed successfully');
                
                // Cache the state for potential recovery
                this.cacheGameState(data.gameId, data.gameSession);
                
                // Clear any pending moves that were acknowledged by server
                this.clearAcknowledgedMoves(data.gameSession);
                
                // Update the game interface
                this.updateGameInterfaceFromState(data.gameSession);
                
            } catch (error) {
                console.error('🎮 📡 State reconciliation failed:', error);
                // Rollback to previous state and request fresh sync
                this.currentGameSession = previousState;
                this.requestFullGameStateSync(data.gameId);
            }
        } else {
            console.log('🎮 📡 Game state sync for different game or no current game');
            console.log('🎮 📡 Current game ID:', this.currentGameSession?.id);
            console.log('🎮 📡 Sync game ID:', data.gameId);
        }
        
        // Always refresh the games list to show updated state
        this.loadNearbyGames();
    }
    
    reconcileGameState(serverState, clientState) {
        console.log('🔄 Reconciling game state differences');
        
        // Compare critical game properties
        const conflicts = this.detectStateConflicts(serverState, clientState);
        
        if (conflicts.length > 0) {
            console.warn('🔄 State conflicts detected:', conflicts);
            
            // Apply conflict resolution strategy
            this.resolveStateConflicts(serverState, clientState, conflicts);
        }
        
        // Update current game session with resolved state
        this.currentGameSession = { ...this.currentGameSession, ...serverState };
        
        // Validate the final state
        if (!this.validateGameState(this.currentGameSession)) {
            throw new Error('Final game state failed validation');
        }
    }
    
    detectStateConflicts(serverState, clientState) {
        const conflicts = [];
        
        if (!clientState || !serverState) {
            return conflicts;
        }
        
        // Check for turn conflicts
        if (serverState.gameState?.currentTurn !== clientState.gameState?.currentTurn) {
            conflicts.push({
                type: 'turn_mismatch',
                server: serverState.gameState?.currentTurn,
                client: clientState.gameState?.currentTurn
            });
        }
        
        // Check for game board differences (tic-tac-toe)
        if (serverState.type === 'tic-tac-toe') {
            const serverBoard = serverState.gameState?.gameData?.board;
            const clientBoard = clientState.gameState?.gameData?.board;
            
            if (JSON.stringify(serverBoard) !== JSON.stringify(clientBoard)) {
                conflicts.push({
                    type: 'board_mismatch',
                    server: serverBoard,
                    client: clientBoard
                });
            }
        }
        
        // Check for player status differences
        if (serverState.players?.length !== clientState.players?.length) {
            conflicts.push({
                type: 'player_count_mismatch',
                server: serverState.players?.length,
                client: clientState.players?.length
            });
        }
        
        return conflicts;
    }
    
    resolveStateConflicts(serverState, clientState, conflicts) {
        console.log('🔧 Resolving state conflicts using server authority');
        
        // Server state always takes precedence for authoritative resolution
        conflicts.forEach(conflict => {
            switch (conflict.type) {
                case 'turn_mismatch':
                    console.log(`🔧 Resolving turn conflict: client(${conflict.client}) -> server(${conflict.server})`);
                    break;
                case 'board_mismatch':
                    console.log('🔧 Resolving board state conflict with server authority');
                    break;
                case 'player_count_mismatch':
                    console.log(`🔧 Resolving player count conflict: client(${conflict.client}) -> server(${conflict.server})`);
                    break;
            }
        });
        
        // Apply optimistic update rollback if needed
        this.rollbackOptimisticUpdates();
    }
    
    rollbackOptimisticUpdates() {
        // Remove any pending moves that weren't acknowledged
        for (const [moveId, moveData] of this.pendingMoves) {
            if (Date.now() - moveData.timestamp > 5000) { // 5 second timeout
                console.log('🔧 Rolling back expired optimistic move:', moveId);
                this.pendingMoves.delete(moveId);
            }
        }
    }
    
    clearAcknowledgedMoves(gameSession) {
        // Clear pending moves that have been processed by the server
        const serverMoveIds = new Set(
            gameSession.gameState?.moves?.map(move => move.id) || []
        );
        
        for (const [moveId] of this.pendingMoves) {
            if (serverMoveIds.has(moveId)) {
                console.log('✅ Move acknowledged by server:', moveId);
                this.pendingMoves.delete(moveId);
            }
        }
    }
    
    requestFullGameStateSync(gameId) {
        if (this.app.socket && this.app.socket.connected) {
            console.log('📡 Requesting full game state sync for:', gameId);
            this.app.socket.emit('request-game-sync', { 
                gameId: gameId,
                lastKnownSequence: this.lastKnownSequence,
                timestamp: Date.now()
            });
        }
    }
    
    cacheGameState(gameId, gameState) {
        this.stateCache.set(gameId, {
            state: this.cloneGameState(gameState),
            timestamp: Date.now(),
            sequence: this.lastKnownSequence
        });
        
        // Keep only last 5 cached states
        if (this.stateCache.size > 5) {
            const oldestKey = this.stateCache.keys().next().value;
            this.stateCache.delete(oldestKey);
        }
    }
    
    cloneGameState(gameState) {
        return JSON.parse(JSON.stringify(gameState));
    }
    
    validateGameState(gameSession) {
        if (!gameSession || !gameSession.gameState) {
            return false;
        }
        
        // Basic validation
        if (!gameSession.id || !gameSession.type || !gameSession.players) {
            return false;
        }
        
        // Game-specific validation
        switch (gameSession.type) {
            case 'tic-tac-toe':
                return this.validateTicTacToeState(gameSession.gameState);
            default:
                return true;
        }
    }
    
    validateTicTacToeState(gameState) {
        const board = gameState.gameData?.board;
        if (!Array.isArray(board) || board.length !== 9) {
            return false;
        }
        
        // Validate that board contains only valid values
        return board.every(cell => cell === null || cell === 'X' || cell === 'O');
    }
    
    updateGameInterfaceFromState(gameSession) {
        if (!this.gameInterface) return;
        
        console.log('🎮 📡 Updating game interface from synchronized state');
        
        const gamePlayBody = this.gameInterface.querySelector('.game-play-body');
        if (gamePlayBody) {
            const isWaiting = gameSession.status === 'waiting' || (!gameSession.gameState && gameSession.status !== 'active');
            
            gamePlayBody.innerHTML = isWaiting ? 
                this.renderWaitingState(gameSession) : 
                this.renderActiveGameState(gameSession);
            
            // Re-attach event listeners if game is active
            if (!isWaiting) {
                this.attachGameInterfaceListeners(gameSession);
            }
            
            console.log('🎮 📡 Game interface updated successfully');
        }
    }

    // Game Interface Methods - Legacy lobby method replaced with direct game interface
    showGameLobby(gameSession) {
        console.log('🔧 LEGACY showGameLobby called - redirecting to game interface:', gameSession);
        
        // Always redirect to game play interface (no more lobby)
        this.showGamePlayInterface(gameSession);
    }

    showGamePlayInterface(gameSession) {
        console.log('🎮 SHOW GAME PLAY INTERFACE called for session:', gameSession);
        console.log('🎮 Game session status:', gameSession.status);
        console.log('🎮 Game session gameState exists:', !!gameSession.gameState);
        
        this.closeGameInterface();
        
        const modal = document.createElement('div');
        modal.className = 'modal game-play-modal';
        modal.id = `game-play-${gameSession.id}`;
        
        const gameType = this.gameTypes[gameSession.type];
        
        // Fix waiting state detection - should be based on game status, not just gameState existence
        const isWaiting = gameSession.status === 'waiting' || (!gameSession.gameState && gameSession.status !== 'active');
        
        console.log('🎮 Is waiting state:', isWaiting);
        console.log('🎮 Will render:', isWaiting ? 'WAITING STATE' : 'ACTIVE GAME STATE');
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${gameType?.icon || '🎮'} ${this.app.escapeHtml(gameSession.title)}</h3>
                    <button class="btn-ghost close-game-play">&times;</button>
                </div>
                <div class="game-play-body">
                    ${isWaiting ? this.renderWaitingState(gameSession) : this.renderActiveGameState(gameSession)}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.gameInterface = modal;
        console.log('🎮 Game play interface added to DOM');
        
        // Add close button event listener
        modal.querySelector('.close-game-play').addEventListener('click', () => {
            console.log('Close game play button clicked');
            this.handleGameInterfaceClose(gameSession);
        });
        
        // Also handle clicking outside the modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                console.log('Clicked outside game play modal');
                this.handleGameInterfaceClose(gameSession);
            }
        });
        
        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                console.log('Escape key pressed in game play modal');
                this.handleGameInterfaceClose(gameSession);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Add game-specific event listeners if game is active
        if (!isWaiting) {
            this.attachGameInterfaceListeners(gameSession);
        }
        
        setTimeout(() => {
            modal.classList.add('active');
            console.log('🎮 Game play interface activated');
        }, 100);
    }

    renderWaitingState(gameSession) {
        const gameType = this.gameTypes[gameSession.type];
        return `
            <div class="game-waiting-state">
                <div class="waiting-header">
                    <div class="waiting-icon">${gameType?.icon || '🎮'}</div>
                    <h2>Waiting for Players...</h2>
                    <p>Share your game ID with nearby users or wait for them to join!</p>
                </div>
                
                <div class="game-info-card">
                    <div class="game-details">
                        <div class="detail-item">
                            <span class="detail-icon">🎯</span>
                            <span class="detail-text">${gameType?.name}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-icon">👥</span>
                            <span class="detail-text">${gameSession.players?.length || 1}/${gameType?.maxPlayers} players</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-icon">⏱️</span>
                            <span class="detail-text">${gameType?.estimatedDuration}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-icon">🏷️</span>
                            <span class="detail-text">${gameType?.difficulty} difficulty</span>
                        </div>
                    </div>
                </div>
                
                <div class="waiting-animation">
                    <div class="pulse-dot"></div>
                    <div class="pulse-dot"></div>
                    <div class="pulse-dot"></div>
                </div>
                
                <div class="waiting-actions">
                    <div class="waiting-message">
                        <p><strong>How to play:</strong> ${gameType?.description}</p>
                        <p>Game will start automatically when enough players join!</p>
                    </div>
                </div>
            </div>
        `;
    }

    renderActiveGameState(gameSession) {
        console.log('🎮 🎨 RENDER ACTIVE GAME STATE called');
        console.log('🎮 🎨 Game session:', gameSession);
        console.log('🎮 🎨 Game status:', gameSession.status);
        console.log('🎮 🎨 Game state exists:', !!gameSession.gameState);
        console.log('🎮 🎨 Game state:', gameSession.gameState);
        
        if (!gameSession.gameState) {
            console.error('🎮 🎨 ERROR: No gameState for active game! Falling back to waiting state.');
            return this.renderWaitingState(gameSession);
        }
        
        return `
            <div class="game-status-bar">
                ${this.renderGameStatusBar(gameSession)}
            </div>
            
            <div class="game-main-content">
                <div class="game-interface" id="game-interface-${gameSession.id}">
                    ${this.renderGameInterface(gameSession)}
                </div>
                
                <div class="game-players-sidebar">
                    ${this.renderGamePlayers(gameSession.players)}
                </div>
            </div>
        `;
    }

    handleGameInterfaceClose(gameSession) {
        console.log('🎮 Handling game interface close for session:', gameSession);
        
        // If user is the creator and game is still waiting, end the game session
        if (gameSession.creatorId === this.app.currentUser?.id && gameSession.status === 'waiting') {
            console.log('🎮 Creator closing waiting game - ending session');
            this.app.socket.emit('end-game', { gameId: gameSession.id });
            this.app.showInAppNotification('🚪 Game session ended');
        }
        
        this.closeGameInterface();
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
        const isMyTurn = gameSession.gameState.currentTurn === this.app.currentUser?.id;
        
        return `
            <div class="tic-tac-toe-game">
                <div class="game-status-info">
                    <h4>You are playing as: <span class="my-symbol">${mySymbol}</span></h4>
                    <p class="turn-status ${isMyTurn ? 'my-turn' : 'wait-turn'}">
                        ${isMyTurn ? '🎯 Your turn! Click a cell to play.' : '⏳ Waiting for opponent...'}
                    </p>
                </div>
                
                <div class="game-board-container">
                    <div class="game-board tic-tac-toe-board">
                        ${board.map((cell, index) => `
                            <button class="board-cell ${cell ? 'filled' : ''} ${isMyTurn && !cell ? 'available' : ''}" 
                                    data-position="${index}" 
                                    ${cell || !isMyTurn ? 'disabled' : ''}
                                    title="${cell ? cell : (isMyTurn ? 'Click to place ' + mySymbol : 'Wait for your turn')}">
                                <span class="cell-content">${cell || ''}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <div class="game-instructions">
                    <p>🎯 <strong>Goal:</strong> Get 3 in a row (horizontal, vertical, or diagonal)</p>
                    <p>⭕ ${mySymbol === 'X' ? 'You go first!' : 'Opponent goes first'}</p>
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

    closeGameInterface() {
        console.log('🔧 Closing game interface');
        if (this.gameInterface) {
            console.log('🔧 Game interface found, removing active class and cleaning up');
            this.gameInterface.classList.remove('active');
            
            // Remove escape key listener
            document.removeEventListener('keydown', this.escapeHandler);
            
            // Use a shorter timeout to make transitions feel snappier
            setTimeout(() => {
                if (this.gameInterface) {
                    console.log('🔧 Removing game interface from DOM');
                    this.gameInterface.remove();
                    this.gameInterface = null;
                    
                    // Clear current game session if game ended
                    if (this.currentGameSession && this.currentGameSession.status === 'finished') {
                        this.currentGameSession = null;
                        this.isInGame = false;
                    }
                }
            }, 200); // Reduced from 300ms
        } else {
            console.log('🔧 No game interface to close');
        }
    }

    loadNearbyGames() {
        if (this.app.socket && this.app.socket.connected) {
            this.app.socket.emit('get-nearby-games');
        }
    }
    
    updateNearbyGames(games) {
        // Update the games list with received games data
        this.updateGamesList(games);
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