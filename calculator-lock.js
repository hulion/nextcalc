        // 狀態變數
        let isDarkMode = true;
        let input = '0';
        let previousInput = '';
        let operator = null;
        let history = [];
        let isNewNumber = true;
        let passwordInput = '';
        let PASSWORD = '1209';

        // === 背景跑馬燈狀態變量 ===
        let bgNumber = '0';           // 背景顯示的數字
        let bgAngle = 34;             // 背景旋轉角度
        let bgGap = 60;               // 數字間距
        let bgRowGap = 0;             // 行與行之間的垂直間距
        let bgFontSize = 100;         // 字體大小
        let animationIntervalRef = null;    // 數字動畫計時器
        let autoRotateIntervalRef = null;   // 自動旋轉計時器
        let idleTimerRef = null;             // 閒置計時器
        let isRandomMode = false;            // 隨機符號模式標記

        // 運算符號陣列
        const operators = ['+', '-', '×', '÷'];

        // 隨機獲取運算符號
        function getRandomOperator() {
            return operators[Math.floor(Math.random() * operators.length)];
        }

        // 行設定：10行，每行隨機速度和方向
        const rowSettings = Array.from({ length: 10 }).map((_, i) => ({
            id: i,
            speed: 40 + Math.random() * 40,  // 40-80秒
            direction: i % 2 === 0 ? 'left' : 'right'
        }));

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

        // === 背景跑馬燈核心函數 ===

        // 創建跑馬燈行
        function createMarqueeRows() {
            const bgLayer = document.getElementById('bgLayer');
            bgLayer.innerHTML = '';  // 清空

            rowSettings.forEach(row => {
                const rowDiv = document.createElement('div');
                rowDiv.className = 'marquee-row';
                rowDiv.dataset.rowId = row.id;
                rowDiv.style.animation = `marquee-${row.direction} ${row.speed}s linear infinite`;

                // 生成12個數字項（加上重複以確保無縫）
                for (let i = 0; i < 24; i++) {
                    const span = document.createElement('span');
                    span.className = 'marquee-item';
                    span.textContent = bgNumber;
                    span.style.fontSize = `${bgFontSize}px`;
                    span.style.opacity = 0.1 + Math.random() * 0.7;  // 每個數字獨立透明度 0.1-0.8
                    span.style.animation = `pulse-scale ${3 + Math.random() * 4}s ease-in-out infinite alternate`;
                    span.style.animationDelay = `${Math.random() * 5}s`;
                    rowDiv.appendChild(span);
                }

                bgLayer.appendChild(rowDiv);
            });
        }

        // 更新跑馬燈內容（更新數字和樣式）
        function updateMarqueeContent(number, useRandomMode = false) {
            const rows = document.querySelectorAll('.marquee-row');
            rows.forEach(row => {
                const spans = row.querySelectorAll('.marquee-item');
                spans.forEach(span => {
                    if (useRandomMode) {
                        span.textContent = getRandomOperator();
                    } else {
                        span.textContent = number;
                    }
                    span.style.fontSize = `${bgFontSize}px`;
                    row.style.gap = `${bgGap}px`;
                });
            });

            // 應用垂直間距到 #bgLayer
            const bgLayer = document.getElementById('bgLayer');
            bgLayer.style.gap = `${bgRowGap}px`;
        }

        // 核心函數：觸發背景變化
        function triggerBgChange(targetVal) {
            // 清除之前的動畫計時器
            if (animationIntervalRef) {
                clearInterval(animationIntervalRef);
                animationIntervalRef = null;
            }

            const targetStr = targetVal.toString();
            const targetNum = parseInt(targetStr);
            const startNum = parseInt(bgNumber);

            // 判斷是否需要漸變動畫
            const isSymbol = isNaN(targetNum);
            const isLongString = targetStr.length > 1;
            const isResetJump = Math.abs(startNum) >= 10 && targetNum === 0;
            const isBigToSmallJump = Math.abs(startNum) >= 10 && Math.abs(targetNum) < 10;

            // 直接設置（符號、長字串、或大數到小數的跳轉）
            if (isSymbol || isLongString || isNaN(startNum) || targetNum === startNum || isResetJump || isBigToSmallJump) {
                bgNumber = targetStr;
                isRandomMode = false;  // 重置為正常模式
                updateMarqueeContent(bgNumber, isRandomMode);
                return;
            }

            // 漸變動畫
            let current = startNum;
            const step = targetNum > startNum ? 1 : -1;

            animationIntervalRef = setInterval(() => {
                current += step;
                bgNumber = current.toString();
                updateMarqueeContent(bgNumber);

                if (current === targetNum) {
                    clearInterval(animationIntervalRef);
                    animationIntervalRef = null;
                }
            }, 60);
        }

        // 隨機化視覺參數並設置旋轉中心
        function randomizeVisuals() {
            const bgLayer = document.getElementById('bgLayer');
            const calculator = document.querySelector('.calculator');

            // 計算 calculator 元素的中心位置（相對於視口）
            if (calculator) {
                const calcRect = calculator.getBoundingClientRect();
                const calcCenterX = calcRect.left + calcRect.width / 2;
                const calcCenterY = calcRect.top + calcRect.height / 2;

                // bgLayer 的左上角在 (-100vw, -100vh) 處
                // 將視口坐標轉換為相對於 bgLayer 的坐標
                const bgLayerOriginX = calcCenterX + window.innerWidth;
                const bgLayerOriginY = calcCenterY + window.innerHeight;

                // 設置 transform-origin（像素值）
                bgLayer.style.transformOrigin = `${bgLayerOriginX}px ${bgLayerOriginY}px`;
            }

            const randomAngle = Math.floor(Math.random() * 360);
            bgAngle = randomAngle;
            bgLayer.style.transform = `rotate(${bgAngle}deg)`;

            const randomGap = Math.floor(Math.random() * (200 - 20 + 1)) + 20;
            bgGap = randomGap;

            const randomRowGap = Math.floor(Math.random() * 101);
            bgRowGap = randomRowGap;

            const randomSize = Math.floor(Math.random() * (200 - 20 + 1)) + 20;
            bgFontSize = randomSize;

            updateMarqueeContent(bgNumber, isRandomMode);
        }

        // 開始自動旋轉
        function startAutoRotation() {
            if (autoRotateIntervalRef) clearInterval(autoRotateIntervalRef);
            isRandomMode = true;  // 進入隨機符號模式
            autoRotateIntervalRef = setInterval(() => {
                randomizeVisuals();
            }, 5000);
        }

        // 處理用戶互動
        function handleUserInteraction() {
            isRandomMode = false;  // 恢復正常模式
            randomizeVisuals();
            if (autoRotateIntervalRef) clearInterval(autoRotateIntervalRef);
            if (idleTimerRef) clearTimeout(idleTimerRef);
            idleTimerRef = setTimeout(() => {
                startAutoRotation();
            }, 2000);
        }

        // 監聽 display 元素的變化並自動更新背景數字
        let lastDisplayValue = '0';
        function startDisplayObserver() {
            const displayEl = document.getElementById('display');
            if (!displayEl) return;

            const observer = new MutationObserver(() => {
                const currentValue = displayEl.textContent.replace(/,/g, ''); // 移除千分位
                if (currentValue !== lastDisplayValue) {
                    lastDisplayValue = currentValue;
                    triggerBgChange(currentValue);
                    handleUserInteraction();
                }
            });

            observer.observe(displayEl, {
                childList: true,
                characterData: true,
                subtree: true
            });

            console.log('[Calculator] Display observer started');
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

        // === 初始化背景跑馬燈 ===
        createMarqueeRows();
        startAutoRotation();
        startDisplayObserver();
        console.log('[Calculator] Background marquee initialized');

        // 注意：自動切換輸入法功能已暫時移除
        // 用戶可以直接使用鍵盤數字鍵輸入密碼

        // ==================== 密碼設定彈窗功能 ====================
        // 監聽來自 main process 的開啟設定彈窗指令
        window.electronAPI.onOpenSettings(() => {
            openSettingsModal();
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
