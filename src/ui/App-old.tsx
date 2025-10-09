import React, { useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    desktop: any;
  }
}

type Mapping = {
  id: string;
  type: "note"; // future: 'cc'
  channel: number; // default 1
  number: number; // note number
  action: "fadeIn" | "fadeOut" | "stop" | "selectAndFadeIn";
  seconds?: number; // fade seconds (default 10)
  selector?: string; // for selectAndFadeIn
  label?: string; // optional user label
};

type MidiMessage = {
  raw: number[];
  type: string;
  channel: number;
  note: number;
  velocity: number;
  timestamp: number;
};

export default function App() {
  const [inputs, setInputs] = useState<{ id: string | number; name: string }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [learningAction, setLearningAction] = useState<string | null>(null);
  const [lastMidiMessage, setLastMidiMessage] = useState<MidiMessage | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
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
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
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

  const startLearning = async (action: string) => {
    setLearningAction(action);
    setStatus(`Learning ${action}... Press a MIDI key/button now!`);
    
    try {
      const result = await window.desktop.midi.startLearning(action);
      
      if (result) {
        // Successfully learned a MIDI mapping
        const newMapping: Mapping = {
          id: `${Date.now()}-${result.note}`,
          type: "note",
          channel: result.channel,
          number: result.note,
          action: action as any,
          seconds: action === "stop" ? undefined : 10,
        };
        
        const updatedMappings = [...mappings, newMapping];
        setMappings(updatedMappings);
        await window.desktop.map.set(updatedMappings);
        setStatus(`✅ Mapped ${result.midiKey} → ${action}`);
      } else {
        setStatus("Learning cancelled or timed out");
      }
    } catch (error) {
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

  const onDeviceChange = async (val: string) => {
    setSelected(val);
    await window.desktop.settings.set({ midiInput: val });
    await window.desktop.midi.open(val === "virtual" ? "virtual" : Number(val));
    setStatus(`Connected to: ${inputs.find(i => String(i.id) === val)?.name || val}`);
  };

  const remove = async (id: string) => {
    const updatedMappings = mappings.filter((m) => m.id !== id);
    setMappings(updatedMappings);
    await window.desktop.map.set(updatedMappings);
  };

  const update = async (id: string, patch: Partial<Mapping>) => {
    const updatedMappings = mappings.map((m) => (m.id === id ? { ...m, ...patch } : m));
    setMappings(updatedMappings);
    await window.desktop.map.set(updatedMappings);
  };

  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 14,
        display: "flex",
        gap: 12,
      }}
    >
      <div style={{ width: 360 }}>
        <h2>Church Lobby Companion</h2>
        <p style={{ opacity: 0.8 }}>
          Load your site, map MIDI, and control fades without changing your
          code.
        </p>

        <h3>Device</h3>
        <select
          value={selected}
          onChange={(e) => onDeviceChange(e.target.value)}
          style={{ width: "100%" }}
        >
          {inputs.map((i) => (
            <option key={i.id} value={String(i.id)}>
              {i.name}
            </option>
          ))}
        </select>

        {/* Real-time MIDI feedback */}
        <div style={{ 
          marginTop: 10, 
          padding: 8, 
          backgroundColor: '#f0f0f0', 
          borderRadius: 4,
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <strong>Last MIDI:</strong> {lastMidiMessage ? (
            `Ch${lastMidiMessage.channel} Note${lastMidiMessage.note} Vel${lastMidiMessage.velocity} (${lastMidiMessage.raw.join(',')})`
          ) : (
            'No messages yet'
          )}
        </div>

        <h3 style={{ marginTop: 14 }}>MIDI Map</h3>
        <div style={{ display: "grid", gap: 6 }}>
          <LearnButton
            label="Fade In"
            action="fadeIn"
            isLearning={learningAction === "fadeIn"}
            onClick={() => startLearning("fadeIn")}
            onCancel={stopLearning}
          />
          <LearnButton
            label="Fade Out (pause)"
            action="fadeOut"
            isLearning={learningAction === "fadeOut"}
            onClick={() => startLearning("fadeOut")}
            onCancel={stopLearning}
          />
          <LearnButton
            label="Stop"
            action="stop"
            isLearning={learningAction === "stop"}
            onClick={() => startLearning("stop")}
            onCancel={stopLearning}
          />
          <LearnButton
            label="Select & Fade In (pick song in site)"
            action="selectAndFadeIn"
            isLearning={learningAction === "selectAndFadeIn"}
            onClick={() => startLearning("selectAndFadeIn")}
            onCancel={stopLearning}
          />
        </div>

        <h3 style={{ marginTop: 14 }}>Mappings</h3>
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {mappings.map((m) => (
            <div
              key={m.id}
              style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8 }}
            >
              <div style={{ fontWeight: 600 }}>{m.action}</div>
              <div>
                Ch{m.channel} Note{m.number}
              </div>
              {m.action !== "stop" && (
                <div>
                  Seconds:{" "}
                  <input
                    type="number"
                    min={0}
                    value={m.seconds ?? 10}
                    onChange={(e) =>
                      update(m.id, { seconds: Number(e.target.value) })
                    }
                  />
                </div>
              )}
              {m.action === "selectAndFadeIn" && (
                <div>
                  Selector:{" "}
                  <input
                    style={{ width: "100%" }}
                    value={m.selector ?? ""}
                    onChange={(e) => update(m.id, { selector: e.target.value })}
                    placeholder="CSS selector for song"
                  />
                </div>
              )}
              <div>
                Label:{" "}
                <input
                  style={{ width: "100%" }}
                  value={m.label ?? ""}
                  onChange={(e) => update(m.id, { label: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
              <button onClick={() => remove(m.id)} style={{ marginTop: 6 }}>
                Remove
              </button>
            </div>
          ))}
          {mappings.length === 0 && (
            <div style={{ opacity: 0.7 }}>No mappings yet.</div>
          )}
        </div>

        {!!status && (
          <div style={{ 
            marginTop: 10, 
            padding: 8,
            backgroundColor: status.includes('✅') ? '#d4edda' : '#fff3cd',
            borderRadius: 4
          }}>
            {status}
          </div>
        )}
      </div>

      <div style={{ flex: 1, borderLeft: "1px solid #eee", paddingLeft: 12 }}>
        <h3>Website</h3>
        <p style={{ opacity: 0.8 }}>
          The desktop window loads your live site. Use your normal UI to pick
          songs. When learning a mapping for Select & Fade In, click the song
          here; a selector will be stored.
        </p>
        <iframe
          src="https://churchlobbymusic.net"
          style={{
            width: "100%",
            height: "80vh",
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        />
      </div>
    </div>
  );
}

function LearnButton({ 
  label, 
  action, 
  isLearning, 
  onClick, 
  onCancel 
}: { 
  label: string; 
  action: string;
  isLearning: boolean;
  onClick: () => void;
  onCancel: () => void;
}) {
  if (isLearning) {
    return (
      <button 
        onClick={onCancel}
        style={{ 
          padding: "8px 10px", 
          backgroundColor: '#ff6b6b',
          color: 'white',
          animation: 'pulse 2s infinite'
        }}
      >
        🎹 Learning {label}... (click to cancel)
      </button>
    );
  }
  
  return (
    <button onClick={onClick} style={{ padding: "8px 10px" }}>
      {label}
    </button>
  );
}
