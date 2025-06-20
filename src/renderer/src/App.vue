<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import Gif from 'gif.js'
import { ElNotification } from 'element-plus'


dayjs.extend(duration)
window.dayjs = dayjs

const myPlayer = ref(null)
const videoBox = ref(null)
const vParam = ref(null)
const videoJumpBar = ref(null)
const jumpTip = ref(null)
const isFullscreen = ref(false)
const gifUrl = ref('')
const imgMode = ref('')
const gifRecording = ref(false)
const gifDownloading = ref(false)
const imgDialogVisible = ref(false)
let fileListShow = ref(true)
const downloadDir = ref('')
const videoParam = ref({
  showTimer: null,
  speed: 1,
  bright: 100,
  volume: 1,
  totalTime: '00:00',
  totalTimeNum: 0,
  currentTime: '00:00',
  currentTimeNum: 0,
  currentVideoName: ''
})

const fileList = ref([])
const subtitleList = ref([])
const currentSubtitles = ref([])
const useSubtitleFile = ref({})
const subtitleSelected = ref('')

const maxImgWidth = ref(800)
const gifFrames = ref([])
const gifInterval = ref(100)
const gifMaxTime = 12
let gifPlayIndex = 0
const gifPlayIndexRange = ref([0, 0])
const gifEditing = ref(false)
let gifPlayTimer = null

const subRecording = ref(false)
const saveSubIndex = ref([])
const subImgNum = ref(0)
const subFrames = ref([])
const subEditing = ref(false)
const subImgMaxNum = ref(18)
const subImgDomHeight = ref(0)
const subFlowNum = ref(0)
const subTimeDialogVisible = ref(false)
let subOldValue = ''

const handleFileChange = (event) => {
  const uploadFile = event.raw
  fileList.value.push({
    raw: uploadFile,
    path: uploadFile.path,
    name: uploadFile.name
  })
}
const playThis = (idx) => {
  if (videoParam.value.currentVideoName === fileList.value[idx].name) {
    return
  }
  // 寻找字幕
  window.api.sendVideoPath(fileList.value[idx].path)
  window.api.onSubtitlePath((subtitlePath) => {
    subtitleList.value = subtitlePath
    if (subtitleList.value.length > 0) {
      useSubtitleFile.value = subtitleList.value[0]
      subtitleSelected.value = subtitleList.value[0].name
    }
    if (myPlayer.value.played) {
      myPlayer.value.pause()
    }
    videoParam.value.currentVideoName = fileList.value[idx].name
    myPlayer.value.src = URL.createObjectURL(fileList.value[idx].raw)
    myPlayer.value.load()
    myPlayer.value.addEventListener('loadedmetadata', () => {
      myPlayer.value.play().then(_ => {
        videoParam.value.totalTimeNum = myPlayer.value.duration
        videoParam.value.totalTime = formatTime(myPlayer.value.duration)
        myPlayer.value.playbackRate = videoParam.value.speed
        myPlayer.value.volume = videoParam.value.volume
      })
    })
  })
}

const myHandleDrop = async (event) => {
  event.preventDefault()
  const items = event.dataTransfer.items
  const processedFiles = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i].webkitGetAsEntry()
    if (item) {
      if (item.isFile) {
        await processFile(item, processedFiles)
      } else if (item.isDirectory) {
        await processDirectory(item, processedFiles)
      }
    }
  }
  fileList.value = processedFiles
}

const processFile = (entry, files) => {
  return new Promise((resolve) => {
    entry.file((file) => {
      if (isVideoFile(file)) {
        const fileInfo = {
          raw: file,
          path: file.path,
          name: file.name
        }
        files.push(fileInfo)
      }
      resolve()
    })
  })
}

const processDirectory = (entry, files) => {
  return new Promise((resolve) => {
    const reader = entry.createReader()
    reader.readEntries((entries) => {
      const promises = entries.map((entry) => {
        if (entry.isFile) {
          return processFile(entry, files)
        }
        return Promise.resolve()
      })
      Promise.all(promises).then(resolve)
    })
  })
}

const isVideoFile = (file) => {
  return /\.(mp4|avi|mov|mkv|flv|wmv)$/i.test(file.name.toLowerCase())
}

const formatTime = (time) => {
  return dayjs.duration(time * 1000).format(time >= 3600 ? 'HH:mm:ss' : 'mm:ss')
}

const showVideoParam = (text) => {
  vParam.value.innerText = text
  vParam.value.style.display = ''
  if (vParam.value.showTimer) clearTimeout(vParam.value.showTimer)
  vParam.value.showTimer = setTimeout(() => {
    vParam.value.style.display = 'none'
  }, 1000)
}

const videoTimeChange = (event) => {
  if (!myPlayer.value.src) return
  const div = event.currentTarget
  const rect = div.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const divWidth = rect.width
  const ratio = clickX / divWidth
  myPlayer.value.currentTime = (ratio * myPlayer.value.duration).toFixed(2)
}

const togglePlayPause = () => {
  if (!myPlayer.value.src) return
  if (myPlayer.value.paused) {
    myPlayer.value.play()
    showVideoParam(`播放`)
  } else {
    myPlayer.value.pause()
    showVideoParam(`暂停`)
  }
}

const toggleFullscreen = () => {
  if (!myPlayer.value.src) return
  if (videoBox.value) {
    if (!document.fullscreenElement) {
      videoBox.value.requestFullscreen().catch(err => {
        alert(`无法进入全屏模式: ${err.message}`)
      })
    } else {
      document.exitFullscreen().catch(err => {
        alert(`无法退出全屏模式: ${err.message}`)
      })
    }
  }
}

const imgClickSub = () => {
  imgMode.value = 'sub'
  imgDialogVisible.value = true
  subRecording.value = true
  subImgNum.value = 0
  subFrames.value = []
  subEditing.value = false
  saveSubIndex.value = []
  if (myPlayer.value.paused) {
    myPlayer.value.play()
  }
  captureFrames('sub')
}
const imgClickGIF = () => {
  imgMode.value = 'gif'
  gifFrames.value.length = 0 // 清空之前的帧
  gifUrl.value = null // 清空之前的 GIF
  gifPlayIndex = 0
  gifPlayIndexRange.value = [0, 0]
  gifEditing.value = false
  if (myPlayer.value.paused) {
    myPlayer.value.play()
  }
  gifRecording.value = true
  imgDialogVisible.value = true
  captureFrames('gif')
}
const imgClickShot = () => {
  imgMode.value = 'shot'
  imgDialogVisible.value = true
  if (myPlayer.value.played) {
    myPlayer.value.pause()
  }
  captureFrames('shot')
}

const fileNameGen = (t) => {
  return `${videoParam.value.currentVideoName.replace(/.[^/.]+$/, '')}_${formatTime(myPlayer.value.currentTime).replace(':', '_')}_${dayjs().format('YYYYMMDD_HHmmss')}.${t}`
}

const createCanvas = () => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const { videoWidth, videoHeight } = myPlayer.value
  let width = videoWidth
  let height = videoHeight
  if (width > maxImgWidth.value) {
    const scale = maxImgWidth.value / width
    width = maxImgWidth.value
    height = Math.round(height * scale)
  }
  canvas.width = width
  canvas.height = height
  // 绘制视频帧
  context.drawImage(myPlayer.value, 0, 0, videoWidth, videoHeight, 0, 0, width, height)
  // 添加自定义字幕
  const subtitles_ = currentSubtitles.value.join('\n')
  context.fillStyle = '#fff'  // 字体颜色
  context.shadowColor = 'rgba(255,0,0)'  // 字体描边颜色
  const fontsize = 24
  context.font = `${fontsize}px 黑体`
  context.textAlign = 'center'
  context.shadowBlur = 8
  context.textBaseline = 'top'
  wrapText(context, subtitles_, canvas.width / 2, canvas.height - 5, canvas.width, fontsize)
  const y = wrapText(context, subtitles_, canvas.width / 2, canvas.height - 5, canvas.width, fontsize)
  return { canvas: canvas, y: y }
}

const captureFrames = (mode) => {
  if (gifFrames.value.length * gifInterval.value >= gifMaxTime * 1000) {
    gifRecording.value = false
    if (myPlayer.value.played) {
      myPlayer.value.pause()
    }
  }
  if (subFrames.value.length >= subImgMaxNum.value) {
    subRecording.value = false
    if (myPlayer.value.played) {
      myPlayer.value.pause()
    }
  }
  if (mode === 'gif' && !gifRecording.value) return
  if (mode === 'sub' && !subRecording.value) return
  // 三种业务
  if (mode === 'gif') {
    const { canvas } = createCanvas()
    gifFrames.value.push(canvas)
    gifUrl.value = canvas.toDataURL('image/png')
    setTimeout(() => {
      captureFrames('gif')
    }, gifInterval.value)
  } else if (mode === 'shot') {
    const { canvas } = createCanvas()
    gifUrl.value = canvas.toDataURL('image/png')
  } else if (mode === 'sub') {
    setTimeout(() => {
      const plainSub = currentSubtitles.value.join('')
      if (subOldValue !== plainSub && plainSub.length > 0) {
        subOldValue = plainSub
        const { canvas, y } = createCanvas()
        subFrames.value.push({
          flowY: y,
          data: canvas,
          imgData: canvas.toDataURL('image/png')
        })
        gifUrl.value = canvas.toDataURL('image/png')
        saveSubIndex.value.push(saveSubIndex.value.length)
      }
      captureFrames('sub')
    }, 100)
  }
}
const renderGif = (gif) => {
  gif.on('finished', (blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileNameGen('gif')
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  })
  gif.render()
}

const downloadImage = () => {
  if (imgMode.value === 'sub' && subEditing.value) {
    subEditing.value = false
    return;
  }
  if (imgMode.value === 'gif' && gifEditing.value) {
    gifEditing.value = false
    return;
  }
  // 停止录制
  if (myPlayer.value.played) {
    myPlayer.value.pause()
  }
  gifDownloading.value = true
  // GIF
  if (imgMode.value === 'gif') {
    gifRecording.value = false
    const gif = new Gif({
      workers: 4,
      quality: 8,
      workerScript: '../../../js/gif.worker.js'
    })
    gifFrames.value.forEach((imgCan, index) => {
      if (gifPlayIndexRange.value[0] <= index && index <= gifPlayIndexRange.value[1]) {
        gif.addFrame(imgCan, { copy: true, delay: gifInterval.value })
      }
    })
    renderGif(gif)
  } else if (imgMode.value === 'shot') {
    fetch(gifUrl.value).then(response => response.blob()).then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileNameGen('png')
      a.click()
      URL.revokeObjectURL(url)
    })
  } else if (imgMode.value === 'sub') {
    if (saveSubIndex.value.length < 1) {
      alert('请至少选择一张字幕图')
      return
    }
    const resultCanvas = document.createElement('canvas')
    const ctx = resultCanvas.getContext('2d')
    let totalHeight = subFrames.value[saveSubIndex.value[0]].data.height
    saveSubIndex.value.slice(1).forEach(item => {
      totalHeight += subFrames.value[item].flowY
    })
    resultCanvas.width = subFrames.value[0].data.width
    resultCanvas.height = totalHeight
    ctx.drawImage(subFrames.value[saveSubIndex.value[0]].data, 0, 0)
    let currentY = subFrames.value[saveSubIndex.value[0]].data.height
    for (let i = 1; i < saveSubIndex.value.length; i++) {
      const temp = subFrames.value[saveSubIndex.value[i]]
      ctx.drawImage(temp.data, 0, temp.data.height - temp.flowY, temp.data.width, temp.flowY, 0, currentY, resultCanvas.width, temp.flowY)
      currentY += temp.flowY
    }
    const link = document.createElement('a')
    link.href = resultCanvas.toDataURL('image/png')
    link.download = fileNameGen('png')
    link.click()
  }
}

const gifRecordingStop = () => {
  gifRecording.value = false
  if (myPlayer.value.played) {
    myPlayer.value.pause()
  }
  gifPlayIndexRange.value = [0, gifFrames.value.length]
}

const subRecordingStop = () => {
  subRecording.value = false
  if (myPlayer.value.played) {
    myPlayer.value.pause()
  }
  gifPlayIndexRange.value = [0, gifFrames.value.length]
  window.subFrames = subFrames.value
}

const downloadImageCancel = () => {
  if (gifEditing.value) {
    gifEditing.value = false
    gifPlayIndexRange.value = [0, gifFrames.value.length]
    gifPlayIndexRangeChange()
  } else if (subEditing.value) {
    subEditing.value = false
    saveSubIndex.value = subFrames.value.map((item, idx) => idx)
  } else {
    imgDialogVisible.value = false
    if (gifPlayTimer) clearInterval(gifPlayTimer)
    if (myPlayer.value.paused) myPlayer.value.play()
    saveSubIndex.value = []
  }
}

const calcSubTop = (nowIndex) => {
  let res = 0
  for (let i = 1; i <= nowIndex; i++) {
    if (saveSubIndex.value.includes(i)) {
      res += subFrames.value[i].flowY
    }
  }
  return res
}

const subFlowNumChange = () => {
  updateSub()
}

const updateSub = () => {
  videoParam.value.currentTime = formatTime(myPlayer.value.currentTime)
  videoParam.value.currentTimeNum = myPlayer.value.currentTime
  // 筛选字幕
  const currentTime = (myPlayer.value.currentTime + subFlowNum.value) * 1000
  const matchingSubtitles = useSubtitleFile.value.data.filter(sub => sub.startTime <= currentTime && currentTime <= sub.endTime)
  matchingSubtitles.sort((a, b) => a.startTime - b.startTime)
  currentSubtitles.value = matchingSubtitles.map(sub => sub.text.replace(/{\\.*?}/g, ''))
}

const editSubImg = (idx) => {
  if (saveSubIndex.value.length <= 1) {
    return ElNotification({
      title: '通知',
      message: `至少保留一张字幕截图`,
      position: 'bottom-left',
      type: 'warning',
      duration: 2000,
      appendTo: '.video-out-box'
    })
  }
  const index = saveSubIndex.value.indexOf(idx)
  if (index !== -1) {
    saveSubIndex.value.splice(index, 1)
  }
}

const gifPlayIndexRangeChange = () => {
  gifPlayIndex = gifPlayIndexRange.value[0]
}

/**
 *
 * @param context 需要字符串，换行符将被解析换行
 * @param text
 * @param x
 * @param y
 * @param maxWidth
 * @param lineHeight 就是字体大小
 * @returns {number}
 */
const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
  if (typeof text != 'string' || typeof x != 'number' || typeof y != 'number' || typeof maxWidth != 'number' || typeof lineHeight != 'number') {
    return -1
  }
  const arrText = text.split('')
  let line = ''
  const res_lines = []
  for (let n in arrText) {
    if (arrText[n] === '\n') {
      // res_lines.push(line)
      // line = ''
      const testLine = line + '  '
      const metrics = context.measureText(testLine)
      const testWidth = metrics.width
      if (testWidth > maxWidth && n > 0) {
        res_lines.push(line)
        line = '  '
      } else {
        line = testLine
      }
    } else {
      const testLine = line + arrText[n]
      const metrics = context.measureText(testLine)
      const testWidth = metrics.width
      if (testWidth > maxWidth && n > 0) {
        res_lines.push(line)
        line = arrText[n]
      } else {
        line = testLine
      }
    }
  }
  res_lines.push(line)
  let s_y = y - lineHeight * res_lines.length
  res_lines.forEach(ll => {
    context.fillText(ll, x, s_y)
    s_y += lineHeight
  })
  return lineHeight * res_lines.length + 10
}

const setDownloadDirHere = (dPath) => {
  window.api.setDownloadPath(dPath)
  window.api.onDownloadPath((realDownPath) => {
    localStorage.setItem('downloadDir', realDownPath)
    downloadDir.value = realDownPath
  })
}

const changeDownloadDirFirst = () => {
  window.api.selectFolderClick((realDownPath) => {
    localStorage.setItem('downloadDir', realDownPath)
    downloadDir.value = realDownPath
  })
}
const currentTimeWidth = computed(() => {
  if (videoParam.value.totalTimeNum === 0) {
    return 0
  } else {
    return 100 * videoParam.value.currentTimeNum / videoParam.value.totalTimeNum
  }
})

watch(gifRecording, (newValue, oldValue) => {
  if (!newValue && oldValue) {
    gifPlayIndexRange.value[1] = gifFrames.value.length
    gifPlayTimer = setInterval(_ => {
      gifUrl.value = gifFrames.value[gifPlayIndex].toDataURL('image/png')
      gifPlayIndex++
      if (gifPlayIndex >= gifPlayIndexRange.value[1]) gifPlayIndex = gifPlayIndexRange.value[0]
    }, gifInterval.value)
  }
})
watch(subtitleSelected, (newValue, _) => {
  for (let item of subtitleList.value) {
    if (newValue === item.name) {
      useSubtitleFile.value = item
    }
  }
})
watch(saveSubIndex, (newValue, oldValue) => {
  // 计算容器高度
  setTimeout(() => {
    let res = 0
    const imgDom = document.querySelectorAll('.sub-images > div')
    let isFirst = true
    for (let j = 0; j <imgDom.length; j++) {
      if (imgDom[j].style.display === 'none') {
        continue
      }
      if (isFirst) {
        res += imgDom[j].getBoundingClientRect().height
        isFirst = false
      }
      res += subFrames.value[j].flowY
    }
    subImgDomHeight.value = Math.min(res, 700)
    // 滚动到最低
    if (oldValue.length <= newValue.length) {
      const subScroll = document.querySelector('.sub-images')
      subScroll.scrollTop = subScroll.scrollHeight
    }
  }, 50)
}, { deep: true })

onMounted(() => {
  const vSpeedTemp = localStorage.getItem('vSpeed')
  if (vSpeedTemp) {
    videoParam.value.speed = parseFloat(vSpeedTemp)
    myPlayer.value.playbackRate = videoParam.value.speed
  }
  const vVolumeTemp = localStorage.getItem('vVolume')
  if (vVolumeTemp) {
    videoParam.value.volume = parseFloat(vVolumeTemp)
    myPlayer.value.volume = videoParam.value.volume
  }
  const handleKeyPress = (event) => {
    if (event.key === 'c') {
      const currentPlaybackRate = myPlayer.value.playbackRate
      myPlayer.value.playbackRate = (currentPlaybackRate + 0.1).toFixed(1)
      videoParam.value.speed = myPlayer.value.playbackRate
      showVideoParam(`播放速度x${videoParam.value.speed}`)
      localStorage.setItem('vSpeed', videoParam.value.speed.toString())
    } else if (event.key === 'x') {
      const currentPlaybackRate = myPlayer.value.playbackRate
      if (currentPlaybackRate > 0.1) {
        myPlayer.value.playbackRate = (currentPlaybackRate - 0.1).toFixed(1)
        videoParam.value.speed = myPlayer.value.playbackRate
      }
      showVideoParam(`播放速度x${videoParam.value.speed}`)
      localStorage.setItem('vSpeed', videoParam.value.speed.toString())
    } else if (event.key === ' ') {
      togglePlayPause()
    } else if (event.key === 'w') {
      // 获取当前的亮度值
      const currentBrightness = myPlayer.value.style.filter
        ? parseFloat(myPlayer.value.style.filter.match(/brightness\((\d+)%\)/)[1]) : 100
      const newBrightness = Math.max(currentBrightness - 10, 0)
      myPlayer.value.style.filter = `brightness(${newBrightness}%)`
      videoParam.value.bright = newBrightness
      showVideoParam(`亮度x${videoParam.value.bright}%`)
    } else if (event.key === 'e') {
      const currentBrightness = myPlayer.value.style.filter
        ? parseFloat(myPlayer.value.style.filter.match(/brightness\((\d+)%\)/)[1]) : 100
      const newBrightness = Math.min(currentBrightness + 10, 200)
      myPlayer.value.style.filter = `brightness(${newBrightness}%)`
      videoParam.value.bright = newBrightness
      showVideoParam(`亮度x${videoParam.value.bright}%`)
    } else if (event.ctrlKey && event.key === 'ArrowRight') {
      myPlayer.value.currentTime += 30
      showVideoParam(`前进30秒`)
    } else if (event.ctrlKey && event.key === 'ArrowLeft') {
      myPlayer.value.currentTime -= 30
      showVideoParam(`后退30秒`)
    } else if (event.key === 'ArrowUp') {
      videoParam.value.volume = Math.min(parseFloat((myPlayer.value.volume + 0.05).toFixed(2)), 1)
      myPlayer.value.volume = videoParam.value.volume
      showVideoParam(`音量x${myPlayer.value.volume * 100}%`)
      localStorage.setItem('vVolume', videoParam.value.volume.toString())
    } else if (event.key === 'ArrowDown') {
      videoParam.value.volume = Math.max(parseFloat((myPlayer.value.volume - 0.05).toFixed(2)), 0)
      myPlayer.value.volume = videoParam.value.volume
      showVideoParam(`音量x${myPlayer.value.volume * 100}%`)
      localStorage.setItem('vVolume', videoParam.value.volume.toString())
    } else if (event.key === 'ArrowRight') {
      myPlayer.value.currentTime += 5
      showVideoParam(`前进5秒`)
    } else if (event.key === 'ArrowLeft') {
      myPlayer.value.currentTime -= 5
      showVideoParam(`后退5秒`)
    } else if (event.key === 'f') {
      const frameRate = 30
      const frameTime = 1 / frameRate
      myPlayer.value.currentTime += frameTime
      if (myPlayer.value.played) myPlayer.value.pause()
      showVideoParam(`前进一帧`)
    } else if (event.key === 'd') {
      const frameRate = 30
      const frameTime = 1 / frameRate
      myPlayer.value.currentTime -= frameTime
      if (myPlayer.value.played) myPlayer.value.pause()
      showVideoParam(`后退一帧`)
    }
  }
  window.addEventListener('keydown', handleKeyPress)
  myPlayer.value.addEventListener('timeupdate', () => {
    updateSub()
  })

  videoJumpBar.value.addEventListener('mousemove', (e) => {
    if (!myPlayer.value.src) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const time = (clickX / rect.width) * myPlayer.value.duration
    const tipWidth = jumpTip.value.getBoundingClientRect().width
    jumpTip.value.style.left = `${clickX - (tipWidth / 2).toFixed(0)}px`
    jumpTip.value.textContent = formatTime(time)
  })
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
  // 设置下载路径
  const downloadDirTemp = localStorage.getItem('downloadDir')
  if (downloadDirTemp) {
    setDownloadDirHere(downloadDirTemp)
  }
  window.api.onDownloadOver(realPath => {
    gifDownloading.value = false
    ElNotification({
      title: '下载成功',
      message: `图片保存路径：${realPath}`,
      position: 'bottom-left',
      type: 'success',
      duration: 2000,
      appendTo: '.video-out-box'
    })
  })
  // 在组件销毁时移除监听器
  onUnmounted(() => {
    videoJumpBar.value.removeEventListener('mousemove')
    myPlayer.value.removeEventListener('timeupdate')
    window.removeEventListener('keydown', handleKeyPress)
  })
})
</script>

<template>
  <div id='outBox' @dragover.prevent @dragenter.prevent @drop='myHandleDrop'>
    <div class='inBox dark'>
      <div>
        <div class='video-head'>
          <el-upload
            class='upload-file'
            action=''
            multiple
            accept='.mp4,.avi,.mov,.mkv,.wmv,.rmvb,.flv,.webm,.f4v,.m4v,.mpg,.mpeg'
            :auto-upload='false'
            :show-file-list='false'
            :on-change='handleFileChange'
          >
            <el-button type='primary'>选择视频</el-button>
          </el-upload>
          <div style='margin-left: 30px; max-width: 400px; overflow: hidden; white-space: nowrap;'
               v-if='videoParam.currentVideoName.length > 0'>
            <span>正在播放：</span>
            <span style='user-select: text;'>{{ videoParam.currentVideoName }}</span>
          </div>
          <div class='video-head-end'></div>
          <el-tooltip
            class='box-item'
            effect='dark'
            :content='downloadDir'
            placement='top-start'
          >
            <el-button type='info' @click='changeDownloadDirFirst'>下载路径</el-button>
          </el-tooltip>
          <el-button type='info' style='padding: 0 8px;' @click='fileListShow = !fileListShow'>
            <img src='./assets/list.png' alt='列表' style='height: 22px;'>
          </el-button>
        </div>
        <div class='video-out-box' ref='videoBox'>
          <div class='video-box' ref='videoCapDom'>
            <video ref='myPlayer' class='video-player' autoplay preload @click='togglePlayPause'>
            </video>
            <div class='some-subtitle'
                 :style='{"font-size": isFullscreen ? "48px": "28px", "bottom": isFullscreen ? "40px": "20px", "padding": isFullscreen ? "0 60px": "0 40px"}'>
              <div v-for='subtitle in currentSubtitles'>
                <span>{{ subtitle }}</span>
              </div>
            </div>
          </div>
          <div class='right-button'>
            <div>
              <img src='./assets/sub.png' alt='字幕' @click='imgClickSub'
                   :style='{height: isFullscreen ? "40px" : "24px"}'>
              <img src='./assets/GIF.png' alt='GIF' @click='imgClickGIF'
                   :style='{height: isFullscreen ? "40px" : "24px"}'>
              <img src='./assets/shot.png' alt='截图' @click='imgClickShot'
                   :style='{height: isFullscreen ? "40px" : "24px"}'>
            </div>
          </div>
          <div ref='vParam' class='video-param' style='display: none;'>无</div>
          <div class='video-foot'>
            <div class='video-bar'>
              <div class='video-time' style='background: #000000a8; height: 100%; display: flex; align-items: center'>
                <span style='height: fit-content;'>{{ videoParam.currentTime }}</span>
              </div>
              <div class='video-bar-left' @click='videoTimeChange' ref='videoJumpBar'>
                <div class='video-bar-time' :style='{width: currentTimeWidth+"%"}'></div>
                <div class='jumpTip' id='jumpTip' ref='jumpTip'></div>
              </div>
              <div class='video-bar-right'>
                <div class='video-time'>{{ videoParam.totalTime }}</div>
                <div>
                  <el-button @click='subTimeDialogVisible= true'>字幕偏移</el-button>
                </div>
                <div v-if='subtitleList.length > 0'>
                  <el-select
                    v-model='subtitleSelected'
                    placeholder='Select'
                    style='width: 80px;'
                    placement='top-start'
                    append-to='.video-out-box'
                  >
                    <el-option
                      v-for='(item,index) in subtitleList'
                      :key='item.name'
                      :label='item.name'
                      :value='item.name'
                    />
                  </el-select>
                </div>
                <img class='video-fullscreen' src='./assets/fullScreen.png' alt='全屏' @click='toggleFullscreen'>
              </div>
            </div>
            <div class='time-bar' :style='{width: currentTimeWidth+"%"}'></div>
          </div>

          <el-dialog
            v-model='subTimeDialogVisible'
            title='字幕偏移'
            width='400'
            top='40vh'
            :show-close='true'
            style='background-color: #2f3241;'
          >
            <div style='width: 374px;'>
              <el-slider v-model='subFlowNum' :min='-25' :max='25' :show-input='true' :append-to='".video-time"'
                         :teleported='false' @change='subFlowNumChange' />
            </div>
          </el-dialog>
          <el-dialog
            v-model='imgDialogVisible'
            :title="imgMode === 'gif' ? 'GIF录制' : imgMode === 'sub' ? '字幕截图' : imgMode === 'shot' ? '截图' : '未知模式'"
            width='832'
            :close-on-click-modal='false'
            :close-on-press-escape='false'
            :show-close='true'
            style='background-color: #2f3241;'
          >
            <div style='width: 820px;'>
              <div v-if='imgMode === "gif" || imgMode === "shot"'>
                <img class='img-preview' :src='gifUrl' alt='待生成中的图片' style='max-width: 800px;' />
              </div>
              <div v-else class='sub-images' :style='{height: subImgDomHeight + "px"}'>
                <div v-for='(frame, index) in subFrames'
                     :style='{zIndex: subFrames.length - index, display: saveSubIndex.includes(index) ? "block" : "none", top: calcSubTop(index) + "px"}'>
                  <img class='img-preview' :src='frame.imgData' alt='待生成中的图片'
                       style='max-width: 800px;' />
                  <div class='my-delete-btn' @click='editSubImg(index)' v-if='subEditing'>ⓧ</div>
                </div>
              </div>
            </div>
            <template #footer>
              <div class='dialog-footer'
                   element-loading-background='#2F3241FF'
                   v-loading='gifDownloading'>
                <div class='gif-slider' v-if='gifEditing'>
                  <el-slider @change='gifPlayIndexRangeChange' v-model='gifPlayIndexRange' :max='gifFrames.length' range
                             show-stops />
                </div>
                <div style='flex: 1;'>
                  <el-button @click='downloadImageCancel'>取消</el-button>
                  <el-button v-if='imgMode === "gif" && !gifEditing && !gifRecording' @click='gifEditing = true' type='primary'>
                    编辑GIF
                  </el-button>
                  <el-button v-if='imgMode === "sub" && !subEditing && !subRecording' @click='subEditing = true' type='primary'>
                    编辑字幕
                  </el-button>
                  <el-button v-if='gifRecording' @click='gifRecordingStop' type='primary'>停止录制</el-button>
                  <el-button v-else-if='subRecording' @click='subRecordingStop' type='primary'>停止录制</el-button>
                  <el-button v-else type='primary' @click='downloadImage'>
                    <span v-if='(imgMode === "sub" && subEditing) || (imgMode === "gif" && gifEditing)'>保存</span>
                    <span v-else>下载</span>
                    <span>{{ imgMode === 'gif' ? 'GIF' : imgMode === 'sub' ? '字幕' : imgMode === 'shot' ? '截图' : '未知模式'
                      }}</span>
                  </el-button>
                </div>
              </div>
            </template>
          </el-dialog>
        </div>
      </div>
      <div class='file-list' v-if='fileListShow && fileList.length > 0'>
        <h3>播放列表：</h3>
        <ul>
          <li v-for='(file, index) in fileList' :key='index' @click='playThis(index)'
              :style='{color: videoParam.currentVideoName === file.name ? "#fff" : ""}'>
            {{ file.name }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>


<style lang='less'>
@import './assets/css/styles.less';

#outBox {
  width: 100vw;
  height: 100vh;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none;

  .inBox {
    display: flex;
  }
}

.file-list {
  margin-left: 10px;

  ul {
    max-height: 60vw * (9 / 16);
    overflow-y: auto;
  }

  ul > li {
    max-width: 250px;
    cursor: pointer;
    word-break: break-all;
    word-wrap: break-word;
    overflow: hidden;
    line-height: 20px;
    color: #999;
    max-height: 40px;
    margin: 2px 0;
  }
}


.video-head {
  display: flex;
  align-items: center;

  .video-head-end {
    flex: 1;
  }
}


.video-out-box {
  width: 60vw;
  height: 60vw * (9 / 16);
  position: relative;

  .video-box {
    width: 100%;
    height: 100%;
    position: relative;

    video {
      width: 100%;
      height: 100%;
      background: #000;

      &:focus {
        outline: -webkit-focus-ring-color auto 0;
      }
    }
  }

  .right-button {
    position: absolute;
    right: 0;
    top: 0;
    height: 100%;
    display: flex;
    align-items: center;

    div {
      display: flex;
      flex-direction: column;
      background: rgba(0, 0, 0, 0.6);
      padding: 65px 2px;
      opacity: 0;
      transition: opacity 0s 1s;

      img {
        opacity: 0.8;
        cursor: pointer;
        margin: 5px 1px;
      }

      &:hover {
        opacity: 1;
        transition: opacity 0s 0s;
      }
    }
  }

  .video-param {
    position: absolute;
    top: 0;
    left: 0;
    background: #000000b5;
    font-size: 12px;
    font-weight: bold;
    padding: 3px 4px;
  }

  .video-foot {
    width: 100%;
    height: 40px;
    position: absolute;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;

    .video-bar {
      flex: 1;
      display: flex;
      align-items: center;
      opacity: 0;
      transition: opacity 0s 1s;

      &:hover {
        opacity: 1;
        transition: opacity 0s 0s;
      }

      .video-bar-left {
        background: #0000006b;
        cursor: pointer;
        flex: 1;
        height: 100%;
        position: relative;

        .video-bar-time {
          height: 100%;
          background: rgba(43, 145, 227, .6);
          transition: width 0.2s ease;
        }

        .jumpTip {
          position: absolute;
          background-color: #575757;
          color: #fff;
          padding: 1px 8px;
          border-radius: 4px;
          font-size: 12px;
          display: none;
          white-space: nowrap;
          height: 20px;
          top: -20px;
        }

        &:hover {
          .jumpTip {
            display: block;
          }
        }
      }

      .video-bar-right {
        display: flex;
        align-items: center;
        background: #000000a8;
        height: 100%;

        .video-fullscreen {
          opacity: 0.75;
          cursor: pointer;
          height: 28px;
        }
      }
    }

    .time-bar {
      width: 100%;
      height: 2px;
      background: #48acbd;
    }
  }
}


.some-subtitle {
  position: absolute;
  width: 100%;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: SimHei, "Microsoft YaHei", cursive;
  user-select: none;

  div {
    background: #0000008a;
    padding: 2px 10px;
    display: flex;
    align-items: center;
    text-shadow: 0 0 4px #de2323, 0 0 4px #de2323, 0 0 4px #de2323, 0 0 4px #de2323;
  }
}

.video-time {
  padding: 0 4px;
}

.el-dialog__title {
  color: #c9c9c9 !important;
  font-weight: bold;
}


.dark {
  --el-fill-color-blank: #0003;
  --el-text-color-regular: #c9c9c9;
}

//.sub-images {
//  max-height: 700px;
//  overflow-y: scroll;
//  position: relative;
//
//  > div {
//    position: absolute;
//    left: 0;
//  }
//
//  .my-delete-btn {
//    border-radius: 7px;
//    font-size: 16px;
//    color: #d9fbff;
//    border: 1px solid #d9fbff;
//    background-color: rgba(222, 116, 35, 0.52);
//    cursor: pointer;
//    position: absolute;
//    bottom: 10px;
//    right: 10px;
//  }
//}

.sub-images {
  position: relative; // 父容器设置为相对定位
  overflow-y: auto; // 超出部分显示滚动条
  overflow-x: hidden; // 防止水平滚动条出现
  &::-webkit-scrollbar { // 隐藏滚动条（Chrome/Safari）
    display: none;
  }
}

.sub-images > div {
  position: absolute; // 子元素设置为绝对定位
  width: 100%; // 子元素宽度占满父容器
  box-sizing: border-box; // 包含边框和内边距
}

.img-preview {
  max-width: 100%; // 图片最大宽度为父容器宽度
  height: auto; // 图片高度自动调整
  display: block; // 去掉图片默认的外边距
}

.my-delete-btn {
  position: absolute; // 删除按钮设置为绝对定位
  right: 20px;
  bottom: 0;
  cursor: pointer; // 鼠标悬停时显示指针
  color: #ff0000;
  padding: 5px; // 内边距
  text-align: center; // 文字居中
}
.dialog-footer {
  display: flex;

  .gif-slider {
    width: 450px;
  }
}
</style>
