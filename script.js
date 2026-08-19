(function() {
    'use strict';

    // DOM refs
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const bestDisplay = document.getElementById('bestDisplay');
    const finalScore = document.getElementById('finalScore');
    const finalBest = document.getElementById('finalBest');
    const menuBest = document.getElementById('menuBest');
    const pieceSlots = document.getElementById('pieceSlots');
    const menuOverlay = document.getElementById('menuOverlay');
    const gameOverOverlay = document.getElementById('gameOverOverlay');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const statsOverlay = document.getElementById('statsOverlay');
    const howToOverlay = document.getElementById('howToOverlay');
    const newBestBadge = document.getElementById('newBestBadge');

    const COLS = 8;
    const ROWS = 8;
    let CELL_SIZE = 40;

    // State
    let grid = [];
    let currentPieces = [];
    let score = 0;
    let bestScore = 0;
    let gamesPlayed = 0;
    let totalScore = 0;
    let linesCleared = 0;
    let highestCombo = 0;
    let comboCount = 0;
    let isDragging = false;
    let dragPieceIndex = -1;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let piecePreviewGrid = null;
    let previewX = -1;
    let previewY = -1;
    let isValidPlacement = false;
    let gameActive = false;
    let audioCtx = null;

    // Settings
    let settings = {
        sound: true,
        music: false,
        vibration: true,
        animations: true
    };

    // Shapes
    const SHAPES = [
        [[1]],
        [[1,1]],
        [[1],[1]],
        [[1,1,1]],
        [[1],[1],[1]],
        [[1,1,1,1]],
        [[1],[1],[1],[1]],
        [[1,1],[1,1]],
        [[1,0],[1,1]],
        [[0,1],[1,1]],
        [[1,1,1],[0,1,0]],
        [[1,1,0],[0,1,1]],
        [[0,1,1],[1,1,0]],
        [[1,1,1],[1,0,0]],
        [[1,1,1],[0,0,1]],
        [[1,0,0],[1,1,1]],
        [[0,0,1],[1,1,1]],
        [[1,1],[0,1],[0,1]],
        [[1,1],[1,0],[1,0]],
        [[0,1],[1,1],[0,1]],
        [[1,0],[1,1],[1,0]],
        [[1,1,1],[1,0,0],[1,0,0]],
        [[1,1,1],[0,0,1],[0,0,1]]
    ];

    function getShapeCopy(shape) {
        return shape.map(row => [...row]);
    }

    function getRandomShape() {
        const idx = Math.floor(Math.random() * SHAPES.length);
        return getShapeCopy(SHAPES[idx]);
    }

    function getBalancedPieces() {
        const pieces = [];
        for (let i = 0; i < 3; i++) {
            pieces.push(getRandomShape());
        }
        return pieces;
    }

    function initGrid() {
        grid = [];
        for (let r = 0; r < ROWS; r++) {
            grid.push(new Array(COLS).fill(0));
        }
    }

    function canPlace(shape, row, col) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c] === 0) continue;
                const gr = row + r;
                const gc = col + c;
                if (gr >= ROWS || gc >= COLS || gr < 0 || gc < 0) return false;
                if (grid[gr][gc] !== 0) return false;
            }
        }
        return true;
    }

    function placeShape(shape, row, col) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c] === 0) continue;
                grid[row + r][col + c] = 1;
            }
        }
    }

    function clearLines() {
        let cleared = 0;
        // Check rows
        for (let r = ROWS - 1; r >= 0; r--) {
            if (grid[r].every(cell => cell === 1)) {
                grid.splice(r, 1);
                grid.unshift(new Array(COLS).fill(0));
                cleared++;
                r++;
            }
        }
        // Check columns
        for (let c = COLS - 1; c >= 0; c--) {
            let full = true;
            for (let r = 0; r < ROWS; r++) {
                if (grid[r][c] === 0) { full = false; break; }
            }
            if (full) {
                for (let r = 0; r < ROWS; r++) {
                    grid[r].splice(c, 1);
                    grid[r].push(0);
                }
                cleared++;
                c++;
            }
        }
        return cleared;
    }

    function hasValidMoves() {
        for (let idx = 0; idx < currentPieces.length; idx++) {
            const shape = currentPieces[idx];
            if (!shape) continue;
            for (let r = 0; r <= ROWS - shape.length; r++) {
                for (let c = 0; c <= COLS - shape[0].length; c++) {
                    if (canPlace(shape, r, c)) return true;
                }
            }
        }
        return false;
    }

    function calculateScore(placedBlocks, linesClearedCount) {
        let points = placedBlocks * 2;
        if (linesClearedCount > 0) {
            comboCount++;
            if (comboCount > highestCombo) highestCombo = comboCount;
            const bonus = linesClearedCount * linesClearedCount * 10;
            const comboBonus = comboCount * 5;
            points += bonus + comboBonus;
            if (linesClearedCount >= 4) points += 50;
        } else {
            comboCount = 0;
        }
        return points;
    }

    function resizeCanvas() {
        const container = document.getElementById('gridContainer');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width - 4, rect.height - 4, 400);
        canvas.width = size;
        canvas.height = size;
        CELL_SIZE = size / COLS;
        drawGrid();
    }

    function drawGrid() {
        if (!canvas) return;
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return;
        ctx.clearRect(0, 0, w, h);
        const cs = CELL_SIZE;
        
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * cs;
                const y = r * cs;
                if (grid[r][c] === 1) {
                    ctx.fillStyle = '#4a7aff';
                    ctx.shadowColor = 'rgba(74,122,255,0.3)';
                    ctx.shadowBlur = 12;
                    ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'rgba(255,255,255,0.1)';
                    ctx.fillRect(x + 2, y + 2, cs - 6, 2);
                } else {
                    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(x, y, cs, cs);
                }
            }
        }
        
        if (piecePreviewGrid && isValidPlacement && previewX >= 0 && previewY >= 0) {
            for (let r = 0; r < piecePreviewGrid.length; r++) {
                for (let c = 0; c < piecePreviewGrid[0].length; c++) {
                    if (piecePreviewGrid[r][c] === 0) continue;
                    const x = (previewX + c) * cs;
                    const y = (previewY + r) * cs;
                    ctx.fillStyle = 'rgba(74,122,255,0.3)';
                    ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
                    ctx.strokeStyle = 'rgba(74,122,255,0.5)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
                }
            }
        }
    }

    function drawPieceOnCanvas(canvasEl, shape) {
        if (!canvasEl || !shape) return;
        const size = Math.min(canvasEl.width, canvasEl.height);
        const ctx2 = canvasEl.getContext('2d');
        ctx2.clearRect(0, 0, size, size);
        const cols = shape[0].length;
        const rows = shape.length;
        const cs = size / 4;
        const offsetX = (4 - cols) * cs / 2;
        const offsetY = (4 - rows) * cs / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (shape[r][c] === 0) continue;
                const x = offsetX + c * cs;
                const y = offsetY + r * cs;
                ctx2.fillStyle = '#4a7aff';
                ctx2.shadowColor = 'rgba(74,122,255,0.3)';
                ctx2.shadowBlur = 10;
                ctx2.fillRect(x + 1, y + 1, cs - 2, cs - 2);
                ctx2.shadowBlur = 0;
                ctx2.fillStyle = 'rgba(255,255,255,0.1)';
                ctx2.fillRect(x + 2, y + 2, cs - 6, 2);
            }
        }
    }

    function renderPieces() {
        if (!pieceSlots) return;
        pieceSlots.innerHTML = '';
        currentPieces.forEach((shape, idx) => {
            if (!shape) return;
            const slot = document.createElement('div');
            slot.className = 'piece-slot';
            slot.dataset.index = idx;
            const c = document.createElement('canvas');
            c.width = 80;
            c.height = 80;
            c.dataset.index = idx;
            drawPieceOnCanvas(c, shape);
            slot.appendChild(c);
            
            // Add click handler
            slot.addEventListener('mousedown', function(e) {
                e.preventDefault();
                const index = parseInt(this.dataset.index);
                startDrag(e.clientX, e.clientY, index);
            });
            slot.addEventListener('touchstart', function(e) {
                e.preventDefault();
                const touch = e.touches[0];
                const index = parseInt(this.dataset.index);
                startDrag(touch.clientX, touch.clientY, index);
            }, { passive: false });
            
            pieceSlots.appendChild(slot);
        });
    }

    function updateUI() {
        if (scoreDisplay) scoreDisplay.textContent = score;
        if (bestDisplay) bestDisplay.textContent = bestScore;
        if (menuBest) menuBest.textContent = bestScore;
    }

    function checkGameOver() {
        if (!hasValidMoves()) {
            endGame();
            return true;
        }
        return false;
    }

    function endGame() {
        gameActive = false;
        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('blackglass_best', String(bestScore));
            if (newBestBadge) newBestBadge.style.display = 'block';
            playSound('newbest');
        } else {
            if (newBestBadge) newBestBadge.style.display = 'none';
        }
        if (finalScore) finalScore.textContent = score;
        if (finalBest) finalBest.textContent = bestScore;
        if (gameOverOverlay) gameOverOverlay.style.display = 'flex';
        playSound('gameover');
        if (settings.vibration && navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 200]);
        }
        saveStats();
    }

    function saveStats() {
        const stats = {
            gamesPlayed: gamesPlayed,
            totalScore: totalScore,
            linesCleared: linesCleared,
            highestCombo: highestCombo,
            bestScore: bestScore
        };
        try {
            localStorage.setItem('blackglass_stats', JSON.stringify(stats));
        } catch(e) {}
    }

    function loadStats() {
        try {
            const data = localStorage.getItem('blackglass_stats');
            if (data) {
                const stats = JSON.parse(data);
                gamesPlayed = stats.gamesPlayed || 0;
                totalScore = stats.totalScore || 0;
                linesCleared = stats.linesCleared || 0;
                highestCombo = stats.highestCombo || 0;
                bestScore = stats.bestScore || 0;
            }
            const best = localStorage.getItem('blackglass_best');
            if (best) bestScore = parseInt(best) || bestScore;
        } catch(e) {}
        if (bestDisplay) bestDisplay.textContent = bestScore;
        if (menuBest) menuBest.textContent = bestScore;
        updateUI();
    }

    function loadSettings() {
        try {
            const data = localStorage.getItem('blackglass_settings');
            if (data) {
                const s = JSON.parse(data);
                settings.sound = s.sound !== undefined ? s.sound : true;
                settings.music = s.music !== undefined ? s.music : false;
                settings.vibration = s.vibration !== undefined ? s.vibration : true;
                settings.animations = s.animations !== undefined ? s.animations : true;
            }
        } catch(e) {}
        const soundToggle = document.getElementById('soundToggle');
        const musicToggle = document.getElementById('musicToggle');
        const vibrationToggle = document.getElementById('vibrationToggle');
        const animationsToggle = document.getElementById('animationsToggle');
        if (soundToggle) soundToggle.checked = settings.sound;
        if (musicToggle) musicToggle.checked = settings.music;
        if (vibrationToggle) vibrationToggle.checked = settings.vibration;
        if (animationsToggle) animationsToggle.checked = settings.animations;
    }

    function saveSettings() {
        try {
            localStorage.setItem('blackglass_settings', JSON.stringify(settings));
        } catch(e) {}
    }

    function initAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) {}
        }
    }

    function playSound(type) {
        if (!settings.sound) return;
        try {
            initAudio();
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.value = 0.15;
            const now = audioCtx.currentTime;
            switch(type) {
                case 'placement':
                    osc.frequency.value = 600;
                    osc.type = 'sine';
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
                    osc.start(now);
                    osc.stop(now + 0.08);
                    break;
                case 'clear':
                    osc.frequency.value = 800;
                    osc.type = 'square';
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                    break;
                case 'combo':
                    osc.frequency.value = 1000;
                    osc.type = 'sine';
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                    break;
                case 'click':
                    osc.frequency.value = 400;
                    osc.type = 'sine';
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                    osc.start(now);
                    osc.stop(now + 0.05);
                    break;
                case 'gameover':
                    osc.frequency.value = 300;
                    osc.type = 'sawtooth';
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                    osc.start(now);
                    osc.stop(now + 0.5);
                    break;
                case 'newbest':
                    osc.frequency.value = 1200;
                    osc.type = 'sine';
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                    break;
                default:
                    osc.frequency.value = 500;
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                    osc.start(now);
                    osc.stop(now + 0.05);
            }
        } catch(e) {}
    }

    function placePiece(shape, row, col) {
        const blocksPlaced = shape.flat().filter(v => v === 1).length;
        placeShape(shape, row, col);
        const cleared = clearLines();
        linesCleared += cleared;
        const points = calculateScore(blocksPlaced, cleared);
        score += points;
        totalScore += points;
        updateUI();
        if (cleared > 0) {
            playSound('clear');
            if (settings.vibration && navigator.vibrate) {
                navigator.vibrate([30, 30, 30]);
            }
            if (cleared >= 3) {
                playSound('combo');
                if (settings.vibration && navigator.vibrate) {
                    navigator.vibrate([50, 30, 50]);
                }
            }
        } else {
            playSound('placement');
            if (settings.vibration && navigator.vibrate) {
                navigator.vibrate(10);
            }
        }
        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('blackglass_best', String(bestScore));
            if (bestDisplay) bestDisplay.textContent = bestScore;
            playSound('newbest');
        }
        saveStats();
        drawGrid();
    }

    function startNewGame() {
        initGrid();
        score = 0;
        comboCount = 0;
        gamesPlayed++;
        currentPieces = getBalancedPieces();
        gameActive = true;
        if (gameOverOverlay) gameOverOverlay.style.display = 'none';
        if (newBestBadge) newBestBadge.style.display = 'none';
        updateUI();
        renderPieces();
        drawGrid();
        saveStats();
        playSound('click');
    }

    function restartGame() {
        startNewGame();
    }

    function checkAndRefill() {
        if (!gameActive) return;
        if (currentPieces.some(p => p !== null)) return;
        currentPieces = getBalancedPieces();
        renderPieces();
        if (!hasValidMoves()) {
            endGame();
        }
    }

    // Drag & Drop
    function getGridPos(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width * canvas.width;
        const y = (clientY - rect.top) / rect.height * canvas.height;
        const col = Math.floor(x / CELL_SIZE);
        const row = Math.floor(y / CELL_SIZE);
        return { row, col };
    }

    function startDrag(clientX, clientY, pieceIndex) {
        if (!gameActive) return;
        if (!currentPieces[pieceIndex]) return;
        isDragging = true;
        dragPieceIndex = pieceIndex;
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width * canvas.width;
        const y = (clientY - rect.top) / rect.height * canvas.height;
        dragOffsetX = x;
        dragOffsetY = y;
        piecePreviewGrid = currentPieces[pieceIndex];
        previewX = -1;
        previewY = -1;
        isValidPlacement = false;
        if (canvas) canvas.style.cursor = 'grabbing';
        drawGrid();
    }

    function moveDrag(clientX, clientY) {
        if (!isDragging || !gameActive) return;
        const shape = currentPieces[dragPieceIndex];
        if (!shape) return;
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width * canvas.width;
        const y = (clientY - rect.top) / rect.height * canvas.height;
        const col = Math.floor((x - dragOffsetX) / CELL_SIZE + 0.5);
        const row = Math.floor((y - dragOffsetY) / CELL_SIZE + 0.5);
        previewX = Math.max(0, Math.min(ROWS - shape.length, row));
        previewY = Math.max(0, Math.min(COLS - shape[0].length, col));
        isValidPlacement = canPlace(shape, previewX, previewY);
        drawGrid();
    }

    function endDrag() {
        if (!isDragging) {
            if (canvas) canvas.style.cursor = 'grab';
            piecePreviewGrid = null;
            previewX = -1;
            previewY = -1;
            isValidPlacement = false;
            drawGrid();
            return;
        }
        const shape = currentPieces[dragPieceIndex];
        if (shape && isValidPlacement && previewX >= 0 && previewY >= 0) {
            placePiece(shape, previewX, previewY);
            currentPieces[dragPieceIndex] = null;
            renderPieces();
            drawGrid();
            if (!hasValidMoves()) {
                endGame();
            } else {
                checkAndRefill();
            }
        }
        isDragging = false;
        if (canvas) canvas.style.cursor = 'grab';
        piecePreviewGrid = null;
        previewX = -1;
        previewY = -1;
        isValidPlacement = false;
        drawGrid();
    }

    // Event Listeners
    function setupEventListeners() {
        // Mouse events on canvas
        if (canvas) {
            canvas.addEventListener('mousedown', function(e) {
                e.preventDefault();
                // Start drag with first available piece
                let idx = -1;
                for (let i = 0; i < currentPieces.length; i++) {
                    if (currentPieces[i]) { idx = i; break; }
                }
                if (idx >= 0) {
                    startDrag(e.clientX, e.clientY, idx);
                }
            });
        }

        document.addEventListener('mousemove', function(e) {
            moveDrag(e.clientX, e.clientY);
        });

        document.addEventListener('mouseup', function() {
            endDrag();
        });

        // Touch events
        if (canvas) {
            canvas.addEventListener('touchstart', function(e) {
                e.preventDefault();
                const touch = e.touches[0];
                let idx = -1;
                for (let i = 0; i < currentPieces.length; i++) {
                    if (currentPieces[i]) { idx = i; break; }
                }
                if (idx >= 0) {
                    startDrag(touch.clientX, touch.clientY, idx);
                }
            }, { passive: false });
        }

        document.addEventListener('touchmove', function(e) {
            const touch = e.touches[0];
            moveDrag(touch.clientX, touch.clientY);
        }, { passive: false });

        document.addEventListener('touchend', function(e) {
            endDrag();
        }, { passive: false });

        // Buttons
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', function() {
                restartGame();
                playSound('click');
            });
        }

        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function() {
                if (settingsOverlay) settingsOverlay.style.display = 'flex';
                playSound('click');
            });
        }

        const settingsCloseBtn = document.getElementById('settingsCloseBtn');
        if (settingsCloseBtn) {
            settingsCloseBtn.addEventListener('click', function() {
                if (settingsOverlay) settingsOverlay.style.display = 'none';
                playSound('click');
            });
        }

        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.addEventListener('click', function() {
                if (menuOverlay) menuOverlay.style.display = 'none';
                startNewGame();
                playSound('click');
            });
        }

        const tryAgainBtn = document.getElementById('tryAgainBtn');
        if (tryAgainBtn) {
            tryAgainBtn.addEventListener('click', function() {
                if (gameOverOverlay) gameOverOverlay.style.display = 'none';
                startNewGame();
                playSound('click');
            });
        }

        const gameoverMenuBtn = document.getElementById('gameoverMenuBtn');
        if (gameoverMenuBtn) {
            gameoverMenuBtn.addEventListener('click', function() {
                if (gameOverOverlay) gameOverOverlay.style.display = 'none';
                if (menuOverlay) menuOverlay.style.display = 'flex';
                playSound('click');
            });
        }

        const menuSettingsBtn = document.getElementById('menuSettingsBtn');
        if (menuSettingsBtn) {
            menuSettingsBtn.addEventListener('click', function() {
                if (menuOverlay) menuOverlay.style.display = 'none';
                if (settingsOverlay) settingsOverlay.style.display = 'flex';
                playSound('click');
            });
        }

        const menuStatsBtn = document.getElementById('menuStatsBtn');
        if (menuStatsBtn) {
            menuStatsBtn.addEventListener('click', function() {
                if (menuOverlay) menuOverlay.style.display = 'none';
                updateStatsUI();
                if (statsOverlay) statsOverlay.style.display = 'flex';
                playSound('click');
            });
        }

        const statsCloseBtn = document.getElementById('statsCloseBtn');
        if (statsCloseBtn) {
            statsCloseBtn.addEventListener('click', function() {
                if (statsOverlay) statsOverlay.style.display = 'none';
                if (menuOverlay) menuOverlay.style.display = 'flex';
                playSound('click');
            });
        }

        const menuHowToBtn = document.getElementById('menuHowToBtn');
        if (menuHowToBtn) {
            menuHowToBtn.addEventListener('click', function() {
                if (menuOverlay) menuOverlay.style.display = 'none';
                if (howToOverlay) howToOverlay.style.display = 'flex';
                playSound('click');
            });
        }

        const howToCloseBtn = document.getElementById('howToCloseBtn');
        if (howToCloseBtn) {
            howToCloseBtn.addEventListener('click', function() {
                if (howToOverlay) howToOverlay.style.display = 'none';
                if (menuOverlay) menuOverlay.style.display = 'flex';
                playSound('click');
            });
        }

        const resetProgressBtn = document.getElementById('resetProgressBtn');
        if (resetProgressBtn) {
            resetProgressBtn.addEventListener('click', function() {
                if (confirm('Reset all progress? This cannot be undone.')) {
                    localStorage.removeItem('blackglass_best');
                    localStorage.removeItem('blackglass_stats');
                    localStorage.removeItem('blackglass_settings');
                    bestScore = 0;
                    gamesPlayed = 0;
                    totalScore = 0;
                    linesCleared = 0;
                    highestCombo = 0;
                    if (bestDisplay) bestDisplay.textContent = '0';
                    if (menuBest) menuBest.textContent = '0';
                    updateUI();
                    playSound('click');
                    if (settingsOverlay) settingsOverlay.style.display = 'none';
                }
            });
        }

        // Settings toggles
        const soundToggle = document.getElementById('soundToggle');
        if (soundToggle) {
            soundToggle.addEventListener('change', function(e) {
                settings.sound = e.target.checked;
                saveSettings();
                if (settings.sound) playSound('click');
            });
        }

        const musicToggle = document.getElementById('musicToggle');
        if (musicToggle) {
            musicToggle.addEventListener('change', function(e) {
                settings.music = e.target.checked;
                saveSettings();
            });
        }

        const vibrationToggle = document.getElementById('vibrationToggle');
        if (vibrationToggle) {
            vibrationToggle.addEventListener('change', function(e) {
                settings.vibration = e.target.checked;
                saveSettings();
            });
        }

        const animationsToggle = document.getElementById('animationsToggle');
        if (animationsToggle) {
            animationsToggle.addEventListener('change', function(e) {
                settings.animations = e.target.checked;
                saveSettings();
            });
        }

        // Window resize
        window.addEventListener('resize', function() {
            resizeCanvas();
        });
    }

    function updateStatsUI() {
        const statGames = document.getElementById('statGames');
        const statBest = document.getElementById('statBest');
        const statTotal = document.getElementById('statTotal');
        const statLines = document.getElementById('statLines');
        const statCombo = document.getElementById('statCombo');
        if (statGames) statGames.textContent = gamesPlayed;
        if (statBest) statBest.textContent = bestScore;
        if (statTotal) statTotal.textContent = totalScore;
        if (statLines) statLines.textContent = linesCleared;
        if (statCombo) statCombo.textContent = highestCombo;
    }

    // Init
    function init() {
        initGrid();
        loadStats();
        loadSettings();
        updateUI();
        resizeCanvas();
        setupEventListeners();
        if (menuOverlay) menuOverlay.style.display = 'flex';
        drawGrid();
        currentPieces = getBalancedPieces();
        renderPieces();
        
        // Audio init on first user interaction
        document.addEventListener('click', function() {
            initAudio();
        }, { once: true });
        document.addEventListener('touchstart', function() {
            initAudio();
        }, { once: true });
    }

    // Start the game when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
