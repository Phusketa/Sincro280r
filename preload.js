const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveFile: (defaultName, content, targetDir, directSave) => ipcRenderer.invoke('save-file', defaultName, content, targetDir, directSave),
  selectFolder: () => ipcRenderer.invoke('select-folder')
});
