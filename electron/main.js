const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const midi = require("@julusian/midi");

const isDev = !app.isPackaged;
let win = null;
let kv = null;

async function initStore() {
  if (!kv) {
    const Store = (await import("electron-store")).default;
    kv = new Store({ name: "settings" });
  }
  return kv;
}

function createWindow() {
  win = new BrowserWindow({
    width: 390,
    height: 844,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    resizable: true,
    minWidth: 375,
    minHeight: 667,
  });
  console.log("Loading Church Lobby Companion desktop app");

  // Load the hamburger MIDI interface in both dev and production
  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    // Load the built hamburger interface (which contains iframe to CLUI)
    const rendererPath = path.join(
      process.resourcesPath,
      "renderer",
      "index.html"
    );
    console.log("Loading renderer from:", rendererPath);
    win.loadFile(rendererPath);
  }
}

let input = null;
let virtualInput = null;
let learningMode = null; // { action: string, resolve: function }

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
  list.unshift({ id: "virtual", name: "Virtual Port (for MIDI Software)" });

  console.log(`Final device list:`, list);
  console.log(`=== END MIDI SCAN ===`);

  return list;
}

function createVirtualPort() {
  try {
    // Create virtual MIDI input port for receiving from MIDI software
    virtualInput = new midi.Input();
    virtualInput.openVirtualPort("Church Lobby Companion");
    virtualInput.on("message", (_deltaTime, msg) => onMidi(msg));
    console.log(
      "Virtual MIDI port 'Church Lobby Companion' created successfully"
    );
    return true;
  } catch (error) {
    console.warn("Could not create virtual MIDI port:", error.message);
    return false;
  }
}

function openInput(index) {
  if (input) {
    try {
      input.closePort();
    } catch {}
    input = null;
  }

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

  try {
    const inPort = new midi.Input();
    inPort.on("message", (_deltaTime, msg) => onMidi(msg));
    inPort.openPort(parseInt(index));
    input = inPort;
    console.log("MIDI input opened:", index);
    return true;
  } catch (error) {
    console.warn("MIDI error:", error.message);
    return false;
  }
}

function onMidi(message) {
  console.log("MIDI message received:", message);

  // Parse MIDI message
  const [status, note, velocity = 0] = message;
  const messageType = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  console.log(
    `MIDI: Type=${messageType.toString(
      16
    )}, Channel=${channel}, Note=${note}, Velocity=${velocity}`
  );

  // Send MIDI info to UI in real-time
  if (win) {
    win.webContents.send("midi:message", {
      raw: Array.from(message),
      type: messageType.toString(16),
      channel,
      note,
      velocity,
      timestamp: Date.now(),
    });
  }

  // Check learning mode status
  console.log(`Learning mode active: ${!!learningMode}`);
  if (learningMode) {
    console.log(`Learning mode details:`, learningMode);
  }

  // If we're in learning mode, capture this message
  if (learningMode && messageType === 0x90) {
    // Remove velocity check
    const midiKey = `ch${channel}-note${note}`;
    console.log(`🎓 Learning captured: ${midiKey} -> ${learningMode.action}`);

    // Send learning result to frontend
    if (win) {
      win.webContents.send("midi:learning-result", {
        channel,
        note,
        action: learningMode.action,
        midiKey,
      });
    }

    learningMode = null;
    console.log(`🎓 Learning mode cleared`);
    return;
  }

  // Handle Note On messages for mapped actions (remove velocity check)
  if (messageType === 0x90) {
    // Any Note On, regardless of velocity
    console.log(
      `🎹 Note On: Channel ${channel}, Note ${note}, Velocity ${velocity}`
    );

    // Check if we have mappings for this MIDI note
    if (kv) {
      const mappings = kv.get("mappings") || [];
      console.log(
        `🔍 Checking ${mappings.length} mappings for Ch${channel} Note${note}`
      );

      const mapping = mappings.find(
        (m) => m.type === "note" && m.channel === channel && m.number === note
      );

      if (mapping) {
        console.log(`✅ Found mapping for Note ${note}:`, mapping);
        console.log(
          `🚀 Executing action: ${mapping.action} (${mapping.seconds || 10}s)`
        );
        dispatchMappedAction(mapping);
      } else {
        console.log(`❌ No mapping found for Ch${channel} Note${note}`);
        console.log(
          `Available mappings:`,
          mappings.map((m) => `Ch${m.channel} Note${m.number} -> ${m.action}`)
        );
      }
    } else {
      console.log(`❌ Storage (kv) not available`);
    }
  }
}

function dispatchMappedAction(mapping) {
  const seconds = typeof mapping.seconds === "number" ? mapping.seconds : 10;
  console.log(`Dispatching action: ${mapping.action} (${seconds}s)`);

  switch (mapping.action) {
    case "fadeIn":
      postToWebsite("cl:command", { type: "fadeIn", seconds });
      break;
    case "fadeOut":
      postToWebsite("cl:command", { type: "fadeOut", seconds, pause: true });
      break;
    case "stop":
      postToWebsite("cl:command", { type: "stop" });
      break;
    case "selectAndFadeIn":
      if (mapping.songId || mapping.songTitle) {
        postToWebsite("cl:command", {
          type: "selectAndFadeIn",
          seconds,
          songId: mapping.songId,
          songTitle: mapping.songTitle,
        });
      }
      break;
  }
}

function postToWebsite(channel, payload) {
  console.log("Posting to website:", channel, payload);
  if (win && win.webContents) {
    // Forward to renderer; preload will forward to the iframe via postMessage.
    win.webContents.send(channel, payload);
  }
}

ipcMain.handle("midi:list", () => listMidiInputs());
ipcMain.handle("midi:open", (_e, idx) => openInput(idx));

// Learning mode handlers
ipcMain.handle("midi:startLearning", (_e, action) => {
  return new Promise((resolve) => {
    console.log(`🎓 Starting MIDI learning for action: ${action}`);

    // Clear any existing learning mode first
    if (learningMode) {
      console.log(`🎓 Clearing previous learning mode: ${learningMode.action}`);
      learningMode.resolve(null);
    }

    learningMode = { action, resolve };
    console.log(`🎓 Learning mode activated for: ${action}`);

    // Set a timeout to cancel learning after 10 seconds
    setTimeout(() => {
      if (learningMode && learningMode.action === action) {
        console.log(`🎓 Learning mode timed out for: ${action}`);
        learningMode = null;
        resolve(null); // Return null if timeout
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

// Add MIDI device IPC handlers
ipcMain.handle("midi:get-devices", async () => {
  return listMidiInputs();
});

ipcMain.handle("midi:connect", async (_e, deviceId) => {
  try {
    console.log(`Attempting to connect to MIDI device: ${deviceId}`);
    const success = openInput(deviceId);
    if (success) {
      console.log(`✅ Successfully connected to MIDI device: ${deviceId}`);
      return true;
    } else {
      console.error(`❌ Failed to connect to MIDI device: ${deviceId}`);
      return false;
    }
  } catch (error) {
    console.error("❌ MIDI connection failed:", error.message);
    return false;
  }
});

ipcMain.handle("midi:start-learning", async (_e, action) => {
  learningMode = { action, resolve: null };
  return true;
});

ipcMain.handle("midi:stop-learning", async () => {
  learningMode = null;
  return true;
});

app.whenReady().then(async () => {
  await initStore();

  // Create virtual MIDI port for MIDI software to connect to
  createVirtualPort();

  createWindow();
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
  if (process.platform !== "darwin") app.quit();
});
