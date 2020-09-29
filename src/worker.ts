import { SIMULATED_MMD_RESOURCE_FOLDER_FLAG } from './constants'
import { ChannelMassageMaps } from './main'
import loadScript from './utils/loadScript'
import JSZipType from 'jszip' // 这个模块只作为类型使用，在webpack中被替换为了一个占位对象

export interface WorkerMessageMaps {
  zipReady: {
    file: Blob | ArrayBuffer
    encoding: string
  }
  initMessageChannel: {
    messageChannelPort: MessagePort
  }
}

;(async () => {
  let messageChannelPort: MessagePort = null as any  // 用于回传数据的prot
  let mmdData: JSZipType | null = null  // 最终解压处理好的mmd数据
  
  // 拦截请求
  self.addEventListener('fetch', (e: any) => {
    // 注意respondWith不能异步执行，有异步流程的要返回一个promise在内部处理(Promise<Response>)
    // const originFetch = () => e.respondWith(fetch(e.request))  // 返回原始请求
    if (!mmdData) { return }

    let [_, simulatedFolderName, pmxPath]: [string, string, string] = e.request.url.replace(e.target.origin + '/', '').match(/^(.+?)\/(.+)$/)
    if (simulatedFolderName !== SIMULATED_MMD_RESOURCE_FOLDER_FLAG) { return }

    // MMD loader会进行encodeURIComponent，这里将路径解码
    // 有些模型的贴图文件夹首字母大小写和pmx里保存的不一致，这里全部转换为小写
    const generalized = (path: string) => decodeURIComponent(path).toLowerCase()
    
    const mmdFiles = Object.keys(mmdData.files).reduce((result, originalPath) => {
      const filePath = generalized(originalPath)
      result[filePath] = mmdData!.files[originalPath]
      return result
    }, {} as JSZipType['files'])

    pmxPath = generalized(pmxPath)
    // pmxPath = iconv.decode(Buffer.from(pmxPath.split('').map(item => item.charCodeAt(0))), 'shiftjis') 

    if (!(pmxPath in mmdFiles)) { return }

    const response = new Promise(async resolve => {
      const blob = await mmdFiles[pmxPath].async('blob')
      resolve(new Response(blob))
    })

    e.respondWith(response)    
  })
  
  // 接收传来的消息
  self.addEventListener('message', e => {
    // 拿一个函数作数据类型映射
    const bindMsgHandler = <T extends keyof WorkerMessageMaps>(type: T, handler: (data: WorkerMessageMaps[T]) => void) => 
      e.data.type === type && handler(e.data.data)

    // 初始化频道消息
    bindMsgHandler('initMessageChannel', data => {
      messageChannelPort = data.messageChannelPort
    })

    // 接收mmd zip
    bindMsgHandler('zipReady', async data => {
      await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.min.js')
      mmdData = await unzip(data.file as any, data.encoding)
    
      const pmxFileName = Object.keys(mmdData!.files).find(item => /\.pmx$/.test(item))!
      // mmd数据准备完毕，通知主线程
      postChannelMessage('mmdDataReady', { pmxFileName })
    })
  })
  
  function unzip(zipData: ArrayBuffer, encoding: string) {
    const JSZip: JSZipType = (self as any).JSZip
    const zip = new JSZip()

    const decoder = new TextDecoder(encoding)
    
    return zip.loadAsync(zipData, {
      decodeFileName: (fileNameBytes: any) => decoder.decode(fileNameBytes)
    } as any)
  }

  function postChannelMessage<T extends keyof ChannelMassageMaps>(type: T, data: ChannelMassageMaps[T]) {
    messageChannelPort.postMessage({ type, data })
  }
})()