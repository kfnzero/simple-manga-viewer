const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

app.setAppUserModelId('com.simple-manga-viewer.app');

let mainWindow;
let pendingFilePath = null; // 從命令列或第二實例傳入的圖片路徑

const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStateFile, 'utf-8'));
  } catch {
    return null;
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? win._lastNormalBounds || win.getNormalBounds() : win.getBounds();
  const state = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, isMaximized };
  try {
    fs.writeFileSync(windowStateFile, JSON.stringify(state));
  } catch { /* ignore */ }
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.avif'
]);

const ARCHIVE_EXTENSIONS = new Set(['.zip', '.cbz']);

// 從命令列參數中取得圖片檔案或壓縮檔路徑
function getImagePathFromArgs(argv) {
  // 打包後: ["app.exe", "C:\path\image.jpg"]
  // 開發中: ["electron.exe", ".", "C:\path\image.jpg"]
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('-') || arg.startsWith('--')) continue;
    if (arg === '.') continue; // 開發模式的 electron .
    const ext = path.extname(arg).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) || ARCHIVE_EXTENSIONS.has(ext)) {
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
  const savedState = loadWindowState();
  const windowOptions = {
    width: savedState?.width || 1200,
    height: savedState?.height || 900,
    minWidth: 600,
    minHeight: 400,
    title: 'Simple Manga Viewer',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (savedState?.x != null && savedState?.y != null) {
    windowOptions.x = savedState.x;
    windowOptions.y = savedState.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (savedState?.isMaximized) {
    mainWindow.maximize();
  }

  // debounce 儲存視窗狀態
  let saveTimeout;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWindowState(mainWindow), 500);
  };

  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      mainWindow._lastNormalBounds = mainWindow.getBounds();
    }
    debouncedSave();
  });
  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      mainWindow._lastNormalBounds = mainWindow.getBounds();
    }
    debouncedSave();
  });
  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
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

app.whenReady().then(() => {
  createWindow();

  const menuTemplate = [
    {
      label: '檔案',
      submenu: [
        {
          label: '開啟目錄或壓縮檔',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow && mainWindow.webContents.send('menu-open-directory'),
        },
        { type: 'separator' },
        { role: 'quit', label: '結束' },
      ],
    },
    {
      label: '說明',
      submenu: [
        {
          label: '關於',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '關於 Simple Manga Viewer',
              message: 'Simple Manga Viewer',
              detail: `版本: v${app.getVersion()}\n作者: kfnzero`,
              buttons: ['確定'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    clearTempDir(); // 清理暫存的壓縮檔目錄
    app.quit();
  }
});

app.on('will-quit', () => {
  clearTempDir();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 解壓縮暫存資料夾
const tempExtractDir = path.join(app.getPath('temp'), 'simple-manga-viewer-extract');

function clearTempDir() {
  if (fs.existsSync(tempExtractDir)) {
    try {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch { }
  }
}

function handleLoadPath(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      return loadImagesFromDirectory(targetPath);
    } else if (stat.isFile() && ARCHIVE_EXTENSIONS.has(path.extname(targetPath).toLowerCase())) {
      return extractAndLoadArchive(targetPath);
    }
    return null;
  } catch {
    return null;
  }
}

function extractAndLoadArchive(archivePath) {
  try {
    clearTempDir();
    fs.mkdirSync(tempExtractDir, { recursive: true });

    const zip = new AdmZip(archivePath);
    const zipEntries = zip.getEntries();

    zipEntries.forEach((entry) => {
      if (!entry.isDirectory) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          // 將原路徑的斜線轉換成底線以扁平化且好排序
          const outName = entry.entryName.replace(/[\\/]/g, '_');
          const outPath = path.join(tempExtractDir, outName);
          fs.writeFileSync(outPath, entry.getData());
        }
      }
    });

    const result = loadImagesFromDirectory(tempExtractDir);
    if (result) {
      result.directoryName = path.basename(archivePath);
      result.originalArchive = archivePath;
    }
    return result;
  } catch (e) {
    console.error('Error extracting archive:', e);
    return null;
  }
}

// Open directory or file dialog
ipcMain.handle('open-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory'],
    title: '選擇漫畫目錄或壓縮檔 (.zip, .cbz)',
    filters: [
      { name: '漫畫與目錄', extensions: ['zip', 'cbz'] },
      { name: '所有檔案', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  return handleLoadPath(selectedPath);
});

// Load images from a given path (directory or archive)
ipcMain.handle('load-directory', async (_event, targetPath) => {
  return handleLoadPath(targetPath);
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
