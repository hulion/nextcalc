// Panic mode detector - detects "444444" pattern
// This script runs in Telegram page to detect emergency logout

let panicSequence = '';
const PANIC_CODE = '444444';
let lastKeyTime = Date.now();

// Listen for key presses
document.addEventListener('keydown', (event) => {
    const currentTime = Date.now();

    // Reset if more than 3 seconds between keypresses
    if (currentTime - lastKeyTime > 3000) {
        panicSequence = '';
    }

    lastKeyTime = currentTime;

    // Only track number 4
    if (event.key === '4') {
        panicSequence += '4';
        console.log('[Panic Detector] Sequence:', panicSequence);

        // Keep only last 6 characters
        if (panicSequence.length > 6) {
            panicSequence = panicSequence.slice(-6);
        }

        // Check if panic code matched
        if (panicSequence === PANIC_CODE) {
            console.log('[Panic Detector] PANIC CODE DETECTED! Clearing session and logging out...');
            panicSequence = '';

            // Clear Telegram session data
            try {
                // Clear localStorage
                localStorage.clear();

                // Clear sessionStorage
                sessionStorage.clear();

                // Clear IndexedDB databases used by Telegram
                if (window.indexedDB) {
                    window.indexedDB.databases().then(databases => {
                        databases.forEach(db => {
                            console.log('[Panic Detector] Deleting database:', db.name);
                            window.indexedDB.deleteDatabase(db.name);
                        });
                    }).catch(err => {
                        console.error('[Panic Detector] Failed to list databases:', err);
                    });
                }

                console.log('[Panic Detector] Session data cleared');
            } catch (err) {
                console.error('[Panic Detector] Failed to clear session:', err);
            }

            // Clear Telegram data and reset password via Electron API
            if (window.electronAPI) {
                (async () => {
                    try {
                        await window.electronAPI.clearTelegramData();
                        await window.electronAPI.resetPassword();
                        console.log('[Panic Detector] Password reset to default (1209)');
                    } catch (err) {
                        console.error('[Panic Detector] Failed to reset password:', err);
                    }

                    // Trigger panic mode (go back to calculator)
                    if (window.electronAPI.panicMode) {
                        window.electronAPI.panicMode();
                    } else {
                        window.location.href = 'calculator.html';
                    }
                })();
            } else {
                // Fallback: just go back to calculator
                window.location.href = 'calculator.html';
            }
        }
    } else {
        // Reset sequence if non-4 key is pressed
        panicSequence = '';
    }
});

console.log('[Panic Detector] Initialized - Press "4" six times quickly to logout');
