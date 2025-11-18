const { app, BrowserWindow } = require("electron");
const path = require("node:path");

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 390,
    height: 844,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
    resizable: true,
    minWidth: 375,
    minHeight: 667,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    const rendererPath = path.join(process.resourcesPath, "renderer", "index.html");
    win.loadFile(rendererPath);
  }
}

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});