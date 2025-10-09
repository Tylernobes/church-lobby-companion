// Church Lobby Companion Integration
// Add this to your React app to enable MIDI control

import { useMiniPlayer } from "./components/MiniPlayerContext"; // adjust path as needed
import { useEffect } from "react";

// Smooth fade functions with volume control
async function fadeInWithVolume(seconds = 10) {
  console.log(`🎵 Starting ultra-smooth fade in over ${seconds} seconds...`);

  // Get the current audio element or sound object
  const audioElement = document.querySelector("audio");
  const soundObject = window.miniPlayerCommands?.getSoundObject?.();

  try {
    // Start playing
    if (window.miniPlayerCommands?.play) {
      await window.miniPlayerCommands.play();
    }

    // Set initial volume to 0
    if (soundObject && soundObject.setVolumeAsync) {
      console.log("Using Expo AV sound object for ultra-smooth volume control");
      await soundObject.setVolumeAsync(0);

      // Ultra-smooth fade with more steps and exponential curve
      const fadeSteps = 200; // 4x more steps for smoother transition
      const stepInterval = (seconds * 1000) / fadeSteps;

      let step = 0;
      const fadeLoop = async () => {
        if (step >= fadeSteps) {
          await soundObject.setVolumeAsync(1); // Ensure we end at full volume
          console.log(
            `✅ Ultra-smooth fade in completed over ${seconds} seconds`
          );
          return;
        }

        // Exponential curve for more natural fading (slow start, faster middle, slow end)
        const progress = step / fadeSteps;
        const exponentialProgress = 1 - Math.pow(1 - progress, 2); // Ease-out curve
        const newVolume = Math.min(1, exponentialProgress);

        await soundObject.setVolumeAsync(newVolume);

        if (step % 20 === 0) {
          // Log every 20th step to reduce console spam
          console.log(
            `📈 Fade in progress: ${(progress * 100).toFixed(
              1
            )}% - volume = ${newVolume.toFixed(3)}`
          );
        }

        step++;
        setTimeout(fadeLoop, stepInterval);
      };

      fadeLoop();
    } else if (audioElement) {
      console.log("Using HTML audio element for ultra-smooth volume control");
      audioElement.volume = 0;

      const fadeSteps = 200;
      const stepInterval = (seconds * 1000) / fadeSteps;

      let step = 0;
      const fadeLoop = () => {
        if (step >= fadeSteps) {
          audioElement.volume = 1;
          console.log(
            `✅ Ultra-smooth fade in completed over ${seconds} seconds`
          );
          return;
        }

        const progress = step / fadeSteps;
        const exponentialProgress = Math.pow(progress, 3); // Cubic ease-in for gradual start, building to full
        const newVolume = Math.min(1, exponentialProgress);

        audioElement.volume = newVolume;

        if (step % 20 === 0) {
          console.log(
            `📈 Fade in progress: ${(progress * 100).toFixed(
              1
            )}% - volume = ${newVolume.toFixed(3)}`
          );
        }

        step++;
        setTimeout(fadeLoop, stepInterval);
      };

      fadeLoop();
    } else {
      console.warn("⚠️ No audio control found, using simple play");
      console.log(
        `✅ Fade in completed over ${seconds} seconds (no volume control)`
      );
    }
  } catch (error) {
    console.error("❌ Error during fade in:", error);
  }
}

async function fadeOutWithVolume(seconds = 10) {
  console.log(`🔇 Starting ultra-smooth fade out over ${seconds} seconds...`);

  // Get the current audio element or sound object
  const audioElement = document.querySelector("audio");
  const soundObject = window.miniPlayerCommands?.getSoundObject?.();

  try {
    if (
      soundObject &&
      soundObject.setVolumeAsync &&
      soundObject.getStatusAsync
    ) {
      console.log("Using Expo AV sound object for ultra-smooth volume control");

      // Get current volume
      const status = await soundObject.getStatusAsync();
      const startVolume = status?.volume || 1;
      console.log(`📊 Starting volume: ${startVolume}`);

      // Ultra-smooth fade with more steps and exponential curve
      const fadeSteps = 200; // 4x more steps for smoother transition
      const stepInterval = (seconds * 1000) / fadeSteps;

      let step = 0;
      const fadeLoop = async () => {
        if (step >= fadeSteps) {
          // Ensure absolute zero volume before pausing
          await soundObject.setVolumeAsync(0);
          console.log("🔇 Volume set to absolute zero");

          // Small delay to prevent crackling
          setTimeout(async () => {
            if (window.miniPlayerCommands?.pause) {
              await window.miniPlayerCommands.pause();
              console.log("⏸️ Audio paused after fade out");
            }
          }, 50);

          console.log(
            `✅ Ultra-smooth fade out completed over ${seconds} seconds`
          );
          return;
        }

        // Exponential curve for more natural fading (faster start, gentle end)
        const progress = step / fadeSteps;
        const exponentialProgress = 1 - Math.pow(1 - progress, 3); // Ease-out curve for gentle fade out
        const newVolume = Math.max(0, startVolume * (1 - exponentialProgress));

        await soundObject.setVolumeAsync(newVolume);

        if (step % 20 === 0) {
          // Log every 20th step to reduce console spam
          console.log(
            `📉 Fade out progress: ${(progress * 100).toFixed(
              1
            )}% - volume = ${newVolume.toFixed(3)}`
          );
        }

        step++;
        setTimeout(fadeLoop, stepInterval);
      };

      fadeLoop();
    } else if (audioElement) {
      console.log("Using HTML audio element for ultra-smooth volume control");
      const startVolume = audioElement.volume;
      console.log(`📊 Starting volume: ${startVolume}`);

      const fadeSteps = 200;
      const stepInterval = (seconds * 1000) / fadeSteps;

      let step = 0;
      const fadeLoop = () => {
        if (step >= fadeSteps) {
          // Ensure absolute zero volume before pausing
          audioElement.volume = 0;
          console.log("� Volume set to absolute zero");

          // Small delay to prevent crackling
          setTimeout(() => {
            if (window.miniPlayerCommands?.pause) {
              window.miniPlayerCommands.pause();
              console.log("⏸️ Audio paused after fade out");
            }
          }, 50);

          console.log(
            `✅ Ultra-smooth fade out completed over ${seconds} seconds`
          );
          return;
        }

        const progress = step / fadeSteps;
        const exponentialProgress = 1 - Math.pow(1 - progress, 3); // Ease-out curve for gentle fade out
        const newVolume = Math.max(0, startVolume * (1 - exponentialProgress));

        audioElement.volume = newVolume;

        if (step % 20 === 0) {
          console.log(
            `📉 Fade out progress: ${(progress * 100).toFixed(
              1
            )}% - volume = ${newVolume.toFixed(3)}`
          );
        }

        step++;
        setTimeout(fadeLoop, stepInterval);
      };

      fadeLoop();
    } else {
      console.warn("⚠️ No audio control found, using simple delay");
      setTimeout(async () => {
        if (window.miniPlayerCommands?.pause) {
          await window.miniPlayerCommands.pause();
        }
        console.log(
          `✅ Fade out completed over ${seconds} seconds (no volume control)`
        );
      }, seconds * 1000);
    }
  } catch (error) {
    console.error("❌ Error during fade out:", error);
  }
}

export function useChurchLobbyIntegration() {
  const { play, pause, seek, isPlaying, position } = useMiniPlayer();

  useEffect(() => {
    // Set up the global command interface
    window.miniPlayerCommands = {
      play,
      pause,
      seek,
      getSoundObject: () => {
        // Try to get the Expo AV sound object if available
        if (typeof window.churchLobbyPlayer?.getSoundObject === "function") {
          return window.churchLobbyPlayer.getSoundObject();
        }
        return null;
      },
      initialized: true,
    };

    console.log("Church Lobby Companion integration ready");

    // Listen for command events
    const handleChurchLobbyCommand = async (event) => {
      const { type, seconds = 10 } = event.detail || {};
      console.log("Received Church Lobby command:", type, seconds);

      switch (type) {
        case "fadeIn":
          console.log(`🎵 Executing fade in over ${seconds} seconds...`);
          await fadeInWithVolume(seconds);
          break;

        case "fadeOut":
          console.log(`🔇 Executing fade out over ${seconds} seconds...`);
          await fadeOutWithVolume(seconds);
          break;

        case "stop":
          console.log("Executing stop (pause)...");
          await pause();
          break;

        default:
          console.log("Unknown command:", type);
      }
    };

    // Listen for postMessage commands
    const handlePostMessage = (event) => {
      if (event.data?.type === "CHURCH_LOBBY_COMMAND") {
        const { command, seconds } = event.data;
        handleChurchLobbyCommand({ detail: { type: command, seconds } });
      }
    };

    // Set up all the listeners
    document.addEventListener("churchLobbyCommand", handleChurchLobbyCommand);
    window.addEventListener("churchLobbyCommand", handleChurchLobbyCommand);
    window.addEventListener("message", handlePostMessage);

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
      window.removeEventListener("message", handlePostMessage);

      if (window.miniPlayerCommands) {
        window.miniPlayerCommands.initialized = false;
      }
    };
  }, [play, pause, seek]);

  return {
    isIntegrationReady: !!window.miniPlayerCommands?.initialized,
  };
}

// Alternative: Direct function exports if you prefer not to use the hook
export function setupChurchLobbyIntegration(miniPlayerContext) {
  const { play, pause, seek } = miniPlayerContext;

  window.miniPlayerCommands = {
    play,
    pause,
    seek,
    getSoundObject: () => {
      // Try to get the Expo AV sound object if available
      if (typeof window.churchLobbyPlayer?.getSoundObject === "function") {
        return window.churchLobbyPlayer.getSoundObject();
      }
      return null;
    },
    initialized: true,
  };

  const handleCommand = async (event) => {
    const { type, seconds = 10 } = event.detail || {};

    console.log(`🔥 DEBUG: handleCommand called with:`, {
      type,
      seconds,
      eventDetail: event.detail,
    });

    switch (type) {
      case "fadeIn":
        console.log(`🎵 Executing fade in over ${seconds} seconds...`);
        await fadeInWithVolume(seconds);
        break;
      case "fadeOut":
        console.log(`🔇 Executing fade out over ${seconds} seconds...`);
        await fadeOutWithVolume(seconds);
        break;
      case "stop":
        await pause();
        break;
    }
  };

  document.addEventListener("churchLobbyCommand", handleCommand);
  window.addEventListener("message", (event) => {
    if (event.data?.type === "CHURCH_LOBBY_COMMAND") {
      handleCommand({
        detail: { type: event.data.command, seconds: event.data.seconds },
      });
    } else if (event.data?.type === "AUDIO_COMMAND") {
      // Handle MIDI commands from desktop app
      console.log(
        `🎹 Received AUDIO_COMMAND: ${event.data.command} (${event.data.seconds}s)`
      );
      console.log(`🔥 DEBUG: AUDIO_COMMAND data:`, event.data);
      handleCommand({
        detail: { type: event.data.command, seconds: event.data.seconds },
      });
    }
  });

  return () => {
    document.removeEventListener("churchLobbyCommand", handleCommand);
    window.miniPlayerCommands.initialized = false;
  };
}
