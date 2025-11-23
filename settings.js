let currentPassword = null;
let isPasswordVisible = false;

const statusValue = document.getElementById('statusValue');
const toggleVisibilityBtn = document.getElementById('toggleVisibilityBtn');
const eyeIcon = document.getElementById('eyeIcon');
const eyeOffIcon = document.getElementById('eyeOffIcon');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const newPasswordLabel = document.getElementById('newPasswordLabel');
const submitBtn = document.getElementById('submitBtn');
const message = document.getElementById('message');
const messageText = document.getElementById('messageText');
const messageIcon = document.getElementById('messageIcon');
const newPasswordHint = document.getElementById('newPasswordHint');
const confirmPasswordHint = document.getElementById('confirmPasswordHint');

// 載入目前密碼
async function loadCurrentPassword() {
    try {
        currentPassword = await window.electronAPI.getPassword();

        // 檢查是否使用預設密碼
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
        statusValue.textContent = '無法載入';
        statusValue.classList.add('not-set');
        console.error('Failed to load password:', err);
    }
}

// 切換密碼顯示/隱藏
function togglePasswordVisibility() {
    isPasswordVisible = !isPasswordVisible;

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

// 顯示浮動通知（與計算機鎖定畫面一致）
function showFloatingStatus(text, type = 'info') {
    const floatingStatus = document.getElementById('floatingStatus');
    floatingStatus.textContent = text;

    // 移除所有狀態類別
    floatingStatus.classList.remove('status-success', 'status-error', 'status-info');

    // 添加對應狀態類別
    if (type === 'success') {
        floatingStatus.classList.add('status-success');
    } else if (type === 'error') {
        floatingStatus.classList.add('status-error');
    } else {
        floatingStatus.classList.add('status-info');
    }

    // 顯示通知
    floatingStatus.classList.add('show');

    // 2秒後自動隱藏
    setTimeout(() => {
        floatingStatus.classList.remove('show');
    }, 2000);
}

// 顯示訊息（保持向後兼容）
function showMessage(text, type) {
    showFloatingStatus(text, type);
}

// 限制輸入只能是數字並顯示提示
function restrictToNumbers(input, hintElement) {
    input.addEventListener('input', (e) => {
        // 移除非數字字元
        const oldValue = e.target.value;
        const newValue = oldValue.replace(/[^0-9]/g, '');
        e.target.value = newValue;

        // 如果有非數字字元被移除，顯示警告
        if (oldValue !== newValue && oldValue.length > 0) {
            hintElement.textContent = '⚠️ 只能輸入數字';
            hintElement.className = 'input-hint error';
            return;
        }

        // 根據長度顯示提示
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

    // 當焦點離開時檢查
    input.addEventListener('blur', (e) => {
        const value = e.target.value;
        if (value.length > 0 && value.length < 4) {
            hintElement.textContent = '❌ 密碼必須是4位數字';
            hintElement.className = 'input-hint error';
        }
    });

    // 當獲得焦點時，如果已經有4位數字就清除提示
    input.addEventListener('focus', (e) => {
        if (e.target.value.length === 4) {
            hintElement.textContent = '';
            hintElement.className = 'input-hint';
        }
    });
}

restrictToNumbers(newPasswordInput, newPasswordHint);
restrictToNumbers(confirmPasswordInput, confirmPasswordHint);

// 儲存密碼
async function savePassword() {
    const newPwd = newPasswordInput.value;
    const confirmPwd = confirmPasswordInput.value;

    // 驗證：必須是4位數字
    if (!/^[0-9]{4}$/.test(newPwd)) {
        showMessage('密碼必須是4位數字', 'error');
        return;
    }

    // 驗證：確認密碼
    if (newPwd !== confirmPwd) {
        showMessage('兩次密碼輸入不一致', 'error');
        return;
    }

    // 驗證：不能使用保留密碼
    if (newPwd === '4444') {
        showMessage('此密碼為系統保留碼，請使用其他密碼', 'error');
        return;
    }

    try {
        submitBtn.disabled = true;
        await window.electronAPI.setPassword(newPwd);
        showMessage('密碼設定成功！', 'success');

        // 更新當前密碼
        currentPassword = newPwd;

        // 清空表單
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';

        // 更新顯示
        loadCurrentPassword();

        // 1.5秒後返回
        setTimeout(() => {
            goBack();
        }, 1500);
    } catch (err) {
        showMessage('儲存失敗：' + err.message, 'error');
        submitBtn.disabled = false;
        console.error('Failed to save password:', err);
    }
}

function goBack() {
    // Close the window with fade out animation
    const overlay = document.querySelector('.settings-overlay');
    overlay.style.animation = 'slideDown 0.3s ease-out';

    setTimeout(() => {
        window.close();
    }, 300);
}

// Add slideDown animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
        to {
            opacity: 0;
            transform: scale(0.9) translateY(30px);
        }
    }
`;
document.head.appendChild(style);

// 拖移功能
const overlay = document.querySelector('.settings-overlay');
const header = document.querySelector('.header');

// 初始化置中位置
function centerOverlay() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const overlayWidth = 420;
    const overlayHeight = 600;

    const left = (windowWidth - overlayWidth) / 2;
    const top = (windowHeight - overlayHeight) / 2;

    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
}

// 頁面載入時置中
centerOverlay();

let isDragging = false;
let offsetX;
let offsetY;

header.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - overlay.offsetLeft;
    offsetY = e.clientY - overlay.offsetTop;
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        e.preventDefault();
        const newX = e.clientX - offsetX;
        const newY = e.clientY - offsetY;

        overlay.style.left = newX + 'px';
        overlay.style.top = newY + 'px';
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

// Tab 切換功能
function switchTab(tabName) {
    const fadeOverlay = document.querySelector('.scroll-fade-overlay');

    // 移除所有 active class
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

    // 添加 active class 到選中的 tab
    if (tabName === 'password') {
        document.querySelector('.tab[onclick="switchTab(\'password\')"]').classList.add('active');
        const passwordTab = document.getElementById('passwordTab');
        passwordTab.classList.add('active');

        // 檢查滾動狀態
        if (passwordTab.scrollTop > 0) {
            fadeOverlay.classList.add('visible');
        } else {
            fadeOverlay.classList.remove('visible');
        }
    } else if (tabName === 'idle') {
        document.querySelector('.tab[onclick="switchTab(\'idle\')"]').classList.add('active');
        const idleTab = document.getElementById('idleTab');
        idleTab.classList.add('active');
        loadIdleTime();

        // 檢查滾動狀態
        if (idleTab.scrollTop > 0) {
            fadeOverlay.classList.add('visible');
        } else {
            fadeOverlay.classList.remove('visible');
        }
    }
}

// 閒置時間相關變數和函數
let selectedIdleTime = 60; // 預設 1 分鐘

async function loadIdleTime() {
    try {
        const idleTime = await window.electronAPI.getIdleTime();
        selectedIdleTime = idleTime !== undefined ? idleTime : 60;
        updateIdleTimeSelection();
    } catch (err) {
        console.error('Failed to load idle time:', err);
        selectedIdleTime = 60;
        updateIdleTimeSelection();
    }
}

function updateIdleTimeSelection() {
    document.querySelectorAll('.idle-option').forEach(option => {
        option.classList.remove('selected');
        if (parseInt(option.dataset.value) === selectedIdleTime) {
            option.classList.add('selected');
        }
    });
}

function selectIdleTime(seconds) {
    selectedIdleTime = seconds;
    updateIdleTimeSelection();
}

async function saveIdleTime() {
    try {
        const idleSubmitBtn = document.getElementById('idleSubmitBtn');
        idleSubmitBtn.disabled = true;

        await window.electronAPI.setIdleTime(selectedIdleTime);

        showIdleMessage('設定已儲存', 'success');
        idleSubmitBtn.disabled = false;

        setTimeout(() => {
            goBack();
        }, 1500);
    } catch (err) {
        showIdleMessage('儲存失敗：' + err.message, 'error');
        idleSubmitBtn.disabled = false;
        console.error('Failed to save idle time:', err);
    }
}

function showIdleMessage(text, type) {
    showFloatingStatus(text, type);
}

// 設定滾動淡出效果
function setupScrollFadeEffect() {
    const fadeOverlay = document.querySelector('.scroll-fade-overlay');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabPanes.forEach(pane => {
        pane.addEventListener('scroll', () => {
            if (pane.classList.contains('active')) {
                if (pane.scrollTop > 0) {
                    fadeOverlay.classList.add('visible');
                } else {
                    fadeOverlay.classList.remove('visible');
                }
            }
        });
    });
}

// 初始化
loadCurrentPassword();
setupScrollFadeEffect();

// Enter 鍵送出
confirmPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        savePassword();
    }
});

// 閒置時間說明提示
const infoIconWrapper = document.querySelector('.info-icon-wrapper');
const infoTooltip = document.getElementById('infoTooltip');

if (infoIconWrapper && infoTooltip) {
    infoIconWrapper.addEventListener('mouseenter', () => {
        infoTooltip.classList.add('show');
    });

    infoIconWrapper.addEventListener('mouseleave', () => {
        infoTooltip.classList.remove('show');
    });
}
