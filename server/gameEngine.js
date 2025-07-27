// Enhanced Game Engine for HushHub Mini-Games Platform with State Synchronization
class GameEngine {
    constructor() {
        this.activeSessions = new Map();
        this.playerConnections = new Map(); // Track player connection states
        this.stateHistory = new Map(); // Store game state history for recovery
        this.gameTypes = {
            "tic-tac-toe": {
                name: "Tic Tac Toe",
                icon: "⭕",
                description: "Classic 3x3 grid game",
                minPlayers: 2,
                maxPlayers: 2,
                estimatedDuration: "2-5 minutes",
                category: "strategy"
            },
            "rock-paper-scissors": {
                name: "Rock Paper Scissors", 
                icon: "✂️",
                description: "Best of 3 rounds",
                minPlayers: 2,
                maxPlayers: 2,
                estimatedDuration: "1-2 minutes",
                category: "chance"
            },
            "math-quiz": {
                name: "Quick Math",
                icon: "🧮", 
                description: "Fast math challenge",
                minPlayers: 1,
                maxPlayers: 8,
                estimatedDuration: "3-5 minutes",
                category: "knowledge"
            },
            "word-association": {
                name: "Word Chain",
                icon: "🔤",
                description: "Build word chains together", 
                minPlayers: 2,
                maxPlayers: 6,
                estimatedDuration: "5-10 minutes",
                category: "creative"
            },
            "drawing-guess": {
                name: "Drawing Guess",
                icon: "🎨",
                description: "Draw and guess pictures",
                minPlayers: 3,
                maxPlayers: 8,
                estimatedDuration: "10-15 minutes",
                category: "creative"
            }
        };
    }

    createGameSession(gameConfig, creator) {
        const gameType = this.gameTypes[gameConfig.type];
        if (!gameType) {
            throw new Error(`Invalid game type: ${gameConfig.type}`);
        }

        const gameId = this.generateGameId();
        const session = {
            id: gameId,
            type: gameConfig.type,
            title: gameConfig.title || gameType.name,
            status: "waiting",
            creatorId: creator.id,
            creatorLocation: creator.location,
            maxPlayers: gameConfig.maxPlayers || gameType.maxPlayers,
            minPlayers: gameType.minPlayers,
            players: [{
                id: creator.id,
                nickname: creator.nickname,
                avatar: creator.avatar,
                isAnonymous: creator.isAnonymous,
                score: 0,
                isReady: false,
                joinedAt: Date.now(),
                isConnected: true,
                lastSeen: Date.now()
            }],
            gameState: this.initializeGameState(gameConfig.type),
            settings: {
                timePerTurn: gameConfig.timePerTurn || 30000,
                autoStart: gameConfig.autoStart !== false,
                spectators: gameConfig.spectators || false,
                rounds: gameConfig.rounds || 1
            },
            createdAt: Date.now(),
            startedAt: null,
            finishedAt: null,
            lastActivity: Date.now(),
            // Enhanced state synchronization fields
            stateSequence: 0,
            lastStateUpdate: Date.now(),
            acknowledgments: new Map(),
            pendingMoves: new Map()
        };

        this.activeSessions.set(gameId, session);
        this.trackPlayerConnection(creator.id, gameId, true);
        this.saveGameStateSnapshot(gameId, session);
        return session;
    }

    joinGameSession(gameId, player) {
        const session = this.activeSessions.get(gameId);
        if (!session) {
            throw new Error("Game session not found");
        }

        if (session.status !== "waiting") {
            throw new Error("Game is not accepting new players");
        }

        if (session.players.length >= session.maxPlayers) {
            throw new Error("Game is full");
        }

        // Check if player is already in the game
        const existingPlayer = session.players.find(p => p.id === player.id);
        if (existingPlayer) {
            // Update connection status if rejoining
            existingPlayer.isConnected = true;
            existingPlayer.lastSeen = Date.now();
            this.trackPlayerConnection(player.id, gameId, true);
            return session;
        }

        session.players.push({
            id: player.id,
            nickname: player.nickname,
            avatar: player.avatar,
            isAnonymous: player.isAnonymous,
            score: 0,
            isReady: false,
            joinedAt: Date.now(),
            isConnected: true,
            lastSeen: Date.now()
        });

        session.lastActivity = Date.now();
        session.stateSequence++;
        this.trackPlayerConnection(player.id, gameId, true);
        this.saveGameStateSnapshot(gameId, session);

        // Auto-start if conditions are met
        if (session.settings.autoStart && session.players.length >= session.minPlayers) {
            this.startGame(gameId);
        }

        return session;
    }

    leaveGameSession(gameId, playerId) {
        const session = this.activeSessions.get(gameId);
        if (!session) {
            return null;
        }

        session.players = session.players.filter(p => p.id !== playerId);
        session.lastActivity = Date.now();

        // If creator left or no players remain, end the game
        if (session.creatorId === playerId || session.players.length === 0) {
            session.status = "cancelled";
            session.finishedAt = Date.now();
            return session;
        }

        // If game was active and below minimum players, end it
        if (session.status === "active" && session.players.length < session.minPlayers) {
            session.status = "finished";
            session.finishedAt = Date.now();
            return session;
        }

        return session;
    }

    setPlayerReady(gameId, playerId, isReady) {
        const session = this.activeSessions.get(gameId);
        if (!session || session.status !== "waiting") {
            return null;
        }

        const player = session.players.find(p => p.id === playerId);
        if (!player) {
            return null;
        }

        player.isReady = isReady;
        session.lastActivity = Date.now();

        // Check if all players are ready and we can start
        const allReady = session.players.every(p => p.isReady);
        if (allReady && session.players.length >= session.minPlayers) {
            this.startGame(gameId);
        }

        return session;
    }

    startGame(gameId) {
        const session = this.activeSessions.get(gameId);
        if (!session || session.status !== "waiting") {
            return null;
        }

        if (session.players.length < session.minPlayers) {
            throw new Error("Not enough players to start the game");
        }

        session.status = "active";
        session.startedAt = Date.now();
        session.lastActivity = Date.now();

        // Initialize game-specific starting state
        this.initializeActiveGameState(session);

        return session;
    }

    processGameMove(gameId, playerId, move) {
        const session = this.activeSessions.get(gameId);
        if (!session || session.status !== "active") {
            throw new Error("Game is not active");
        }

        const player = session.players.find(p => p.id === playerId);
        if (!player) {
            throw new Error("Player not in game");
        }

        if (!player.isConnected) {
            throw new Error("Player is not connected");
        }

        // Update player's last seen
        player.lastSeen = Date.now();

        // Validate turn-based games
        if (session.gameState.currentTurn && session.gameState.currentTurn !== playerId) {
            throw new Error("Not your turn");
        }

        // Create a snapshot of the current state for rollback capability
        const previousState = this.cloneGameState(session.gameState);
        const previousSequence = session.stateSequence;

        try {
            // Process move based on game type
            const result = this.processGameSpecificMove(session, playerId, move);
            
            // Increment state sequence for synchronization
            session.stateSequence++;
            session.lastActivity = Date.now();
            session.lastStateUpdate = Date.now();
            
            // Add move to history with sequence number
            session.gameState.moves.push({
                id: this.generateMoveId(),
                playerId,
                move,
                timestamp: Date.now(),
                sequence: session.stateSequence
            });

            // Check for win condition
            const winResult = this.checkWinCondition(session);
            if (winResult.hasWinner) {
                session.status = "finished";
                session.finishedAt = Date.now();
                session.gameState.winner = winResult.winner;
                session.gameState.winCondition = winResult.condition;
                session.stateSequence++;
            } else {
                // Advance turn for turn-based games
                this.advanceTurn(session);
            }

            // Validate state consistency
            if (!this.isGameStateValid(session)) {
                throw new Error("Invalid game state detected after move");
            }

            // Save state snapshot for recovery
            this.saveGameStateSnapshot(gameId, session);

            return {
                session,
                moveResult: result,
                winResult,
                stateSequence: session.stateSequence
            };

        } catch (error) {
            // Rollback to previous state on error
            session.gameState = previousState;
            session.stateSequence = previousSequence;
            console.error(`Game move failed for game ${gameId}, player ${playerId}:`, error);
            throw error;
        }
    }

    initializeGameState(gameType) {
        const baseState = {
            currentTurn: null,
            turnTimeout: 30000,
            gameData: {},
            moves: [],
            winner: null,
            winCondition: null
        };

        switch (gameType) {
            case "tic-tac-toe":
                return {
                    ...baseState,
                    gameData: {
                        board: Array(9).fill(null), // 3x3 grid
                        symbols: {} // playerId -> symbol mapping
                    }
                };
            
            case "rock-paper-scissors":
                return {
                    ...baseState,
                    gameData: {
                        rounds: [],
                        currentRound: 1,
                        maxRounds: 3,
                        choices: {} // playerId -> choice for current round
                    }
                };
            
            case "math-quiz":
                return {
                    ...baseState,
                    gameData: {
                        questions: [],
                        currentQuestion: 0,
                        answers: {}, // playerId -> answers array
                        scores: {}, // playerId -> score
                        timePerQuestion: 15000
                    }
                };
            
            case "word-association":
                return {
                    ...baseState,
                    gameData: {
                        words: [],
                        currentWord: "",
                        usedWords: new Set(),
                        consecutivePasses: 0
                    }
                };
            
            case "drawing-guess":
                return {
                    ...baseState,
                    gameData: {
                        rounds: [],
                        currentRound: 1,
                        drawer: null,
                        word: "",
                        guesses: [],
                        drawing: [],
                        timePerRound: 90000
                    }
                };
            
            default:
                return baseState;
        }
    }

    initializeActiveGameState(session) {
        switch (session.type) {
            case "tic-tac-toe":
                // Assign X and O to players
                session.gameState.gameData.symbols[session.players[0].id] = "X";
                session.gameState.gameData.symbols[session.players[1].id] = "O";
                session.gameState.currentTurn = session.players[0].id; // X goes first
                break;
                
            case "rock-paper-scissors":
                session.gameState.currentTurn = null; // Both players choose simultaneously
                break;
                
            case "math-quiz":
                this.generateMathQuestions(session);
                session.gameState.currentTurn = null; // All players answer simultaneously
                break;
                
            case "word-association":
                session.gameState.currentTurn = session.players[0].id;
                break;
                
            case "drawing-guess":
                session.gameState.gameData.drawer = session.players[0].id;
                session.gameState.currentTurn = session.gameState.gameData.drawer;
                this.generateDrawingWord(session);
                break;
        }
    }

    processGameSpecificMove(session, playerId, move) {
        switch (session.type) {
            case "tic-tac-toe":
                return this.processTicTacToeMove(session, playerId, move);
            case "rock-paper-scissors":
                return this.processRPSMove(session, playerId, move);
            case "math-quiz":
                return this.processMathQuizMove(session, playerId, move);
            case "word-association":
                return this.processWordAssociationMove(session, playerId, move);
            case "drawing-guess":
                return this.processDrawingGuessMove(session, playerId, move);
            default:
                throw new Error(`Move processing not implemented for ${session.type}`);
        }
    }

    processTicTacToeMove(session, playerId, move) {
        const { position } = move;
        const board = session.gameState.gameData.board;
        
        if (position < 0 || position > 8 || board[position] !== null) {
            throw new Error("Invalid move");
        }
        
        const symbol = session.gameState.gameData.symbols[playerId];
        board[position] = symbol;
        
        return { position, symbol };
    }

    processRPSMove(session, playerId, move) {
        const { choice } = move; // "rock", "paper", "scissors"
        const validChoices = ["rock", "paper", "scissors"];
        
        if (!validChoices.includes(choice)) {
            throw new Error("Invalid choice");
        }
        
        session.gameState.gameData.choices[playerId] = choice;
        
        // Check if both players have chosen
        const choiceCount = Object.keys(session.gameState.gameData.choices).length;
        if (choiceCount === session.players.length) {
            return this.resolveRPSRound(session);
        }
        
        return { choice, waiting: true };
    }

    processMathQuizMove(session, playerId, move) {
        const { answer, questionIndex } = move;
        const currentQ = session.gameState.gameData.currentQuestion;
        
        if (questionIndex !== currentQ) {
            throw new Error("Question mismatch");
        }
        
        if (!session.gameState.gameData.answers[playerId]) {
            session.gameState.gameData.answers[playerId] = [];
        }
        
        session.gameState.gameData.answers[playerId][questionIndex] = {
            answer,
            timestamp: Date.now()
        };
        
        return { answer, questionIndex };
    }

    processWordAssociationMove(session, playerId, move) {
        const { word } = move;
        const gameData = session.gameState.gameData;
        
        if (gameData.usedWords.has(word.toLowerCase())) {
            throw new Error("Word already used");
        }
        
        if (gameData.currentWord && !this.isValidWordAssociation(gameData.currentWord, word)) {
            throw new Error("Invalid word association");
        }
        
        gameData.words.push(word);
        gameData.currentWord = word;
        gameData.usedWords.add(word.toLowerCase());
        gameData.consecutivePasses = 0;
        
        return { word };
    }

    processDrawingGuessMove(session, playerId, move) {
        const { type, data } = move;
        
        if (type === "draw") {
            if (playerId !== session.gameState.gameData.drawer) {
                throw new Error("Only the drawer can draw");
            }
            session.gameState.gameData.drawing.push(data);
            return { type: "draw", data };
        } else if (type === "guess") {
            if (playerId === session.gameState.gameData.drawer) {
                throw new Error("Drawer cannot guess");
            }
            const guess = {
                playerId,
                guess: data.guess,
                timestamp: Date.now()
            };
            session.gameState.gameData.guesses.push(guess);
            return { type: "guess", data: guess };
        }
        
        throw new Error("Invalid move type");
    }

    checkWinCondition(session) {
        switch (session.type) {
            case "tic-tac-toe":
                return this.checkTicTacToeWin(session);
            case "rock-paper-scissors":
                return this.checkRPSWin(session);
            case "math-quiz":
                return this.checkMathQuizWin(session);
            case "word-association":
                return this.checkWordAssociationWin(session);
            case "drawing-guess":
                return this.checkDrawingGuessWin(session);
            default:
                return { hasWinner: false };
        }
    }

    checkTicTacToeWin(session) {
        const board = session.gameState.gameData.board;
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6] // diagonals
        ];
        
        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                const winnerId = Object.keys(session.gameState.gameData.symbols)
                    .find(id => session.gameState.gameData.symbols[id] === board[a]);
                return {
                    hasWinner: true,
                    winner: winnerId,
                    condition: { type: "line", pattern }
                };
            }
        }
        
        // Check for draw
        if (board.every(cell => cell !== null)) {
            return {
                hasWinner: true,
                winner: null,
                condition: { type: "draw" }
            };
        }
        
        return { hasWinner: false };
    }

    checkRPSWin(session) {
        const gameData = session.gameState.gameData;
        if (gameData.currentRound > gameData.maxRounds) {
            // Count wins for each player
            const wins = {};
            session.players.forEach(p => wins[p.id] = 0);
            
            gameData.rounds.forEach(round => {
                if (round.winner) {
                    wins[round.winner]++;
                }
            });
            
            const maxWins = Math.max(...Object.values(wins));
            const winners = Object.keys(wins).filter(id => wins[id] === maxWins);
            
            if (winners.length === 1) {
                return {
                    hasWinner: true,
                    winner: winners[0],
                    condition: { type: "best_of_rounds", wins }
                };
            } else {
                return {
                    hasWinner: true,
                    winner: null,
                    condition: { type: "tie", wins }
                };
            }
        }
        
        return { hasWinner: false };
    }

    checkMathQuizWin(session) {
        const gameData = session.gameState.gameData;
        if (gameData.currentQuestion >= gameData.questions.length) {
            // Calculate final scores
            const scores = {};
            session.players.forEach(p => {
                scores[p.id] = this.calculateMathQuizScore(session, p.id);
            });
            
            const maxScore = Math.max(...Object.values(scores));
            const winners = Object.keys(scores).filter(id => scores[id] === maxScore);
            
            if (winners.length === 1) {
                return {
                    hasWinner: true,
                    winner: winners[0],
                    condition: { type: "highest_score", scores }
                };
            } else {
                return {
                    hasWinner: true,
                    winner: null,
                    condition: { type: "tie", scores }
                };
            }
        }
        
        return { hasWinner: false };
    }

    checkWordAssociationWin(session) {
        const gameData = session.gameState.gameData;
        
        // Game ends if too many consecutive passes or word limit reached
        if (gameData.consecutivePasses >= session.players.length || gameData.words.length >= 50) {
            return {
                hasWinner: true,
                winner: null, // Collaborative game
                condition: { 
                    type: "word_chain_complete",
                    wordCount: gameData.words.length,
                    finalWord: gameData.currentWord
                }
            };
        }
        
        return { hasWinner: false };
    }

    checkDrawingGuessWin(session) {
        const gameData = session.gameState.gameData;
        
        // Check if someone guessed correctly
        const correctGuess = gameData.guesses.find(g => 
            g.guess.toLowerCase().trim() === gameData.word.toLowerCase().trim()
        );
        
        if (correctGuess) {
            return {
                hasWinner: true,
                winner: correctGuess.playerId,
                condition: { 
                    type: "correct_guess",
                    word: gameData.word,
                    guess: correctGuess.guess
                }
            };
        }
        
        return { hasWinner: false };
    }

    advanceTurn(session) {
        if (!session.gameState.currentTurn) return;
        
        switch (session.type) {
            case "tic-tac-toe":
                // Switch between the two players
                const currentIndex = session.players.findIndex(p => p.id === session.gameState.currentTurn);
                const nextIndex = (currentIndex + 1) % session.players.length;
                session.gameState.currentTurn = session.players[nextIndex].id;
                break;
                
            case "word-association":
                // Next player in rotation
                const wordCurrentIndex = session.players.findIndex(p => p.id === session.gameState.currentTurn);
                const wordNextIndex = (wordCurrentIndex + 1) % session.players.length;
                session.gameState.currentTurn = session.players[wordNextIndex].id;
                break;
        }
    }

    // Helper methods
    generateGameId() {
        return 'game_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    generateMathQuestions(session) {
        const questions = [];
        for (let i = 0; i < 10; i++) {
            const a = Math.floor(Math.random() * 50) + 1;
            const b = Math.floor(Math.random() * 50) + 1;
            const operations = ['+', '-', '*'];
            const op = operations[Math.floor(Math.random() * operations.length)];
            
            let answer;
            switch (op) {
                case '+': answer = a + b; break;
                case '-': answer = a - b; break;
                case '*': answer = a * b; break;
            }
            
            questions.push({
                question: `${a} ${op} ${b}`,
                answer,
                options: this.generateMathOptions(answer)
            });
        }
        session.gameState.gameData.questions = questions;
    }

    generateMathOptions(correctAnswer) {
        const options = [correctAnswer];
        while (options.length < 4) {
            const wrong = correctAnswer + (Math.floor(Math.random() * 20) - 10);
            if (wrong !== correctAnswer && !options.includes(wrong)) {
                options.push(wrong);
            }
        }
        return this.shuffleArray(options);
    }

    generateDrawingWord(session) {
        const words = [
            "cat", "house", "tree", "car", "sun", "flower", "bird", "fish",
            "mountain", "beach", "pizza", "guitar", "book", "clock", "smile"
        ];
        const word = words[Math.floor(Math.random() * words.length)];
        session.gameState.gameData.word = word;
    }

    isValidWordAssociation(currentWord, newWord) {
        // Simple validation - could be enhanced with AI/dictionary
        return newWord.length > 1 && /^[a-zA-Z]+$/.test(newWord);
    }

    calculateMathQuizScore(session, playerId) {
        const answers = session.gameState.gameData.answers[playerId] || [];
        const questions = session.gameState.gameData.questions;
        
        let score = 0;
        answers.forEach((answer, index) => {
            if (answer && answer.answer === questions[index].answer) {
                // Bonus points for speed
                const timeBonus = Math.max(0, 15000 - (answer.timestamp - session.startedAt)) / 1000;
                score += 100 + timeBonus;
            }
        });
        
        return Math.round(score);
    }

    resolveRPSRound(session) {
        const choices = session.gameState.gameData.choices;
        const players = session.players;
        const gameData = session.gameState.gameData;
        
        const [player1, player2] = players;
        const choice1 = choices[player1.id];
        const choice2 = choices[player2.id];
        
        let winner = null;
        if (choice1 === choice2) {
            // Tie
        } else if (
            (choice1 === "rock" && choice2 === "scissors") ||
            (choice1 === "scissors" && choice2 === "paper") ||
            (choice1 === "paper" && choice2 === "rock")
        ) {
            winner = player1.id;
        } else {
            winner = player2.id;
        }
        
        const round = {
            round: gameData.currentRound,
            choices: { ...choices },
            winner,
            timestamp: Date.now()
        };
        
        gameData.rounds.push(round);
        gameData.currentRound++;
        gameData.choices = {}; // Clear choices for next round
        
        return { round, winner };
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Game session management
    getGameSession(gameId) {
        return this.activeSessions.get(gameId);
    }

    getAllActiveSessions() {
        return Array.from(this.activeSessions.values());
    }

    getNearbyGameSessions(userLocation, radius = 50) {
        const nearbySessions = [];
        
        for (const session of this.activeSessions.values()) {
            if (session.status === "cancelled" || session.status === "finished") {
                continue;
            }
            
            const distance = this.calculateDistance(
                userLocation.latitude,
                userLocation.longitude,
                session.creatorLocation.latitude,
                session.creatorLocation.longitude
            );
            
            if (distance <= radius) {
                nearbySessions.push({
                    ...session,
                    distance: Math.round(distance)
                });
            }
        }
        
        return nearbySessions.sort((a, b) => a.distance - b.distance);
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
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

    // Cleanup old sessions
    cleanupOldSessions() {
        const now = Date.now();
        const maxAge = 2 * 60 * 60 * 1000; // 2 hours
        
        for (const [gameId, session] of this.activeSessions) {
            if (now - session.lastActivity > maxAge) {
                this.activeSessions.delete(gameId);
                this.stateHistory.delete(gameId);
            }
        }
    }

    // Enhanced state synchronization methods
    trackPlayerConnection(playerId, gameId, isConnected) {
        const connectionKey = `${playerId}_${gameId}`;
        this.playerConnections.set(connectionKey, {
            playerId,
            gameId,
            isConnected,
            lastSeen: Date.now()
        });
    }

    updatePlayerConnectionStatus(playerId, gameId, isConnected) {
        const session = this.activeSessions.get(gameId);
        if (session) {
            const player = session.players.find(p => p.id === playerId);
            if (player) {
                player.isConnected = isConnected;
                player.lastSeen = Date.now();
                this.trackPlayerConnection(playerId, gameId, isConnected);
                
                // Update state sequence to trigger sync
                session.stateSequence++;
                session.lastStateUpdate = Date.now();
            }
        }
    }

    saveGameStateSnapshot(gameId, session) {
        if (!this.stateHistory.has(gameId)) {
            this.stateHistory.set(gameId, []);
        }
        
        const history = this.stateHistory.get(gameId);
        const snapshot = {
            sequence: session.stateSequence,
            timestamp: Date.now(),
            gameState: this.cloneGameState(session.gameState),
            players: session.players.map(p => ({ ...p })),
            status: session.status
        };
        
        history.push(snapshot);
        
        // Keep only last 10 snapshots to prevent memory issues
        if (history.length > 10) {
            history.shift();
        }
    }

    getGameStateSnapshot(gameId, sequence = null) {
        const history = this.stateHistory.get(gameId);
        if (!history || history.length === 0) {
            return null;
        }
        
        if (sequence === null) {
            // Return latest snapshot
            return history[history.length - 1];
        }
        
        // Find snapshot with specific sequence
        return history.find(snapshot => snapshot.sequence === sequence) || null;
    }

    cloneGameState(gameState) {
        return JSON.parse(JSON.stringify(gameState));
    }

    isGameStateValid(session) {
        if (!session || !session.gameState) {
            return false;
        }
        
        // Basic validation checks
        if (!session.gameState.hasOwnProperty('moves')) {
            return false;
        }
        
        // Game-specific validation
        switch (session.type) {
            case 'tic-tac-toe':
                return this.validateTicTacToeState(session.gameState);
            case 'rock-paper-scissors':
                return this.validateRPSState(session.gameState);
            default:
                return true; // Basic validation for other games
        }
    }

    validateTicTacToeState(gameState) {
        const board = gameState.gameData?.board;
        if (!Array.isArray(board) || board.length !== 9) {
            return false;
        }
        
        // Count X and O to ensure valid game progression
        const xCount = board.filter(cell => cell === 'X').length;
        const oCount = board.filter(cell => cell === 'O').length;
        
        // X goes first, so X count should be equal to O count or one more
        return xCount === oCount || xCount === oCount + 1;
    }

    validateRPSState(gameState) {
        const gameData = gameState.gameData;
        if (!gameData) return false;
        
        // Check if round data is consistent
        if (gameData.currentRound < 1 || gameData.currentRound > gameData.maxRounds + 1) {
            return false;
        }
        
        return true;
    }

    generateMoveId() {
        return 'move_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    getConnectedPlayers(gameId) {
        const session = this.activeSessions.get(gameId);
        if (!session) return [];
        
        return session.players.filter(player => player.isConnected);
    }

    handlePlayerDisconnection(playerId, gameId) {
        const session = this.activeSessions.get(gameId);
        if (!session) return null;
        
        const player = session.players.find(p => p.id === playerId);
        if (player) {
            player.isConnected = false;
            player.lastSeen = Date.now();
            this.trackPlayerConnection(playerId, gameId, false);
            
            // If game is active and player was current turn, advance turn
            if (session.status === 'active' && session.gameState.currentTurn === playerId) {
                this.advanceTurn(session);
                session.stateSequence++;
            }
            
            this.saveGameStateSnapshot(gameId, session);
        }
        
        return session;
    }

    handlePlayerReconnection(playerId, gameId) {
        const session = this.activeSessions.get(gameId);
        if (!session) return null;
        
        const player = session.players.find(p => p.id === playerId);
        if (player) {
            player.isConnected = true;
            player.lastSeen = Date.now();
            this.trackPlayerConnection(playerId, gameId, true);
            session.stateSequence++;
            this.saveGameStateSnapshot(gameId, session);
        }
        
        return session;
    }
}

module.exports = GameEngine;