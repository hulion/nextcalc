const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Script starting...');

contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (title, body, icon) => {
    return ipcRenderer.invoke('show-notification', { title, body, icon });
  },
  unlockApp: () => {
    return ipcRenderer.invoke('unlock-app');
  },
  getPassword: () => {
    return ipcRenderer.invoke('get-password');
  },
  setPassword: (password) => {
    return ipcRenderer.invoke('set-password', password);
  },
  resetPassword: () => {
    return ipcRenderer.invoke('reset-password');
  },
  panicMode: () => {
    return ipcRenderer.invoke('panic-mode');
  },
  clearTelegramData: () => {
    return ipcRenderer.invoke('clear-telegram-data');
  },
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', callback);
  },
  getIdleTime: () => {
    return ipcRenderer.invoke('get-idle-time');
  },
  setIdleTime: (seconds) => {
    return ipcRenderer.invoke('set-idle-time', seconds);
  }
});

// Create custom Notification class
class ElectronNotification extends EventTarget {
  constructor(title, options = {}) {
    super();
    this.title = title;
    this.body = options.body || '';
    this.icon = options.icon || '';
    this.tag = options.tag || '';
    this.data = options.data || null;
    this.silent = options.silent || false;

    console.log('[Preload] Creating notification:', title, options);

    // Send to main process
    ipcRenderer.invoke('show-notification', {
      title: this.title,
      body: this.body,
      icon: this.icon,
      tag: this.tag,
      silent: this.silent
    }).then(() => {
      console.log('[Preload] Notification sent successfully');
      const event = new Event('show');
      this.dispatchEvent(event);
      if (this.onshow) this.onshow(event);
    }).catch((err) => {
      console.error('[Preload] Notification error:', err);
      const event = new Event('error');
      this.dispatchEvent(event);
      if (this.onerror) this.onerror(event);
    });

    // Handle click from main process
    const clickHandler = () => {
      const event = new Event('click');
      this.dispatchEvent(event);
      if (this.onclick) this.onclick(event);
    };

    ipcRenderer.once(`notification-clicked-${this.tag || Date.now()}`, clickHandler);
  }

  close() {
    const event = new Event('close');
    this.dispatchEvent(event);
    if (this.onclose) this.onclose(event);
  }

  static requestPermission(callback) {
    console.log('[Preload] requestPermission called');
    const result = Promise.resolve('granted');
    if (callback) {
      result.then(callback);
    }
    return result;
  }

  static get permission() {
    return 'granted';
  }
}

ElectronNotification.prototype.onclick = null;
ElectronNotification.prototype.onshow = null;
ElectronNotification.prototype.onerror = null;
ElectronNotification.prototype.onclose = null;

// Force override Notification immediately
delete window.Notification;
window.Notification = ElectronNotification;

// Ensure it stays overridden
Object.defineProperty(window, 'Notification', {
  get: () => ElectronNotification,
  set: () => {
    console.log('[Preload] Prevented Notification override attempt');
  },
  configurable: false
});

console.log('[Preload] Notification class installed:', window.Notification === ElectronNotification);
console.log('[Preload] Notification.permission:', window.Notification.permission);
