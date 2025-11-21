// Lock overlay - shows calculator on top of Telegram without unloading the page
// This allows Telegram notifications to continue working in the background

(function() {
    'use strict';

    // Check if overlay already exists
    if (document.getElementById('calculator-lock-overlay')) {
        return;
    }

    // Fetch calculator HTML content
    fetch('calculator.html')
        .then(response => response.text())
        .then(html => {
            // Create overlay container
            const overlay = document.createElement('div');
            overlay.id = 'calculator-lock-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                z-index: 999999;
                display: flex;
                justify-content: center;
                align-items: center;
            `;

            // Parse HTML and extract body content
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const calculatorContent = doc.body.innerHTML;

            // Set calculator content
            overlay.innerHTML = calculatorContent;

            // Extract and inject styles
            const styles = doc.querySelectorAll('style');
            styles.forEach(style => {
                const styleElement = document.createElement('style');
                styleElement.textContent = style.textContent;
                overlay.appendChild(styleElement);
            });

            // Extract and execute scripts
            const scripts = doc.querySelectorAll('script');
            scripts.forEach(script => {
                const scriptElement = document.createElement('script');
                if (script.src) {
                    scriptElement.src = script.src;
                } else {
                    scriptElement.textContent = script.textContent;
                }
                overlay.appendChild(scriptElement);
            });

            // Add overlay to page
            document.body.appendChild(overlay);

            console.log('[Lock Overlay] Calculator lock overlay injected');
        })
        .catch(err => {
            console.error('[Lock Overlay] Failed to load calculator:', err);
        });
})();

// Function to remove lock overlay
window.removeLockOverlay = function() {
    const overlay = document.getElementById('calculator-lock-overlay');
    if (overlay) {
        overlay.remove();
        console.log('[Lock Overlay] Lock overlay removed');
    }
};
