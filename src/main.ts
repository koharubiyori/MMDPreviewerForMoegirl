import * as THREE from 'three'
import { MMDLoader } from 'three/examples/jsm/loaders/MMDLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { SIMULATED_MMD_RESOURCE_FOLDER_FLAG } from './constants'
import { WorkerMessageMaps } from './worker'

export interface ChannelMassageMaps {
  mmdDataReady: {
    pmxFileName: string
  }
  invalidMmdZipFormat: {}
}

const defaultContainerWidth = 300
const defaultContainerHeight = 500
const mmdLoadingTimeout = 20000

const init = () => {
  const mmdPreviewers = document.querySelectorAll('.mmdPreviewerContainer')
  mmdPreviewers.forEach(item => createMmdPreviewer(item as HTMLDivElement))
}

window.__mmdPreviewerWidgetInit = init

process.env.NODE_ENV == 'development' && init()

// const uploadInput = document.createElement('input')
// uploadInput.type = 'file'
// document.body.append(uploadInput)
// uploadInput.addEventListener('change', async (e: any) => {
//   const file: File = e.target.files.item(0)
//   if (!file) { return }
//   const arrayBuffer = await file.arrayBuffer()
//   postWorkerMessage('zipReady', { file: arrayBuffer })
// })

// const buttonToLoadKizunaAi = document.createElement('button')
// const kizunaLoadingProgress = document.createElement('span')
// buttonToLoadKizunaAi.textContent = '加载老大(可能有点慢)'

// document.body.append(buttonToLoadKizunaAi)
// document.body.append(kizunaLoadingProgress)

// buttonToLoadKizunaAi.addEventListener('click', () => {
//   buttonToLoadKizunaAi.disabled = true
//   const xhr = new XMLHttpRequest()
//   xhr.open('get', 'kizunaai.zip')
//   xhr.responseType = 'arraybuffer'
//   xhr.send()
//   xhr.onload = () => {
//     postWorkerMessage('zipReady', { file: xhr.response })
//   }
//   xhr.onprogress = e => {
//     kizunaLoadingProgress.textContent = Math.floor(e.loaded / e.total * 100) + '%'
//   }
// })

async function createMmdPreviewer(mmdContainer: HTMLDivElement) {
  const { hintTextEl } = initMmdContainer()

  const containerWidth = mmdContainer.dataset.canvasWidth ? parseInt(mmdContainer.dataset.canvasWidth) : defaultContainerWidth
  const containerHeight = mmdContainer.dataset.canvasHeight ? parseInt(mmdContainer.dataset.canvasHeight) : defaultContainerHeight
  
  mmdContainer.style.width = containerWidth + 'px'
  mmdContainer.style.height = containerHeight + 'px'
  mmdContainer.style.textAlign = 'center'
  
  if (!navigator.serviceWorker) {
    hintTextEl.textContent = '您的浏览器不支持模型预览'
    return
  }
  
  let currentModel: THREE.Mesh | null = null
  const { scene, camera, renderer } = initScene()
  const worker = await initWorker()

  // 使用一个messageChannel，将port2传给serviceWorker进行通信
  const messageChannel = new MessageChannel()
  postWorkerMessage('initMessageChannel', { messageChannelPort: messageChannel.port2 })

  messageChannel.port1.onmessage = e => {
    const bindMsgHandler = <T extends keyof ChannelMassageMaps>(type: T, handler: (data: ChannelMassageMaps[T]) => void) => 
      e.data.type === type && handler(e.data.data)

    bindMsgHandler('mmdDataReady', data => {
      // 以这个常量开头的请求会被拦截并去匹配zip包中的数据
      initMmd(`/${SIMULATED_MMD_RESOURCE_FOLDER_FLAG}/${data.pmxFileName}`)
    })

    bindMsgHandler('invalidMmdZipFormat', () => {
      hintTextEl.style.display = 'inline'
      hintTextEl.textContent = '错误：无效的mmd文件'
    })
  }

  loadMmdZip()

  function initMmdContainer() {
    mmdContainer.style.cssText = `
      position: relative;
      width: ${containerWidth}px;
      height: ${containerHeight}px;
      cursor: grab;
    `

    const hintTextEl = document.createElement('span')
    hintTextEl.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      cursor: pointer;
    `
    mmdContainer.appendChild(hintTextEl)
    
    return { hintTextEl }
  }

  function initScene() {    
    const bgColor = mmdContainer.dataset.bgcolor
    
    // 创建场景
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bgColor)
    
    // 创建摄像机
    const camera = new THREE.PerspectiveCamera(50, containerWidth / containerHeight, 1, 2000)
    camera.position.z = 24
    
    // 创建渲染器
    const renderer = new THREE.WebGLRenderer()
    renderer.setPixelRatio(window.devicePixelRatio * 2) // 二倍像素防锯齿
    renderer.setSize(containerWidth, containerHeight)
    mmdContainer.appendChild(renderer.domElement)
    renderer.domElement.style.outline = 'none'
    
    // 添加全景光，否则模型是暗的
    const ambient = new THREE.AmbientLight('#eee')
    scene.add(ambient)

    renderer.render(scene, camera)
  
    return { scene, camera, renderer }
  }

  async function initWorker() {
    // 开启一个serviceWorker，将zip传入，解压并作为数据源，拦截请求
    // 因为MMDLoader根据pmx的材质名自动向同路径下发请求，其他办法均无法做到一个文件加载mmd模型
    const serviceWorkerRegistration = await navigator.serviceWorker.register(window.__WIDGET_MMD_PREVIEWER_WORKER_PATH || 'worker.js')
    await navigator.serviceWorker.ready

    // serviceWorker首次安装后不会生效，这里强制刷新一次
    if (!localStorage.getItem('mmdPreviewer-workerReady')) {
      localStorage.setItem('mmdPreviewer-workerReady', 'true')
      location.reload()
    }

    const worker = serviceWorkerRegistration.active!
    return worker
  }

  function loadMmdZip() {
    const MMDZipUrl = mmdContainer.dataset.source!
    const xhr = new XMLHttpRequest()
    xhr.open('get', MMDZipUrl)
    xhr.responseType = 'arraybuffer'
    xhr.timeout = mmdLoadingTimeout
    xhr.send()

    xhr.onprogress = e => {
      hintTextEl.textContent = `加载中：${Math.floor(e.loaded / e.total * 100)}%`
    }

    xhr.onload = () => {
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304) {
        postWorkerMessage('zipReady', { file: xhr.response })
        hintTextEl.style.display = 'none'
      } else {
        hintTextEl.textContent = '加载失败，点击重试'
        bindOneReload()
      }
    }

    xhr.onerror = () => {
      hintTextEl.textContent = '加载失败，点击重试'
      bindOneReload()
    }

    xhr.ontimeout = () => {
      hintTextEl.textContent = '加载失败，点击重试'
      bindOneReload()
    }

    function bindOneReload() {
      const clickHandler = () => {
        loadMmdZip()
        hintTextEl.removeEventListener('click', clickHandler)
      }
      
      hintTextEl.addEventListener('click', clickHandler)
    }
  }

  function initMmd(pmxPath: string) {
    const loader = new MMDLoader()
    loader.load(
      pmxPath, 
      mesh => {
        // 移除之前载入的模型
        if (currentModel) scene.remove(currentModel)

        currentModel = mesh
        scene.add(mesh)
        mesh.position.y = -10.5
    
        const render = () => renderer.render(scene, camera)
        
        // 初始化预览控件
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.addEventListener('change', render)
        
        ;(function animationLoop() {
          requestAnimationFrame(animationLoop)
          render()
        })()
      }
    )
  }

  function postWorkerMessage<T extends keyof WorkerMessageMaps>(this: ServiceWorker | void, type: T, data: WorkerMessageMaps[T]) {
    const transferList = Object.values(data).filter(item => [ArrayBuffer, MessagePort, ImageBitmap].includes(item.constructor))
    ;(this || worker).postMessage({ type, data }, transferList)
  }
}