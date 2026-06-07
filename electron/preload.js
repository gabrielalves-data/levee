'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal typed surface exposed to the renderer.
// No Node.js APIs leak — only these explicit channels.
contextBridge.exposeInMainWorld('devcost', {
  getToken:      () => ipcRenderer.invoke('get-token'),
  getPort:       () => ipcRenderer.invoke('get-port'),
  openDashboard: (serviceId) => ipcRenderer.send('open-dashboard', serviceId),
  getLoginItem:  () => ipcRenderer.invoke('get-login-item'),
  setLoginItem:  (enable) => ipcRenderer.invoke('set-login-item', enable),
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
