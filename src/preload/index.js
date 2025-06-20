import { contextBridge, ipcRenderer  } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'


// Custom APIs for renderer
const api = {
  sendVideoPath: (videoPath) => {
    ipcRenderer.send('video-path', videoPath);
  },
  onSubtitlePath: (callback) => {
    ipcRenderer.once('subtitle-path', (event, subtitles) => {
      callback(subtitles)
    });
  },
  selectFolderClick: (callback) => {
    ipcRenderer.send('select-folder');
    ipcRenderer.once('folder-selected', (event, folderPath) => {
      callback(folderPath)
    });
  },
  setDownloadPath: (dPath) => {
    ipcRenderer.send('down-path', dPath);
  },
  onDownloadPath: (callback) => {
    ipcRenderer.once('real-down-path', (event, dPath) => {
      callback(dPath)
    })
  },
  onDownloadOver: (callback) => {
    ipcRenderer.on('down-over', (event, filePath) => {
      callback(filePath)
    })
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
