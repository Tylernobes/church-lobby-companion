const { contextBridge, ipcRenderer } = require("electron");

// Relay desktop → web page commands
ipcRenderer.on("cl:command", (_e, payload) => {
  console.log("Preload received cl:command:", payload);
  window.postMessage({ channel: "cl:command", payload });

  // Also try direct iframe forwarding
  const iframe = document.querySelector("iframe");
  if (iframe && iframe.contentWindow) {
    console.log("Forwarding to iframe...");
    try {
      // Legacy debug message (no-op for CLUI)
      iframe.contentWindow.postMessage({ channel: "cl:command", payload }, "*");

      // Canonical message that CLUI listens for
      const audioCommand = {
        type: "AUDIO_COMMAND",
        command: payload?.type || payload?.command,
        seconds: payload?.seconds,
        songId: payload?.songId,
        songTitle: payload?.songTitle,
      };
      iframe.contentWindow.postMessage(audioCommand, "*");
      console.log("Successfully forwarded to iframe");
    } catch (error) {
      console.error("Error forwarding to iframe:", error);
    }
  } else {
    console.log("No iframe found to forward to");
  }
});

// Relay MIDI messages to React UI
ipcRenderer.on("midi:message", (_e, message) => {
  window.postMessage({ type: "midi:message", payload: message }, "*");
});

// Relay learning results to React UI
ipcRenderer.on("midi:learning-result", (_e, result) => {
  window.postMessage({ type: "midi:learning-result", payload: result }, "*");
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

// Removed cross-origin iframe DOM injection. We rely solely on postMessage bridging.
