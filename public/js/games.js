// Mini Games System
class GameManager {
    constructor(app) {
        this.app = app;
        this.availableGames = [
            {
                id: 'quick-poll',
                name: 'Quick Poll',
                icon: '📊',
                description: 'Create a quick poll for nearby users',
                minPlayers: 1,
                maxPlayers: 20
            },
            {
                id: 'word-chain',
                name: 'Word Chain',
                icon: '🔤',
                description: 'Build words by adding letters',
                minPlayers: 2,
                maxPlayers: 6
            },
            {
                id: 'emoji-guess',
                name: 'Emoji Guess',
                icon: '🎭',
                description: 'Guess what the emoji story means',
                minPlayers: 2,
                maxPlayers: 10
            },
            {
                id: 'nearby-trivia',
                name: 'Local Trivia',
                icon: '🧠',
                description: 'Answer questions about your area',
                minPlayers: 1,
                maxPlayers: 15
            }
        ];
        
        this.activeGames = new Map();
        this.setupGameEvents();
    }

    setupGameEvents() {
        // Socket events for games
        this.app.socket.on('game-created', (game) => {
            this.handleGameCreated(game);
        });

        this.app.socket.on('nearby-games', (games) => {
            this.updateGamesList(games);
        });

        this.app.socket.on('game-joined', (data) => {
            this.handleGameJoined(data);
        });

        this.app.socket.on('game-update', (gameData) => {
            this.handleGameUpdate(gameData);
        });

        this.app.socket.on('game-ended', (data) => {
            this.handleGameEnded(data);
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
                    <h3>🎮 Create a Game</h3>
                    <button class="btn-ghost close-game-creation">&times;</button>
                </div>
                <div class="game-selection">
                    ${this.availableGames.map(game => `
                        <div class="game-option" data-game-id="${game.id}">
                            <div class="game-icon">${game.icon}</div>
                            <div class="game-info">
                                <h4>${game.name}</h4>
                                <p>${game.description}</p>
                                <small>${game.minPlayers}-${game.maxPlayers} players</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="game-creation-form" id="game-creation-form" style="display: none;">
                    <input type="text" id="game-title" placeholder="Game title (optional)">
                    <div class="form-actions">
                        <button class="btn-ghost" onclick="gameManager.closeGameCreation()">Cancel</button>
                        <button class="btn-primary" onclick="gameManager.createGame()">Create Game</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners
        modal.querySelector('.close-game-creation').addEventListener('click', () => {
            this.closeGameCreation();
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
        
        return modal;
    }

    selectGameType(gameId) {
        const modal = document.getElementById('game-creation-modal');
        const selection = modal.querySelector('.game-selection');
        const form = modal.querySelector('.game-creation-form');
        
        // Highlight selected game
        modal.querySelectorAll('.game-option').forEach(option => {
            option.classList.toggle('selected', option.dataset.gameId === gameId);
        });
        
        // Store selected game
        modal.dataset.selectedGame = gameId;
        
        // Show form
        form.style.display = 'block';
        selection.style.display = 'none';
    }

    createGame() {
        const modal = document.getElementById('game-creation-modal');
        const gameId = modal.dataset.selectedGame;
        const title = document.getElementById('game-title').value.trim();
        
        if (!gameId) return;

        const gameType = this.availableGames.find(g => g.id === gameId);
        
        this.app.socket.emit('create-game', {
            type: gameId,
            title: title || gameType.name,
            maxPlayers: gameType.maxPlayers
        });

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
        const gamesList = document.getElementById('games-list');
        
        if (games.length === 0) {
            gamesList.innerHTML = `
                <div class="empty-state">
                    <span class="icon">🎲</span>
                    <p>No games available. Create one!</p>
                </div>
            `;
            return;
        }

        gamesList.innerHTML = games.map(game => {
            const gameType = this.availableGames.find(g => g.id === game.type);
            return `
                <div class="game-card" onclick="gameManager.joinGame('${game.id}')">
                    <div class="game-card-header">
                        <span class="game-card-icon">${gameType?.icon || '🎮'}</span>
                        <h4>${this.app.escapeHtml(game.title)}</h4>
                        <span class="game-status ${game.status}">${game.status}</span>
                    </div>
                    <div class="game-card-body">
                        <p>${gameType?.description || 'Fun game for everyone!'}</p>
                        <div class="game-meta">
                            <span class="players-count">
                                ${game.players.length}/${game.maxPlayers} players
                            </span>
                            <span class="game-time">
                                ${this.app.formatTimeAgo(game.createdAt)}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    joinGame(gameId) {
        this.app.socket.emit('join-game', { gameId });
    }

    handleGameCreated(game) {
        this.app.showNotification(`Game "${game.title}" created!`);
        this.loadNearbyGames();
    }

    handleGameJoined(data) {
        this.showGameInterface(data.game);
    }

    showGameInterface(game) {
        const gameType = this.availableGames.find(g => g.id === game.type);
        const modal = this.createGameInterfaceModal(game, gameType);
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 100);
    }

    createGameInterfaceModal(game, gameType) {
        const modal = document.createElement('div');
        modal.className = 'modal game-interface-modal';
        modal.id = `game-interface-${game.id}`;
        
        let gameContent = '';
        
        switch (game.type) {
            case 'quick-poll':
                gameContent = this.createPollInterface(game);
                break;
            case 'word-chain':
                gameContent = this.createWordChainInterface(game);
                break;
            case 'emoji-guess':
                gameContent = this.createEmojiGuessInterface(game);
                break;
            case 'nearby-trivia':
                gameContent = this.createTriviaInterface(game);
                break;
            default:
                gameContent = `<p>Game interface not implemented yet!</p>`;
        }
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${gameType?.icon || '🎮'} ${this.app.escapeHtml(game.title)}</h3>
                    <button class="btn-ghost close-game-interface">&times;</button>
                </div>
                <div class="game-interface-body">
                    <div class="game-players">
                        <h4>Players (${game.players.length}/${game.maxPlayers})</h4>
                        <div class="players-list">
                            ${game.players.map(player => `
                                <span class="player-tag">
                                    ${player.avatar} ${player.isAnonymous ? 'Anonymous' : this.app.escapeHtml(player.nickname)}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="game-content">
                        ${gameContent}
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners
        modal.querySelector('.close-game-interface').addEventListener('click', () => {
            this.closeGameInterface(game.id);
        });
        
        return modal;
    }

    createPollInterface(game) {
        return `
            <div class="poll-interface">
                <div class="poll-question">
                    <input type="text" id="poll-question" placeholder="What's your question?" ${game.status === 'active' ? 'disabled' : ''}>
                </div>
                <div class="poll-options">
                    <input type="text" class="poll-option" placeholder="Option 1" ${game.status === 'active' ? 'disabled' : ''}>
                    <input type="text" class="poll-option" placeholder="Option 2" ${game.status === 'active' ? 'disabled' : ''}>
                    <button class="btn-ghost add-option" ${game.status === 'active' ? 'disabled' : ''}>+ Add Option</button>
                </div>
                ${game.status === 'waiting' ? '<button class="btn-primary start-poll">Start Poll</button>' : ''}
                <div class="poll-results" id="poll-results-${game.id}"></div>
            </div>
        `;
    }

    createWordChainInterface(game) {
        return `
            <div class="word-chain-interface">
                <div class="current-word">
                    <h4>Current Word:</h4>
                    <span class="word-display">${game.currentWord || 'waiting...'}</span>
                </div>
                <div class="word-input">
                    <input type="text" id="next-word" placeholder="Add your word...">
                    <button class="btn-primary" onclick="gameManager.submitWord('${game.id}')">Submit</button>
                </div>
                <div class="word-history">
                    <h4>Word Chain:</h4>
                    <div class="words-list" id="words-list-${game.id}">
                        ${(game.wordHistory || []).map(word => `<span class="word-tag">${word}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    createEmojiGuessInterface(game) {
        return `
            <div class="emoji-guess-interface">
                <div class="emoji-story">
                    <h4>Guess this story:</h4>
                    <div class="emoji-display">${game.currentEmoji || '🎬🎭🎪'}</div>
                </div>
                <div class="guess-input">
                    <input type="text" id="emoji-guess" placeholder="What's the story?">
                    <button class="btn-primary" onclick="gameManager.submitGuess('${game.id}')">Guess</button>
                </div>
                <div class="guesses-list" id="guesses-list-${game.id}"></div>
            </div>
        `;
    }

    createTriviaInterface(game) {
        return `
            <div class="trivia-interface">
                <div class="trivia-question">
                    <h4>Question ${game.currentQuestion || 1}:</h4>
                    <p>${game.question || 'Loading question...'}</p>
                </div>
                <div class="trivia-options">
                    ${(game.options || ['A', 'B', 'C', 'D']).map((option, index) => `
                        <button class="trivia-option" onclick="gameManager.submitAnswer('${game.id}', ${index})">
                            ${option}
                        </button>
                    `).join('')}
                </div>
                <div class="trivia-score" id="trivia-score-${game.id}">
                    Score: ${game.score || 0}
                </div>
            </div>
        `;
    }

    submitWord(gameId) {
        const input = document.getElementById('next-word');
        const word = input.value.trim().toLowerCase();
        
        if (!word) return;

        this.app.socket.emit('game-action', {
            gameId: gameId,
            action: 'submit-word',
            data: { word: word }
        });

        input.value = '';
    }

    submitGuess(gameId) {
        const input = document.getElementById('emoji-guess');
        const guess = input.value.trim();
        
        if (!guess) return;

        this.app.socket.emit('game-action', {
            gameId: gameId,
            action: 'submit-guess',
            data: { guess: guess }
        });

        input.value = '';
    }

    submitAnswer(gameId, answerIndex) {
        this.app.socket.emit('game-action', {
            gameId: gameId,
            action: 'submit-answer',
            data: { answer: answerIndex }
        });
    }

    handleGameUpdate(gameData) {
        // Update game interface based on game type
        console.log('Game update:', gameData);
        
        // This would contain specific update logic for each game type
        // For now, just show a notification
        if (gameData.message) {
            this.app.showNotification(gameData.message);
        }
    }

    handleGameEnded(data) {
        this.app.showNotification(`Game "${data.title}" has ended!`);
        this.closeGameInterface(data.gameId);
    }

    closeGameInterface(gameId) {
        const modal = document.getElementById(`game-interface-${gameId}`);
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
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
            
            // Add event listener for create game button
            document.getElementById('create-game-btn').addEventListener('click', () => {
                window.gameManager.showGameCreationModal();
            });
            
            clearInterval(checkApp);
        }
    }, 100);
});