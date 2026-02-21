const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mangaAPI', {
  openDirectory: () => ipcRenderer.invoke('open-directory'),
  loadDirectory: (dirPath) => ipcRenderer.invoke('load-directory', dirPath),
  getSubdirectories: (dirPath) => ipcRenderer.invoke('get-subdirectories', dirPath),
  getFileDirectory: (filePath) => ipcRenderer.invoke('get-file-directory', filePath),
  getParentDirectory: (dirPath) => ipcRenderer.invoke('get-parent-directory', dirPath),
  getVersion: () => ipcRenderer.invoke('get-version'),
  onOpenFile: (callback) => ipcRenderer.on('open-file', (_event, filePath) => callback(filePath)),
});
