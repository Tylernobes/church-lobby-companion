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
      iframe.contentWindow.postMessage({ channel: "cl:command", payload }, "*");
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
});

// ===== Direct MiniPlayer Context Integration =====
(function setupMiniPlayerControl() {
  // Listen for commands from main process and call MiniPlayer functions
  window.addEventListener("message", (event) => {
    const { channel, payload } = event.data || {};
    if (channel !== "cl:command") return;

    console.log("Received audio command:", payload);

    const { type, seconds = 10 } = payload;

    // Try to find and call your MiniPlayer context functions
    const iframe = document.querySelector("iframe");
    if (iframe && iframe.contentWindow) {
      try {
        // Send commands to your website
        iframe.contentWindow.postMessage(
          {
            type: "CHURCH_LOBBY_COMMAND",
            command: type,
            seconds: seconds,
          },
          "*"
        );
        console.log("Sent command to website:", type);
      } catch (error) {
        console.error("Error sending to iframe:", error);
      }
    }

    // Also try to access React context directly if possible
    const executeCommand = () => {
      try {
        // Look for your MiniPlayer context in the iframe's window
        const iframeWindow = iframe?.contentWindow;
        if (!iframeWindow) return;

        // Try to find React components with MiniPlayer context
        const reactFiberKey = Object.keys(
          iframe.contentDocument?.querySelector("div") || {}
        ).find(
          (key) =>
            key.startsWith("__reactFiber") ||
            key.startsWith("__reactInternalInstance")
        );

        if (reactFiberKey) {
          console.log("React app detected in iframe");
        }

        // Execute the JavaScript directly in the iframe context
        const script = `
          (function() {
            console.log('Executing MiniPlayer command: ${type}');
            
            // Try to find MiniPlayer context functions
            if (window.miniPlayerCommands) {
              console.log('Found miniPlayerCommands object');
              switch ('${type}') {
                case 'fadeIn':
                  if (window.miniPlayerCommands.play) {
                    window.miniPlayerCommands.play();
                    console.log('Called MiniPlayer play()');
                  }
                  break;
                case 'fadeOut':
                  setTimeout(() => {
                    if (window.miniPlayerCommands.pause) {
                      window.miniPlayerCommands.pause();
                      console.log('Called MiniPlayer pause() after ${seconds}s');
                    }
                  }, ${seconds} * 1000);
                  break;
                case 'stop':
                  if (window.miniPlayerCommands.pause) {
                    window.miniPlayerCommands.pause();
                    console.log('Called MiniPlayer pause() for stop');
                  }
                  break;
              }
            } else {
              console.log('miniPlayerCommands not found on window');
              // Try to dispatch a custom event that your app can listen for
              const event = new CustomEvent('churchLobbyCommand', {
                detail: { type: '${type}', seconds: ${seconds} }
              });
              document.dispatchEvent(event);
              window.dispatchEvent(event);
              console.log('Dispatched churchLobbyCommand event');
            }
          })();
        `;

        // Execute in iframe context
        const scriptElement = iframe.contentDocument.createElement("script");
        scriptElement.textContent = script;
        iframe.contentDocument.head.appendChild(scriptElement);
      } catch (error) {
        console.error("Error executing command:", error);
      }
    };

    executeCommand();
  });

  // Try to inject command interface when iframe loads
  const iframe = document.querySelector("iframe");
  if (iframe) {
    iframe.addEventListener("load", () => {
      console.log("Iframe loaded, setting up MiniPlayer command interface...");

      // Give the React app time to initialize
      setTimeout(() => {
        try {
          // Inject a script that exposes MiniPlayer commands
          const script = iframe.contentDocument.createElement("script");
          script.textContent = `
            (function() {
              console.log('Setting up MiniPlayer command bridge...');
              
              // Listen for our custom command events
              function handleChurchLobbyCommand(event) {
                console.log('Received churchLobbyCommand:', event.detail);
                const { type, seconds } = event.detail;
                
                // Try to find your React context through common patterns
                // This will depend on how your app is structured
                const app = document.querySelector('#root') || document.querySelector('[data-reactroot]') || document.body;
                
                if (app) {
                  const reactProps = Object.keys(app).find(key => key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber'));
                  if (reactProps) {
                    console.log('Found React app structure');
                  }
                }
                
                // Create a global command interface that your app can set up
                if (!window.miniPlayerCommands) {
                  window.miniPlayerCommands = {};
                  console.log('Created miniPlayerCommands interface');
                }
                
                // Try to execute the command if interface is ready
                if (window.miniPlayerCommands.initialized) {
                  switch (type) {
                    case 'fadeIn':
                      window.miniPlayerCommands.play?.();
                      break;
                    case 'fadeOut':
                      setTimeout(() => window.miniPlayerCommands.pause?.(), seconds * 1000);
                      break;
                    case 'stop':
                      window.miniPlayerCommands.pause?.();
                      break;
                  }
                }
              }
              
              document.addEventListener('churchLobbyCommand', handleChurchLobbyCommand);
              window.addEventListener('churchLobbyCommand', handleChurchLobbyCommand);
              
              console.log('MiniPlayer command bridge ready');
            })();
          `;
          iframe.contentDocument.head.appendChild(script);
        } catch (error) {
          console.error("Error setting up command interface:", error);
        }
      }, 2000);
    });
  }
})();
