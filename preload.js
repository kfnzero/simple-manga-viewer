const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mangaAPI', {
  openDirectory: () => ipcRenderer.invoke('open-directory'),
  loadDirectory: (dirPath) => ipcRenderer.invoke('load-directory', dirPath),
  getSubdirectories: (dirPath) => ipcRenderer.invoke('get-subdirectories', dirPath),
  getParentDirectory: (dirPath) => ipcRenderer.invoke('get-parent-directory', dirPath),
});
