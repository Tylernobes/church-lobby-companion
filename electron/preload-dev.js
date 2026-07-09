const { contextBridge, ipcRenderer } = require("electron");

// Relay MIDI messages to React UI
ipcRenderer.on("midi:message", (_e, message) => {
  window.postMessage({ type: "midi:message", payload: message }, "*");
});

// Relay learning results to React UI
ipcRenderer.on("midi:learning-result", (_e, result) => {
  window.postMessage({ type: "midi:learning-result", payload: result }, "*");
});

// Relay CLUI messages (subscription, song selection) to the overlay UI
ipcRenderer.on("clui:message", (_e, payload) => {
  window.postMessage(payload, "*");
});

contextBridge.exposeInMainWorld("desktop", {
  midi: {
    list: () => ipcRenderer.invoke("midi:list"),
    open: (idx) => ipcRenderer.invoke("midi:open", idx),
    startLearning: (action) => ipcRenderer.invoke("midi:startLearning", action),
    stopLearning: () => ipcRenderer.invoke("midi:stopLearning"),
  },
  map: {
    get: () => ipcRenderer.invoke("map:get"),
    set: (items) => ipcRenderer.invoke("map:set", items),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch) => ipcRenderer.invoke("settings:set", patch),
  },
});

// New electron API for the redesigned UI
contextBridge.exposeInMainWorld("electron", {
  requestMidiDevices: () => ipcRenderer.invoke("midi:get-devices"),
  connectMidiDevice: (deviceId) => ipcRenderer.invoke("midi:connect", deviceId),
  startMidiLearning: (action) =>
    ipcRenderer.invoke("midi:start-learning", action),
  stopMidiLearning: () => ipcRenderer.invoke("midi:stop-learning"),
  onMidiMessage: (callback) => ipcRenderer.on("midi:message", callback),
  onMidiDevices: (callback) => {
    // Send devices immediately on request
    ipcRenderer.invoke("midi:get-devices").then((devices) => {
      callback(null, devices);
    });
  },
  removeAllListeners: (event) => ipcRenderer.removeAllListeners(event),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});

contextBridge.exposeInMainWorld("clOffline", {
  downloadPlaylist: (payload) => ipcRenderer.invoke("offline:download-playlist", payload),
  downloadAlbum: (payload) => ipcRenderer.invoke("offline:download-album", payload),
  getSongUrl: (payload) => ipcRenderer.invoke("offline:get-song-url", payload),
  getPlaylistStatus: (payload) => ipcRenderer.invoke("offline:get-playlist-status", payload),
  getAlbumStatus: (payload) => ipcRenderer.invoke("offline:get-album-status", payload),
  listDownloads: () => ipcRenderer.invoke("offline:list-downloads"),
  clearDownloads: () => ipcRenderer.invoke("offline:clear-downloads"),
});

// Removed cross-origin iframe DOM injection. We rely solely on postMessage bridging.
