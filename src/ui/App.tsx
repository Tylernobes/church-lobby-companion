import React, { useState, useEffect } from "react";

// Declare electron API types
declare global {
  interface Window {
    electron?: {
      requestMidiDevices?: () => Promise<MidiDevice[]>;
      connectMidiDevice?: (deviceId: string) => Promise<boolean>;
      startMidiLearning?: (action: string) => Promise<boolean>;
      stopMidiLearning?: () => Promise<boolean>;
      onMidiMessage?: (callback: (event: any, message: any) => void) => void;
      removeAllListeners?: (event: string) => void;
      invoke?: (channel: string, ...args: any[]) => Promise<any>;
      openExternal?: (url: string) => Promise<void>;
    };
  }
}

interface Mapping {
  id: string;
  type: "note" | "cc";
  channel: number;
  number: number;
  action:
    | "fadeIn"
    | "fadeOut"
    | "stop"
    | "prev"
    | "playPause"
    | "next"
    | "selectAndFadeIn"
    | "launchPlaylist"
    | "launchAlbum";
  label?: string;
  seconds?: number;
  songId?: string;
  songTitle?: string;
  playlistTitle?: string;
  playlistId?: string;
  albumId?: string;
  albumTitle?: string;
  queueSongIds?: string[];
  source?: "virtual" | "hardware"; // optional for backward compatibility
  sourceType?: "virtual" | "hardware" | "unknown";
  sourceId?: string;
  sourceName?: string;
  sourceLocked?: boolean;
}

interface MidiDevice {
  id: string | number;
  name: string;
}

export default function App() {
  const SONG_PICKER_DRAFT_STORAGE_KEY = "cl_song_picker_draft_v1";
  const getActionLabel = (action: Mapping["action"]) => {
    switch (action) {
      case "fadeIn":
        return "Fade In";
      case "fadeOut":
        return "Fade Out";
      case "prev":
        return "Previous";
      case "playPause":
        return "Play/Pause";
      case "next":
        return "Next";
      case "launchPlaylist":
        return "Launch Playlist";
      case "selectAndFadeIn":
        return "Launch Song";
      case "launchAlbum":
        return "Launch Album";
      default:
        return "Stop";
    }
  };
  const getActionTone = (action: Mapping["action"]) => {
    switch (action) {
      case "fadeIn":
        return { border: "rgba(40, 167, 69, 0.5)", chip: "rgba(40, 167, 69, 0.22)", text: "#7ee09a" };
      case "fadeOut":
        return { border: "rgba(255, 193, 7, 0.55)", chip: "rgba(255, 193, 7, 0.2)", text: "#ffd04e" };
      case "stop":
        return { border: "rgba(220, 53, 69, 0.55)", chip: "rgba(220, 53, 69, 0.2)", text: "#ff7f8f" };
      case "playPause":
        return { border: "rgba(40, 167, 69, 0.45)", chip: "rgba(40, 167, 69, 0.18)", text: "#76d992" };
      case "launchPlaylist":
        return { border: "rgba(138, 43, 226, 0.6)", chip: "rgba(138, 43, 226, 0.2)", text: "#c89aff" };
      case "selectAndFadeIn":
        return { border: "rgba(255, 143, 61, 0.6)", chip: "rgba(255, 143, 61, 0.2)", text: "#ffb37a" };
      case "launchAlbum":
        return { border: "rgba(33, 150, 243, 0.6)", chip: "rgba(33, 150, 243, 0.2)", text: "#7cc7ff" };
      default:
        return { border: "rgba(23, 162, 184, 0.45)", chip: "rgba(23, 162, 184, 0.18)", text: "#77d8e8" };
    }
  };
  const getQuickActionButtonStyle = (
    action: Mapping["action"],
    disabled: boolean
  ) => {
    const tone = getActionTone(action);
    return {
      padding: "12px 14px",
      minHeight: "42px",
      backgroundColor: disabled ? "rgba(255, 255, 255, 0.1)" : tone.chip,
      color: disabled ? "rgba(255, 255, 255, 0.5)" : tone.text,
      border: disabled
        ? "1px solid rgba(255, 255, 255, 0.1)"
        : `1px solid ${tone.border}`,
      borderRadius: "10px",
      cursor: disabled ? "not-allowed" : "pointer",
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: 1.2,
      letterSpacing: "0.01em",
      textAlign: "center" as const,
      opacity: disabled ? 0.5 : 1,
      transition: "all 0.2s ease",
    };
  };
  const formatMappingSource = (mapping: Mapping) => {
    if (mapping.sourceLocked) {
      if (mapping.sourceName) return `Source: ${mapping.sourceName}`;
      if (mapping.sourceType === "virtual") return "Source: Virtual Port";
      if (mapping.sourceType === "hardware") return "Source: Hardware Device";
      return "Source: Locked Device";
    }
    return "Source: Any Device (legacy-safe)";
  };

  // Add global styles to prevent scrolling and margins
  React.useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.overflow = "hidden";
    document.body.style.background = "transparent";
    document.documentElement.style.margin = "0";
    document.documentElement.style.padding = "0";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.background = "transparent";

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [status, setStatus] = useState("");
  const [learningMode, setLearningMode] = useState<{
    action: string;
    resolve: (value: any) => void;
    duration?: number;
    songId?: string;
    songTitle?: string;
    playlistTitle?: string;
    albumTitle?: string;
    playlistId?: string;
    albumId?: string;
    queueSongIds?: string[];
  } | null>(null);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [showMidiPanel, setShowMidiPanel] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<string | null>(null);
  const [showDurationPicker, setShowDurationPicker] = useState<{
    action: string;
  } | null>(null);
  const [editingMapping, setEditingMapping] = useState<string | null>(null);
  const [customDuration, setCustomDuration] = useState<string>("");
  const [showSongPicker, setShowSongPicker] = useState<{
    action: string;
    duration?: number;
  } | null>(null);
  const [selectedSong, setSelectedSong] = useState<{
    id: string;
    title: string;
    artist?: string;
    playlistId?: string;
    albumId?: string;
    queueSongIds?: string[];
  } | null>(null);
  const [waitingForSongSelection, setWaitingForSongSelection] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState<{
    action: string;
    duration?: number;
  } | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<{
    id: string;
    title: string;
    queueSongIds?: string[];
  } | null>(null);
  const [waitingForPlaylistSelection, setWaitingForPlaylistSelection] =
    useState(false);
  const [showAlbumPicker, setShowAlbumPicker] = useState<{
    action: string;
    duration?: number;
  } | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<{
    id: string;
    title: string;
    queueSongIds?: string[];
  } | null>(null);
  const [waitingForAlbumSelection, setWaitingForAlbumSelection] =
    useState(false);
  const actionOrder: Mapping["action"][] = [
    "launchPlaylist",
    "launchAlbum",
    "selectAndFadeIn",
    "fadeIn",
    "fadeOut",
    "playPause",
    "next",
    "prev",
    "stop",
  ];
  const sortedMappings = React.useMemo(() => {
    return [...mappings].sort((a, b) => {
      const actionSort =
        actionOrder.indexOf(a.action) - actionOrder.indexOf(b.action);
      if (actionSort !== 0) return actionSort;
      const channelSort = a.channel - b.channel;
      if (channelSort !== 0) return channelSort;
      return a.number - b.number;
    });
  }, [mappings]);
  const mappingSummary = React.useMemo(() => {
    const counts = new Map<Mapping["action"], number>();
    mappings.forEach((m) => {
      counts.set(m.action, (counts.get(m.action) || 0) + 1);
    });
    return actionOrder
      .map((action) => ({ action, count: counts.get(action) || 0 }))
      .filter((entry) => entry.count > 0);
  }, [mappings]);
  const songPickerDraftHydratedRef = React.useRef(false);

  // Subscription status from iframe
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    canUseDesktopApp: boolean;
    canUseFadeControls: boolean;
    isPro: boolean;
    isSolo: boolean;
    plan: string | null;
  } | null>(null);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SONG_PICKER_DRAFT_STORAGE_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw) as {
        showSongPicker?: { action?: string; duration?: number } | null;
        selectedSong?: {
          id: string;
          title: string;
          artist?: string;
          playlistId?: string;
          albumId?: string;
          queueSongIds?: string[];
        } | null;
        waitingForSongSelection?: boolean;
        showPlaylistPicker?: { action?: string; duration?: number } | null;
        selectedPlaylist?: {
          id: string;
          title: string;
          queueSongIds?: string[];
        } | null;
        waitingForPlaylistSelection?: boolean;
        showAlbumPicker?: { action?: string; duration?: number } | null;
        selectedAlbum?: {
          id: string;
          title: string;
          queueSongIds?: string[];
        } | null;
        waitingForAlbumSelection?: boolean;
      };

      if (draft?.showSongPicker?.action === "selectAndFadeIn") {
        setShowSongPicker({
          action: "selectAndFadeIn",
          duration:
            typeof draft.showSongPicker.duration === "number"
              ? draft.showSongPicker.duration
              : undefined,
        });
      }

      if (draft?.selectedSong?.id && draft?.selectedSong?.title) {
        setSelectedSong({
          id: draft.selectedSong.id,
          title: draft.selectedSong.title,
          artist: draft.selectedSong.artist,
          playlistId: draft.selectedSong.playlistId,
          albumId: draft.selectedSong.albumId,
          queueSongIds: Array.isArray(draft.selectedSong.queueSongIds)
            ? draft.selectedSong.queueSongIds
            : undefined,
        });
      }

      if (draft?.waitingForSongSelection) {
        setWaitingForSongSelection(true);
        window.electron?.invoke?.("clui:postMessage", {
          type: "START_SONG_SELECTION_MODE",
        });
      }

      if (draft?.showPlaylistPicker?.action === "launchPlaylist") {
        setShowPlaylistPicker({
          action: "launchPlaylist",
          duration:
            typeof draft.showPlaylistPicker.duration === "number"
              ? draft.showPlaylistPicker.duration
              : undefined,
        });
      }

      if (draft?.selectedPlaylist?.id && draft?.selectedPlaylist?.title) {
        setSelectedPlaylist({
          id: draft.selectedPlaylist.id,
          title: draft.selectedPlaylist.title,
          queueSongIds: Array.isArray(draft.selectedPlaylist.queueSongIds)
            ? draft.selectedPlaylist.queueSongIds
            : undefined,
        });
      }

      if (draft?.waitingForPlaylistSelection) {
        setWaitingForPlaylistSelection(true);
        window.electron?.invoke?.("clui:postMessage", {
          type: "START_PLAYLIST_SELECTION_MODE",
        });
      }

      if (draft?.showAlbumPicker?.action === "launchAlbum") {
        setShowAlbumPicker({
          action: "launchAlbum",
          duration:
            typeof draft.showAlbumPicker.duration === "number"
              ? draft.showAlbumPicker.duration
              : undefined,
        });
      }

      if (draft?.selectedAlbum?.id && draft?.selectedAlbum?.title) {
        setSelectedAlbum({
          id: draft.selectedAlbum.id,
          title: draft.selectedAlbum.title,
          queueSongIds: Array.isArray(draft.selectedAlbum.queueSongIds)
            ? draft.selectedAlbum.queueSongIds
            : undefined,
        });
      }

      if (draft?.waitingForAlbumSelection) {
        setWaitingForAlbumSelection(true);
        window.electron?.invoke?.("clui:postMessage", {
          type: "START_ALBUM_SELECTION_MODE",
        });
      }
    } catch {}
    finally {
      songPickerDraftHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!songPickerDraftHydratedRef.current) return;

    try {
      if (!showSongPicker) {
        window.localStorage.removeItem(SONG_PICKER_DRAFT_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(
        SONG_PICKER_DRAFT_STORAGE_KEY,
        JSON.stringify({
          showSongPicker,
          selectedSong,
          waitingForSongSelection,
          showPlaylistPicker,
          selectedPlaylist,
          waitingForPlaylistSelection,
          showAlbumPicker,
          selectedAlbum,
          waitingForAlbumSelection,
        })
      );
    } catch {}
  }, [
    showSongPicker,
    selectedSong,
    waitingForSongSelection,
    showPlaylistPicker,
    selectedPlaylist,
    waitingForPlaylistSelection,
    showAlbumPicker,
    selectedAlbum,
    waitingForAlbumSelection,
  ]);

  useEffect(() => {
    window.electron
      ?.invoke?.("overlay:set-expanded", showMidiPanel)
      .catch((err) => {
        console.warn("Failed to sync overlay bounds:", err);
      });
  }, [showMidiPanel]);

  const toggleMidiPanel = () => {
    setShowMidiPanel((prev) => {
      const next = !prev;
      window.electron
        ?.invoke?.("overlay:set-expanded", next)
        .catch((err) => {
          console.warn("Failed to sync overlay bounds:", err);
        });
      return next;
    });
  };

  const loadMidiDevices = async () => {
    try {
      const deviceList = await window.electron?.invoke?.('midi:get-devices') || [];
      setDevices(deviceList);
      
      // Auto-connect to virtual port if no device selected
      if (!selectedDevice && deviceList.length > 0) {
        const virtualPort = deviceList.find((d: MidiDevice) => d.name?.toLowerCase().includes('virtual') || d.name?.toLowerCase().includes('church lobby'));
        if (virtualPort) {
          await connectToDevice(virtualPort);
        }
      }
    } catch (error) {
      console.error('Failed to load MIDI devices:', error);
      setStatus('Failed to load MIDI devices');
    }
  };

  const connectToDevice = async (device: MidiDevice) => {
    try {
      await window.electron?.invoke?.('midi:connect', device.id);
      setSelectedDevice(device.id.toString());
      setIsConnected(true);
      setCurrentDevice(device.name);
      setStatus(`Connected to ${device.name}`);
    } catch (error) {
      console.error('Failed to connect to device:', error);
      setStatus(`Failed to connect to ${device.name}`);
    }
  };

  useEffect(() => {
    // Load MIDI devices on startup
    loadMidiDevices();

    // Request subscription status from iframe
    const requestSubscriptionStatus = () => {
      window.electron?.invoke?.("clui:postMessage", {
        type: "get-subscription-status",
      });
    };

    // Initial request after short delay to ensure iframe is loaded
    const initialTimer = setTimeout(requestSubscriptionStatus, 2000);

    // Poll for subscription status every 4 hours
    const pollTimer = setInterval(requestSubscriptionStatus, 4 * 60 * 60 * 1000);

    // Also check when window gains focus (user returns from browser)
    const handleFocus = () => requestSubscriptionStatus();
    window.addEventListener("focus", handleFocus);

    // Listen for MIDI messages via postMessage (from preload)
    const handlePostMessage = (event: MessageEvent) => {
      // Handle subscription status response
      if (event.data?.type === "subscription-status") {
        console.log("📊 Received subscription status:", event.data.payload);
        setSubscriptionStatus(event.data.payload);
        setSubscriptionChecked(true);
      }

      if (event.data?.type === "midi:learning-result" && learningMode) {
        const result = event.data.payload;
        const resolvedSourceType =
          (result.sourceType as "virtual" | "hardware" | "unknown") ||
          "unknown";
        const resolvedSourceId =
          typeof result.sourceId === "string" ? result.sourceId : undefined;
        const calculatedSeconds =
          learningMode.duration ||
          (learningMode.action.includes("fade") ? 10 : undefined);

        console.log(
          `🔥 Creating new mapping with learningMode.duration=${learningMode.duration}, calculatedSeconds=${calculatedSeconds}`
        );

        const newMapping: Mapping = {
          id: `${Date.now()}-${result.number}`,
          type: (result.type as "note" | "cc") || "note",
          channel: result.channel,
          number: result.number ?? result.note,
          action: learningMode.action as any,
          seconds: calculatedSeconds,
          songId: learningMode.songId,
          songTitle: learningMode.songTitle,
          playlistTitle: learningMode.playlistTitle,
          albumTitle: learningMode.albumTitle,
          playlistId: learningMode.playlistId,
          albumId: learningMode.albumId,
          queueSongIds: learningMode.queueSongIds,
          // Tag mapping source; default to virtual if unspecified for safety
          source:
            result.sourceType === "hardware" || result.source === "hardware"
              ? "hardware"
              : "virtual",
          sourceType: resolvedSourceType,
          sourceId: resolvedSourceId,
          sourceName:
            typeof result.sourceName === "string"
              ? result.sourceName
              : undefined,
          sourceLocked:
            !!resolvedSourceId ||
            resolvedSourceType === "virtual" ||
            resolvedSourceType === "hardware",
        };

        console.log(`🔥 Created mapping:`, newMapping);

        const updatedMappings = [...mappings, newMapping];
        setMappings(updatedMappings);
        (async () => {
          try {
            await saveMappings(updatedMappings);
            const reloaded = await window.electron?.invoke?.("map:get");
            if (Array.isArray(reloaded)) setMappings(reloaded);
          } catch {}
        })();
        const what =
          (result.type === "cc"
            ? `CC${result.number}`
            : `Note${result.number ?? result.note}`) || "Message";
        setStatus(
          `✅ Mapped Ch${result.channel} ${what} → ${learningMode.action}${
            calculatedSeconds ? ` (${calculatedSeconds}s)` : ""
          }${
            result.sourceName ? ` [${result.sourceName}]` : ""
          }`
        );
        learningMode.resolve(newMapping);
        setLearningMode(null);

        // Clear selected song and waiting state after successful mapping
        setSelectedSong(null);
        setWaitingForSongSelection(false);
        setSelectedPlaylist(null);
        setWaitingForPlaylistSelection(false);
        setSelectedAlbum(null);
        setWaitingForAlbumSelection(false);
        window.electron?.invoke?.("clui:postMessage", {
          type: "STOP_SONG_SELECTION_MODE",
        });
        window.electron?.invoke?.("clui:postMessage", {
          type: "STOP_PLAYLIST_SELECTION_MODE",
        });
        window.electron?.invoke?.("clui:postMessage", {
          type: "STOP_ALBUM_SELECTION_MODE",
        });
      }

      // Handle song selection from CLUI
      if (event.data?.type === "SONG_SELECTED" && waitingForSongSelection) {
        const {
          songId,
          songTitle,
          songArtist,
          playlistId,
          albumId,
          contextType,
          contextId,
          queueSongIds,
        } = event.data;
        const selectedPlaylistId =
          playlistId || (contextType === "playlist" ? contextId : undefined);
        const selectedAlbumId =
          albumId || (contextType === "album" ? contextId : undefined);
        console.log(
          `🎵 Received song selection from CLUI: ${songTitle} by ${
            songArtist || "Unknown"
          }`
        );

        setSelectedSong({
          id: songId,
          title: songTitle,
          artist: songArtist,
          playlistId: selectedPlaylistId,
          albumId: selectedAlbumId,
          queueSongIds: Array.isArray(queueSongIds) ? queueSongIds : undefined,
        });
        setWaitingForSongSelection(false);
        window.electron?.invoke?.("clui:postMessage", {
          type: "STOP_SONG_SELECTION_MODE",
        });
      }

      if (event.data?.type === "PLAYLIST_SELECTED" && waitingForPlaylistSelection) {
        const { playlistId, playlistTitle, queueSongIds } = event.data;
        setSelectedPlaylist({
          id: playlistId,
          title: playlistTitle || "Playlist",
          queueSongIds: Array.isArray(queueSongIds)
            ? (queueSongIds as string[])
            : undefined,
        });
        setWaitingForPlaylistSelection(false);
        window.electron?.invoke?.("clui:postMessage", {
          type: "STOP_PLAYLIST_SELECTION_MODE",
        });
      }

      if (event.data?.type === "ALBUM_SELECTED" && waitingForAlbumSelection) {
        const { albumId, albumTitle, queueSongIds } = event.data;
        setSelectedAlbum({
          id: albumId,
          title: albumTitle || "Album",
          queueSongIds: Array.isArray(queueSongIds)
            ? (queueSongIds as string[])
            : undefined,
        });
        setWaitingForAlbumSelection(false);
        window.electron?.invoke?.("clui:postMessage", {
          type: "STOP_ALBUM_SELECTION_MODE",
        });
      }
    };

    window.addEventListener("message", handlePostMessage);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollTimer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("message", handlePostMessage);
      window.electron?.removeAllListeners?.("midi:message");
    };
  }, [
    learningMode,
    waitingForSongSelection,
    waitingForPlaylistSelection,
    waitingForAlbumSelection,
  ]);

  // Load saved mappings on startup
  useEffect(() => {
    loadMappings();
  }, []);

  const startLearning = (
    action: string,
    duration?: number,
    songId?: string,
    songTitle?: string,
    playlistTitle?: string,
    albumTitle?: string,
    playlistId?: string,
    albumId?: string,
    queueSongIds?: string[]
  ): Promise<any> => {
    return new Promise((resolve) => {
      setLearningMode({
        action,
        resolve,
        duration,
        songId,
        songTitle,
        playlistTitle,
        albumTitle,
        playlistId,
        albumId,
        queueSongIds,
      });
      setStatus(
        `🎓 Send a MIDI message to map to: ${action}${
          duration ? ` (${duration}s)` : ""
        }${songTitle ? ` - ${songTitle}` : ""}`
      );
      window.electron?.startMidiLearning?.(action);
    });
  };

  const stopLearning = () => {
    setLearningMode(null);
    setStatus("");
    window.electron?.stopMidiLearning?.();
  };

  const addMapping = async (action: string, duration?: number) => {
    try {
      if (action === "selectAndFadeIn") {
        // Show song picker and start listening for song selection from CLUI
        setShowSongPicker({ action, duration });
        setSelectedSong(null); // Clear any previous selection
        setWaitingForSongSelection(true);

        // Send message to CLUI to start listening for song clicks
        window.electron?.invoke?.("clui:postMessage", {
          type: "START_SONG_SELECTION_MODE",
        });
        return;
      }
      if (action === "launchPlaylist") {
        setShowPlaylistPicker({ action, duration: duration || 10 });
        setSelectedPlaylist(null);
        setWaitingForPlaylistSelection(true);
        window.electron?.invoke?.("clui:postMessage", {
          type: "START_PLAYLIST_SELECTION_MODE",
        });
        return;
      }
      if (action === "launchAlbum") {
        setShowAlbumPicker({ action, duration: duration || 10 });
        setSelectedAlbum(null);
        setWaitingForAlbumSelection(true);
        window.electron?.invoke?.("clui:postMessage", {
          type: "START_ALBUM_SELECTION_MODE",
        });
        return;
      }
      if (
        (action === "fadeIn" || action === "fadeOut") &&
        duration === undefined
      ) {
        // Show duration picker for fade actions
        setShowDurationPicker({ action });
        return;
      }
      await startLearning(action, duration);
    } catch (error) {
      setStatus("❌ Learning failed");
    }
  };

  const startMappingWithDuration = async (action: string, duration: number) => {
    setShowDurationPicker(null);
    try {
      await startLearning(action, duration);
    } catch (error) {
      setStatus("❌ Learning failed");
    }
  };

  const startSongMapping = async (
    songId: string,
    songTitle: string,
    duration: number,
    playlistId?: string,
    albumId?: string,
    queueSongIds?: string[]
  ) => {
    setShowSongPicker(null);

    // Keep the selected song visible during learning
    setStatus(
      `🎵 Selected: "${songTitle}" - Now press a MIDI key to map it (${duration}s fade)`
    );

    try {
      await startLearning(
        "selectAndFadeIn",
        duration,
        songId,
        songTitle,
        undefined,
        undefined,
        playlistId,
        albumId,
        queueSongIds
      );
    } catch (error) {
      setStatus("❌ Learning failed");
      setSelectedSong(null);
    }
  };

  const startPlaylistMapping = async (
    playlistId: string,
    playlistTitle: string,
    duration: number,
    queueSongIds?: string[]
  ) => {
    setShowPlaylistPicker(null);

    setStatus(
      `🎵 Selected playlist "${playlistTitle}" - Now press a MIDI key to map it (${duration}s fade)`
    );

    try {
      const startSongId = Array.isArray(queueSongIds)
        ? queueSongIds[0]
        : undefined;
      await startLearning(
        "launchPlaylist",
        duration,
        startSongId,
        undefined,
        playlistTitle,
        undefined,
        playlistId,
        undefined,
        queueSongIds
      );
    } catch (error) {
      setStatus("❌ Learning failed");
      setSelectedPlaylist(null);
    }
  };

  const startAlbumMapping = async (
    albumId: string,
    albumTitle: string,
    duration: number,
    queueSongIds?: string[]
  ) => {
    setShowAlbumPicker(null);

    setStatus(
      `🎵 Selected album "${albumTitle}" - Now press a MIDI key to map it (${duration}s fade)`
    );

    try {
      const startSongId = Array.isArray(queueSongIds)
        ? queueSongIds[0]
        : undefined;
      await startLearning(
        "launchAlbum",
        duration,
        startSongId,
        undefined,
        undefined,
        albumTitle,
        undefined,
        albumId,
        queueSongIds
      );
    } catch (error) {
      setStatus("❌ Learning failed");
      setSelectedAlbum(null);
    }
  };

  const removeMapping = (id: string) => {
    const updatedMappings = mappings.filter((m) => m.id !== id);
    setMappings(updatedMappings);
    saveMappings(updatedMappings);
    setStatus("✅ Mapping removed");
  };

  const updateMappingDuration = (id: string, newDuration: number) => {
    console.log(`🔥 Updating mapping ${id} duration to ${newDuration}s`);
    const updatedMappings = mappings.map((m) =>
      m.id === id ? { ...m, seconds: newDuration } : m
    );
    console.log(`🔥 Updated mappings:`, updatedMappings);
    setMappings(updatedMappings);

    // Save to persistent storage
    saveMappings(updatedMappings);
    setStatus(`✅ Duration updated to ${newDuration}s`);
  };

  const saveMappings = async (mappingsToSave: Mapping[]) => {
    try {
      console.log(`🔥 Saving mappings to storage:`, mappingsToSave);
      await window.electron?.invoke?.("map:set", mappingsToSave);
      console.log(
        `💾 Successfully saved ${mappingsToSave.length} mappings to storage`
      );
    } catch (error) {
      console.error("Failed to save mappings:", error);
      setStatus("❌ Failed to save mappings");
    }
  };

  const loadMappings = async () => {
    try {
      console.log(`🔥 Loading mappings from storage...`);
      const savedMappings = await window.electron?.invoke?.("map:get");
      console.log(`🔥 Loaded mappings from storage:`, savedMappings);
      if (savedMappings) {
        setMappings(savedMappings);
        console.log(
          `📂 Successfully loaded ${savedMappings.length} mappings from storage`
        );
      }
    } catch (error) {
      console.error("Failed to load mappings:", error);
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        overflow: "hidden",
        backgroundColor: "transparent",
        margin: 0,
        padding: 0,
      }}
    >
      {/* Floating MIDI Control Indicator */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          zIndex: 1000,
        }}
      >
        {/* Hamburger Menu Button */}
        <button
          onClick={toggleMidiPanel}
          style={{
            width: "44px",
            height: "44px",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(10px)",
            transition: "all 0.2s ease",
            boxShadow: showMidiPanel
              ? "0 4px 12px rgba(0, 0, 0, 0.4)"
              : "0 2px 6px rgba(0, 0, 0, 0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth="2"
            style={{
              transition: "transform 0.2s ease",
            }}
          >
            {showMidiPanel ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <>
                <path d="M3 12h18" />
                <path d="M3 6h18" />
                <path d="M3 18h18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Floating MIDI Control Panel */}
      {showMidiPanel && (
        <div
          style={{
            position: "fixed",
            top: "56px",
            right: "20px",
            width: "min(96vw, 760px)",
            maxHeight: "calc(100vh - 72px)",
            backgroundColor: "rgba(0, 0, 0, 0.95)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
            zIndex: 999,
            overflow: "hidden",
            animation: "slideIn 0.3s ease-out",
          }}
        >
          {/* Check subscription status */}
          {!subscriptionChecked && (
            <div style={{ padding: "20px", textAlign: "center" }}>
              <div style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "13px" }}>
                🔄 Checking subscription status...
              </div>
            </div>
          )}

          {subscriptionChecked && !subscriptionStatus?.canUseDesktopApp && (
            <div style={{ padding: "20px" }}>
              <div style={{
                backgroundColor: "rgba(138, 43, 226, 0.1)",
                border: "1px solid rgba(138, 43, 226, 0.3)",
                borderRadius: "12px",
                padding: "20px",
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: "32px",
                  marginBottom: "12px",
                }}>🎹</div>
                <div style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#8a2be2",
                  marginBottom: "8px",
                }}>
                  Pro Feature
                </div>
                <div style={{
                  fontSize: "13px",
                  color: "rgba(255, 255, 255, 0.7)",
                  marginBottom: "16px",
                  lineHeight: "1.5",
                }}>
                  MIDI control requires a Pro subscription.
                  <br />
                  Upgrade to unlock this feature.
                </div>
                <button
                  onClick={async () => {
                    console.log("Upgrade button clicked");
                    
                    // Try electron API first
                    if (window.electron?.openExternal) {
                      console.log("Using electron.openExternal");
                      await window.electron.openExternal("https://churchlobbymusic.net/profile");
                    } 
                    // Fallback: use window.open as a workaround
                    else {
                      console.log("Fallback: using window.open");
                      window.open("https://churchlobbymusic.net/profile", "_blank");
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    backgroundColor: "rgba(138, 43, 226, 0.8)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "600",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(138, 43, 226, 1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(138, 43, 226, 0.8)";
                  }}
                >
                  Upgrade to Pro
                </button>
              </div>
            </div>
          )}

          {subscriptionChecked && subscriptionStatus?.canUseDesktopApp && (
          <>
          <style>{`
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateY(-10px) scale(0.95);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
          `}</style>

          {/* Panel Content */}
          <div
            style={{
              padding: "18px",
              maxHeight: "calc(100vh - 150px)",
              overflowY: "auto",
            }}
          >
            {/* MIDI Device Selection */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "rgba(255, 255, 255, 0.9)",
                  marginBottom: "8px",
                }}
              >
                MIDI Input Device
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                }}
              >
                <select
                  value={selectedDevice}
                  onChange={(e) => {
                    const id = e.target.value;
                    const device = devices.find((d) => String(d.id) === id);
                    if (device) {
                      connectToDevice(device);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                >
                  <option value="" style={{ backgroundColor: "#1a1a1a" }}>
                    Select device...
                  </option>
                  {devices.map((device) => (
                    <option
                      key={String(device.id)}
                      value={String(device.id)}
                      style={{ backgroundColor: "#1a1a1a" }}
                    >
                      {device.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadMidiDevices}
                  style={{
                    padding: "10px 12px",
                    backgroundColor: "rgba(0, 123, 255, 0.2)",
                    color: "#66b3ff",
                    border: "1px solid rgba(0, 123, 255, 0.35)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "600",
                    minWidth: "84px",
                  }}
                >
                  Refresh
                </button>
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "11px",
                  color: isConnected
                    ? "#4cd964"
                    : "rgba(255, 255, 255, 0.6)",
                }}
              >
                {isConnected
                  ? `Connected: ${currentDevice || "Unknown device"}`
                  : "Not connected. Select a hardware device or use Virtual Port for software MIDI."}
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "rgba(255, 255, 255, 0.9)",
                  marginBottom: "8px",
                }}
              >
                Create MIDI Mapping
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "8px",
                }}
              >
                <button
                  onClick={() => addMapping("prev")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("prev", !!learningMode)}
                >
                  Previous
                </button>
                <button
                  onClick={() => addMapping("playPause")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("playPause", !!learningMode)}
                >
                  Play/Pause
                </button>
                <button
                  onClick={() => addMapping("next")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("next", !!learningMode)}
                >
                  Next
                </button>
                <button
                  onClick={() => addMapping("fadeIn")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("fadeIn", !!learningMode)}
                >
                  Fade In
                </button>
                <button
                  onClick={() => addMapping("fadeOut")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("fadeOut", !!learningMode)}
                >
                  Fade Out
                </button>
                <button
                  onClick={() => addMapping("stop")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("stop", !!learningMode)}
                >
                  Stop
                </button>
                <button
                  onClick={() => addMapping("selectAndFadeIn")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("selectAndFadeIn", !!learningMode)}
                >
                  Launch Song
                </button>
                <button
                  onClick={() => addMapping("launchPlaylist")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("launchPlaylist", !!learningMode)}
                >
                  Launch Playlist
                </button>
                <button
                  onClick={() => addMapping("launchAlbum")}
                  disabled={!!learningMode}
                  style={getQuickActionButtonStyle("launchAlbum", !!learningMode)}
                >
                  Launch Album
                </button>
              </div>
            </div>

            {/* Duration Picker */}
            {showDurationPicker && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "16px",
                  backgroundColor: "rgba(255, 193, 7, 0.1)",
                  border: "1px solid rgba(255, 193, 7, 0.3)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#ffc107",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  ⏱️ Set Fade Duration
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "rgba(255, 255, 255, 0.8)",
                    marginBottom: "10px",
                    fontWeight: "500",
                  }}
                >
                  How long should the{" "}
                  {showDurationPicker.action === "fadeIn"
                    ? "fade in"
                    : "fade out"}{" "}
                  take?
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "8px",
                    marginBottom: "10px",
                  }}
                >
                  {[3, 5, 10, 15].map((duration) => (
                    <button
                      key={duration}
                      onClick={() =>
                        startMappingWithDuration(
                          showDurationPicker.action,
                          duration
                        )
                      }
                      style={{
                        padding: "10px",
                        backgroundColor: "rgba(255, 193, 7, 0.8)",
                        color: "#000",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    marginBottom: "10px",
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="number"
                    min="0.5"
                    max="60"
                    step="0.5"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    placeholder="Custom (e.g. 8.5)"
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      border: "1px solid rgba(255, 255, 255, 0.3)",
                      borderRadius: "6px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                  <button
                    onClick={() => {
                      const duration = parseFloat(customDuration);
                      if (duration >= 0.5 && duration <= 60) {
                        startMappingWithDuration(
                          showDurationPicker.action,
                          duration
                        );
                        setCustomDuration("");
                      }
                    }}
                    disabled={
                      !customDuration ||
                      parseFloat(customDuration) < 0.5 ||
                      parseFloat(customDuration) > 60
                    }
                    style={{
                      padding: "8px 12px",
                      backgroundColor:
                        !customDuration ||
                        parseFloat(customDuration) < 0.5 ||
                        parseFloat(customDuration) > 60
                          ? "rgba(255, 255, 255, 0.1)"
                          : "rgba(40, 167, 69, 0.8)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor:
                        !customDuration ||
                        parseFloat(customDuration) < 0.5 ||
                        parseFloat(customDuration) > 60
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        !customDuration ||
                        parseFloat(customDuration) < 0.5 ||
                        parseFloat(customDuration) > 60
                          ? 0.5
                          : 1,
                      fontSize: "12px",
                      fontWeight: "600",
                    }}
                  >
                    Use
                  </button>
                </div>
                <button
                  onClick={() => setShowDurationPicker(null)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    color: "#fff",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* ... */}

            {showPlaylistPicker && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "16px",
                  backgroundColor: "rgba(102, 16, 242, 0.12)",
                  border: "1px solid rgba(102, 16, 242, 0.35)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#b089ff",
                    marginBottom: "8px",
                  }}
                >
                  📻 Select Playlist for MIDI Mapping
                </div>

                {waitingForPlaylistSelection && !selectedPlaylist && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "16px",
                      backgroundColor: "rgba(0, 123, 255, 0.1)",
                      border: "1px solid rgba(0, 123, 255, 0.3)",
                      borderRadius: "8px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#66b3ff",
                        marginBottom: "8px",
                        fontWeight: "600",
                      }}
                    >
                      🎯 Waiting for Playlist Selection
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.8)",
                      }}
                    >
                      Open the playlists tab in CLUI and click the playlist you
                      want this MIDI trigger to launch.
                    </div>
                  </div>
                )}

                {selectedPlaylist && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "12px",
                      backgroundColor: "rgba(0, 255, 0, 0.1)",
                      border: "1px solid rgba(0, 255, 0, 0.3)",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#00ff7a",
                        marginBottom: "4px",
                      }}
                    >
                      ✅ Selected Playlist:
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#fff",
                        fontWeight: "500",
                      }}
                    >
                      {selectedPlaylist.title}
                    </div>
                  </div>
                )}

                {selectedPlaylist && (
                  <div style={{ marginBottom: "16px" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.8)",
                        marginBottom: "10px",
                        fontWeight: "500",
                      }}
                    >
                      ⏱️ Choose Fade Duration:
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {[3, 5, 10, 15].map((duration) => (
                        <button
                          key={duration}
                          onClick={() =>
                            startPlaylistMapping(
                              selectedPlaylist.id,
                              selectedPlaylist.title,
                              duration,
                              selectedPlaylist.queueSongIds
                            )
                          }
                          style={{
                            padding: "10px",
                            backgroundColor: "rgba(102, 16, 242, 0.8)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(102, 16, 242, 1)";
                            e.currentTarget.style.transform =
                              "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(102, 16, 242, 0.8)";
                            e.currentTarget.style.transform = "translateY(0)";
                          }}
                        >
                          {duration}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "center",
                  }}
                >
                  <button
                    onClick={() => {
                      setShowPlaylistPicker(null);
                      setSelectedPlaylist(null);
                      setWaitingForPlaylistSelection(false);
                      setStatus("");
                      window.electron?.invoke?.("clui:postMessage", {
                        type: "STOP_PLAYLIST_SELECTION_MODE",
                      });
                    }}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#fff",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showAlbumPicker && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "16px",
                  backgroundColor: "rgba(33, 150, 243, 0.12)",
                  border: "1px solid rgba(33, 150, 243, 0.35)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#7cc7ff",
                    marginBottom: "8px",
                  }}
                >
                  💿 Select Album for MIDI Mapping
                </div>

                {waitingForAlbumSelection && !selectedAlbum && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "16px",
                      backgroundColor: "rgba(0, 123, 255, 0.1)",
                      border: "1px solid rgba(0, 123, 255, 0.3)",
                      borderRadius: "8px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#66b3ff",
                        marginBottom: "8px",
                        fontWeight: "600",
                      }}
                    >
                      🎯 Waiting for Album Selection
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.8)",
                      }}
                    >
                      Open the albums tab in CLUI and click the album you want
                      this MIDI trigger to launch.
                    </div>
                  </div>
                )}

                {selectedAlbum && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "12px",
                      backgroundColor: "rgba(0, 255, 0, 0.1)",
                      border: "1px solid rgba(0, 255, 0, 0.3)",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#00ff7a",
                        marginBottom: "4px",
                      }}
                    >
                      ✅ Selected Album:
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#fff",
                        fontWeight: "500",
                      }}
                    >
                      {selectedAlbum.title}
                    </div>
                  </div>
                )}

                {selectedAlbum && (
                  <div style={{ marginBottom: "16px" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.8)",
                        marginBottom: "10px",
                        fontWeight: "500",
                      }}
                    >
                      ⏱️ Choose Fade Duration:
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {[3, 5, 10, 15].map((duration) => (
                        <button
                          key={duration}
                          onClick={() =>
                            startAlbumMapping(
                              selectedAlbum.id,
                              selectedAlbum.title,
                              duration,
                              selectedAlbum.queueSongIds
                            )
                          }
                          style={{
                            padding: "10px",
                            backgroundColor: "rgba(33, 150, 243, 0.8)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(33, 150, 243, 1)";
                            e.currentTarget.style.transform =
                              "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(33, 150, 243, 0.8)";
                            e.currentTarget.style.transform = "translateY(0)";
                          }}
                        >
                          {duration}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "center",
                  }}
                >
                  <button
                    onClick={() => {
                      setShowAlbumPicker(null);
                      setSelectedAlbum(null);
                      setWaitingForAlbumSelection(false);
                      setStatus("");
                      window.electron?.invoke?.("clui:postMessage", {
                        type: "STOP_ALBUM_SELECTION_MODE",
                      });
                    }}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#fff",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Song Picker Modal */}
            {showSongPicker && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "16px",
                  backgroundColor: "rgba(255, 143, 61, 0.1)",
                  border: "1px solid rgba(255, 143, 61, 0.3)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#ff9b54",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  🎵 Select Song for MIDI Mapping
                </div>

                {/* Waiting for Song Selection */}
                {waitingForSongSelection && !selectedSong && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "16px",
                      backgroundColor: "rgba(0, 123, 255, 0.1)",
                      border: "1px solid rgba(0, 123, 255, 0.3)",
                      borderRadius: "8px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#007bff",
                        marginBottom: "8px",
                        fontWeight: "600",
                      }}
                    >
                      🎯 Waiting for Song Selection
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.8)",
                      }}
                    >
                      Go to CLUI and click on any song to select it for MIDI
                      mapping
                    </div>
                  </div>
                )}

                {/* Selected Song Display */}
                {selectedSong && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "12px",
                      backgroundColor: "rgba(0, 255, 0, 0.1)",
                      border: "1px solid rgba(0, 255, 0, 0.3)",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#00ff00",
                        marginBottom: "4px",
                      }}
                    >
                      ✅ Selected Song:
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#fff",
                        fontWeight: "500",
                      }}
                    >
                      {selectedSong.title}
                    </div>
                    {selectedSong.artist && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "rgba(255, 255, 255, 0.7)",
                        }}
                      >
                        by {selectedSong.artist}
                      </div>
                    )}
                  </div>
                )}

                {/* Fade Duration Selection */}
                {selectedSong && (
                  <div style={{ marginBottom: "16px" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "rgba(255, 255, 255, 0.8)",
                        marginBottom: "10px",
                        fontWeight: "500",
                      }}
                    >
                      ⏱️ Choose Fade Duration:
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {[3, 5, 10, 15].map((duration) => (
                        <button
                          key={duration}
                          onClick={() =>
                            startSongMapping(
                              selectedSong.id,
                              selectedSong.title,
                              duration,
                              selectedSong.playlistId,
                              selectedSong.albumId,
                              selectedSong.queueSongIds
                            )
                          }
                          style={{
                            padding: "10px",
                            backgroundColor: "rgba(255, 143, 61, 0.8)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(255, 143, 61, 1)";
                            e.currentTarget.style.transform =
                              "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "rgba(255, 143, 61, 0.8)";
                            e.currentTarget.style.transform = "translateY(0)";
                          }}
                        >
                          {duration}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "center",
                  }}
                >
                  <button
                    onClick={() => {
                      setShowSongPicker(null);
                      setSelectedSong(null);
                      setWaitingForSongSelection(false);
                      setStatus("");

                      // Stop listening for song selection in CLUI
                      window.electron?.invoke?.("clui:postMessage", {
                        type: "STOP_SONG_SELECTION_MODE",
                      });
                    }}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#fff",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Learning Mode Indicator */}
            {learningMode && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "12px",
                  backgroundColor: "rgba(13, 202, 240, 0.1)",
                  border: "1px solid rgba(13, 202, 240, 0.3)",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#0dcaf0",
                    marginBottom: "4px",
                  }}
                >
                  🎓 Learning Mode Active
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(255, 255, 255, 0.8)",
                    marginBottom: "8px",
                  }}
                >
                  Send a MIDI message to map to: <strong>{learningMode.action}</strong>
                </div>
                <button
                  onClick={stopLearning}
                  style={{
                    padding: "4px 8px",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    color: "#fff",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Current Mappings */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "rgba(255, 255, 255, 0.9)",
                  marginBottom: "8px",
                }}
              >
                Active Mappings ({mappings.length})
              </label>
              {mappingSummary.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginBottom: "10px",
                  }}
                >
                  {mappingSummary.map((entry) => {
                    const tone = getActionTone(entry.action);
                    return (
                      <div
                        key={entry.action}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "999px",
                          border: `1px solid ${tone.border}`,
                          backgroundColor: tone.chip,
                          color: tone.text,
                          fontSize: "10px",
                          fontWeight: "700",
                        }}
                      >
                        {getActionLabel(entry.action)}: {entry.count}
                      </div>
                    );
                  })}
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                }}
              >
                {sortedMappings.map((m) => {
                  const tone = getActionTone(m.action);
                  return (
                  <div
                    key={m.id}
                    style={{
                      padding: "10px 12px",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      borderLeft: `4px solid ${tone.border}`,
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "5px",
                      }}
                    >
                      <div
                        style={{
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border: `1px solid ${tone.border}`,
                          backgroundColor: tone.chip,
                          color: tone.text,
                          fontSize: "10px",
                          fontWeight: "700",
                        }}
                      >
                        {getActionLabel(m.action)}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "rgba(255, 255, 255, 0.8)",
                          fontWeight: "600",
                        }}
                      >
                        Ch{m.channel} {m.type === "cc" ? "CC" : "Note"}
                        {m.number}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "rgba(255, 255, 255, 0.7)",
                        marginBottom: "6px",
                        lineHeight: 1.4,
                      }}
                    >
                      {m.action === "launchPlaylist" && (
                        <>
                          <div
                            style={{
                              color: "rgba(224, 189, 255, 0.98)",
                              fontWeight: 800,
                              fontSize: "14px",
                              lineHeight: 1.25,
                              marginBottom: "3px",
                            }}
                          >
                            Target Playlist: {m.playlistTitle || "(Untitled playlist)"}
                          </div>
                        </>
                      )}
                      {m.action === "launchAlbum" && (
                        <>
                          <div
                            style={{
                              color: "rgba(124, 199, 255, 0.98)",
                              fontWeight: 800,
                              fontSize: "14px",
                              lineHeight: 1.25,
                              marginBottom: "3px",
                            }}
                          >
                            Target Album: {m.albumTitle || "(Untitled album)"}
                          </div>
                        </>
                      )}
                      {m.action === "selectAndFadeIn" && m.songTitle && (
                        <div
                          style={{
                            color: "rgba(255, 143, 61, 0.98)",
                            fontWeight: 800,
                            fontSize: "14px",
                            lineHeight: 1.25,
                            marginBottom: "3px",
                          }}
                        >
                          Target Song: {m.songTitle}
                        </div>
                      )}
                      {m.seconds && <div>{`${m.seconds}s fade`}</div>}
                    </div>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "rgba(255, 255, 255, 0.55)",
                        marginBottom: "7px",
                      }}
                    >
                      {formatMappingSource(m)}
                    </div>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {(m.action === "fadeIn" ||
                        m.action === "fadeOut" ||
                        m.action === "launchPlaylist" ||
                        m.action === "launchAlbum" ||
                        m.action === "selectAndFadeIn") && (
                        <button
                          onClick={() =>
                            setEditingMapping(
                              editingMapping === m.id ? null : m.id
                            )
                          }
                          style={{
                            padding: "2px 6px",
                            backgroundColor: "rgba(255, 193, 7, 0.8)",
                            color: "#000",
                            border: "none",
                            borderRadius: "3px",
                            fontSize: "10px",
                            cursor: "pointer",
                          }}
                        >
                          {editingMapping === m.id ? "Cancel" : "Edit Time"}
                        </button>
                      )}
                      <button
                        onClick={() => removeMapping(m.id)}
                        style={{
                          padding: "2px 6px",
                          backgroundColor: "rgba(220, 53, 69, 0.8)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "3px",
                          fontSize: "10px",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    {editingMapping === m.id && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "8px",
                          backgroundColor: "rgba(255, 193, 7, 0.1)",
                          border: "1px solid rgba(255, 193, 7, 0.3)",
                          borderRadius: "4px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "10px",
                            color: "rgba(255, 255, 255, 0.8)",
                            marginBottom: "6px",
                          }}
                        >
                          Select new duration:
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: "3px",
                            marginBottom: "6px",
                          }}
                        >
                          {[3, 5, 10, 15].map((duration) => (
                            <button
                              key={duration}
                              onClick={() => {
                                updateMappingDuration(m.id, duration);
                                setEditingMapping(null);
                              }}
                              style={{
                                padding: "3px 6px",
                                backgroundColor:
                                  duration === m.seconds
                                    ? "rgba(255, 193, 7, 1)"
                                    : "rgba(255, 193, 7, 0.6)",
                                color: "#000",
                                border: "none",
                                borderRadius: "3px",
                                cursor: "pointer",
                                fontSize: "9px",
                                fontWeight:
                                  duration === m.seconds ? "600" : "500",
                              }}
                            >
                              {duration}s
                            </button>
                          ))}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "3px",
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="number"
                            min="0.5"
                            max="60"
                            step="0.5"
                            placeholder="Custom"
                            style={{
                              flex: 1,
                              padding: "2px 4px",
                              backgroundColor: "rgba(255, 255, 255, 0.1)",
                              border: "1px solid rgba(255, 255, 255, 0.3)",
                              borderRadius: "3px",
                              color: "#fff",
                              fontSize: "9px",
                            }}
                            onKeyPress={(e) => {
                              if (e.key === "Enter") {
                                const duration = parseFloat(
                                  e.currentTarget.value
                                );
                                if (duration >= 0.5 && duration <= 60) {
                                  updateMappingDuration(m.id, duration);
                                  setEditingMapping(null);
                                  e.currentTarget.value = "";
                                }
                              }
                            }}
                          />
                          <button
                            onClick={(e) => {
                              const input =
                                e.currentTarget.parentElement?.querySelector(
                                  "input"
                                ) as HTMLInputElement;
                              const duration = parseFloat(input?.value || "0");
                              if (duration >= 0.5 && duration <= 60) {
                                updateMappingDuration(m.id, duration);
                                setEditingMapping(null);
                                if (input) input.value = "";
                              }
                            }}
                            style={{
                              padding: "2px 6px",
                              backgroundColor: "rgba(40, 167, 69, 0.8)",
                              color: "#fff",
                              border: "none",
                              borderRadius: "3px",
                              cursor: "pointer",
                              fontSize: "8px",
                            }}
                          >
                            Set
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )})}
                {mappings.length === 0 && (
                  <div
                    style={{
                      padding: "20px",
                      textAlign: "center",
                      color: "rgba(255, 255, 255, 0.5)",
                      fontSize: "12px",
                    }}
                  >
                    No mappings yet.
                    <br />
                    Create one above!
                  </div>
                )}
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}
