'use strict';

const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload] script loaded');

try {
  contextBridge.exposeInMainWorld('levee', {
    getToken:      () => ipcRenderer.invoke('get-token'),
    getPort:       () => ipcRenderer.invoke('get-port'),
    openDashboard: (serviceId) => ipcRenderer.send('open-dashboard', serviceId),
    getLoginItem:     () => ipcRenderer.invoke('get-login-item'),
    setLoginItem:     (enable) => ipcRenderer.invoke('set-login-item', enable),
    getOverlayEnabled: () => ipcRenderer.invoke('get-overlay-enabled'),
    setOverlayEnabled: (enable) => ipcRenderer.invoke('set-overlay-enabled', enable),
    getContentProtection: () => ipcRenderer.invoke('get-content-protection'),
    setContentProtection: (enable) => ipcRenderer.invoke('set-content-protection', enable),
    overlayExpand:       (w, h)         => ipcRenderer.invoke('overlay-expand', w, h),
    overlayRefit:        (w, h, anchor) => ipcRenderer.send('overlay-refit', w, h, anchor),
    overlayCollapse:     (anchor)       => ipcRenderer.send('overlay-collapse', anchor),
    overlayGetPosition:  ()     => ipcRenderer.invoke('overlay-get-position'),
    overlayMove:         (x, y, w, h, anchor) => ipcRenderer.send('overlay-move', x, y, w, h, anchor),
    notifyWidgetUpdate:  ()     => ipcRenderer.send('widget-updated'),
    getAppVersion:   () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('update-check'),
    downloadUpdate:  () => ipcRenderer.invoke('update-download'),
    installUpdate:   () => ipcRenderer.invoke('update-install'),
    onUpdateStatus: (cb) => {
      const handler = (_event, status) => cb(status);
      ipcRenderer.on('update-status', handler);
      return () => ipcRenderer.removeListener('update-status', handler);
    },
    onWidgetUpdate: (cb) => {
      const handler = () => cb();
      ipcRenderer.on('widget-updated', handler);
      return () => ipcRenderer.removeListener('widget-updated', handler);
    },
    // These return a cleanup function the caller invokes on unmount.
    // contextBridge proxies returned functions across the bridge.
    onNavigate: (cb) => {
      const handler = (_event, route) => cb(route);
      ipcRenderer.on('navigate', handler);
      return () => ipcRenderer.removeListener('navigate', handler);
    },
    onOverlayVisibility: (cb) => {
      const handler = (_event, show) => cb(show);
      ipcRenderer.on('overlay-visibility', handler);
      return () => ipcRenderer.removeListener('overlay-visibility', handler);
    },
  });
  console.log('[preload] levee exposed OK');
} catch (err) {
  console.error('[preload] contextBridge failed:', err.message, err.stack);
}
