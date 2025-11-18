// Example of how to integrate with your Expo AV app
// Add this to your React component that handles audio playback

import { useEffect, useRef } from "react";

export function AudioPlayer() {
  const audioRef = useRef(null); // Your Expo AV Audio.Sound instance

  useEffect(() => {
    // Listen for commands from the desktop app
    const handleChurchLobbyCommand = (event) => {
      const { type, seconds = 10 } = event.detail;
      console.log("Received audio command:", type, seconds);

      if (audioRef.current) {
        switch (type) {
          case "fadeIn":
            // Start playing and fade in
            audioRef.current.setPositionAsync(0);
            audioRef.current.setVolumeAsync(0);
            audioRef.current.playAsync();

            // Fade in over specified seconds
            const fadeInSteps = seconds * 10;
            let step = 0;
            const fadeInInterval = setInterval(() => {
              step++;
              const volume = step / fadeInSteps;
              audioRef.current.setVolumeAsync(Math.min(1, volume));

              if (step >= fadeInSteps) {
                clearInterval(fadeInInterval);
              }
            }, 100);
            break;

          case "fadeOut":
            // Fade out over specified seconds then pause
            const fadeOutSteps = seconds * 10;
            let currentVolume = 1;
            const fadeOutInterval = setInterval(() => {
              currentVolume -= 1 / fadeOutSteps;
              audioRef.current.setVolumeAsync(Math.max(0, currentVolume));

              if (currentVolume <= 0) {
                clearInterval(fadeOutInterval);
                audioRef.current.pauseAsync();
              }
            }, 100);
            break;

          case "stop":
            audioRef.current.stopAsync();
            break;
        }
      }
    };

    // Add event listeners
    document.addEventListener("churchLobbyCommand", handleChurchLobbyCommand);
    window.addEventListener("churchLobbyCommand", handleChurchLobbyCommand);

    // Cleanup
    return () => {
      document.removeEventListener(
        "churchLobbyCommand",
        handleChurchLobbyCommand
      );
      window.removeEventListener(
        "churchLobbyCommand",
        handleChurchLobbyCommand
      );
    };
  }, []);

  // Your existing audio player JSX
  return <div>{/* Your audio player UI goes here */}</div>;
}

// Option 2: IPC Messaging (for Electron-wrapped Expo apps)
export function AudioPlayerWithIPC() {
  const audioRef = useRef(null);

  useEffect(() => {
    // Check if running in Electron environment
    if (window.electronAPI) {
      // Listen for IPC messages from the main desktop app
      window.electronAPI.onAudioCommand((command) => {
        const { type, seconds = 10 } = command;
        console.log("Received IPC audio command:", type, seconds);

        if (audioRef.current) {
          switch (type) {
            case "fadeIn":
              audioRef.current.setPositionAsync(0);
              audioRef.current.setVolumeAsync(0);
              audioRef.current.playAsync();

              const fadeInSteps = seconds * 10;
              let step = 0;
              const fadeInInterval = setInterval(() => {
                step++;
                const volume = step / fadeInSteps;
                audioRef.current.setVolumeAsync(Math.min(1, volume));

                if (step >= fadeInSteps) {
                  clearInterval(fadeInInterval);
                }
              }, 100);
              break;

            case "fadeOut":
              const fadeOutSteps = seconds * 10;
              let currentVolume = 1;
              const fadeOutInterval = setInterval(() => {
                currentVolume -= 1 / fadeOutSteps;
                audioRef.current.setVolumeAsync(Math.max(0, currentVolume));

                if (currentVolume <= 0) {
                  clearInterval(fadeOutInterval);
                  audioRef.current.pauseAsync();
                }
              }, 100);
              break;

            case "stop":
              audioRef.current.stopAsync();
              break;
          }
        }
      });

      // Optional: Send status updates back to the desktop app
      const sendStatusUpdate = (status) => {
        if (window.electronAPI.sendAudioStatus) {
          window.electronAPI.sendAudioStatus(status);
        }
      };

      // Example: Send updates when audio state changes
      if (audioRef.current) {
        audioRef.current.setOnPlaybackStatusUpdate((status) => {
          sendStatusUpdate({
            isPlaying: status.isPlaying,
            position: status.positionMillis,
            duration: status.durationMillis,
            volume: status.volume,
          });
        });
      }
    }
  }, []);

  return <div>{/* Your audio player UI goes here */}</div>;
}

// Option 3: HTTP/WebSocket Communication (most flexible)
export function AudioPlayerWithAPI() {
  const audioRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    // Option 3a: WebSocket connection for real-time commands
    const connectWebSocket = () => {
      try {
        // Connect to your desktop app's WebSocket server
        wsRef.current = new WebSocket("ws://localhost:8080/audio-control");

        wsRef.current.onopen = () => {
          console.log("Connected to Church Lobby desktop app");
        };

        wsRef.current.onmessage = (event) => {
          try {
            const command = JSON.parse(event.data);
            handleAudioCommand(command);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        wsRef.current.onclose = () => {
          console.log("Disconnected from desktop app, attempting reconnect...");
          // Reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };

        wsRef.current.onerror = (error) => {
          console.error("WebSocket error:", error);
        };
      } catch (error) {
        console.error("Failed to connect WebSocket:", error);
        // Fallback to HTTP polling
        startHttpPolling();
      }
    };

    // Option 3b: HTTP polling fallback
    const startHttpPolling = () => {
      const pollForCommands = async () => {
        try {
          const response = await fetch(
            "http://localhost:8080/api/audio-commands"
          );
          if (response.ok) {
            const commands = await response.json();
            commands.forEach(handleAudioCommand);
          }
        } catch (error) {
          console.log("HTTP polling failed, retrying...");
        }
      };

      // Poll every 500ms
      const pollingInterval = setInterval(pollForCommands, 500);
      return () => clearInterval(pollingInterval);
    };

    const handleAudioCommand = (command) => {
      const { type, seconds = 10, id } = command;
      console.log("Received API audio command:", type, seconds);

      if (audioRef.current) {
        switch (type) {
          case "fadeIn":
            audioRef.current.setPositionAsync(0);
            audioRef.current.setVolumeAsync(0);
            audioRef.current.playAsync();

            const fadeInSteps = seconds * 10;
            let step = 0;
            const fadeInInterval = setInterval(() => {
              step++;
              const volume = step / fadeInSteps;
              audioRef.current.setVolumeAsync(Math.min(1, volume));

              if (step >= fadeInSteps) {
                clearInterval(fadeInInterval);
                sendCommandResponse(id, "completed");
              }
            }, 100);
            break;

          case "fadeOut":
            const fadeOutSteps = seconds * 10;
            let currentVolume = 1;
            const fadeOutInterval = setInterval(() => {
              currentVolume -= 1 / fadeOutSteps;
              audioRef.current.setVolumeAsync(Math.max(0, currentVolume));

              if (currentVolume <= 0) {
                clearInterval(fadeOutInterval);
                audioRef.current.pauseAsync();
                sendCommandResponse(id, "completed");
              }
            }, 100);
            break;

          case "stop":
            audioRef.current.stopAsync();
            sendCommandResponse(id, "completed");
            break;
        }
      }
    };

    // Send response back to desktop app
    const sendCommandResponse = async (commandId, status) => {
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "commandResponse",
              commandId,
              status,
              timestamp: Date.now(),
            })
          );
        } else {
          // Fallback to HTTP
          await fetch("http://localhost:8080/api/audio-response", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commandId, status, timestamp: Date.now() }),
          });
        }
      } catch (error) {
        console.error("Failed to send command response:", error);
      }
    };

    // Start connection
    connectWebSocket();

    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return <div>{/* Your audio player UI goes here */}</div>;
}

/* 
=== INTEGRATION GUIDE ===

Choose the integration method that best fits your setup:

OPTION 1: Custom Events (Simplest)
- Best for: Web apps, Expo Web, basic integration
- Setup: Just import and use AudioPlayer component
- Limitations: Only works when both apps run in same browser context

OPTION 2: IPC Messaging (Electron)
- Best for: Expo apps wrapped in Electron
- Setup: Requires Electron preload script to expose electronAPI
- Benefits: Direct communication, reliable

OPTION 3: HTTP/WebSocket (Most Flexible)
- Best for: Any setup, mobile apps, separate processes
- Setup: Requires your desktop app to run a web server
- Benefits: Works across different devices, most robust

=== DESKTOP APP INTEGRATION ===

To integrate with your Church Lobby desktop app:

1. Add WebSocket server (recommended):
   ```javascript
   const WebSocket = require('ws');
   const wss = new WebSocket.Server({ port: 8080 });
   
   wss.on('connection', (ws) => {
     console.log('Expo app connected');
     
     // Send commands to Expo app
     const sendCommand = (type, seconds) => {
       ws.send(JSON.stringify({ type, seconds, id: Date.now() }));
     };
     
     // Example: Trigger fade in
     sendCommand('fadeIn', 5);
   });
   ```

2. Or add HTTP endpoints:
   ```javascript
   const express = require('express');
   const app = express();
   
   let pendingCommands = [];
   
   app.get('/api/audio-commands', (req, res) => {
     res.json(pendingCommands);
     pendingCommands = []; // Clear after sending
   });
   
   app.post('/api/audio-response', (req, res) => {
     console.log('Command completed:', req.body);
     res.json({ success: true });
   });
   ```

3. Or dispatch custom events (browser only):
   ```javascript
   // In your desktop app's web context
   const sendAudioCommand = (type, seconds) => {
     const event = new CustomEvent('churchLobbyCommand', {
       detail: { type, seconds }
     });
     document.dispatchEvent(event);
   };
   ```

=== EXPO AV SETUP ===

Make sure your Expo app has expo-av installed:
```bash
npx expo install expo-av
```

Then load your audio:
```javascript
import { Audio } from 'expo-av';

const [sound, setSound] = useState();

const loadAudio = async () => {
  const { sound } = await Audio.Sound.createAsync(
    require('./path/to/your/audio.mp3')
  );
  setSound(sound);
};

// Pass the sound instance to audioRef.current
audioRef.current = sound;
```

=== TESTING ===

1. Test Custom Events in browser console:
   ```javascript
   document.dispatchEvent(new CustomEvent('churchLobbyCommand', {
     detail: { type: 'fadeIn', seconds: 3 }
   }));
   ```

2. Test WebSocket connection:
   ```javascript
   const ws = new WebSocket('ws://localhost:8080/audio-control');
   ws.onopen = () => {
     ws.send(JSON.stringify({ type: 'fadeIn', seconds: 5 }));
   };
   ```

3. Test HTTP API:
   ```javascript
   fetch('http://localhost:8080/api/audio-commands')
     .then(r => r.json())
     .then(console.log);
   ```
*/
