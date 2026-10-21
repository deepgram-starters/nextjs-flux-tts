"use client";
import { useRef, useState } from "react";

export default function Page() {
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const [events, setEvents] = useState([]);
  const add = (event) => setEvents((current) => [event, ...current].slice(0, 12));
  async function connect() {
    const { token } = await fetch("/api/session").then((response) => response.json());
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/api/tts?encoding=linear16&sample_rate=24000`, [`access_token.${token}`]);
    socket.binaryType = "arraybuffer";
    socket.onmessage = async (event) => {
      if (typeof event.data === "string") { add(event.data); return; }
      const context = audioRef.current || new AudioContext({ sampleRate: 24000 }); audioRef.current = context;
      const raw = new Int16Array(event.data); const buffer = context.createBuffer(1, raw.length, 24000); const channel = buffer.getChannelData(0);
      raw.forEach((sample, index) => { channel[index] = sample / 0x8000; }); const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start();
    };
    socket.onopen = () => add("Connected to Flux TTS"); socket.onerror = () => add("WebSocket error"); socketRef.current = socket;
  }
  function speak(event) { event.preventDefault(); const text = new FormData(event.currentTarget).get("text"); if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return add("Connect first"); socketRef.current.send(JSON.stringify({ type: "Speak", text })); socketRef.current.send(JSON.stringify({ type: "Flush" })); }
  return <main><p>Deepgram starter</p><h1>Stream speech as it is generated.</h1><button onClick={connect}>Connect</button><form onSubmit={speak}><textarea name="text" required placeholder="Write something to speak" /><button>Speak</button></form><pre>{events.join("\n\n") || "Connection events will appear here."}</pre></main>;
}
