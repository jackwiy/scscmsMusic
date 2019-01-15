var W = window
W.requestFileSystem = W.requestFileSystem || W.webkitRequestFileSystem
var fileSystem = {
    fs: null,//文件系统对象
    usage: 0,// 已经使用空间
    size: 1024 * 1024 * 1024,//申请多少1024M空间
    judgeObjectType(obj, type){
        return Object.prototype.toString.call(obj) === '[object ' + type + ']'
    },
    // 生成文件夹
    createFolder(folderName) {
        return new Promise((resolve, reject) => {
            fileSystem.fs.root.getDirectory(folderName, {create: true}, function(dirEntry) {
                resolve(dirEntry)
            }, e => reject(e.name))
        })
    },
    // 列出指定文件夹的文件
    listFiles(path) {
        return new Promise((resolve, reject) => {
            fileSystem.fs.root.getDirectory(path, {create: true}, function (dirEntry) {
                let dirReader = dirEntry.createReader()
                dirReader.readEntries(function (results) {
                    resolve(results)
                }, e => reject(e.name))
            }, e => reject(e.name))
        })
    },
    // 读取根目录下的文件
    readerFile(file) {
        return new Promise((resolve, reject) => {
            fileSystem.fs.root.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (file) {
                    let reader = new FileReader()
                    reader.onloadend = function () {
                        resolve(this.result)
                    }
                    reader.readAsArrayBuffer(file)
                }, e => reject(e.name))
            }, e => reject(e.name))
        })
    },
    // 重命名(限修改当前列表)
    renameFile(oldName, newName) {
        return new Promise((resolve, reject) => {
            fileSystem.fs.root.getDirectory(obj.defaultFolder, {}, function (parentDir) {
                parentDir.getFile(oldName, {}, function (fileEntry) {
                    fileEntry.moveTo(parentDir, newName)
                    resolve(newName)
                }, e => reject(e.name))
            }, e => reject(e.name))
        })
    },
    // 删除文件
    delFile(file){
        return new Promise((resolve, reject) => {
            fileSystem.fs.root.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.remove(function () {
                    fileSystem.updateMusicList().then(()=>{
                        resolve()
                    })
                }, e => reject(e.name))
            }, e => reject(e.name))
        })
    },
    // 删除文件夹
    dropDirs(path){
        return new Promise((resolve, reject) => {
            fileSystem.fs.root.getDirectory(path, {}, function (dirEntry) {
                dirEntry.removeRecursively(function () {
                    fileSystem.updateMusicList().then(()=>{
                        resolve(dirEntry)
                    })
                }, e => reject(e.name))
            })
        })
    },
    // 保存文件
    saveFile(config){
        return new Promise((resolve, reject) => {
            fileSystem.createFolder(config.pathname).then(()=>{
                fileSystem.fs.root.getFile(config.pathname + '/' + config.fileName, {create: true, exclusive: false}, function (fileEntry) {
                    fileEntry.createWriter(function (fileWriter) {
                        fileWriter.onwriteend = function () {
                            if (fileWriter.length === 0) {
                                if(fileSystem.judgeObjectType(config.content,'Blob')){
                                    fileWriter.write(config.content)
                                }else if(fileSystem.judgeObjectType(config.content,'ArrayBuffer')){
                                    fileWriter.write(new Blob([new Uint8Array(config.content)], {type: config.mineType}))
                                }else{
                                    reject('未知数据类型')
                                }
                            } else {
                                fileSystem.updateMusicList().then(()=>{
                                    resolve()
                                })
                            }
                        }
                        fileWriter.onerror = function (e) {
                            reject(e.message)
                        }
                        fileWriter.truncate(0)//先清空
                    })
                })
            })
        })
    },
    // 更新歌曲列表
    updateMusicList(){
        return new Promise((resolve,reject) => {
            fileSystem.fs.root.getDirectory('/', {}, function (dirEntry) {
                let dirReader = dirEntry.createReader()
                dirReader.readEntries(function (results) {
                    let count = 0
                    var lists = []
                    results.forEach(o => {
                        fileSystem.listFiles(o.name).then(arr=>{
                            if(o.name === obj.defaultFolder){
                                lists.push({name: o.name, total: arr.length, musics: arr})
                                obj.totalSongs = arr.length // 总共多少首歌曲
                                arr.forEach((song, index)=>{
                                    if(song.name === obj.songName){
                                        obj.index = index // 修正index
                                    }
                                    fileSystem.readerFile(song.fullPath).then(b=>{
                                        new AudioContext().decodeAudioData(b).then(buffer => {
                                            let duration = parseInt(buffer.duration)
                                            let pad = t => parseInt(t).toString().padStart(2, '0')
                                            song.duration = duration
                                            song.time = `[${pad(duration / 60)}:${pad(duration % 60)}]`
                                        }).catch(function(){
                                            song.bad = true
                                        })
                                    })
                                })
                            }else{
                                lists.push({name: o.name, total: arr.length})
                            }
                        }).finally(()=>{
                            if(++count === results.length){
                                obj.folderList = lists
                                resolve()
                            }
                        })
                    })
                }, e => reject(e.name))
            })
        })
    }
}
// 截取歌曲名
function getNameByteLen(name) {
    let len = 30
    let str = ''
    for (let i = 0; i < name.length; i++) {
        len -= /[^\x00-\xff]/.test(name[i]) ? 2 : 1
        if(len < 0){
            str = name.slice(0,i)
            break
        }
    }
    return len < 0 ? str : name
}
var obj = {
    context: new AudioContext(),
    manual: null, // 手动操作
    folderList: [], // 所有文件夹列表
    defaultFolder: 'music', // 默认文件夹
    autoPlay: false, // 自动播放
    index: 0, // 当前播放序号
    totalSongs: 0, // 总共多少首歌曲
    songPush: false,// 监听音乐并推送
    songName: '', //　当前播放歌名
    songDuration: 0, //　当前播放总播放时间
    pattern: ['loop', 'ordinal', 'single', 'random'], // 播放模式
    serial: 0, // 播放模式序号
    init: false, // 是否已经初始化
    volume: 0.5, // 音量 [0-1]
    mute: false, // 静音
    downPrior: false,
    downNext: false,
    downPlay: false,
    downStop: false,
    capYArray: new Array(1024).fill(0), //帽子
    analyser: null,
    frequencyArray: [] //采样频率缓冲数组
}
let gainNode // 音量控制器
var source = {} // 音频源
// 获取当前列表所有歌曲
function getCurrentMusicList() {
    let musicFiles = obj.folderList.find(o => o.name === obj.defaultFolder)
    return musicFiles ? musicFiles.musics : []
}
// 开始初始化函数
function startInitialize() {
    chrome.storage.sync.get({defaultFolder: 'music',volume:0.5,serial:0,autoPlay:false,songPush:true}, function(items) {
        Object.assign(obj,items)
        obj.defaultFolder = items.defaultFolder
        fileSystem.updateMusicList().then(() => {
            // 判断默认文件夹是否存在
            let lists = obj.folderList
            if (lists.find(o => o.name === obj.defaultFolder)) {
                obj.autoPlay && playSong(0, 0)
            } else {
                // 默认文件夹不存在
                if (lists.length === 0) {
                    fileSystem.createFolder(config.pathname).then(startInitialize)
                } else {
                    obj.defaultFolder = lists[0].name
                    setStorage(startInitialize)
                }
            }
        })
    })
}
// 存储缓存
function setStorage(fun){
    fun = fun||function(){}
    let {defaultFolder,volume,serial,autoPlay,songPush} = obj
    chrome.storage.sync.set({defaultFolder,volume,serial,autoPlay,songPush}, fun)
}
// 指定序号播放歌曲
function playSong(step,index){
    let musics = getCurrentMusicList()
    let maxLength = musics.length
    if(maxLength === 0){
        obj.init = false
        source.stop && source.stop(0)
        return sendNotice('播放器通知','暂无音乐请先添加音乐文件！')
    }
    if (step === 'playing') {
        // 直接点击播放或者暂停
        if(obj.init){
            obj.context.state === 'running' ? obj.context.suspend() : obj.context.resume()
            obj.downPlay = obj.downStop = false
            setTimeout(updatePlayMenus,100)
        }else{
            playSong(0,0)
        }
        return
    }
    source.stop && source.stop(0)
    let pat = obj.pattern[obj.serial]
    let _index = obj.index // 备份
    obj.index += step
    if(Number.isInteger(index)){
        obj.index = index
    }else if(pat === 'single'){
        obj.index = _index // 单曲循环
    }else if(pat === 'loop'){
        obj.index >= maxLength && (obj.index = 0)
        obj.index < 0 && (obj.index = maxLength - 1)
    }else if(pat === 'ordinal'){
        if (obj.index > maxLength - 1 || obj.index < 0) {
            obj.init = false
            obj.index = 0
            obj.context.suspend() // 为了出现播放菜单
            setTimeout(updatePlayMenus,100)
            return
        }
    }else if(pat === 'random'){
        obj.index = Math.floor(Math.random() * maxLength)
    }
    let music = musics[obj.index]
    obj.songName = getNameByteLen(music.name)  // 更新当前歌名
    obj.init = true
    fileSystem.readerFile(music.fullPath).then(b=>{
        obj.manual = null
        updatePlayMenus()
        obj.context.decodeAudioData(b).then(buffer => {
            source.stop && source.stop(0)
            obj.context = new AudioContext() // 新建对象，否则播放时间不对
            source = obj.context.createBufferSource()
            gainNode = obj.context.createGain()
            gainNode.gain.value = obj.volume
            obj.analyser = obj.context.createAnalyser()
            source.connect(obj.analyser)
            obj.analyser.connect(gainNode)
            gainNode.connect(obj.context.destination)
            source.buffer = buffer
            source.loopStart = source.context.currentTime + 20
            source.start(0)
            obj.songDuration = buffer.duration
            source.onended = function (){
                !obj.manual && playSong(1)// 手动点击上下一首，也会触发onended，所以要排除
            }
            obj.frequencyArray = new Uint8Array(obj.analyser.frequencyBinCount)
        },()=>{
            sendNotice('播放音乐出错',`《${music.name}》音乐文件解码失败,已自动删除！`)
            fileSystem.delFile(music.fullPath).then(()=>{
                obj.manual = 'self-motion'
                playSong(1) // 自动播放下一首
            })
        })
    }).catch(e =>{
        sendNotice('读取文件出错',e.message)
        obj.manual = 'self-next'
        playSong(1) // 自动播放下一首
    })
}
// 新增音乐
function addingMusic(arr, isLocal){
    let reg = /^https?:\/\/.+\.(mp3|ogg|m4a)(\?.+)?/i
    let lists = getCurrentMusicList()
    arr.forEach(item => {
        let name = isLocal ? item.name : item.split(/[?#]/)[0].split('/').slice(-1)[0]
        if (lists.find(o => o.name === name)) {
            sendNotice('播放器通知',`《${name}》已经存在列表了`)
        }else if(!isLocal && !reg.test(item)){
            sendNotice('无效的远程音乐地址', item)
        }else if(isLocal){
            const fileReader = new FileReader()
            fileReader.onloadend = function (e) {
                saveMusicToList(name, e.target.result)
            }
            fileReader.readAsArrayBuffer(item)
        }else{
            fetch(item).then(res => res.blob().then(blob => {
                let reg = /^audio\/(mp3|ogg|mp4|mpeg)$/i
                reg.test(blob.type) && blob.size > 1048576 ? saveMusicToList(name, blob):sendNotice('音乐文件下载失败', blob.toString())
            })).catch(()=>{
                sendNotice('音乐文件下载失败', item)
            })
        }
    })
}
// 保存到音乐列表
function saveMusicToList(name, data){
    let type = {mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/x-m4a'}
    let suffix = name.match(/([^.]+)$/)[1].toLowerCase()
    fileSystem.saveFile({
        pathname: obj.defaultFolder,
        fileName: name,
        content: data,
        mineType: type[suffix] || 'audio/midi'
    }).then(()=>{
        fileSystem.updateMusicList().then(()=>{
            !obj.init && playSong(0,0)
        })
    },e=>{
        sendNotice('音乐保存失败',`《${name}》因“${e}”加载失败！`)
    })
}
// 读取缓存
if (W.requestFileSystem) {
    navigator.webkitTemporaryStorage.queryUsageAndQuota(function (usage, quota) {
        if (quota) {
            W.requestFileSystem(TEMPORARY, this.size, function (fs) {
                fileSystem.fs = fs
                startInitialize()
            })
            fileSystem.usage = usage
        } else {
            sendNotice('播放器初始化失败','本地FileSystem申请失败！')
        }
    })
}else{
    sendNotice('播放器初始化失败','本地FileSystem初始化失败！')
}

// 发浏览器通知
function sendNotice(title,message,fun){
    chrome.notifications.create(null, {
        type: 'basic',
        iconUrl: 'img/icons.png',
        title,
        message,
    },function(id){
        fun && fun(id)
    })
}
// 操作播放器
function operation(action, val) {
    obj.manual = action
    switch (action) {
        case 'remove':
            let index = obj.index
            let path = getCurrentMusicList()[val].fullPath
            fileSystem.delFile(path).then(() => {
                fileSystem.updateMusicList().then(()=>{
                    if (val === index) {
                        playSong(0,index)
                    }
                })
            })
            break
        case 'prior':
            obj.downPrior = false
            playSong(-1)
            break
        case 'playing':
            playSong('playing')
            break
        case 'next':
            playSong(1)
            obj.downNext = false
            break
        case 'serial':
            obj.serial = ++obj.serial % 4
            setStorage()
            break
        case 'setVolume':
            obj.volume = Math.min(40, val) / 40
            gainNode.gain.value = obj.volume
            setStorage()
            break
        case 'mute':
            (obj.mute = !obj.mute) ? obj.analyser.disconnect(gainNode) :
              obj.analyser.connect(gainNode)
            break
        default:
    }
}

// 监听来自content-script的消息
let noticeId
let ajaxSong
let menuId
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse){
    let type = request.type
    let data = request.data
    if(obj.songPush && type === 'ajaxSong'){
        ajaxSong = data
        sendNotice('监听到本站有音乐','是否需要听听本站音乐？点击本信息表示接受！',function(id){
            noticeId = id
        })
    }
})
// 点击通知回调
chrome.notifications.onClicked.addListener((id)=>{
    id === noticeId && addingMusic(ajaxSong, false)
    chrome.notifications.clear(id)
})

// 更新播放菜单
function updatePlayMenus(){
    chrome.contextMenus.update(menuId,{
        title: obj.context.state !== 'suspended' ?'暂停':'播放',
    })
}
// 添加菜单
function addMenus(name,fun){
    return chrome.contextMenus.create({
        type: 'normal',
        title: name,
        contexts: ['page'],
        onclick: fun
    })
}
chrome.contextMenus.removeAll(()=>{
    menuId = addMenus('播放',function(){operation('playing')})
    addMenus('上一曲',function(){operation('prior')})
    addMenus('下一曲',function(){operation('next')})
    addMenus('添加网络歌曲',function(){
        let song = prompt('请输入完整的远程音乐地址，多个以英文逗号分开','')
        song && addingMusic(song.split(','), false)
    })
})
