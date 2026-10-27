const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// Ensure all builds (dev & unpacked/installer) share the exact same user data folder
try {
  const customUserData = path.join(app.getPath('appData'), 'Sincro280r_NC_Generator');
  app.setPath('userData', customUserData);
} catch (e) {
  console.error('Error setting userData path:', e);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0d1017',
    title: 'Sincro280r — NC Generator',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Open DevTools with F12
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('save-file', async (event, defaultName, content, targetDir, directSave = false) => {
  let defaultPath = defaultName;
  if (targetDir && fs.existsSync(targetDir)) {
    const fullPath = path.join(targetDir, defaultName);
    if (directSave) {
      fs.writeFileSync(fullPath, content, 'utf-8');
      return fullPath;
    }
    defaultPath = fullPath;
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath,
    filters: [{ name: 'NC Files', extensions: ['nc', 'NC'] }]
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return result.filePath;
  }
  return null;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});
