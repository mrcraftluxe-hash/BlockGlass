// ===== script.js =====
(function() {
    'use strict';

    // --- DOM refs ---
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

    // --- constants ---
    const COLS = 8;
    const ROWS = 8;
    const CELL_SIZE = 40;

    // --- state ---
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
    let dragStartX = 0;
    let dragStartY = 0;
    let piecePreviewGrid = null;
    let previewX = -1;
    let previewY = -1;
    let isValidPlacement = false;
    let gameActive = false;
    let animating = false;
    let cellSize = CELL_SIZE;

    // --- settings ---
    let settings = {
        sound: true,
        music: false,
        vibration: true,
        animations: true
    };

    // --- audio context ---
    let audioCtx = null;

    // --- shapes ---
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

    // --- helpers ---
    function getShapeCopy(shape) {
        return shape.map(row => [...row]);
    }

    function rotateShape(shape) {
        const rows = shape.length;
        const cols = shape[0].length;
        const rotated = [];
        for (let c = 0; c < cols; c++) {
            rotated.push([]);
            for (let r = rows - 1; r >= 0; r--) {
                rotated[c].push(shape[r][c]);
            }
        }
        return rotated;
    }

    function getRandomShape() {
        const idx = Math.floor(Math.random() * SHAPES.length);
        return getShapeCopy(SHAPES[idx]);
    }

    function getBalancedPieces() {
        const pieces = [];
        const types = [];
        for (let i = 0; i < 3; i++) {
            let shape;
            let attempts = 0;
            do {
                shape = getRandomShape();
                attempts++;
            } while (attempts < 10 && types.some(t => t === shape.flat().join('')));
            types.push(shape.flat().join(''));
            pieces.push(shape);
        }
        return pieces;
    }

    // --- grid functions ---
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
        // rows
        for (let r = ROWS - 1; r >= 0; r--) {
            if (grid[r].every(cell => cell === 1)) {
                grid.splice(r, 1);
                grid.unshift(new Array(COLS).fill(0));
                cleared++;
                r++;
            }
        }
        // cols
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

    function getPieceCells(shape) {
        const cells = [];
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c] === 1) cells.push({r, c});
            }
        }
        return cells;
    }

    // --- scoring ---
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

    // --- render ---
    function resizeCanvas() {
        const container = document.getElementById('gridContainer');
        const rect = container.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height, 400);
        canvas.width = size;
        canvas.height = size;
        cellSize = size / COLS;
        drawGrid();
    }

    function drawGrid() {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const cs = cellSize;
        // draw grid
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
        // preview
        if (piecePreviewGrid && isValidPlacement) {
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
        const size = Math.min(canvasEl.width, canvasEl.height);
        const cs = size / 4;
        const ctx2 = canvasEl.getContext('2d');
        ctx2.clearRect(0, 0, size, size);
        const cols = shape[0].length;
        const rows = shape.length;
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
            pieceSlots.appendChild(slot);
        });
    }

    function updateUI() {
        scoreDisplay.textContent = score;
        bestDisplay.textContent = bestScore;
    }

    // --- game over ---
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
            localStorage.setItem('blackglass_best', bestScore);
            newBestBadge.style.display = 'block';
        } else {
            newBestBadge.style.display = 'none';
        }
        finalScore.textContent = score;
        finalBest.textContent = bestScore;
        gameOverOverlay.style.display = 'flex';
        playSound('gameover');
        if (settings.vibration && navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 200]);
        }
        saveStats();
    }

    // --- save/load ---
    function saveStats() {
        const stats = {
            gamesPlayed,
            totalScore,
            linesCleared,
            highestCombo,
            bestScore
        };
        localStorage.setItem('blackglass_stats', JSON.stringify(stats));
    }

    function loadStats() {
        const data = localStorage.getItem('blackglass_stats');
        if (data) {
            const stats = JSON.parse(data);
            gamesPlayed = stats.gamesPlayed || 0;
            totalScore = stats.totalScore || 0;
            linesCleared = stats.linesCleared || 0;
            highestCombo = stats.highestCombo || 0;
            bestScore = stats.bestScore || 0;
        }
        bestScore = parseInt(localStorage.getItem('blackglass_best')) || bestScore;
        bestDisplay.textContent = bestScore;
        menuBest.textContent = bestScore;
    }

    function loadSettings() {
        const data = localStorage.getItem('blackglass_settings');
        if (data) {
            const s = JSON.parse(data);
            settings.sound = s.sound !== undefined ? s.sound : true;
            settings.music = s.music !== undefined ? s.music : false;
            settings.vibration = s.vibration !== undefined ? s.vibration : true;
            settings.animations = s.animations !== undefined ? s.animations : true;
        }
        document.getElementById('soundToggle').checked = settings.sound;
        document.getElementById('musicToggle').checked = settings.music;
        document.getElementById('vibrationToggle').checked = settings.vibration;
        document.getElementById('animationsToggle').checked = settings.animations;
    }

    function saveSettings() {
        localStorage.setItem('blackglass_settings', JSON.stringify(settings));
    }

    // --- sound ---
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playSound(type) {
        if (!settings.sound) return;
        try {
            initAudio();
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
                    osc.stop(now +
