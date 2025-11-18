"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
function App() {
    // Determine and track which CLUI URL to load in the iframe (dev/prod with fallback)
    const [iframeSrc, setIframeSrc] = (0, react_1.useState)("about:blank");
    // Helper: probe a URL quickly to see if it's reachable
    const probeUrl = async (url, timeoutMs = 1500) => {
        try {
            // Use fetch no-cors; network errors will reject, reachable hosts will resolve
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), timeoutMs);
            await fetch(url, {
                mode: "no-cors",
                cache: "no-store",
                signal: ctrl.signal,
            });
            clearTimeout(t);
            return true;
        }
        catch {
            return false;
        }
    };
    // Decide which URL to use for the embedded CLUI app
    (0, react_1.useEffect)(() => {
        const decide = async () => {
            const prod = "https://clui.expo.app";
            // Allow manual override stored locally (handy for custom tunnels)
            const manual = localStorage.getItem("clui_iframe_url");
            if (manual && (await probeUrl(manual))) {
                setIframeSrc(manual);
                return;
            }
            // When running the Electron renderer via Vite dev server (protocol !== file:),
            // prefer local Expo web dev servers. Fallback to production if offline.
            if (window.location.protocol !== "file:") {
                const candidates = [
                    "http://localhost:19006/",
                    "http://127.0.0.1:19006/",
                    "http://localhost:8081/",
                    "http://127.0.0.1:8081/",
                ];
                for (const base of candidates) {
                    if (await probeUrl(base)) {
                        setIframeSrc(base.replace(/\/$/, ""));
                        return;
                    }
                }
                // Last-resort dev URL (was previously hardcoded exp.direct). Skip if offline.
                const previousTunnel = "https://wc19uzo-anonymous-8081.exp.direct";
                if (await probeUrl(previousTunnel)) {
                    setIframeSrc(previousTunnel);
                    return;
                }
                // Fall back to production
                setIframeSrc(prod);
                return;
            }
            // Packaged app (file:): always use production
            setIframeSrc(prod);
        };
        decide();
    }, []);
    // Add global styles to prevent scrolling and margins
    react_1.default.useEffect(() => {
        document.body.style.margin = "0";
        document.body.style.padding = "0";
        document.body.style.overflow = "hidden";
        document.documentElement.style.margin = "0";
        document.documentElement.style.padding = "0";
        document.documentElement.style.overflow = "hidden";
        return () => {
            // Cleanup on unmount
            document.body.style.overflow = "";
            document.documentElement.style.overflow = "";
        };
    }, []);
    const [mappings, setMappings] = (0, react_1.useState)([]);
    const [status, setStatus] = (0, react_1.useState)("");
    const [learningMode, setLearningMode] = (0, react_1.useState)(null);
    const [devices, setDevices] = (0, react_1.useState)([]);
    const [selectedDevice, setSelectedDevice] = (0, react_1.useState)("");
    const [showMidiPanel, setShowMidiPanel] = (0, react_1.useState)(false);
    const [isConnected, setIsConnected] = (0, react_1.useState)(false);
    const [currentDevice, setCurrentDevice] = (0, react_1.useState)(null);
    const [showDurationPicker, setShowDurationPicker] = (0, react_1.useState)(null);
    const [editingMapping, setEditingMapping] = (0, react_1.useState)(null);
    const [customDuration, setCustomDuration] = (0, react_1.useState)("");
    const [showSongPicker, setShowSongPicker] = (0, react_1.useState)(null);
    const [selectedSong, setSelectedSong] = (0, react_1.useState)(null);
    const [waitingForSongSelection, setWaitingForSongSelection] = (0, react_1.useState)(false);
    const loadMidiDevices = async () => {
        try {
            const deviceList = await window.electron?.invoke?.('midi:get-devices') || [];
            setDevices(deviceList);
            // Auto-connect to virtual port if no device selected
            if (!selectedDevice && deviceList.length > 0) {
                const virtualPort = deviceList.find((d) => d.name?.toLowerCase().includes('virtual') || d.name?.toLowerCase().includes('church lobby'));
                if (virtualPort) {
                    await connectToDevice(virtualPort);
                }
            }
        }
        catch (error) {
            console.error('Failed to load MIDI devices:', error);
            setStatus('Failed to load MIDI devices');
        }
    };
    const connectToDevice = async (device) => {
        try {
            await window.electron?.invoke?.('midi:connect', device.id);
            setSelectedDevice(device.id.toString());
            setIsConnected(true);
            setCurrentDevice(device.name);
            setStatus(`Connected to ${device.name}`);
        }
        catch (error) {
            console.error('Failed to connect to device:', error);
            setStatus(`Failed to connect to ${device.name}`);
        }
    };
    (0, react_1.useEffect)(() => {
        // Load MIDI devices on startup
        loadMidiDevices();
        // Listen for MIDI messages via postMessage (from preload)
        const handlePostMessage = (event) => {
            if (event.data?.type === "midi:learning-result" && learningMode) {
                const result = event.data.payload;
                const calculatedSeconds = learningMode.duration ||
                    (learningMode.action.includes("fade") ? 10 : undefined);
                console.log(`🔥 Creating new mapping with learningMode.duration=${learningMode.duration}, calculatedSeconds=${calculatedSeconds}`);
                const newMapping = {
                    id: `${Date.now()}-${result.number}`,
                    type: result.type || "note",
                    channel: result.channel,
                    number: result.number ?? result.note,
                    action: learningMode.action,
                    seconds: calculatedSeconds,
                    songId: learningMode.songId,
                    songTitle: learningMode.songTitle,
                    // Tag mapping source; default to virtual if unspecified for safety
                    source: result.source === "hardware"
                        ? "hardware"
                        : result.source || "virtual",
                };
                console.log(`🔥 Created mapping:`, newMapping);
                const updatedMappings = [...mappings, newMapping];
                setMappings(updatedMappings);
                (async () => {
                    try {
                        await saveMappings(updatedMappings);
                        const reloaded = await window.electron?.invoke?.("map:get");
                        if (Array.isArray(reloaded))
                            setMappings(reloaded);
                    }
                    catch { }
                })();
                const what = (result.type === "cc"
                    ? `CC${result.number}`
                    : `Note${result.number ?? result.note}`) || "Message";
                setStatus(`✅ Mapped Ch${result.channel} ${what} → ${learningMode.action}${calculatedSeconds ? ` (${calculatedSeconds}s)` : ""}`);
                learningMode.resolve(newMapping);
                setLearningMode(null);
                // Clear selected song and waiting state after successful mapping
                setSelectedSong(null);
                setWaitingForSongSelection(false);
            }
            // Handle song selection from CLUI
            if (event.data?.type === "SONG_SELECTED" && waitingForSongSelection) {
                const { songId, songTitle, songArtist } = event.data;
                console.log(`🎵 Received song selection from CLUI: ${songTitle} by ${songArtist || "Unknown"}`);
                setSelectedSong({
                    id: songId,
                    title: songTitle,
                    artist: songArtist,
                });
                setWaitingForSongSelection(false);
            }
        };
        window.addEventListener("message", handlePostMessage);
        return () => {
            window.removeEventListener("message", handlePostMessage);
            window.electron?.removeAllListeners?.("midi:message");
        };
    }, [learningMode, waitingForSongSelection]);
    // Load saved mappings on startup
    (0, react_1.useEffect)(() => {
        loadMappings();
    }, []);
    const startLearning = (action, duration, songId, songTitle) => {
        return new Promise((resolve) => {
            setLearningMode({ action, resolve, duration, songId, songTitle });
            setStatus(`🎓 Send a MIDI message to map to: ${action}${duration ? ` (${duration}s)` : ""}${songTitle ? ` - ${songTitle}` : ""}`);
            window.electron?.startMidiLearning?.(action);
        });
    };
    const stopLearning = () => {
        setLearningMode(null);
        setStatus("");
        window.electron?.stopMidiLearning?.();
    };
    const addMapping = async (action, duration) => {
        try {
            if (action === "selectAndFadeIn") {
                // Show song picker and start listening for song selection from CLUI
                setShowSongPicker({ action, duration });
                setSelectedSong(null); // Clear any previous selection
                setWaitingForSongSelection(true);
                // Send message to CLUI to start listening for song clicks
                const iframe = document.querySelector("iframe");
                if (iframe && iframe.contentWindow) {
                    const targetOrigin = (() => {
                        try {
                            return new URL(iframeSrc).origin;
                        }
                        catch {
                            return "*";
                        }
                    })();
                    iframe.contentWindow.postMessage({ type: "START_SONG_SELECTION_MODE" }, targetOrigin);
                }
                return;
            }
            if ((action === "fadeIn" || action === "fadeOut") &&
                duration === undefined) {
                // Show duration picker for fade actions
                setShowDurationPicker({ action });
                return;
            }
            await startLearning(action, duration);
        }
        catch (error) {
            setStatus("❌ Learning failed");
        }
    };
    const startMappingWithDuration = async (action, duration) => {
        setShowDurationPicker(null);
        try {
            await startLearning(action, duration);
        }
        catch (error) {
            setStatus("❌ Learning failed");
        }
    };
    const startSongMapping = async (songId, songTitle, duration) => {
        setShowSongPicker(null);
        // Keep the selected song visible during learning
        setStatus(`🎵 Selected: "${songTitle}" - Now press a MIDI key to map it (${duration}s fade)`);
        try {
            await startLearning("selectAndFadeIn", duration, songId, songTitle);
        }
        catch (error) {
            setStatus("❌ Learning failed");
            setSelectedSong(null);
        }
    };
    const removeMapping = (id) => {
        const updatedMappings = mappings.filter((m) => m.id !== id);
        setMappings(updatedMappings);
        saveMappings(updatedMappings);
        setStatus("✅ Mapping removed");
    };
    const updateMappingDuration = (id, newDuration) => {
        console.log(`🔥 Updating mapping ${id} duration to ${newDuration}s`);
        const updatedMappings = mappings.map((m) => m.id === id ? { ...m, seconds: newDuration } : m);
        console.log(`🔥 Updated mappings:`, updatedMappings);
        setMappings(updatedMappings);
        // Save to persistent storage
        saveMappings(updatedMappings);
        setStatus(`✅ Duration updated to ${newDuration}s`);
    };
    const saveMappings = async (mappingsToSave) => {
        try {
            console.log(`🔥 Saving mappings to storage:`, mappingsToSave);
            await window.electron?.invoke?.("map:set", mappingsToSave);
            console.log(`💾 Successfully saved ${mappingsToSave.length} mappings to storage`);
        }
        catch (error) {
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
                console.log(`📂 Successfully loaded ${savedMappings.length} mappings from storage`);
            }
        }
        catch (error) {
            console.error("Failed to load mappings:", error);
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { style: {
            width: "100vw",
            height: "100vh",
            position: "fixed",
            top: 0,
            left: 0,
            overflow: "hidden",
            backgroundColor: "#000",
            margin: 0,
            padding: 0,
        }, children: [(0, jsx_runtime_1.jsx)("iframe", { id: "website-iframe", src: iframeSrc, style: {
                    width: "100%",
                    height: "100%",
                    border: "0",
                    margin: 0,
                    padding: 0,
                    backgroundColor: "#000",
                    display: "block",
                }, frameBorder: "0", scrolling: "no", seamless: true }), (0, jsx_runtime_1.jsx)("div", { style: {
                    position: "fixed",
                    top: "20px",
                    right: "20px",
                    zIndex: 1000,
                }, children: (0, jsx_runtime_1.jsx)("button", { onClick: () => setShowMidiPanel(!showMidiPanel), style: {
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
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                    }, children: (0, jsx_runtime_1.jsx)("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(255, 255, 255, 0.9)", strokeWidth: "2", style: {
                            transition: "transform 0.2s ease",
                        }, children: showMidiPanel ? ((0, jsx_runtime_1.jsx)("path", { d: "M18 6L6 18M6 6l12 12" })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("path", { d: "M3 12h18" }), (0, jsx_runtime_1.jsx)("path", { d: "M3 6h18" }), (0, jsx_runtime_1.jsx)("path", { d: "M3 18h18" })] })) }) }) }), showMidiPanel && ((0, jsx_runtime_1.jsxs)("div", { style: {
                    position: "fixed",
                    top: "80px",
                    right: "20px",
                    width: "320px",
                    maxHeight: "calc(100vh - 120px)",
                    backgroundColor: "rgba(0, 0, 0, 0.95)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
                    zIndex: 999,
                    overflow: "hidden",
                    animation: "slideIn 0.3s ease-out",
                }, children: [(0, jsx_runtime_1.jsx)("style", { children: `
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
          ` }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            padding: "20px",
                            maxHeight: "calc(100vh - 220px)",
                            overflowY: "auto",
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { marginBottom: "20px" }, children: (0, jsx_runtime_1.jsxs)("div", { style: {
                                        padding: "12px",
                                        backgroundColor: "rgba(0, 123, 255, 0.1)",
                                        border: "1px solid rgba(0, 123, 255, 0.3)",
                                        borderRadius: "8px",
                                    }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                fontSize: "12px",
                                                color: "#007bff",
                                                fontWeight: "600",
                                                marginBottom: "6px",
                                            }, children: "\uD83D\uDCA1 Software MIDI Integration" }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                fontSize: "11px",
                                                color: "rgba(255, 255, 255, 0.9)",
                                                lineHeight: "1.4",
                                            }, children: "Configure your software (Ableton, ProPresenter, etc.) to send MIDI to \"Church Lobby Companion\". Create mappings below, then trigger them from your software." })] }) }), (0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: "20px" }, children: [(0, jsx_runtime_1.jsx)("label", { style: {
                                            display: "block",
                                            fontSize: "13px",
                                            fontWeight: "500",
                                            color: "rgba(255, 255, 255, 0.9)",
                                            marginBottom: "8px",
                                        }, children: "Create MIDI Mapping" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: "8px",
                                        }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => addMapping("fadeIn"), disabled: !!learningMode, style: {
                                                    padding: "12px 16px",
                                                    backgroundColor: learningMode
                                                        ? "rgba(255, 255, 255, 0.1)"
                                                        : "rgba(40, 167, 69, 0.2)",
                                                    color: learningMode
                                                        ? "rgba(255, 255, 255, 0.5)"
                                                        : "#28a745",
                                                    border: learningMode
                                                        ? "1px solid rgba(255, 255, 255, 0.1)"
                                                        : "1px solid rgba(40, 167, 69, 0.3)",
                                                    borderRadius: "8px",
                                                    cursor: learningMode ? "not-allowed" : "pointer",
                                                    fontSize: "13px",
                                                    fontWeight: "600",
                                                    opacity: learningMode ? 0.5 : 1,
                                                    transition: "all 0.2s ease",
                                                }, children: "Fade In" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => addMapping("fadeOut"), disabled: !!learningMode, style: {
                                                    padding: "12px 16px",
                                                    backgroundColor: learningMode
                                                        ? "rgba(255, 255, 255, 0.1)"
                                                        : "rgba(255, 193, 7, 0.2)",
                                                    color: learningMode
                                                        ? "rgba(255, 255, 255, 0.5)"
                                                        : "#ffc107",
                                                    border: learningMode
                                                        ? "1px solid rgba(255, 255, 255, 0.1)"
                                                        : "1px solid rgba(255, 193, 7, 0.3)",
                                                    borderRadius: "8px",
                                                    cursor: learningMode ? "not-allowed" : "pointer",
                                                    fontSize: "13px",
                                                    fontWeight: "600",
                                                    opacity: learningMode ? 0.5 : 1,
                                                    transition: "all 0.2s ease",
                                                }, children: "Fade Out" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => addMapping("stop"), disabled: !!learningMode, style: {
                                                    padding: "12px 16px",
                                                    backgroundColor: learningMode
                                                        ? "rgba(255, 255, 255, 0.1)"
                                                        : "rgba(220, 53, 69, 0.2)",
                                                    color: learningMode
                                                        ? "rgba(255, 255, 255, 0.5)"
                                                        : "#dc3545",
                                                    border: learningMode
                                                        ? "1px solid rgba(255, 255, 255, 0.1)"
                                                        : "1px solid rgba(220, 53, 69, 0.3)",
                                                    borderRadius: "8px",
                                                    cursor: learningMode ? "not-allowed" : "pointer",
                                                    fontSize: "13px",
                                                    fontWeight: "600",
                                                    opacity: learningMode ? 0.5 : 1,
                                                    transition: "all 0.2s ease",
                                                }, children: "Stop" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => addMapping("selectAndFadeIn"), disabled: !!learningMode, style: {
                                                    padding: "12px 16px",
                                                    backgroundColor: learningMode
                                                        ? "rgba(255, 255, 255, 0.1)"
                                                        : "rgba(138, 43, 226, 0.2)",
                                                    color: learningMode
                                                        ? "rgba(255, 255, 255, 0.5)"
                                                        : "#8a2be2",
                                                    border: learningMode
                                                        ? "1px solid rgba(255, 255, 255, 0.1)"
                                                        : "1px solid rgba(138, 43, 226, 0.3)",
                                                    borderRadius: "8px",
                                                    cursor: learningMode ? "not-allowed" : "pointer",
                                                    fontSize: "13px",
                                                    fontWeight: "600",
                                                    opacity: learningMode ? 0.5 : 1,
                                                    transition: "all 0.2s ease",
                                                }, children: "Select Song & Fade In" })] })] }), showDurationPicker && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    marginBottom: "20px",
                                    padding: "12px",
                                    backgroundColor: "rgba(255, 193, 7, 0.1)",
                                    border: "1px solid rgba(255, 193, 7, 0.3)",
                                    borderRadius: "8px",
                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            fontSize: "12px",
                                            fontWeight: "600",
                                            color: "#ffc107",
                                            marginBottom: "8px",
                                        }, children: "\u23F1\uFE0F Set Fade Duration" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                            fontSize: "11px",
                                            color: "rgba(255, 255, 255, 0.8)",
                                            marginBottom: "12px",
                                        }, children: ["How long should the", " ", showDurationPicker.action === "fadeIn"
                                                ? "fade in"
                                                : "fade out", " ", "take?"] }), (0, jsx_runtime_1.jsx)("div", { style: {
                                            display: "grid",
                                            gridTemplateColumns: "repeat(4, 1fr)",
                                            gap: "6px",
                                            marginBottom: "8px",
                                        }, children: [3, 5, 10, 15].map((duration) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => startMappingWithDuration(showDurationPicker.action, duration), style: {
                                                padding: "6px 8px",
                                                backgroundColor: "rgba(255, 193, 7, 0.8)",
                                                color: "#000",
                                                border: "none",
                                                borderRadius: "4px",
                                                cursor: "pointer",
                                                fontSize: "11px",
                                                fontWeight: "500",
                                            }, children: [duration, "s"] }, duration))) }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                            marginBottom: "8px",
                                            display: "flex",
                                            gap: "6px",
                                            alignItems: "center",
                                        }, children: [(0, jsx_runtime_1.jsx)("input", { type: "number", min: "0.5", max: "60", step: "0.5", value: customDuration, onChange: (e) => setCustomDuration(e.target.value), placeholder: "Custom (e.g. 8.5)", style: {
                                                    flex: 1,
                                                    padding: "4px 6px",
                                                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                                                    border: "1px solid rgba(255, 255, 255, 0.3)",
                                                    borderRadius: "4px",
                                                    color: "#fff",
                                                    fontSize: "11px",
                                                } }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                                    const duration = parseFloat(customDuration);
                                                    if (duration >= 0.5 && duration <= 60) {
                                                        startMappingWithDuration(showDurationPicker.action, duration);
                                                        setCustomDuration("");
                                                    }
                                                }, disabled: !customDuration ||
                                                    parseFloat(customDuration) < 0.5 ||
                                                    parseFloat(customDuration) > 60, style: {
                                                    padding: "4px 8px",
                                                    backgroundColor: !customDuration ||
                                                        parseFloat(customDuration) < 0.5 ||
                                                        parseFloat(customDuration) > 60
                                                        ? "rgba(255, 255, 255, 0.1)"
                                                        : "rgba(40, 167, 69, 0.8)",
                                                    color: "#fff",
                                                    border: "none",
                                                    borderRadius: "4px",
                                                    cursor: !customDuration ||
                                                        parseFloat(customDuration) < 0.5 ||
                                                        parseFloat(customDuration) > 60
                                                        ? "not-allowed"
                                                        : "pointer",
                                                    fontSize: "11px",
                                                    opacity: !customDuration ||
                                                        parseFloat(customDuration) < 0.5 ||
                                                        parseFloat(customDuration) > 60
                                                        ? 0.5
                                                        : 1,
                                                }, children: "Use" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setShowDurationPicker(null), style: {
                                            padding: "4px 8px",
                                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                                            color: "#fff",
                                            border: "1px solid rgba(255, 255, 255, 0.2)",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                            fontSize: "11px",
                                        }, children: "Cancel" })] })), showSongPicker && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    marginBottom: "20px",
                                    padding: "16px",
                                    backgroundColor: "rgba(138, 43, 226, 0.1)",
                                    border: "1px solid rgba(138, 43, 226, 0.3)",
                                    borderRadius: "12px",
                                    backdropFilter: "blur(10px)",
                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            fontSize: "14px",
                                            fontWeight: "600",
                                            color: "#8a2be2",
                                            marginBottom: "8px",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                        }, children: "\uD83C\uDFB5 Select Song for MIDI Mapping" }), waitingForSongSelection && !selectedSong && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                            marginBottom: "16px",
                                            padding: "16px",
                                            backgroundColor: "rgba(0, 123, 255, 0.1)",
                                            border: "1px solid rgba(0, 123, 255, 0.3)",
                                            borderRadius: "8px",
                                            textAlign: "center",
                                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                    fontSize: "13px",
                                                    color: "#007bff",
                                                    marginBottom: "8px",
                                                    fontWeight: "600",
                                                }, children: "\uD83C\uDFAF Waiting for Song Selection" }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                    fontSize: "12px",
                                                    color: "rgba(255, 255, 255, 0.8)",
                                                }, children: "Go to CLUI and click on any song to select it for MIDI mapping" })] })), selectedSong && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                            marginBottom: "16px",
                                            padding: "12px",
                                            backgroundColor: "rgba(0, 255, 0, 0.1)",
                                            border: "1px solid rgba(0, 255, 0, 0.3)",
                                            borderRadius: "8px",
                                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                    fontSize: "12px",
                                                    fontWeight: "600",
                                                    color: "#00ff00",
                                                    marginBottom: "4px",
                                                }, children: "\u2705 Selected Song:" }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                    fontSize: "13px",
                                                    color: "#fff",
                                                    fontWeight: "500",
                                                }, children: selectedSong.title }), selectedSong.artist && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                                    fontSize: "11px",
                                                    color: "rgba(255, 255, 255, 0.7)",
                                                }, children: ["by ", selectedSong.artist] }))] })), selectedSong && ((0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: "16px" }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                    fontSize: "12px",
                                                    color: "rgba(255, 255, 255, 0.8)",
                                                    marginBottom: "10px",
                                                    fontWeight: "500",
                                                }, children: "\u23F1\uFE0F Choose Fade Duration:" }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                    display: "grid",
                                                    gridTemplateColumns: "repeat(4, 1fr)",
                                                    gap: "8px",
                                                }, children: [3, 5, 10, 15].map((duration) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => startSongMapping(selectedSong.id, selectedSong.title, duration), style: {
                                                        padding: "10px",
                                                        backgroundColor: "rgba(138, 43, 226, 0.8)",
                                                        color: "#fff",
                                                        border: "none",
                                                        borderRadius: "6px",
                                                        cursor: "pointer",
                                                        fontSize: "12px",
                                                        fontWeight: "600",
                                                        transition: "all 0.2s ease",
                                                    }, onMouseEnter: (e) => {
                                                        e.currentTarget.style.backgroundColor =
                                                            "rgba(138, 43, 226, 1)";
                                                        e.currentTarget.style.transform =
                                                            "translateY(-1px)";
                                                    }, onMouseLeave: (e) => {
                                                        e.currentTarget.style.backgroundColor =
                                                            "rgba(138, 43, 226, 0.8)";
                                                        e.currentTarget.style.transform = "translateY(0)";
                                                    }, children: [duration, "s"] }, duration))) })] })), (0, jsx_runtime_1.jsx)("div", { style: {
                                            display: "flex",
                                            gap: "8px",
                                            justifyContent: "center",
                                        }, children: (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                                setShowSongPicker(null);
                                                setSelectedSong(null);
                                                setWaitingForSongSelection(false);
                                                setStatus("");
                                                // Stop listening for song selection in CLUI
                                                const iframe = document.querySelector("iframe");
                                                if (iframe && iframe.contentWindow) {
                                                    const targetOrigin = (() => {
                                                        try {
                                                            return new URL(iframeSrc).origin;
                                                        }
                                                        catch {
                                                            return "*";
                                                        }
                                                    })();
                                                    iframe.contentWindow.postMessage({ type: "STOP_SONG_SELECTION_MODE" }, targetOrigin);
                                                }
                                            }, style: {
                                                padding: "8px 16px",
                                                backgroundColor: "rgba(255, 255, 255, 0.1)",
                                                color: "#fff",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                borderRadius: "6px",
                                                cursor: "pointer",
                                                fontSize: "12px",
                                            }, children: "Cancel" }) })] })), learningMode && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    marginBottom: "20px",
                                    padding: "12px",
                                    backgroundColor: "rgba(13, 202, 240, 0.1)",
                                    border: "1px solid rgba(13, 202, 240, 0.3)",
                                    borderRadius: "8px",
                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            fontSize: "12px",
                                            fontWeight: "600",
                                            color: "#0dcaf0",
                                            marginBottom: "4px",
                                        }, children: "\uD83C\uDF93 Learning Mode Active" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                            fontSize: "11px",
                                            color: "rgba(255, 255, 255, 0.8)",
                                            marginBottom: "8px",
                                        }, children: ["Send a MIDI message to map to: ", (0, jsx_runtime_1.jsx)("strong", { children: learningMode.action })] }), (0, jsx_runtime_1.jsx)("button", { onClick: stopLearning, style: {
                                            padding: "4px 8px",
                                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                                            color: "#fff",
                                            border: "1px solid rgba(255, 255, 255, 0.2)",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                            fontSize: "11px",
                                        }, children: "Cancel" })] })), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("label", { style: {
                                            display: "block",
                                            fontSize: "13px",
                                            fontWeight: "500",
                                            color: "rgba(255, 255, 255, 0.9)",
                                            marginBottom: "8px",
                                        }, children: ["Active Mappings (", mappings.length, ")"] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                            display: "grid",
                                            gap: "8px",
                                            maxHeight: "200px",
                                            overflowY: "auto",
                                        }, children: [mappings.map((m) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                                    padding: "10px 12px",
                                                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                                    borderRadius: "6px",
                                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                            fontSize: "12px",
                                                            fontWeight: "600",
                                                            color: "#fff",
                                                            marginBottom: "4px",
                                                        }, children: m.action === "fadeIn"
                                                            ? "Fade In"
                                                            : m.action === "fadeOut"
                                                                ? "Fade Out"
                                                                : m.action === "selectAndFadeIn"
                                                                    ? "Select Song & Fade In"
                                                                    : "Stop" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                                            fontSize: "11px",
                                                            color: "rgba(255, 255, 255, 0.7)",
                                                            marginBottom: "6px",
                                                        }, children: ["Ch", m.channel, " Note", m.number, m.seconds && ` • ${m.seconds}s`, m.songTitle && ` • ${m.songTitle}`] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: "4px" }, children: [(m.action === "fadeIn" ||
                                                                m.action === "fadeOut" ||
                                                                m.action === "selectAndFadeIn") && ((0, jsx_runtime_1.jsx)("button", { onClick: () => setEditingMapping(editingMapping === m.id ? null : m.id), style: {
                                                                    padding: "2px 6px",
                                                                    backgroundColor: "rgba(255, 193, 7, 0.8)",
                                                                    color: "#000",
                                                                    border: "none",
                                                                    borderRadius: "3px",
                                                                    fontSize: "10px",
                                                                    cursor: "pointer",
                                                                }, children: editingMapping === m.id ? "Cancel" : "Edit Time" })), (0, jsx_runtime_1.jsx)("button", { onClick: () => removeMapping(m.id), style: {
                                                                    padding: "2px 6px",
                                                                    backgroundColor: "rgba(220, 53, 69, 0.8)",
                                                                    color: "#fff",
                                                                    border: "none",
                                                                    borderRadius: "3px",
                                                                    fontSize: "10px",
                                                                    cursor: "pointer",
                                                                }, children: "Remove" })] }), editingMapping === m.id && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                                            marginTop: "8px",
                                                            padding: "8px",
                                                            backgroundColor: "rgba(255, 193, 7, 0.1)",
                                                            border: "1px solid rgba(255, 193, 7, 0.3)",
                                                            borderRadius: "4px",
                                                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                                    fontSize: "10px",
                                                                    color: "rgba(255, 255, 255, 0.8)",
                                                                    marginBottom: "6px",
                                                                }, children: "Select new duration:" }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                                    display: "grid",
                                                                    gridTemplateColumns: "repeat(4, 1fr)",
                                                                    gap: "3px",
                                                                    marginBottom: "6px",
                                                                }, children: [3, 5, 10, 15].map((duration) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => {
                                                                        updateMappingDuration(m.id, duration);
                                                                        setEditingMapping(null);
                                                                    }, style: {
                                                                        padding: "3px 6px",
                                                                        backgroundColor: duration === m.seconds
                                                                            ? "rgba(255, 193, 7, 1)"
                                                                            : "rgba(255, 193, 7, 0.6)",
                                                                        color: "#000",
                                                                        border: "none",
                                                                        borderRadius: "3px",
                                                                        cursor: "pointer",
                                                                        fontSize: "9px",
                                                                        fontWeight: duration === m.seconds ? "600" : "500",
                                                                    }, children: [duration, "s"] }, duration))) }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                                                    display: "flex",
                                                                    gap: "3px",
                                                                    alignItems: "center",
                                                                }, children: [(0, jsx_runtime_1.jsx)("input", { type: "number", min: "0.5", max: "60", step: "0.5", placeholder: "Custom", style: {
                                                                            flex: 1,
                                                                            padding: "2px 4px",
                                                                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                                                                            border: "1px solid rgba(255, 255, 255, 0.3)",
                                                                            borderRadius: "3px",
                                                                            color: "#fff",
                                                                            fontSize: "9px",
                                                                        }, onKeyPress: (e) => {
                                                                            if (e.key === "Enter") {
                                                                                const duration = parseFloat(e.currentTarget.value);
                                                                                if (duration >= 0.5 && duration <= 60) {
                                                                                    updateMappingDuration(m.id, duration);
                                                                                    setEditingMapping(null);
                                                                                    e.currentTarget.value = "";
                                                                                }
                                                                            }
                                                                        } }), (0, jsx_runtime_1.jsx)("button", { onClick: (e) => {
                                                                            const input = e.currentTarget.parentElement?.querySelector("input");
                                                                            const duration = parseFloat(input?.value || "0");
                                                                            if (duration >= 0.5 && duration <= 60) {
                                                                                updateMappingDuration(m.id, duration);
                                                                                setEditingMapping(null);
                                                                                if (input)
                                                                                    input.value = "";
                                                                            }
                                                                        }, style: {
                                                                            padding: "2px 6px",
                                                                            backgroundColor: "rgba(40, 167, 69, 0.8)",
                                                                            color: "#fff",
                                                                            border: "none",
                                                                            borderRadius: "3px",
                                                                            cursor: "pointer",
                                                                            fontSize: "8px",
                                                                        }, children: "Set" })] })] }))] }, m.id))), mappings.length === 0 && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                                    padding: "20px",
                                                    textAlign: "center",
                                                    color: "rgba(255, 255, 255, 0.5)",
                                                    fontSize: "12px",
                                                }, children: ["No mappings yet.", (0, jsx_runtime_1.jsx)("br", {}), "Create one above!"] }))] })] })] })] }))] }));
}
