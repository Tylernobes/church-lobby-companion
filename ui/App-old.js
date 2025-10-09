"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
function App() {
    const [inputs, setInputs] = (0, react_1.useState)([]);
    const [selected, setSelected] = (0, react_1.useState)("");
    const [mappings, setMappings] = (0, react_1.useState)([]);
    const [learningAction, setLearningAction] = (0, react_1.useState)(null);
    const [lastMidiMessage, setLastMidiMessage] = (0, react_1.useState)(null);
    const [status, setStatus] = (0, react_1.useState)("");
    (0, react_1.useEffect)(() => {
        (async () => {
            const list = await window.desktop.midi.list();
            console.log("MIDI inputs:", list);
            setInputs(list);
            const saved = await window.desktop.map.get();
            setMappings(saved);
            const prefs = await window.desktop.settings.get();
            const sel = prefs?.midiInput ?? "virtual";
            setSelected(sel);
            await window.desktop.midi.open(sel === "virtual" ? "virtual" : Number(sel));
        })();
    }, []);
    // Listen for real-time MIDI messages
    (0, react_1.useEffect)(() => {
        const handleWindowMessage = (event) => {
            if (event.data?.type === 'midi:message') {
                const message = event.data.payload;
                console.log("Received MIDI message in UI:", message);
                setLastMidiMessage(message);
            }
        };
        window.addEventListener('message', handleWindowMessage);
        return () => {
            window.removeEventListener('message', handleWindowMessage);
        };
    }, []);
    const startLearning = async (action) => {
        setLearningAction(action);
        setStatus(`Learning ${action}... Press a MIDI key/button now!`);
        try {
            const result = await window.desktop.midi.startLearning(action);
            if (result) {
                // Successfully learned a MIDI mapping
                const newMapping = {
                    id: `${Date.now()}-${result.note}`,
                    type: "note",
                    channel: result.channel,
                    number: result.note,
                    action: action,
                    seconds: action === "stop" ? undefined : 10,
                };
                const updatedMappings = [...mappings, newMapping];
                setMappings(updatedMappings);
                await window.desktop.map.set(updatedMappings);
                setStatus(`✅ Mapped ${result.midiKey} → ${action}`);
            }
            else {
                setStatus("Learning cancelled or timed out");
            }
        }
        catch (error) {
            console.error("Learning error:", error);
            setStatus("Learning failed");
        }
        setLearningAction(null);
    };
    const stopLearning = async () => {
        if (learningAction) {
            await window.desktop.midi.stopLearning();
            setLearningAction(null);
            setStatus("Learning cancelled");
        }
    };
    const onDeviceChange = async (val) => {
        setSelected(val);
        await window.desktop.settings.set({ midiInput: val });
        await window.desktop.midi.open(val === "virtual" ? "virtual" : Number(val));
        setStatus(`Connected to: ${inputs.find(i => String(i.id) === val)?.name || val}`);
    };
    const remove = async (id) => {
        const updatedMappings = mappings.filter((m) => m.id !== id);
        setMappings(updatedMappings);
        await window.desktop.map.set(updatedMappings);
    };
    const update = async (id, patch) => {
        const updatedMappings = mappings.map((m) => (m.id === id ? { ...m, ...patch } : m));
        setMappings(updatedMappings);
        await window.desktop.map.set(updatedMappings);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { style: {
            fontFamily: "Inter, system-ui, sans-serif",
            padding: 14,
            display: "flex",
            gap: 12,
        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { width: 360 }, children: [(0, jsx_runtime_1.jsx)("h2", { children: "Church Lobby Companion" }), (0, jsx_runtime_1.jsx)("p", { style: { opacity: 0.8 }, children: "Load your site, map MIDI, and control fades without changing your code." }), (0, jsx_runtime_1.jsx)("h3", { children: "Device" }), (0, jsx_runtime_1.jsx)("select", { value: selected, onChange: (e) => onDeviceChange(e.target.value), style: { width: "100%" }, children: inputs.map((i) => ((0, jsx_runtime_1.jsx)("option", { value: String(i.id), children: i.name }, i.id))) }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            marginTop: 10,
                            padding: 8,
                            backgroundColor: '#f0f0f0',
                            borderRadius: 4,
                            fontSize: '12px',
                            fontFamily: 'monospace'
                        }, children: [(0, jsx_runtime_1.jsx)("strong", { children: "Last MIDI:" }), " ", lastMidiMessage ? (`Ch${lastMidiMessage.channel} Note${lastMidiMessage.note} Vel${lastMidiMessage.velocity} (${lastMidiMessage.raw.join(',')})`) : ('No messages yet')] }), (0, jsx_runtime_1.jsx)("h3", { style: { marginTop: 14 }, children: "MIDI Map" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "grid", gap: 6 }, children: [(0, jsx_runtime_1.jsx)(LearnButton, { label: "Fade In", action: "fadeIn", isLearning: learningAction === "fadeIn", onClick: () => startLearning("fadeIn"), onCancel: stopLearning }), (0, jsx_runtime_1.jsx)(LearnButton, { label: "Fade Out (pause)", action: "fadeOut", isLearning: learningAction === "fadeOut", onClick: () => startLearning("fadeOut"), onCancel: stopLearning }), (0, jsx_runtime_1.jsx)(LearnButton, { label: "Stop", action: "stop", isLearning: learningAction === "stop", onClick: () => startLearning("stop"), onCancel: stopLearning }), (0, jsx_runtime_1.jsx)(LearnButton, { label: "Select & Fade In (pick song in site)", action: "selectAndFadeIn", isLearning: learningAction === "selectAndFadeIn", onClick: () => startLearning("selectAndFadeIn"), onCancel: stopLearning })] }), (0, jsx_runtime_1.jsx)("h3", { style: { marginTop: 14 }, children: "Mappings" }), (0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 8, display: "grid", gap: 6 }, children: [mappings.map((m) => ((0, jsx_runtime_1.jsxs)("div", { style: { border: "1px solid #ddd", borderRadius: 8, padding: 8 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600 }, children: m.action }), (0, jsx_runtime_1.jsxs)("div", { children: ["Ch", m.channel, " Note", m.number] }), m.action !== "stop" && ((0, jsx_runtime_1.jsxs)("div", { children: ["Seconds:", " ", (0, jsx_runtime_1.jsx)("input", { type: "number", min: 0, value: m.seconds ?? 10, onChange: (e) => update(m.id, { seconds: Number(e.target.value) }) })] })), m.action === "selectAndFadeIn" && ((0, jsx_runtime_1.jsxs)("div", { children: ["Selector:", " ", (0, jsx_runtime_1.jsx)("input", { style: { width: "100%" }, value: m.selector ?? "", onChange: (e) => update(m.id, { selector: e.target.value }), placeholder: "CSS selector for song" })] })), (0, jsx_runtime_1.jsxs)("div", { children: ["Label:", " ", (0, jsx_runtime_1.jsx)("input", { style: { width: "100%" }, value: m.label ?? "", onChange: (e) => update(m.id, { label: e.target.value }), placeholder: "Optional description" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => remove(m.id), style: { marginTop: 6 }, children: "Remove" })] }, m.id))), mappings.length === 0 && ((0, jsx_runtime_1.jsx)("div", { style: { opacity: 0.7 }, children: "No mappings yet." }))] }), !!status && ((0, jsx_runtime_1.jsx)("div", { style: {
                            marginTop: 10,
                            padding: 8,
                            backgroundColor: status.includes('✅') ? '#d4edda' : '#fff3cd',
                            borderRadius: 4
                        }, children: status }))] }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, borderLeft: "1px solid #eee", paddingLeft: 12 }, children: [(0, jsx_runtime_1.jsx)("h3", { children: "Website" }), (0, jsx_runtime_1.jsx)("p", { style: { opacity: 0.8 }, children: "The desktop window loads your live site. Use your normal UI to pick songs. When learning a mapping for Select & Fade In, click the song here; a selector will be stored." }), (0, jsx_runtime_1.jsx)("iframe", { src: "https://churchlobbymusic.net", style: {
                            width: "100%",
                            height: "80vh",
                            border: "1px solid #ddd",
                            borderRadius: 8,
                        } })] })] }));
}
function LearnButton({ label, action, isLearning, onClick, onCancel }) {
    if (isLearning) {
        return ((0, jsx_runtime_1.jsxs)("button", { onClick: onCancel, style: {
                padding: "8px 10px",
                backgroundColor: '#ff6b6b',
                color: 'white',
                animation: 'pulse 2s infinite'
            }, children: ["\uD83C\uDFB9 Learning ", label, "... (click to cancel)"] }));
    }
    return ((0, jsx_runtime_1.jsx)("button", { onClick: onClick, style: { padding: "8px 10px" }, children: label }));
}
