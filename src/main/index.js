import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'

const fs = require('fs')
const path = require('path')
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const ffmpeg = require('fluent-ffmpeg')
const subtitlesParser = require('subtitles-parser')
const subsrt = require('subsrt')

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let realDownPath = app.getPath('downloads')
let mainWindow

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    // 设置下载文件的保存路径为默认下载目录
    const sPath = path.join(realDownPath, item.getFilename())
    item.setSavePath(sPath)
    item.once('done', (event, state) => {
      if (state === 'completed') {
        mainWindow.webContents.send('down-over', sPath)
      }
    })
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function() {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  ipcMain.on('select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'], // 允许选择文件夹
    })

    if (!canceled && filePaths.length > 0) {
      const selectedFolderPath = filePaths[0]
      realDownPath = selectedFolderPath
      mainWindow.webContents.send('folder-selected', selectedFolderPath)
    }
  })

  ipcMain.on('video-path', async (event, videoPath) => {
    const outerSubtitlePath = findSubtitleFile(videoPath)
    const resSubtitles = []
    // 解析字幕
    const innerSubtitles = await extractSubtitleStreams(videoPath)
    if (innerSubtitles.length !== 0) {
      for (const subtitle of innerSubtitles) {
        const innerTemp = await parseSubtitles(subtitle.path, subtitle.codec_name, true)
        resSubtitles.push({
          name: `内嵌${subtitle.index}`,
          data: innerTemp
        })
      }
    }
    for (const idx in outerSubtitlePath) {
      const outerTemp = await parseSubtitles(outerSubtitlePath[idx], outerSubtitlePath[idx].substring(outerSubtitlePath[idx].lastIndexOf('.') + 1).toLowerCase(), false)
      resSubtitles.push({
        name: `外挂${idx}`,
        data: outerTemp
      })
    }
    event.reply('subtitle-path', resSubtitles)
  })
  ipcMain.on('down-path', (event, dPath) => {
    if (fs.existsSync(dPath)) {
      realDownPath = dPath
    } else {
      realDownPath = app.getPath('downloads')
    }
    event.reply('real-down-path', realDownPath)
  })
})

function findSubtitleFile(videoPath) {
  const res = [];
  const videoDir = path.dirname(videoPath); // 获取视频文件所在目录
  const videoName = path.basename(videoPath, path.extname(videoPath)); // 获取视频文件名（不含扩展名）
  const subtitleExtensions = ['.srt', '.ass', '.ssa', '.vtt']; // 支持的字幕扩展名列表
  const files = fs.readdirSync(videoDir);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (file.toLowerCase().includes(videoName.toLowerCase()) && subtitleExtensions.includes(ext)) {
      res.push(path.join(videoDir, file));
    }
  }
  return res
}


async function extractSubtitleStreams(videoPath) {
  return new Promise((resolve, reject) => {
    // 使用 ffprobe 获取视频的元数据
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        return reject(err)
      }
      // 查找字幕流
      const subtitleStreams = metadata.streams.filter(stream => stream.codec_type === 'subtitle')
      if (subtitleStreams.length === 0) {
        return resolve([]) // 没有字幕流
      }
      const subtitlePromises = subtitleStreams.map((stream, index) => {
        return new Promise((subResolve, subReject) => {
          // 提取字幕流到临时文件
          const tempSubtitlePath = `temp_subtitle_${index}.srt` // 假设提取为 SRT 格式
          ffmpeg(videoPath)
            .outputOptions([
              `-map 0:${stream.index}`, // 映射字幕流
              '-c:s', 'srt' // 转换为 SRT 格式
            ])
            .output(tempSubtitlePath)
            .on('end', () => {
              subResolve({ index, path: tempSubtitlePath })
            })
            .on('error', subReject)
            .run()
        })
      })
      Promise.all(subtitlePromises)
        .then(subtitles => {
          resolve(subtitles)
        })
        .catch(reject)
    })
  })
}


function parseSubtitles(subtitlePath, codecName, isTempFile = false) {
  return new Promise((resolve, reject) => {
    // 读取并解析字幕文件
    const subtitleContent = fs.readFileSync(subtitlePath, 'utf8')

    if (codecName === 'ass' || codecName === 'ssa') {
      const parsedSrt = subtitlesParser.fromSrt(subsrt.convert(subtitleContent, { format: 'srt' }), true)
      if (isTempFile) fs.unlinkSync(subtitlePath)
      resolve(parsedSrt)
    } else {
      // 解析 SRT 格式
      const parsedSrt = subtitlesParser.fromSrt(subtitleContent, true)
      if (isTempFile) fs.unlinkSync(subtitlePath)
      resolve(parsedSrt)
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
