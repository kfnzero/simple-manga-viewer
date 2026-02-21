const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let pendingFilePath = null; // 從命令列或第二實例傳入的圖片路徑

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.avif'
]);

// 從命令列參數中取得圖片檔案路徑
function getImagePathFromArgs(argv) {
  // 打包後: ["app.exe", "C:\path\image.jpg"]
  // 開發中: ["electron.exe", ".", "C:\path\image.jpg"]
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('-') || arg.startsWith('--')) continue;
    if (arg === '.') continue; // 開發模式的 electron .
    const ext = path.extname(arg).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      const resolved = path.resolve(arg);
      try {
        if (fs.existsSync(resolved)) return resolved;
      } catch { /* ignore */ }
    }
  }
  return null;
}

// 單一實例鎖定：若已有實例在執行，將路徑傳給它
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = getImagePathFromArgs(argv);
    if (filePath && mainWindow) {
      mainWindow.webContents.send('open-file', filePath);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 記錄啟動時的命令列參數
pendingFilePath = getImagePathFromArgs(process.argv);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 600,
    minHeight: 400,
    title: 'Simple Manga Viewer',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // 頁面載入完成後，若有待開啟的圖片則傳送給 renderer
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingFilePath) {
      mainWindow.webContents.send('open-file', pendingFilePath);
      pendingFilePath = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Open directory dialog
ipcMain.handle('open-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '選擇漫畫目錄',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const dirPath = result.filePaths[0];
  return loadImagesFromDirectory(dirPath);
});

// Load images from a given directory path
ipcMain.handle('load-directory', async (_event, dirPath) => {
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return null;
    return loadImagesFromDirectory(dirPath);
  } catch {
    return null;
  }
});

// Get subdirectories and image files for the sidebar
ipcMain.handle('get-subdirectories', async (_event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        type: 'directory',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const files = entries
      .filter((e) => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        type: 'image',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return [...dirs, ...files];
  } catch {
    return [];
  }
});

// Get directory of a file
ipcMain.handle('get-file-directory', async (_event, filePath) => {
  return path.dirname(filePath);
});

// Get app version
ipcMain.handle('get-version', () => app.getVersion());

// Get parent directory
ipcMain.handle('get-parent-directory', async (_event, dirPath) => {
  const parent = path.dirname(dirPath);
  if (parent === dirPath) return null;
  return parent;
});

function loadImagesFromDirectory(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath);
    const images = entries
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return IMAGE_EXTENSIONS.has(ext);
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => {
        const fullPath = path.join(dirPath, file);
        return {
          name: file,
          path: fullPath,
          url: `file://${fullPath.replace(/\\/g, '/')}`,
        };
      });

    return {
      directory: dirPath,
      directoryName: path.basename(dirPath),
      images,
    };
  } catch {
    return null;
  }
}
