"use client";

import { useEffect, useRef, useState } from "react";

const SAMPLE_RATE = 24000;

function durationSince(start) {
  if (!start) return "00:00";
  const seconds = Math.floor((Date.now() - start) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Page() {
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const sourcesRef = useRef([]);
  const nextStartRef = useRef(0);
  const startRef = useRef(null);
  const [title, setTitle] = useState("Flux Text-to-Speech");
  const [model, setModel] = useState("flux-alexis-en");
  const [text, setText] = useState("Hello! This is a test of Flux streaming text-to-speech. The audio should play smoothly as it is generated.");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("Disconnected");
  const [playbackState, setPlaybackState] = useState("Idle");
  const [transcripts, setTranscripts] = useState([]);
  const [stats, setStats] = useState({ chunks: 0, bytes: 0, queued: 0, duration: "00:00" });
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/metadata").then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.title) { setTitle(data.title); document.title = data.title; }
    }).catch(() => {});
    const clock = window.setInterval(() => setStats((current) => ({ ...current, duration: durationSince(startRef.current) })), 1000);
    return () => { window.clearInterval(clock); disconnect(); };
  }, []);

  function stopAudio() {
    sourcesRef.current.forEach((source) => { try { source.stop(); } catch {} });
    sourcesRef.current = []; nextStartRef.current = 0; setPlaybackState("Idle"); setStats((current) => ({ ...current, queued: 0 }));
  }

  function disconnect() {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "Close" }));
    socket?.close(); stopAudio(); setConnected(false); setConnecting(false); setConnectionState("Disconnected"); startRef.current = null;
  }

  function playFrame(arrayBuffer) {
    const context = audioRef.current || new AudioContext({ sampleRate: SAMPLE_RATE });
    audioRef.current = context;
    if (context.state === "suspended") context.resume();
    const samples = new Int16Array(arrayBuffer);
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    samples.forEach((sample, index) => { channel[index] = sample / 0x8000; });
    const source = context.createBufferSource();
    source.buffer = buffer; source.connect(context.destination);
    const now = context.currentTime;
    if (nextStartRef.current < now + .02) nextStartRef.current = now + .05;
    source.start(nextStartRef.current); nextStartRef.current += buffer.duration; sourcesRef.current.push(source);
    setPlaybackState("Playing");
    setStats((current) => ({ ...current, queued: Math.max(0, nextStartRef.current - now) }));
    source.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((currentSource) => currentSource !== source);
      if (sourcesRef.current.length === 0) { setPlaybackState("Idle"); setStats((current) => ({ ...current, queued: 0 })); }
    };
  }

  async function connect() {
    if (connecting || connected) return;
    setError(""); setConnecting(true); setConnectionState("Connecting");
    try {
      const sessionResponse = await fetch("/api/session");
      if (!sessionResponse.ok) throw new Error("Unable to start a session.");
      const { token } = await sessionResponse.json();
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${scheme}://${location.host}/api/tts?model=${encodeURIComponent(model.trim() || "flux-alexis-en")}&encoding=linear16&sample_rate=${SAMPLE_RATE}`, [`access_token.${token}`]);
      socket.binaryType = "arraybuffer"; socketRef.current = socket;
      socket.onopen = () => { startRef.current = Date.now(); setConnected(true); setConnecting(false); setConnectionState("Connected"); setStats({ chunks: 0, bytes: 0, queued: 0, duration: "00:00" }); };
      socket.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "SpeechStarted") setPlaybackState("Buffering");
            if (message.type === "Error") { setConnectionState("Error"); setError(message.message || message.data?.message || "Deepgram returned an error."); }
          } catch { setError("Received an unreadable server message."); }
          return;
        }
        const frame = event.data instanceof ArrayBuffer ? event.data : null;
        if (!frame) return;
        setStats((current) => ({ ...current, chunks: current.chunks + 1, bytes: current.bytes + frame.byteLength })); playFrame(frame);
      };
      socket.onerror = () => { setConnectionState("Error"); setError("WebSocket connection failed."); };
      socket.onclose = () => {
        if (socketRef.current === socket) { socketRef.current = null; stopAudio(); setConnected(false); setConnecting(false); setConnectionState("Disconnected"); startRef.current = null; }
      };
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to connect."); setConnecting(false); setConnectionState("Error");
    }
  }

  function speak() {
    const value = text.trim();
    if (!value) { setError("Enter text to synthesize."); return; }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) { setError("Connect before sending text."); return; }
    setError(""); stopAudio(); setStats((current) => ({ ...current, chunks: 0, bytes: 0 })); setPlaybackState("Buffering");
    setTranscripts((current) => [...current, { text: value, time: new Date().toLocaleTimeString() }]);
    socket.send(JSON.stringify({ type: "Speak", text: value })); socket.send(JSON.stringify({ type: "Flush" }));
  }

  return <div className="tts-app">
    <header className="tts-header"><strong>DEEPGRAM <span>{title}</span></strong><nav><a href="https://github.com/deepgram-starters" target="_blank" rel="noreferrer">GitHub</a><a className="outlined-link" href="https://console.deepgram.com" target="_blank" rel="noreferrer">Free API Key</a></nav></header>
    <div className="tts-columns">
      <aside className="tts-sidebar configuration"><h1>Configuration</h1><label>Flux Voice Model<input list="flux-voices" value={model} disabled={connected || connecting} onChange={(event) => setModel(event.target.value)} placeholder="flux-alexis-en" /><datalist id="flux-voices"><option value="flux-alexis-en" /></datalist><small>Use the format flux-voice-language, for example flux-alexis-en.</small></label><label>Text to Speak<textarea rows="9" value={text} disabled={!connected} onChange={(event) => setText(event.target.value)} placeholder="Enter text to synthesize..." /></label><button className="send-button" disabled={!connected} onClick={speak}>Send</button></aside>
      <main className="tts-main">
        {error && <div className="tts-error"><strong>Error</strong><span>{error}</span></div>}
        {!connected && <div className="tts-overlay"><div className="tts-prompt"><div className="voice-mark">VOICE</div><h2>Flux Text-to-Speech Ready</h2><p>Configure settings and connect to start streaming speech.</p><button className="connect-button" disabled={connecting} onClick={connect}>{connecting ? "Connecting..." : "Connect"}</button></div></div>}
        {connected && <button className="disconnect-button" onClick={disconnect}>Disconnect</button>}
        {transcripts.length === 0 ? <div className="tts-empty"><div>VOICE</div><p>Send text to start generating speech.</p></div> : <div className="playback-section"><div className="playback-info"><small>Current State</small><strong>{playbackState}</strong></div><div className="speech-history">{transcripts.map((item, index) => <article key={`${item.time}-${index}`}><time>{item.time}</time><p>{item.text}</p></article>)}</div></div>}
      </main>
      <aside className="tts-sidebar status"><h1>Status</h1><dl><div><dt>Connection</dt><dd className={connectionState === "Connected" ? "connected" : connectionState === "Error" ? "error" : ""}><i />{connectionState}</dd></div><div><dt>Playback State</dt><dd>{playbackState}</dd></div><div><dt>Current Model</dt><dd>{connected ? model : "-"}</dd></div><div><dt>Audio Chunks</dt><dd>{stats.chunks}</dd></div><div><dt>Bytes Received</dt><dd>{stats.bytes.toLocaleString()}</dd></div><div><dt>Buffers Queued</dt><dd>{stats.queued.toFixed(1)}s</dd></div><div><dt>Session Duration</dt><dd>{stats.duration}</dd></div></dl></aside>
    </div>
  </div>;
}
