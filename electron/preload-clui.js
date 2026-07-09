const { contextBridge, ipcRenderer } = require("electron");

const forwardTypes = new Set([
  "subscription-status",
  "SONG_SELECTED",
  "PLAYLIST_SELECTED",
  "ALBUM_SELECTED",
]);

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type || !forwardTypes.has(data.type)) {
    return;
  }
  ipcRenderer.send("clui:message", data);
});

ipcRenderer.on("clui:postMessage", (_e, payload) => {
  window.postMessage(payload, "*");
});

window.addEventListener("DOMContentLoaded", () => {
  ipcRenderer
    .invoke("app:version")
    .then((version) => {
      if (!version) return;
      window.postMessage({ type: "DESKTOP_APP_VERSION", version }, "*");
    })
    .catch(() => {});
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
