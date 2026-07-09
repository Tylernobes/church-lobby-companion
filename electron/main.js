const { app, BrowserWindow, BrowserView, ipcMain, dialog, powerSaveBlocker, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");
const midi = require("@julusian/midi");

app.setName("Church Lobby");
app.setPath(
  "userData",
  path.join(app.getPath("appData"), "Church Lobby")
);

let mainWindow = null;
let overlayView = null;
let kv = null;
let powerSaveBlockerId = null;
let offlineServer = null;
let offlinePort = null;
let offlineIndexCache = { songs: {}, playlists: {}, albums: {} };

const OFFLINE_DIR_NAME = "offline-cache";
const OFFLINE_LEASE_DAYS = 21;

const CLUI_PROD_URL = "https://clui.expo.app";
const CLUI_DEV_URLS = [
  "http://localhost:19006",
  "http://127.0.0.1:19006",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];
const OVERLAY_EXPANDED_WIDTH = 360;
const OVERLAY_EXPANDED_HEIGHT = 720;
const OVERLAY_COLLAPSED_SIZE = 68;
const OVERLAY_MARGIN = 12;
let overlayExpanded = false;
let updateOverlayBounds = null;

async function initStore() {
  if (!kv) {
    const Store = (await import("electron-store")).default;
    kv = new Store({ name: "settings" });
  }
  return kv;
}

async function ensureOfflineRoot() {
  const root = path.join(app.getPath("userData"), OFFLINE_DIR_NAME);
  await fsp.mkdir(root, { recursive: true });
  return root;
}

async function loadOfflineIndex() {
  const store = await initStore();
  offlineIndexCache = store.get("offlineIndex") || { songs: {}, playlists: {}, albums: {} };
  return offlineIndexCache;
}

function persistOfflineIndex() {
  if (kv) kv.set("offlineIndex", offlineIndexCache);
}

function isExpired(entry) {
  return !!entry?.expiresAt && entry.expiresAt < Date.now();
}

function computeOfflineSummary() {
  const playlists = Object.entries(offlineIndexCache.playlists || {})
    .filter(([, entry]) => !isExpired(entry))
    .map(([id, entry]) => ({
      id,
      title: entry?.title || "Playlist",
      songCount: (entry?.songIds || []).length,
      songIds: entry?.songIds || [],
      expiresAt: entry?.expiresAt || null,
    }));
  const albums = Object.entries(offlineIndexCache.albums || {})
    .filter(([, entry]) => !isExpired(entry))
    .map(([id, entry]) => ({
      id,
      title: entry?.title || "Album",
      songCount: (entry?.songIds || []).length,
      songIds: entry?.songIds || [],
      expiresAt: entry?.expiresAt || null,
    }));
  const songs = Object.values(offlineIndexCache.songs || {});
  const songMeta = Object.entries(offlineIndexCache.songs || {}).reduce((acc, [id, entry]) => {
    if (isExpired(entry)) return acc;
    acc[id] = {
      title: entry?.title || null,
      artist: entry?.artist || null,
      albumTitle: entry?.albumTitle || null,
      albumId: entry?.albumId || entry?.albumID || null,
      albumID: entry?.albumID || entry?.albumId || null,
      circlePath: entry?.circlePath || null,
    };
    return acc;
  }, {});
  const totalSize = songs.reduce((sum, s) => sum + (s?.size || 0), 0);
  return {
    playlists,
    albums,
    songs: songMeta,
    songCount: songs.length,
    totalSize,
  };
}

function getSongFilePath(root, songId, audioUrl) {
  let ext = ".mp3";
  try {
    const u = new URL(audioUrl);
    const maybeExt = path.extname(u.pathname || "");
    if (maybeExt) ext = maybeExt;
  } catch {}
  return path.join(root, `${songId}${ext}`);
}

async function downloadToFile(audioUrl, filePath) {
  return new Promise((resolve, reject) => {
    const u = new URL(audioUrl);
    const client = u.protocol === "https:" ? https : http;
    const req = client.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadToFile(res.headers.location, filePath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      const file = fs.createWriteStream(filePath);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", (err) => {
        try { fs.unlinkSync(filePath); } catch {}
        reject(err);
      });
    });
    req.on("error", reject);
  });
}

async function downloadSong(song) {
  if (!song?.id || !song?.audioUrl) return null;
  const root = await ensureOfflineRoot();
  const existing = offlineIndexCache.songs[song.id];
  if (existing && !isExpired(existing) && fs.existsSync(existing.path)) {
    return existing;
  }
  const filePath = getSongFilePath(root, song.id, song.audioUrl);
  await downloadToFile(song.audioUrl, filePath);
  const stats = await fsp.stat(filePath).catch(() => null);
  const entry = {
    path: filePath,
    size: stats?.size || 0,
    expiresAt: Date.now() + OFFLINE_LEASE_DAYS * 24 * 60 * 60 * 1000,
    title: song?.title || null,
    artist: song?.artist || null,
    albumTitle: song?.albumTitle || null,
    albumId: song?.albumId || song?.albumID || null,
    albumID: song?.albumID || song?.albumId || null,
    circlePath: song?.circlePath || null,
  };
  offlineIndexCache.songs[song.id] = entry;
  persistOfflineIndex();
  return entry;
}

function startOfflineServer() {
  if (offlineServer) return;
  offlineServer = http.createServer((req, res) => {
    const baseHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "Range,Origin,Content-Type,Accept",
      "Access-Control-Expose-Headers": "Content-Length,Content-Range",
      "Accept-Ranges": "bytes",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, baseHeaders);
      return res.end();
    }
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (!url.pathname.startsWith("/song/")) {
        res.writeHead(404, baseHeaders);
        return res.end();
      }
      const songId = url.pathname.replace("/song/", "").trim();
      const entry = offlineIndexCache.songs[songId];
      if (!entry || isExpired(entry) || !fs.existsSync(entry.path)) {
        res.writeHead(404, baseHeaders);
        return res.end();
      }
      const stats = fs.statSync(entry.path);
      const fileSize = stats.size;
      const range = req.headers.range;
      const contentType = "audio/mpeg";

      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        if (!match) {
          res.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${fileSize}` });
          return res.end();
        }
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        if (start >= fileSize || end < start) {
          res.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${fileSize}` });
          return res.end();
        }
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          ...baseHeaders,
          "Content-Type": contentType,
          "Content-Length": chunkSize,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        });
        if (req.method === "HEAD") return res.end();
        return fs.createReadStream(entry.path, { start, end }).pipe(res);
      }

      res.writeHead(200, {
        ...baseHeaders,
        "Content-Type": contentType,
        "Content-Length": fileSize,
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(entry.path).pipe(res);
    } catch {
      res.writeHead(500, baseHeaders);
      res.end();
    }
  });
  offlineServer.listen(0, "127.0.0.1", () => {
    const address = offlineServer.address();
    offlinePort = typeof address === "object" && address ? address.port : null;
    console.log("Offline server listening on", offlinePort);
  });
}

function loadCluiWithFallback(targetWindow) {
  const candidates = [...CLUI_DEV_URLS, CLUI_PROD_URL];
  let index = 0;

  const tryNext = () => {
    const url = candidates[index];
    if (!url) {
      return;
    }
    index += 1;
    targetWindow.loadURL(url);
  };

  const handleFail = () => {
    if (index < candidates.length) {
      tryNext();
    }
  };

  targetWindow.webContents.on("did-fail-load", handleFail);
  tryNext();
}

function attachOverlayView(parentWindow, isDev) {
  overlayView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  overlayView.setBackgroundColor("#00000000");

  parentWindow.setBrowserView(overlayView);

  updateOverlayBounds = () => {
    const [width, height] = parentWindow.getContentSize();
    const targetWidth = overlayExpanded
      ? OVERLAY_EXPANDED_WIDTH
      : OVERLAY_COLLAPSED_SIZE;
    const targetHeight = overlayExpanded
      ? OVERLAY_EXPANDED_HEIGHT
      : OVERLAY_COLLAPSED_SIZE;
    const viewWidth = Math.min(targetWidth, width);
    const viewHeight = Math.min(targetHeight, height);
    overlayView.setBounds({
      x: Math.max(0, width - viewWidth - OVERLAY_MARGIN),
      y: OVERLAY_MARGIN,
      width: viewWidth,
      height: viewHeight,
    });
  };

  updateOverlayBounds();
  parentWindow.once("ready-to-show", updateOverlayBounds);
  parentWindow.on("show", updateOverlayBounds);
  parentWindow.on("resize", updateOverlayBounds);

  if (isDev) {
    overlayView.webContents.loadURL("http://localhost:5173");
  } else {
    const rendererPath = path.join(
      process.resourcesPath,
      "renderer",
      "index.html"
    );
    overlayView.webContents.loadFile(rendererPath);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 390,
    height: 844,
    webPreferences: {
      preload: path.join(__dirname, "preload-clui.js"),
      nodeIntegration: false,
      contextIsolation: true,
      // Ensure timers/animation don't throttle when window is unfocused/occluded
      backgroundThrottling: false,
      // Enable persistent storage for login sessions
      partition: "persist:church-lobby",
    },
    resizable: true,
    minWidth: 375,
    minHeight: 667,
  });
  console.log("Loading Church Lobby Companion desktop app");

  const isDev = !app.isPackaged;
  if (isDev) {
    loadCluiWithFallback(mainWindow);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(CLUI_PROD_URL);
  }

  attachOverlayView(mainWindow, isDev);
}

let input = null;
let hardwareInputs = new Map();
let virtualInput = null;
const VIRTUAL_PORT_NAME = "Church Lobby Companion";
let learningMode = null; // { action: string, resolve: function }
let postLearnSuppress = null; // { channel: number, note: number, until: number }
let playPauseFallbackIsPlaying = true;

function listMidiInputs() {
  const tmp = new midi.Input();
  const list = [];
  const portCount = tmp.getPortCount();

  console.log(`=== MIDI DEVICE SCAN ===`);
  console.log(`Total MIDI ports found: ${portCount}`);

  for (let i = 0; i < portCount; i++) {
    const portName = tmp.getPortName(i);
    console.log(`Port ${i}: "${portName}"`);

    // Include ALL MIDI sources (software and hardware) except our own virtual port
    if (!portName.includes("Church Lobby Companion")) {
      list.push({ id: i, name: portName });
      console.log(`  ✅ Added to list: ${portName}`);
    } else {
      console.log(`  ⏭️ Skipped (our own port): ${portName}`);
    }
  }
  tmp.closePort();

  // Add option to listen to our virtual port (for MIDI software)
  list.unshift({ id: "virtual", name: "Virtual Port (for Software like Ableton, ProPresenter)" });

  console.log(`Final device list:`, list);
  console.log(`=== END MIDI SCAN ===`);

  return list;
}

function getSourceMetaForPort(index) {
  if (index === "virtual") {
    return {
      sourceType: "virtual",
      sourceId: "virtual",
      sourceName: "Virtual Port (Church Lobby Companion)",
    };
  }

  const portIndex = Number.parseInt(String(index), 10);
  if (!Number.isFinite(portIndex)) {
    return {
      sourceType: "hardware",
      sourceId: `port:${String(index)}`,
      sourceName: `MIDI Port ${String(index)}`,
    };
  }

  let portName = `MIDI Port ${portIndex}`;
  try {
    const tmp = new midi.Input();
    const count = tmp.getPortCount();
    if (portIndex >= 0 && portIndex < count) {
      portName = tmp.getPortName(portIndex) || portName;
    }
    tmp.closePort();
  } catch {}

  return {
    sourceType: "hardware",
    sourceId: `port:${portIndex}`,
    sourceName: portName,
  };
}

function mappingHasSourceConstraint(mapping) {
  return (
    mapping?.sourceLocked === true ||
    typeof mapping?.sourceId === "string" ||
    typeof mapping?.sourceType === "string"
  );
}

function mappingMatchesSource(mapping, sourceMeta) {
  if (!mappingHasSourceConstraint(mapping)) {
    return true;
  }

  if (
    typeof mapping?.sourceId === "string" &&
    mapping.sourceId &&
    mapping.sourceId !== sourceMeta.sourceId
  ) {
    return false;
  }

  if (
    typeof mapping?.sourceType === "string" &&
    mapping.sourceType &&
    mapping.sourceType !== "unknown" &&
    mapping.sourceType !== sourceMeta.sourceType
  ) {
    return false;
  }

  return true;
}

function createVirtualPort() {
  try {
    // Create virtual MIDI input port for receiving from MIDI software
    if (virtualInput) {
      try {
        virtualInput.closePort();
      } catch {}
      virtualInput = null;
    }
    virtualInput = new midi.Input();
    virtualInput.openVirtualPort(VIRTUAL_PORT_NAME);
    const sourceMeta = getSourceMetaForPort("virtual");
    virtualInput.on("message", (_deltaTime, msg) => onMidi(msg, sourceMeta));
    console.log(
      `Virtual MIDI port '${VIRTUAL_PORT_NAME}' created successfully`
    );
    return true;
  } catch (error) {
    console.warn("Could not create virtual MIDI port:", error.message);
    return false;
  }
}

function openInput(index) {
  if (index === "virtual") {
    // Virtual port is already created and listening - just confirm connection
    console.log("Connected to virtual MIDI port");
    return true;
  }

  // If no device selected, that's fine - we still receive from virtual port
  if (index === null || index === undefined || index === "") {
    console.log("No MIDI device selected - listening on virtual port only");
    return true;
  }

  const parsedIndex = Number.parseInt(String(index), 10);
  if (!Number.isFinite(parsedIndex)) {
    console.warn("MIDI error: invalid device index", index);
    return false;
  }

  if (hardwareInputs.has(parsedIndex)) {
    return true;
  }

  try {
    const inPort = new midi.Input();
    const sourceMeta = getSourceMetaForPort(parsedIndex);
    inPort.on("message", (_deltaTime, msg) => onMidi(msg, sourceMeta));
    inPort.openPort(parsedIndex);
    hardwareInputs.set(parsedIndex, inPort);
    // Keep legacy reference for backward compatibility with old debug paths.
    input = inPort;
    console.log("MIDI input opened:", parsedIndex);
    return true;
  } catch (error) {
    console.warn("MIDI error:", error.message);
    return false;
  }
}

function openAllHardwareInputs(devices) {
  const sourceList = Array.isArray(devices) ? devices : listMidiInputs();
  const hardwareDevices = sourceList.filter((d) => d?.id !== "virtual");
  for (const device of hardwareDevices) {
    openInput(device.id);
  }
}

function onMidi(message, sourceMeta) {
  console.log("MIDI message received:", message);

  const resolvedSource = sourceMeta || {
    sourceType: "unknown",
    sourceId: "unknown",
    sourceName: "Unknown MIDI Source",
  };

  // Parse MIDI message
  const [status, note, velocity = 0] = message;
  const messageType = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const NOTE_ON = 0x90;
  const NOTE_OFF = 0x80;
  const CC = 0xb0;
  const now = Date.now();

  // Send MIDI info to UI in real-time
  if (overlayView?.webContents) {
    overlayView.webContents.send("midi:message", {
      raw: Array.from(message),
      type: messageType.toString(16),
      channel,
      note,
      velocity,
      sourceType: resolvedSource.sourceType,
      sourceId: resolvedSource.sourceId,
      sourceName: resolvedSource.sourceName,
      timestamp: Date.now(),
    });
  }

  // While learning is active, capture Note On or CC and suppress mapped actions.
  if (learningMode) {
    if (messageType === NOTE_ON || messageType === CC) {
      const learnedType = messageType === CC ? "cc" : "note";
      const midiKey = `ch${channel}-${learnedType}${note}`;
      if (overlayView?.webContents) {
        overlayView.webContents.send("midi:learning-result", {
          type: learnedType,
          channel,
          number: note,
          note,
          velocity,
          action: learningMode.action,
          midiKey,
          sourceType: resolvedSource.sourceType,
          sourceId: resolvedSource.sourceId,
          sourceName: resolvedSource.sourceName,
        });
      }
      // Ignore trailing events from the same physical key press right after capture.
      postLearnSuppress = {
        channel,
        note,
        type: learnedType,
        sourceId: resolvedSource.sourceId,
        until: now + 350,
      };
      learningMode = null;
    }
    return;
  }

  if (
    postLearnSuppress &&
    now <= postLearnSuppress.until &&
    postLearnSuppress.channel === channel &&
    postLearnSuppress.note === note &&
    postLearnSuppress.sourceId === resolvedSource.sourceId &&
    ((postLearnSuppress.type === "note" &&
      (messageType === NOTE_ON || messageType === NOTE_OFF)) ||
      (postLearnSuppress.type === "cc" && messageType === CC))
  ) {
    return;
  }

  if (postLearnSuppress && now > postLearnSuppress.until) {
    postLearnSuppress = null;
  }

  // Dispatch mappings for Note On (velocity > 0) or CC.
  // Note Off is ignored for mapped actions to prevent duplicate triggers.
  if (messageType === NOTE_ON && velocity > 0) {
    if (kv) {
      const mappings = kv.get("mappings") || [];
      const candidates = mappings.filter(
        (m) => m.type === "note" && m.channel === channel && m.number === note
      );
      const constrained = candidates.filter((m) => mappingHasSourceConstraint(m));
      const constrainedMatch = constrained.find((m) =>
        mappingMatchesSource(m, resolvedSource)
      );
      const legacyFallback = candidates.find(
        (m) => !mappingHasSourceConstraint(m)
      );
      const mapping = constrainedMatch || legacyFallback;
      if (mapping) {
        dispatchMappedAction(mapping);
      }
    }
  } else if (messageType === CC && velocity >= 0) {
    if (kv) {
      const mappings = kv.get("mappings") || [];
      const candidates = mappings.filter(
        (m) => m.type === "cc" && m.channel === channel && m.number === note
      );
      const constrained = candidates.filter((m) => mappingHasSourceConstraint(m));
      const constrainedMatch = constrained.find((m) =>
        mappingMatchesSource(m, resolvedSource)
      );
      const legacyFallback = candidates.find(
        (m) => !mappingHasSourceConstraint(m)
      );
      const mapping = constrainedMatch || legacyFallback;
      if (mapping) {
        dispatchMappedAction(mapping);
      }
    }
  }
}

function dispatchMappedAction(mapping) {
  const seconds = typeof mapping.seconds === "number" ? mapping.seconds : 10;

  switch (mapping.action) {
    case "prev":
      postToClui({ type: "prev" });
      break;
    case "playPause":
      // Compatibility fallback: older CLUI runtimes don't support playPause.
      // Alternate between play/pause commands locally so the mapping still works.
      postToClui({ type: playPauseFallbackIsPlaying ? "pause" : "play" });
      playPauseFallbackIsPlaying = !playPauseFallbackIsPlaying;
      break;
    case "next":
      postToClui({ type: "next" });
      break;
    case "fadeIn":
      postToClui({ type: "fadeIn", seconds });
      break;
    case "fadeOut":
      postToClui({ type: "fadeOut", seconds, pause: true });
      break;
    case "stop":
      postToClui({ type: "stop" });
      break;
    case "selectAndFadeIn":
      if (mapping.songId || mapping.songTitle) {
        postToClui({
          type: "selectAndFadeIn",
          seconds,
          songId: mapping.songId,
          songTitle: mapping.songTitle,
          playlistId: mapping.playlistId,
          albumId: mapping.albumId,
          queueSongIds: mapping.queueSongIds,
        });
      }
      break;
    case "launchPlaylist":
      if (mapping.playlistId) {
        const startSongId =
          mapping.songId ||
          (Array.isArray(mapping.queueSongIds) && mapping.queueSongIds.length
            ? mapping.queueSongIds[0]
            : undefined);
        postToClui({
          type: "launchPlaylist",
          seconds,
          songId: startSongId,
          startSongId,
          playlistTitle: mapping.playlistTitle,
          playlistId: mapping.playlistId,
          queueSongIds: mapping.queueSongIds,
        });
      }
      break;
    case "launchAlbum":
      if (mapping.albumId) {
        const startSongId =
          mapping.songId ||
          (Array.isArray(mapping.queueSongIds) && mapping.queueSongIds.length
            ? mapping.queueSongIds[0]
            : undefined);
        postToClui({
          type: "launchAlbum",
          seconds,
          songId: startSongId,
          startSongId,
          albumTitle: mapping.albumTitle,
          albumId: mapping.albumId,
          queueSongIds: mapping.queueSongIds,
        });
      }
      break;
  }
}

function postToClui(payload) {
  if (!mainWindow?.webContents) {
    return;
  }

  const audioCommand = {
    type: "AUDIO_COMMAND",
    command: payload?.type || payload?.command,
    seconds: payload?.seconds,
    songId: payload?.songId,
    songTitle: payload?.songTitle,
    startSongId: payload?.startSongId,
    playlistTitle: payload?.playlistTitle,
    playlistId: payload?.playlistId,
    albumTitle: payload?.albumTitle,
    albumId: payload?.albumId,
    queueSongIds: payload?.queueSongIds,
  };

  mainWindow.webContents.send("clui:postMessage", audioCommand);
}

function configureStoragePermissionsForSession(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "persistent-storage" || permission === "storage") {
      callback(true);
      return;
    }
    callback(false);
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === "persistent-storage" || permission === "storage") {
      return true;
    }
    return false;
  });
}

app.whenReady().then(async () => {
  await initStore();
  await loadOfflineIndex();
  startOfflineServer();

  // Configure session for persistent storage
  const ses = session.fromPartition("persist:church-lobby");
  configureStoragePermissionsForSession(ses);
  configureStoragePermissionsForSession(session.defaultSession);

  // Prevent App Nap and system sleep to avoid gray screen issue
  powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  console.log(`Power save blocker active: ${powerSaveBlocker.isStarted(powerSaveBlockerId)}`);

  // Setup all IPC handlers after app is ready
  ipcMain.handle("midi:open", (_e, idx) => openInput(idx));
  ipcMain.handle("midi:get-devices", () => {
    const devices = listMidiInputs();
    openAllHardwareInputs(devices);
    return devices;
  });
  ipcMain.handle("midi:connect", (_e, deviceId) => {
    return openInput(deviceId);
  });
  
  // Learning mode handlers
  ipcMain.handle("midi:startLearning", (_e, action) => {
    return new Promise((resolve) => {
      console.log(`🎓 Starting MIDI learning for action: ${action}`);
      if (learningMode) {
        console.log(`🎓 Clearing previous learning mode: ${learningMode.action}`);
        learningMode.resolve(null);
      }
      learningMode = { action, resolve };
      console.log(`🎓 Learning mode activated for: ${action}`);
      setTimeout(() => {
        if (learningMode && learningMode.action === action) {
          console.log(`🎓 Learning mode timed out for: ${action}`);
          learningMode = null;
          resolve(null);
        }
      }, 10000);
    });
  });
  
  ipcMain.handle("midi:stopLearning", () => {
    console.log("🎓 Stopping MIDI learning");
    if (learningMode) {
      console.log(`🎓 Clearing learning mode: ${learningMode.action}`);
      learningMode.resolve(null);
      learningMode = null;
    }
    console.log("🎓 Learning mode fully cleared");
    return true;
  });
  
  ipcMain.handle("midi:start-learning", async (_e, action) => {
    return new Promise((resolve) => {
      console.log(`🎓 Starting MIDI learning for action: ${action}`);
      if (learningMode) {
        console.log(`🎓 Clearing previous learning mode: ${learningMode.action}`);
        learningMode.resolve(null);
      }
      learningMode = { action, resolve };
      console.log(`🎓 Learning mode activated for: ${action}`);
      setTimeout(() => {
        if (learningMode && learningMode.action === action) {
          console.log(`🎓 Learning mode timed out for: ${action}`);
          learningMode = null;
          resolve(null);
        }
      }, 10000);
    });
  });
  
  ipcMain.handle("midi:stop-learning", async () => {
    console.log("🎓 Stopping MIDI learning");
    if (learningMode) {
      console.log(`🎓 Clearing learning mode: ${learningMode.action}`);
      learningMode.resolve(null);
      learningMode = null;
    }
    console.log("🎓 Learning mode fully cleared");
    return true;
  });
  
  ipcMain.handle("map:get", async () => {
    const store = await initStore();
    return store.get("mappings") || [];
  });
  ipcMain.handle("map:set", async (_e, items) => {
    const store = await initStore();
    return store.set("mappings", items);
  });
  ipcMain.handle("settings:get", async () => {
    const store = await initStore();
    return store.get("settings") || {};
  });
  ipcMain.handle("settings:set", async (_e, patch) => {
    const store = await initStore();
    const cur = store.get("settings") || {};
    store.set("settings", { ...cur, ...patch });
  });

  ipcMain.handle("app:version", async () => app.getVersion());

  ipcMain.handle("clui:postMessage", (_e, payload) => {
    if (mainWindow?.webContents) {
      mainWindow.webContents.send("clui:postMessage", payload);
      return true;
    }
    return false;
  });

  ipcMain.handle("overlay:set-expanded", (_e, expanded) => {
    overlayExpanded = !!expanded;
    if (typeof updateOverlayBounds === "function") {
      updateOverlayBounds();
    }
    return true;
  });

  ipcMain.on("clui:message", (_e, payload) => {
    if (overlayView?.webContents) {
      overlayView.webContents.send("clui:message", payload);
    }
  });

  // Create virtual MIDI port for MIDI software to connect to
  const virtualPortCreated = createVirtualPort();
  
  // Auto-connect to virtual port for software MIDI
  if (virtualPortCreated) {
    const connected = openInput("virtual");
    console.log(`Virtual port connection: ${connected ? 'SUCCESS' : 'FAILED'}`);
  }

  // Listen to all available hardware inputs so mapped triggers are independent
  // of the currently selected device in the UI.
  openAllHardwareInputs();

  createWindow();
});

ipcMain.handle("offline:download-playlist", async (_e, payload) => {
  await loadOfflineIndex();
  const playlistId = payload?.playlistId || "unknown";
  const title = payload?.title || "Playlist";
  const songs = Array.isArray(payload?.songs) ? payload.songs : [];
  for (const song of songs) {
    try { await downloadSong(song); } catch (e) { console.warn("Offline download failed", song?.id, e?.message || e); }
  }
  offlineIndexCache.playlists[playlistId] = {
    songIds: songs.map((s) => s.id),
    title,
    expiresAt: Date.now() + OFFLINE_LEASE_DAYS * 24 * 60 * 60 * 1000,
  };
  persistOfflineIndex();
  return { ok: true, downloaded: songs.length };
});

ipcMain.handle("offline:download-album", async (_e, payload) => {
  await loadOfflineIndex();
  const albumId = payload?.albumId || "unknown";
  const title = payload?.title || "Album";
  const songs = Array.isArray(payload?.songs) ? payload.songs : [];
  for (const song of songs) {
    try { await downloadSong(song); } catch (e) { console.warn("Offline download failed", song?.id, e?.message || e); }
  }
  offlineIndexCache.albums[albumId] = {
    songIds: songs.map((s) => s.id),
    title,
    expiresAt: Date.now() + OFFLINE_LEASE_DAYS * 24 * 60 * 60 * 1000,
  };
  persistOfflineIndex();
  return { ok: true, downloaded: songs.length };
});

ipcMain.handle("offline:get-song-url", async (_e, payload) => {
  await loadOfflineIndex();
  const songId = payload?.songId;
  const entry = songId ? offlineIndexCache.songs[songId] : null;
  if (!entry || isExpired(entry) || !fs.existsSync(entry.path) || !offlinePort) {
    return { ok: false };
  }
  return { ok: true, url: `http://127.0.0.1:${offlinePort}/song/${songId}` };
});

ipcMain.handle("offline:get-playlist-status", async (_e, payload) => {
  await loadOfflineIndex();
  const playlistId = payload?.playlistId;
  const entry = playlistId ? offlineIndexCache.playlists[playlistId] : null;
  if (!entry || isExpired(entry)) return { ok: false };
  return { ok: true, songIds: entry.songIds || [], expiresAt: entry.expiresAt };
});

ipcMain.handle("offline:get-album-status", async (_e, payload) => {
  await loadOfflineIndex();
  const albumId = payload?.albumId;
  const entry = albumId ? offlineIndexCache.albums[albumId] : null;
  if (!entry || isExpired(entry)) return { ok: false };
  return { ok: true, songIds: entry.songIds || [], expiresAt: entry.expiresAt };
});

ipcMain.handle("offline:list-downloads", async () => {
  await loadOfflineIndex();
  return { ok: true, ...computeOfflineSummary() };
});

ipcMain.handle("offline:clear-downloads", async () => {
  const root = await ensureOfflineRoot();
  await fsp.rm(root, { recursive: true, force: true });
  offlineIndexCache = { songs: {}, playlists: {}, albums: {} };
  persistOfflineIndex();
  return { ok: true };
});

// Handle opening external URLs
ipcMain.handle("open-external", async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error("Failed to open external URL:", error);
    return { success: false, error: error.message };
  }
});

app.on("window-all-closed", () => {
  // Clean up MIDI ports
  if (input) {
    try {
      input.closePort();
    } catch {}
  }
  if (virtualInput) {
    try {
      virtualInput.closePort();
    } catch {}
  }
  // Stop power save blocker
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    console.log('Power save blocker stopped');
  }
  if (process.platform !== "darwin") app.quit();
});
