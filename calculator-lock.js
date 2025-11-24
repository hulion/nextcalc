        // 狀態變數
        let isDarkMode = true;
        let input = '0';
        let previousInput = '';
        let operator = null;
        let history = [];
        let isNewNumber = true;
        let passwordInput = '';
        let PASSWORD = '1209';

        // === FPS 檢測器類別 ===
        class FPSMonitor {
            constructor() {
                this.fps = 0;
                this.frameCount = 0;
                this.lastTime = performance.now();
                this.fpsHistory = [];
                this.maxHistoryLength = 60; // 保留最近 60 個 FPS 記錄
            }

            update() {
                this.frameCount++;
                const currentTime = performance.now();
                const elapsed = currentTime - this.lastTime;

                // 每秒更新一次 FPS
                if (elapsed >= 1000) {
                    this.fps = Math.round((this.frameCount * 1000) / elapsed);
                    this.fpsHistory.push(this.fps);

                    // 限制歷史記錄長度
                    if (this.fpsHistory.length > this.maxHistoryLength) {
                        this.fpsHistory.shift();
                    }

                    this.frameCount = 0;
                    this.lastTime = currentTime;

                    // 更新 DOM 顯示
                    this.updateDisplay();
                }
            }

            updateDisplay() {
                const fpsElement = document.getElementById('fpsCounter');
                if (fpsElement) {
                    const avgFps = this.getAverageFPS();
                    const minFps = this.getMinFPS();
                    const maxFps = this.getMaxFPS();

                    fpsElement.innerHTML = `
                        <div class="fps-current">${this.fps}</div>
                        <div class="fps-label">FPS</div>
                        <div class="fps-stats">
                            <span>AVG: ${avgFps}</span>
                            <span>MIN: ${minFps}</span>
                            <span>MAX: ${maxFps}</span>
                        </div>
                    `;

                    // 根據 FPS 變更顏色
                    if (this.fps >= 50) {
                        fpsElement.className = 'fps-counter fps-good';
                    } else if (this.fps >= 30) {
                        fpsElement.className = 'fps-counter fps-ok';
                    } else {
                        fpsElement.className = 'fps-counter fps-bad';
                    }
                }
            }

            getAverageFPS() {
                if (this.fpsHistory.length === 0) return 0;
                const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
                return Math.round(sum / this.fpsHistory.length);
            }

            getMinFPS() {
                if (this.fpsHistory.length === 0) return 0;
                return Math.min(...this.fpsHistory);
            }

            getMaxFPS() {
                if (this.fpsHistory.length === 0) return 0;
                return Math.max(...this.fpsHistory);
            }

            reset() {
                this.fps = 0;
                this.frameCount = 0;
                this.fpsHistory = [];
                this.lastTime = performance.now();
            }
        }

        // === Canvas 背景跑馬燈類別 ===
        class CanvasMarquee {
            constructor(canvasId) {
                this.canvas = document.getElementById(canvasId);
                if (!this.canvas) {
                    console.error('[CanvasMarquee] Canvas element not found:', canvasId);
                    return;
                }

                this.ctx = this.canvas.getContext('2d', { alpha: true });
                this.animationFrameId = null;
                this.isRunning = false;

                // 新增 FPS 監控器
                this.fpsMonitor = new FPSMonitor();

                // 背景跑馬燈狀態
                this.bgNumber = '0';
                this.bgAngle = 34;
                this.bgGap = 60;
                this.bgRowGap = 0;
                this.bgFontSize = 100;
                this.isRandomMode = false;

                // 運算符號
                this.operators = ['+', '-', '×', '÷'];

                // 行設定：10 行保持效能
                this.rowSettings = Array.from({ length: 10 }).map((_, i) => ({
                    id: i,
                    speed: 40 + Math.random() * 40,  // 40-80秒 (像素/秒)
                    direction: i % 2 === 0 ? 'left' : 'right',
                    offset: 0,  // 當前偏移量
                    fontSize: Math.floor(Math.random() * (200 - 20 + 1)) + 20  // 每列隨機字體大小 20-200px
                }));

                // 每行的數字項配置 - 20 個 (10×20=200個符號)
                this.itemsPerRow = 20;
                this.itemStates = [];  // 存儲每個項的動畫狀態

                // 計時器
                this.autoRotateInterval = null;
                this.idleTimer = null;
                this.animationStartTime = Date.now();

                // 3D 翻轉動畫狀態
                this.isFlipping = false;
                this.flipProgress = 0;  // 0-1
                this.flipDuration = 800;  // 翻轉動畫時長 (毫秒)
                this.flipStartTime = 0;
                this.targetMode = this.isRandomMode;  // 目標模式

                this.init();
            }

            init() {
                // 設定高 DPI 螢幕支援
                this.setupCanvas();

                // 初始化每個項的動畫狀態
                for (let row = 0; row < this.rowSettings.length; row++) {
                    this.itemStates[row] = [];
                    for (let item = 0; item < this.itemsPerRow; item++) {
                        this.itemStates[row][item] = {
                            opacity: 0.1 + Math.random() * 0.7,
                            scale: 0.1,
                            scaleSpeed: 3 + Math.random() * 4,  // 3-7秒週期
                            scalePhase: Math.random() * Math.PI * 2,  // 隨機起始相位
                            blur: 1 + Math.random() * 4,
                            symbol: this.getRandomOperator()  // 每個項目有自己固定的符號
                        };
                    }
                }

                // 監聽視窗大小變化
                window.addEventListener('resize', () => this.setupCanvas());

                console.log('[CanvasMarquee] Initialized');
            }

            setupCanvas() {
                const dpr = window.devicePixelRatio || 1;
                const width = window.innerWidth;
                const height = window.innerHeight;

                // 設定 Canvas 實際像素尺寸
                this.canvas.width = width * dpr;
                this.canvas.height = height * dpr;

                // 設定 Canvas 顯示尺寸
                this.canvas.style.width = `${width}px`;
                this.canvas.style.height = `${height}px`;

                // 重新獲取 context（這會重置所有轉換）
                this.ctx = this.canvas.getContext('2d', { alpha: true });

                // 縮放 context 以匹配 DPI
                this.ctx.scale(dpr, dpr);

                this.width = width;
                this.height = height;
                this.dpr = dpr;

                console.log('[CanvasMarquee] Canvas resized:', width, 'x', height, 'DPR:', dpr);
            }

            getRandomOperator() {
                return this.operators[Math.floor(Math.random() * this.operators.length)];
            }

            start() {
                if (this.isRunning) return;
                this.isRunning = true;
                this.animationStartTime = Date.now();
                this.startAutoRotation();
                this.animate();
                console.log('[CanvasMarquee] Started');
            }

            stop() {
                this.isRunning = false;
                if (this.animationFrameId) {
                    cancelAnimationFrame(this.animationFrameId);
                    this.animationFrameId = null;
                }
                if (this.autoRotateInterval) {
                    clearInterval(this.autoRotateInterval);
                    this.autoRotateInterval = null;
                }
                if (this.idleTimer) {
                    clearTimeout(this.idleTimer);
                    this.idleTimer = null;
                }

                // 清空 Canvas
                this.ctx.clearRect(0, 0, this.width, this.height);
                console.log('[CanvasMarquee] Stopped');
            }

            animate() {
                if (!this.isRunning) return;

                // 更新 FPS 監控器
                this.fpsMonitor.update();

                // 更新翻轉動畫
                if (this.isFlipping) {
                    const elapsed = Date.now() - this.flipStartTime;
                    this.flipProgress = Math.min(elapsed / this.flipDuration, 1);

                    if (this.flipProgress >= 0.5 && this.isRandomMode !== this.targetMode) {
                        // 翻轉到一半時切換模式
                        this.isRandomMode = this.targetMode;
                    }

                    if (this.flipProgress >= 1) {
                        this.isFlipping = false;
                        this.flipProgress = 0;
                    }
                }

                // 清空 Canvas
                this.ctx.clearRect(0, 0, this.width, this.height);

                // 儲存當前狀態
                this.ctx.save();

                // 計算旋轉中心(視窗中心)
                const centerX = this.width / 2;
                const centerY = this.height / 2;

                // 移動到中心並旋轉
                this.ctx.translate(centerX, centerY);
                this.ctx.rotate((this.bgAngle * Math.PI) / 180);
                this.ctx.translate(-centerX, -centerY);

                // 計算當前時間(秒)
                const currentTime = (Date.now() - this.animationStartTime) / 1000;

                // 繪製每一行
                this.drawRows(currentTime);

                // 恢復狀態
                this.ctx.restore();

                // 請求下一幀
                this.animationFrameId = requestAnimationFrame(() => this.animate());
            }

            drawRows(currentTime) {
                const rowHeight = this.height / this.rowSettings.length;

                // 設定通用樣式
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = isDarkMode ? 'hsl(220, 52%, 19%)' : '#cbd5e1';

                this.rowSettings.forEach((row, rowIndex) => {
                    const y = rowIndex * rowHeight + rowHeight / 2;

                    // 為每一列設定不同的字體大小
                    this.ctx.font = `italic 800 ${row.fontSize}px Barlow, sans-serif`;

                    // 計算此行的偏移量(根據時間和速度)
                    const speedPxPerSec = this.width / row.speed;  // 像素/秒
                    row.offset = (currentTime * speedPxPerSec) % this.width;

                    if (row.direction === 'right') {
                        row.offset = -row.offset;
                    }

                    // 計算需要的項目數量以填滿螢幕 (使用該列的字體大小)
                    const itemWidth = row.fontSize + this.bgGap;
                    const itemsToDraw = Math.ceil(this.width * 2 / itemWidth);  // 減少繪製範圍

                    // 繪製此行的所有項目
                    for (let i = 0; i < itemsToDraw; i++) {
                        const itemIndex = i % this.itemsPerRow;
                        const itemState = this.itemStates[rowIndex][itemIndex];

                        // 計算 x 位置
                        let x = row.offset + (i * itemWidth) - this.width;

                        // 只繪製在可見範圍內的項目 (使用該列的字體大小)
                        if (x < -row.fontSize * 2 || x > this.width + row.fontSize * 2) {
                            continue;
                        }

                        // 計算縮放值(使用 sin 波動) - 簡化計算
                        const scalePhase = itemState.scalePhase + (currentTime / itemState.scaleSpeed) * Math.PI * 2;
                        const scale = 0.5 + (Math.sin(scalePhase) * 0.5 + 0.5) * 1.0;  // 0.5 到 1.5 (減少縮放範圍)

                        this.drawItemOptimized(x, y, itemState, scale);
                    }
                });
            }

            // 優化的繪製方法 - 減少 save/restore 呼叫
            drawItemOptimized(x, y, itemState, scale) {
                this.ctx.save();

                // 調整透明度係數從 0.4 到 0.625,使範圍從 4%-32% 變成 4%-50%
                this.ctx.globalAlpha = itemState.opacity * 0.625;
                this.ctx.translate(x, y);

                // 計算翻轉效果的 scaleX
                let flipScaleX = 1;
                if (this.isFlipping) {
                    const easedProgress = this.easeInOutCubic(this.flipProgress);
                    flipScaleX = Math.abs(1 - 2 * easedProgress);
                }

                this.ctx.scale(scale * flipScaleX, scale);

                // 使用項目自己的固定符號,而不是每次都隨機生成
                const text = this.isRandomMode ? itemState.symbol : this.bgNumber;
                this.ctx.fillText(text, 0, 0);

                this.ctx.restore();
            }

            drawItem(x, y, itemState, scale) {
                this.ctx.save();

                // 設定透明度
                this.ctx.globalAlpha = itemState.opacity * 0.5; // 降低透明度減少視覺負擔

                // **移除 blur filter - 這是最大的效能殺手**
                // this.ctx.filter = `blur(${itemState.blur}px)`;

                // 移動到項目位置
                this.ctx.translate(x, y);

                // 計算翻轉效果的 scaleX
                let flipScaleX = 1;
                if (this.isFlipping) {
                    const easedProgress = this.easeInOutCubic(this.flipProgress);
                    flipScaleX = Math.abs(1 - 2 * easedProgress);
                }

                // 應用縮放（包含翻轉效果）
                this.ctx.scale(scale * flipScaleX, scale);

                // 設定字體
                this.ctx.font = `italic 800 ${this.bgFontSize}px Barlow, sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';

                // 設定顏色(根據主題)
                this.ctx.fillStyle = isDarkMode ? 'hsl(220, 52%, 19%)' : '#cbd5e1';

                // 繪製文字
                const text = this.isRandomMode ? this.getRandomOperator() : this.bgNumber;
                this.ctx.fillText(text, 0, 0);

                this.ctx.restore();
            }

            // 更新顯示的數字
            updateNumber(number) {
                this.bgNumber = number.toString();
            }

            // 隨機化視覺參數
            randomizeVisuals() {
                this.bgAngle = Math.floor(Math.random() * 360);
                this.bgGap = Math.floor(Math.random() * (200 - 20 + 1)) + 20;
                this.bgRowGap = Math.floor(Math.random() * 101);
                this.bgFontSize = Math.floor(Math.random() * (200 - 20 + 1)) + 20;

                // 為每一列隨機分配新的字體大小
                this.rowSettings.forEach(row => {
                    row.fontSize = Math.floor(Math.random() * (200 - 20 + 1)) + 20;
                });
            }

            // 緩動函數 (ease-in-out cubic)
            easeInOutCubic(t) {
                return t < 0.5
                    ? 4 * t * t * t
                    : 1 - Math.pow(-2 * t + 2, 3) / 2;
            }

            // 開始翻轉動畫
            startFlip(targetMode) {
                if (this.targetMode !== targetMode) {
                    this.isFlipping = true;
                    this.flipProgress = 0;
                    this.flipStartTime = Date.now();
                    this.targetMode = targetMode;
                    console.log('[CanvasMarquee] Starting flip to', targetMode ? 'symbols' : 'numbers');
                }
            }

            // 開始自動旋轉
            startAutoRotation() {
                if (this.autoRotateInterval) clearInterval(this.autoRotateInterval);
                this.startFlip(true);  // 翻轉到符號模式
                this.autoRotateInterval = setInterval(() => {
                    this.randomizeVisuals();
                }, 5000);
            }

            // 處理使用者互動
            handleUserInteraction() {
                this.startFlip(false);  // 翻轉回數字模式
                this.randomizeVisuals();
                if (this.autoRotateInterval) clearInterval(this.autoRotateInterval);
                if (this.idleTimer) clearTimeout(this.idleTimer);
                this.idleTimer = setTimeout(() => {
                    this.startAutoRotation();
                }, 5000);  // 5秒後切換到加減乘除符號
            }
        }

        // === 背景跑馬燈狀態變量 (保留以相容舊程式碼) ===
        let bgNumber = '0';
        let bgAngle = 34;
        let bgGap = 60;
        let bgRowGap = 0;
        let bgFontSize = 100;
        let animationIntervalRef = null;
        let autoRotateIntervalRef = null;
        let idleTimerRef = null;
        let isRandomMode = false;

        // 運算符號陣列
        const operators = ['+', '-', '×', '÷'];

        // 隨機獲取運算符號
        function getRandomOperator() {
            return operators[Math.floor(Math.random() * operators.length)];
        }

        // 行設定：10行，每行隨機速度和方向
        const rowSettings = Array.from({ length: 10 }).map((_, i) => ({
            id: i,
            speed: 40 + Math.random() * 40,
            direction: i % 2 === 0 ? 'left' : 'right'
        }));

        // 建立 CanvasMarquee 實例
        let canvasMarquee = null;

        // DOM 元素
        const display = document.getElementById('display');
        const previousDisplay = document.getElementById('previous-display');
        const status = document.getElementById('status');
        const clearBtn = document.getElementById('clear-btn');
        const historyOverlay = document.getElementById('history-overlay');
        const historyContent = document.getElementById('history-content');
        const sunIcon = document.querySelector('.sun-icon');
        const moonIcon = document.querySelector('.moon-icon');
        const floatingStatus = document.getElementById('floatingStatus');
        const floatingStatusText = document.getElementById('floatingStatusText');

        // 狀態列定時器
        let statusTimeout = null;

        // 顯示懸浮狀態列
        function showStatus(message, type = 'info', duration = 2000) {
            // 清除之前的定時器
            if (statusTimeout) {
                clearTimeout(statusTimeout);
            }

            // 設置訊息和樣式
            floatingStatusText.textContent = message;
            floatingStatus.className = 'floating-status show';

            // 添加狀態類型
            if (type === 'success') {
                floatingStatus.classList.add('status-success');
            } else if (type === 'error') {
                floatingStatus.classList.add('status-error');
            } else {
                floatingStatus.classList.add('status-info');
            }

            // 設置自動隱藏
            statusTimeout = setTimeout(() => {
                floatingStatus.classList.remove('show');
            }, duration);
        }

        // === Canvas 背景跑馬燈整合函數 ===

        // 監聽 display 元素的變化並自動更新背景數字
        let lastDisplayValue = '0';
        function startDisplayObserver() {
            const displayEl = document.getElementById('display');
            if (!displayEl || !canvasMarquee) return;

            const observer = new MutationObserver(() => {
                const currentValue = displayEl.textContent.replace(/,/g, ''); // 移除千分位
                if (currentValue !== lastDisplayValue) {
                    lastDisplayValue = currentValue;
                    // 更新 Canvas 顯示的數字
                    if (canvasMarquee) {
                        canvasMarquee.updateNumber(currentValue);
                        canvasMarquee.handleUserInteraction();
                    }
                }
            });

            observer.observe(displayEl, {
                childList: true,
                characterData: true,
                subtree: true
            });

            console.log('[Calculator] Display observer started (Canvas mode)');
        }

        // 載入密碼
        async function loadPassword() {
            try {
                PASSWORD = await window.electronAPI.getPassword();
                console.log('[Calculator] Password loaded:', PASSWORD);
            } catch (err) {
                console.error('[Calculator] Failed to load password:', err);
            }
        }

        loadPassword();

        // 格式化數字 (千分位)
        function formatNumber(num) {
            if (!num || num === 'Error') return num || '0';
            const parts = num.toString().split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return parts.join('.');
        }

        // 更新顯示
        function updateDisplay() {
            const formatted = formatNumber(input);
            display.textContent = formatted;

            // 動態調整字體大小
            if (formatted.length > 9) {
                display.className = 'display smaller';
            } else if (formatted.length > 6) {
                display.className = 'display small';
            } else {
                display.className = 'display';
            }

            // 更新上方顯示
            if (previousInput && operator) {
                previousDisplay.textContent = `${formatNumber(previousInput)} ${operator}`;
            } else {
                previousDisplay.textContent = '';
            }

            // 更新 AC/C 按鈕
            if (input === '0' && !previousInput) {
                clearBtn.textContent = 'AC';
            } else {
                clearBtn.textContent = 'C';
            }

            // 更新運算符高亮
            document.querySelectorAll('.btn-operator').forEach(btn => {
                btn.classList.remove('active');
            });
        }

        // 處理數字輸入
        function handleNumber(num) {
            passwordInput += num;
            checkPassword();

            if (isNewNumber) {
                input = num;
                isNewNumber = false;
            } else {
                if (num === '.' && input.includes('.')) return;
                if (input.length > 12) return;
                input = input === '0' && num !== '.' ? num : input + num;
            }
            updateDisplay();
        }

        // 處理運算符
        function handleOperator(op) {
            if (operator && !isNewNumber) {
                calculate();
            }
            previousInput = input;
            operator = op;
            isNewNumber = true;
            updateDisplay();
        }

        // 計算
        function calculate() {
            if (!operator || !previousInput) return;

            const prev = parseFloat(previousInput.replace(/,/g, ''));
            const current = parseFloat(input.replace(/,/g, ''));
            let result = 0;

            switch (operator) {
                case '+': result = prev + current; break;
                case '-': result = prev - current; break;
                case '×': result = prev * current; break;
                case '÷': result = current === 0 ? 'Error' : prev / current; break;
                default: return;
            }

            // 處理精確度
            if (result !== 'Error') {
                result = Math.round(result * 100000000) / 100000000;
            }

            // 新增到歷史
            const historyItem = {
                calculation: `${formatNumber(previousInput)} ${operator} ${formatNumber(input)}`,
                result: formatNumber(result.toString())
            };
            history.unshift(historyItem);
            history = history.slice(0, 20);
            updateHistory();

            input = result.toString();
            operator = null;
            previousInput = '';
            isNewNumber = true;
            updateDisplay();
        }

        // 特殊功能
        function handleSpecial(type) {
            let nextBg = '0';


            switch (type) {
                case 'AC':
                    input = '0';
                    previousInput = '';
                    operator = null;
                    isNewNumber = true;
                    passwordInput = '';
                    nextBg = 'AC';
                    break;
                case 'C':
                    input = '0';
                    isNewNumber = true;
                    nextBg = '0';
                    break;
                case '+/-':
                    input = (parseFloat(input.replace(/,/g, '')) * -1).toString();
                    nextBg = input;
                    break;
                case '%':
                    input = (parseFloat(input.replace(/,/g, '')) / 100).toString();
                    nextBg = '%';
                    break;
            }

            updateDisplay();
        }

        // 切換主題
        function toggleTheme() {
            isDarkMode = !isDarkMode;
            document.body.className = isDarkMode ? 'dark' : 'light';
            sunIcon.style.display = isDarkMode ? 'block' : 'none';
            moonIcon.style.display = isDarkMode ? 'none' : 'block';
        }

        // 切換歷史紀錄
        function toggleHistory() {
            historyOverlay.classList.toggle('show');
        }

        // 更新歷史紀錄
        function updateHistory() {
            if (history.length === 0) {
                historyContent.innerHTML = '<div class="history-empty">尚無紀錄</div>';
            } else {
                historyContent.innerHTML = history.map(item => `
                    <div class="history-item">
                        <div class="history-calc">${item.calculation}</div>
                        <div class="history-result">= ${item.result}</div>
                    </div>
                `).join('');
            }
        }

        // 清空歷史
        function clearHistory() {
            history = [];
            updateHistory();
        }

        // 檢查密碼
        async function checkPassword() {
            // 檢查緊急清除代碼 (4444)
            if (passwordInput.includes('4444')) {
                showStatus('清除資料中...', 'info', 3000);
                try {
                    await window.electronAPI.clearTelegramData();
                    await window.electronAPI.resetPassword();
                    PASSWORD = '1209'; // Reset to default
                    showStatus('資料已清除，密碼已重置為預設值', 'success', 3000);
                    passwordInput = '';
                } catch (err) {
                    showStatus('清除失敗', 'error', 3000);
                    console.error('[Calculator] Failed to clear data:', err);
                }
                return;
            }

            // 檢查測試代碼 (0329) - 顯示獅子表情符號
            if (passwordInput.includes('0329')) {
                showStatus('🦁', 'success', 2000);
                passwordInput = '';
                console.log('[Calculator] Easter egg triggered: Lion emoji');
                return;
            }

            // 檢查解鎖密碼
            if (passwordInput.includes(PASSWORD)) {
                showStatus('Unlocking...', 'success', 1500);
                setTimeout(() => {
                    // Notify main process to show BrowserView
                    if (window.electronAPI && window.electronAPI.unlockApp) {
                        window.electronAPI.unlockApp();
                    }

                    // Reset calculator state after unlock
                    setTimeout(() => {
                        currentValue = '0';
                        previousValue = '';
                        operation = null;
                        passwordInput = '';
                        updateDisplay();
                    }, 100);
                }, 500);
            }

            // 限制密碼輸入長度
            if (passwordInput.length > PASSWORD.length * 2) {
                passwordInput = passwordInput.slice(-PASSWORD.length);
            }
        }

        // Global reset function
        window.resetCalculator = function() {
            input = '0';
            previousInput = '';
            operator = null;
            isNewNumber = true;
            passwordInput = '';
            status.textContent = '';
            updateDisplay();
            console.log('[Calculator] State reset');
        };

        // Global function to stop background animations (Canvas version)
        window.stopBackgroundAnimations = function() {
            console.log('[Calculator] Stopping background animations (Canvas)...');

            if (canvasMarquee) {
                canvasMarquee.stop();
            }

            console.log('[Calculator] Background animations stopped');
        };

        // Global function to resume background animations (Canvas version)
        window.resumeBackgroundAnimations = function() {
            console.log('[Calculator] Resuming background animations (Canvas)...');

            if (canvasMarquee) {
                canvasMarquee.start();
            }

            console.log('[Calculator] Background animations resumed');
        };

        // 键盘按键到按钮元素的映射表
        const keyToButtonMap = {
            '0': () => document.querySelector('button[onclick*="handleNumber(\'0\')"]'),
            '1': () => document.querySelector('button[onclick*="handleNumber(\'1\')"]'),
            '2': () => document.querySelector('button[onclick*="handleNumber(\'2\')"]'),
            '3': () => document.querySelector('button[onclick*="handleNumber(\'3\')"]'),
            '4': () => document.querySelector('button[onclick*="handleNumber(\'4\')"]'),
            '5': () => document.querySelector('button[onclick*="handleNumber(\'5\')"]'),
            '6': () => document.querySelector('button[onclick*="handleNumber(\'6\')"]'),
            '7': () => document.querySelector('button[onclick*="handleNumber(\'7\')"]'),
            '8': () => document.querySelector('button[onclick*="handleNumber(\'8\')"]'),
            '9': () => document.querySelector('button[onclick*="handleNumber(\'9\')"]'),
            '.': () => document.querySelector('button[onclick*="handleNumber(\'.\')"]'),
            '+': () => document.querySelector('button[onclick*="handleOperator(\'+\')"]'),
            '-': () => document.querySelector('button[onclick*="handleOperator(\'-\')"]'),
            '*': () => document.querySelector('button[onclick*="handleOperator(\'×\')"]'),
            '/': () => document.querySelector('button[onclick*="handleOperator(\'÷\')"]'),
            'Enter': () => document.querySelector('button[onclick*="calculate()"]'),
            '=': () => document.querySelector('button[onclick*="calculate()"]'),
            'Backspace': () => document.getElementById('clear-btn'),
            'Escape': () => document.getElementById('clear-btn')
        };

        // 添加键盘按下视觉反馈
        function addKeyboardPressEffect(button) {
            if (button && !button.classList.contains('keyboard-pressed')) {
                button.classList.add('keyboard-pressed');
            }
        }

        // 移除键盘按下视觉反馈
        function removeKeyboardPressEffect(button) {
            if (button) {
                button.classList.remove('keyboard-pressed');
            }
        }

        // 鍵盤支援 - keydown
        document.addEventListener('keydown', (e) => {
            // 防止重复按下同一按键时的处理
            if (e.repeat) return;

            const key = e.key;

            // 获取对应的按钮元素并添加视觉效果
            const getButton = keyToButtonMap[key];
            if (getButton) {
                const button = getButton();
                addKeyboardPressEffect(button);
            }

            // 执行原有的功能
            if (/[0-9]/.test(key)) handleNumber(key);
            if (key === '.') handleNumber('.');
            if (key === 'Enter' || key === '=') { e.preventDefault(); calculate(); }
            if (key === 'Backspace') handleSpecial('C');
            if (key === 'Escape') handleSpecial('AC');
            if (key === '+') handleOperator('+');
            if (key === '-') handleOperator('-');
            if (key === '*') handleOperator('×');
            if (key === '/') { e.preventDefault(); handleOperator('÷'); }
        });

        // 键盘松开事件 - keyup
        document.addEventListener('keyup', (e) => {
            const key = e.key;

            // 获取对应的按钮元素并移除视觉效果
            const getButton = keyToButtonMap[key];
            if (getButton) {
                const button = getButton();
                removeKeyboardPressEffect(button);
            }
        });

        // 初始化
        updateDisplay();

        // === 初始化 Canvas 背景跑馬燈 ===
        canvasMarquee = new CanvasMarquee('bgCanvas');
        canvasMarquee.start();
        startDisplayObserver();
        console.log('[Calculator] Canvas background marquee initialized');

        // === 初始化 FPS 檢測器顯示設定 ===
        (async () => {
            try {
                const isDev = await window.electronAPI.isDevelopment();
                const fpsCounter = document.getElementById('fpsCounter');

                if (!isDev && fpsCounter) {
                    // 生產環境:隱藏 FPS 檢測器
                    fpsCounter.style.display = 'none';
                    console.log('[Calculator] FPS counter hidden (production mode)');
                } else {
                    console.log('[Calculator] FPS counter visible (development mode)');
                }
            } catch (err) {
                console.error('[Calculator] Failed to check development mode:', err);
            }
        })();

        // 注意：自動切換輸入法功能已暫時移除
        // 用戶可以直接使用鍵盤數字鍵輸入密碼

        // ==================== 密碼設定彈窗功能 ====================
        // 監聽來自 main process 的開啟設定彈窗指令
        window.electronAPI.onOpenSettings(() => {
            openSettingsModal();
        });

        // 監聽來自 main process 的鎖定狀態變化
        window.electronAPI.onLockStateChanged((event, isLocked) => {
            console.log('[Calculator] Lock state changed:', isLocked ? 'Locked' : 'Unlocked');
            if (isLocked) {
                // 鎖定時恢復背景動畫
                window.resumeBackgroundAnimations();
            } else {
                // 解鎖時停止背景動畫
                window.stopBackgroundAnimations();
            }
        });

        function openSettingsModal() {
            const modal = document.getElementById('settingsModal');
            modal.style.display = 'flex';
            // 觸發動畫
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
            // 載入目前密碼
            loadCurrentPassword();
        }

        function closeSettingsModal() {
            const modal = document.getElementById('settingsModal');
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
                // 清空表單
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
                document.getElementById('newPasswordHint').textContent = '';
                document.getElementById('confirmPasswordHint').textContent = '';
                document.getElementById('settingsMessage').classList.remove('show');
            }, 300);
        }

        let currentPassword = null;
        let isPasswordVisible = false;

        async function loadCurrentPassword() {
            try {
                currentPassword = await window.electronAPI.getPassword();
                const statusValue = document.getElementById('statusValue');
                const toggleVisibilityBtn = document.getElementById('toggleVisibilityBtn');
                const newPasswordLabel = document.getElementById('newPasswordLabel');
                const submitBtn = document.getElementById('submitBtn');

                if (currentPassword === '1209') {
                    statusValue.textContent = '使用預設密碼';
                    statusValue.classList.add('not-set');
                    toggleVisibilityBtn.style.display = 'none';
                    newPasswordLabel.textContent = '設定密碼（4位數字）';
                    submitBtn.textContent = '設定密碼';
                } else if (currentPassword) {
                    statusValue.textContent = '● ● ● ●';
                    statusValue.classList.remove('not-set');
                    toggleVisibilityBtn.style.display = 'block';
                    newPasswordLabel.textContent = '設定新密碼（4位數字）';
                    submitBtn.textContent = '更新密碼';
                } else {
                    statusValue.textContent = '未設定';
                    statusValue.classList.add('not-set');
                    toggleVisibilityBtn.style.display = 'none';
                    newPasswordLabel.textContent = '設定密碼（4位數字）';
                    submitBtn.textContent = '設定密碼';
                }
            } catch (err) {
                console.error('Failed to load password:', err);
            }
        }

        function togglePasswordVisibility() {
            isPasswordVisible = !isPasswordVisible;
            const statusValue = document.getElementById('statusValue');
            const eyeIcon = document.getElementById('eyeIcon');
            const eyeOffIcon = document.getElementById('eyeOffIcon');

            if (isPasswordVisible) {
                statusValue.textContent = currentPassword;
                eyeIcon.style.display = 'none';
                eyeOffIcon.style.display = 'block';
            } else {
                statusValue.textContent = '● ● ● ●';
                eyeIcon.style.display = 'block';
                eyeOffIcon.style.display = 'none';
            }
        }

        function showSettingsMessage(text, type) {
            const message = document.getElementById('settingsMessage');
            const messageText = document.getElementById('settingsMessageText');
            const messageIcon = document.getElementById('settingsMessageIcon');

            messageText.textContent = text;
            message.className = `message show ${type}`;

            if (type === 'success') {
                messageIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>';
            } else {
                messageIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>';
            }

            setTimeout(() => {
                message.classList.remove('show');
            }, 3000);
        }

        function restrictToNumbersForSettings(input, hintElement) {
            input.addEventListener('input', (e) => {
                const oldValue = e.target.value;
                const newValue = oldValue.replace(/[^0-9]/g, '');
                e.target.value = newValue;

                if (oldValue !== newValue && oldValue.length > 0) {
                    hintElement.textContent = '⚠️ 只能輸入數字';
                    hintElement.className = 'input-hint error';
                    return;
                }

                const length = newValue.length;
                if (length === 0) {
                    hintElement.textContent = '';
                    hintElement.className = 'input-hint';
                } else if (length < 4) {
                    hintElement.textContent = `請輸入 ${4 - length} 位數字 (${length}/4)`;
                    hintElement.className = 'input-hint warning';
                } else if (length === 4) {
                    hintElement.textContent = '✓ 已輸入4位數字';
                    hintElement.className = 'input-hint success';
                }
            });

            input.addEventListener('blur', (e) => {
                const value = e.target.value;
                if (value.length > 0 && value.length < 4) {
                    hintElement.textContent = '❌ 密碼必須是4位數字';
                    hintElement.className = 'input-hint error';
                }
            });

            input.addEventListener('focus', (e) => {
                if (e.target.value.length === 4) {
                    hintElement.textContent = '';
                    hintElement.className = 'input-hint';
                }
            });
        }

        async function savePassword() {
            const newPwd = document.getElementById('newPassword').value;
            const confirmPwd = document.getElementById('confirmPassword').value;

            if (!/^[0-9]{4}$/.test(newPwd)) {
                showSettingsMessage('密碼必須是4位數字', 'error');
                return;
            }

            if (newPwd !== confirmPwd) {
                showSettingsMessage('兩次密碼輸入不一致', 'error');
                return;
            }

            if (newPwd === '4444') {
                showSettingsMessage('此密碼為系統保留碼，請使用其他密碼', 'error');
                return;
            }

            try {
                const submitBtn = document.getElementById('submitBtn');
                submitBtn.disabled = true;
                await window.electronAPI.setPassword(newPwd);
                showSettingsMessage('密碼設定成功！', 'success');

                currentPassword = newPwd;
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
                loadCurrentPassword();

                setTimeout(() => {
                    closeSettingsModal();
                }, 1500);
            } catch (err) {
                showSettingsMessage('儲存失敗：' + err.message, 'error');
                submitBtn.disabled = false;
                console.error('Failed to save password:', err);
            }
        }

        // 初始化密碼輸入框的驗證
        const newPasswordInput = document.getElementById('newPassword');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const newPasswordHint = document.getElementById('newPasswordHint');
        const confirmPasswordHint = document.getElementById('confirmPasswordHint');

        if (newPasswordInput && confirmPasswordInput) {
            restrictToNumbersForSettings(newPasswordInput, newPasswordHint);
            restrictToNumbersForSettings(confirmPasswordInput, confirmPasswordHint);

            confirmPasswordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    savePassword();
                }
            });
        }

        // 點擊背景關閉彈窗
        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                closeSettingsModal();
            }
        });

        // ==================== 更新通知功能 ====================
        let currentUpdateInfo = null;

        // 顯示更新通知
        function showUpdateNotification(updateInfo) {
            currentUpdateInfo = updateInfo;
            const notification = document.getElementById('updateNotification');
            const titleEl = document.querySelector('.update-title');
            const versionEl = document.getElementById('updateVersion');
            const progressContainer = document.getElementById('updateProgressContainer');
            const installBtn = document.getElementById('updateInstallBtn');
            const laterBtn = document.getElementById('updateLaterBtn');
            const closeBtn = document.getElementById('updateCloseBtn');

            // 更新版本資訊
            versionEl.textContent = `版本 ${updateInfo.version}`;

            // 隱藏進度條,啟用安裝按鈕
            progressContainer.style.display = 'none';
            installBtn.disabled = false;

            // 根據更新類型設定按鈕文字
            if (updateInfo.isMandatory) {
                // 必須更新會自動下載，按鈕顯示「立即重啟安裝」
                installBtn.textContent = '立即重啟安裝';
                installBtn.dataset.downloaded = 'false'; // 標記尚未下載
            } else {
                // 可選更新不自動下載，按鈕顯示「開始下載」
                installBtn.textContent = '開始下載';
                installBtn.dataset.downloaded = 'false'; // 標記尚未下載
            }

            // 根據更新類型控制樣式、標題和按鈕可見性
            if (updateInfo.isMandatory) {
                // 必須更新:全螢幕遮罩,隱藏「稍後提醒」按鈕和關閉按鈕
                notification.classList.remove('optional');
                if (titleEl) titleEl.textContent = '重要更新';
                if (laterBtn) laterBtn.style.display = 'none';
                if (closeBtn) closeBtn.style.display = 'none';
                console.log('[Calculator] Mandatory update - fullscreen modal');
            } else {
                // 可選更新:左上角通知,顯示「稍後提醒」按鈕和關閉按鈕
                notification.classList.add('optional');
                if (titleEl) titleEl.textContent = '有可用更新';
                if (laterBtn) laterBtn.style.display = 'block';
                if (closeBtn) closeBtn.style.display = 'block';
                console.log('[Calculator] Optional update - top-left notification');
            }

            // 顯示通知
            notification.style.display = 'flex';
            setTimeout(() => {
                notification.classList.add('show');
            }, 10);

            // 如果是可選更新，啟用拖移功能
            if (!updateInfo.isMandatory) {
                initializeDraggable(notification);
            }

            console.log('[Calculator] Update notification shown:', updateInfo.version, 'isMandatory:', updateInfo.isMandatory);
        }

        // 初始化拖移功能
        function initializeDraggable(element) {
            const card = element.querySelector('.update-card');
            const header = element.querySelector('.update-header');

            if (!card || !header) return;

            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            // 添加視覺提示
            header.style.cursor = 'move';

            header.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            function dragStart(e) {
                // 如果點擊的是關閉按鈕，不啟動拖移
                if (e.target.closest('#updateCloseBtn')) return;

                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (e.target === header || header.contains(e.target)) {
                    isDragging = true;
                    card.style.transition = 'none';
                }
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();

                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    setTranslate(currentX, currentY, card);
                }
            }

            function dragEnd(e) {
                if (isDragging) {
                    initialX = currentX;
                    initialY = currentY;
                    isDragging = false;
                    card.style.transition = '';
                }
            }

            function setTranslate(xPos, yPos, el) {
                el.style.transform = `translate(${xPos}px, ${yPos}px)`;
            }
        }

        // 更新下載進度
        function updateDownloadProgress(progress) {
            const progressContainer = document.getElementById('updateProgressContainer');
            const progressBar = document.getElementById('updateProgressBar');
            const progressPercent = document.getElementById('updateProgressPercent');
            const installBtn = document.getElementById('updateInstallBtn');

            // 顯示進度條
            progressContainer.style.display = 'block';

            // 更新進度
            progressBar.style.width = `${progress.percent}%`;
            progressPercent.textContent = `${progress.percent}%`;

            // 下載期間停用安裝按鈕
            installBtn.disabled = true;
            installBtn.textContent = '下載中...';

            console.log('[Calculator] Update download progress:', progress.percent + '%');
        }

        // 更新下載完成
        function updateDownloadComplete(updateInfo) {
            const progressContainer = document.getElementById('updateProgressContainer');
            const installBtn = document.getElementById('updateInstallBtn');

            // 隱藏進度條
            progressContainer.style.display = 'none';

            // 啟用安裝按鈕，變更文字為「立即重啟安裝」
            installBtn.disabled = false;
            installBtn.textContent = '立即重啟安裝';
            installBtn.dataset.downloaded = 'true'; // 標記已下載完成

            console.log('[Calculator] Update download complete:', updateInfo.version);
        }

        // 關閉更新通知
        function closeUpdateNotification() {
            const notification = document.getElementById('updateNotification');
            notification.classList.remove('show');
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }

        // 安裝更新（或開始下載）
        async function installUpdate() {
            const installBtn = document.getElementById('updateInstallBtn');
            const isDownloaded = installBtn.dataset.downloaded === 'true';

            if (!isDownloaded) {
                // 尚未下載，開始下載
                console.log('[Calculator] Starting update download...');
                if (window.electronAPI && window.electronAPI.downloadUpdate) {
                    window.electronAPI.downloadUpdate();
                }
                return;
            }

            // 已下載完成，執行安裝
            if (window.electronAPI && window.electronAPI.installUpdate) {
                // 檢查是否為開發模式
                const isDev = await window.electronAPI.isDevelopment();

                if (isDev) {
                    // 測試模式：顯示訊息後關閉通知
                    installBtn.textContent = '✓ 測試完成（不會真的重啟）';
                    installBtn.disabled = true;
                    installBtn.style.background = '#10b981'; // 綠色
                    installBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'; // 綠色光暈

                    // 調用主程序的測試安裝（僅記錄日誌）
                    window.electronAPI.installUpdate();

                    console.log('[Calculator] Test mode: Install button clicked, app will not restart');

                    // 2秒後關閉通知，回到計算機畫面
                    setTimeout(() => {
                        closeUpdateNotification();
                    }, 2000);
                } else {
                    // 生產模式：立即安裝並重啟
                    window.electronAPI.installUpdate();
                }
            }
        }

        // 監聽來自主程序的更新事件
        if (window.electronAPI) {
            // 有可用更新
            window.electronAPI.onUpdateAvailable((event, updateInfo) => {
                console.log('[Calculator] Update available:', updateInfo);
                showUpdateNotification(updateInfo);
            });

            // 下載進度
            window.electronAPI.onUpdateProgress((event, progress) => {
                updateDownloadProgress(progress);
            });

            // 下載完成
            window.electronAPI.onUpdateDownloaded((event, updateInfo) => {
                console.log('[Calculator] Update downloaded:', updateInfo);
                updateDownloadComplete(updateInfo);
            });
        }
