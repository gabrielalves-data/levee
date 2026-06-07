'use strict';

const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload] script loaded');

try {
  contextBridge.exposeInMainWorld('devcost', {
    getToken:      () => ipcRenderer.invoke('get-token'),
    getPort:       () => ipcRenderer.invoke('get-port'),
    openDashboard: (serviceId) => ipcRenderer.send('open-dashboard', serviceId),
    getLoginItem:  () => ipcRenderer.invoke('get-login-item'),
    setLoginItem:  (enable) => ipcRenderer.invoke('set-login-item', enable),
    // These return a cleanup function the caller invokes on unmount.
    // contextBridge proxies returned functions across the bridge.
    onCostUpdate: (cb) => {
      const handler = (_event, data) => cb(data);
      ipcRenderer.on('cost-update', handler);
      return () => ipcRenderer.removeListener('cost-update', handler);
    },
    onNavigate: (cb) => {
      const handler = (_event, route) => cb(route);
      ipcRenderer.on('navigate', handler);
      return () => ipcRenderer.removeListener('navigate', handler);
    },
  });
  console.log('[preload] devcost exposed OK');
} catch (err) {
  console.error('[preload] contextBridge failed:', err.message, err.stack);
}
