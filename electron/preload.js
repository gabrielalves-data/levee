'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal typed surface exposed to the renderer.
// No Node.js APIs leak — only these explicit channels.
contextBridge.exposeInMainWorld('devcost', {
  getToken: () => ipcRenderer.invoke('get-token'),
  getPort:  () => ipcRenderer.invoke('get-port'),
  onCostUpdate: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('cost-update', handler);
    return () => ipcRenderer.removeListener('cost-update', handler);
  },
});
