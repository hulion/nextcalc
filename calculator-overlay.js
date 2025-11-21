// Calculator overlay - inject calculator interface into Telegram page
// Use z-index to control visibility

(function() {
    'use strict';

    // Check if overlay already exists
    if (document.getElementById('calculator-overlay-container')) {
        console.log('[Calculator Overlay] Overlay already exists');
        return;
    }

    console.log('[Calculator Overlay] Creating calculator overlay...');

    // Create full-screen overlay container
    const overlay = document.createElement('div');
    overlay.id = 'calculator-overlay-container';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #111827;
        z-index: -1;
        pointer-events: none;
        transition: z-index 0s, opacity 0.3s;
        opacity: 0;
    `;

    document.body.appendChild(overlay);

    // Load calculator HTML content via fetch and inject directly
    console.log('[Calculator Overlay] Fetching calculator content...');

    // This will be replaced with actual file URL by main.js
    const calculatorURL = 'CALCULATOR_URL_PLACEHOLDER';

    fetch(calculatorURL)
        .then(response => response.text())
        .then(html => {
            console.log('[Calculator Overlay] Calculator content loaded');

            // Parse HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Inject body content
            overlay.innerHTML = doc.body.innerHTML;

            // Inject styles
            doc.querySelectorAll('style').forEach(style => {
                const styleElement = document.createElement('style');
                styleElement.textContent = style.textContent;
                overlay.appendChild(styleElement);
            });

            // Inject scripts
            doc.querySelectorAll('script').forEach(script => {
                const scriptElement = document.createElement('script');
                if (script.src) {
                    scriptElement.src = script.src;
                } else {
                    scriptElement.textContent = script.textContent;
                }
                overlay.appendChild(scriptElement);
            });

            console.log('[Calculator Overlay] Calculator content injected');
        })
        .catch(err => {
            console.error('[Calculator Overlay] Failed to load calculator:', err);
            overlay.innerHTML = '<div style="color: white; padding: 20px; text-align: center;">Failed to load calculator</div>';
        });

    console.log('[Calculator Overlay] Calculator overlay created');
})();

// Global functions to control overlay visibility
window.showCalculatorOverlay = function() {
    const overlay = document.getElementById('calculator-overlay-container');
    if (overlay) {
        overlay.style.zIndex = '999999';
        overlay.style.pointerEvents = 'auto';
        overlay.style.opacity = '1';
        console.log('[Calculator Overlay] Showing calculator');
    } else {
        console.error('[Calculator Overlay] Overlay not found');
    }
};

window.hideCalculatorOverlay = function() {
    const overlay = document.getElementById('calculator-overlay-container');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.zIndex = '-1';
            overlay.style.pointerEvents = 'none';
        }, 300); // Wait for fade out animation
        console.log('[Calculator Overlay] Hiding calculator');
    } else {
        console.error('[Calculator Overlay] Overlay not found');
    }
};

console.log('[Calculator Overlay] Script loaded successfully');
