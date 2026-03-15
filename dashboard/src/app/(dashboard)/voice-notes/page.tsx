"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface VoiceNote {
  id: string;
  filename: string;
  duration: number | null;
  tags: string[];
  transcript: string | null;
  r2Url: string;
  createdAt: string;
}

// ── Tag input ────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 items-center min-h-[42px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 bg-indigo-500/20 text-indigo-300 text-xs font-medium px-2 py-1 rounded-md">
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-red-400 transition-colors">×</button>
        </span>
      ))}
      <input
        type="text" value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !input && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={add}
        placeholder={tags.length === 0 ? "Add tags… press Enter" : ""}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-gray-500 outline-none"
      />
    </div>
  );
}

// ── Waveform bars ────────────────────────────────────────────────────────────
function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-8">
      {Array.from({ length: 28 }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full transition-all"
          style={{
            backgroundColor: active ? "#818cf8" : "#374151",
            height: active ? `${8 + ((i * 13 + 7) % 24)}px` : "4px",
            animation: active ? "pulse-bar 0.9s ease-in-out infinite" : "none",
            animationDelay: `${(i * 40) % 600}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ── Audio preview player ─────────────────────────────────────────────────────
function AudioPreview({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const a = ref.current!;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl p-3">
      <audio
        ref={ref} src={src}
        onTimeUpdate={() => setProgress(ref.current!.currentTime)}
        onLoadedMetadata={() => setDuration(ref.current!.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button
        id="preview-play"
        onClick={toggle}
        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 transition-all"
      >
        {playing ? (
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 truncate mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <input
            type="range" min={0} max={duration || 1} step={0.1} value={progress}
            onChange={(e) => { ref.current!.currentTime = +e.target.value; setProgress(+e.target.value); }}
            className="flex-1 h-1 accent-indigo-500 cursor-pointer"
          />
          <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
            {fmt(progress)} / {fmt(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function VoiceNotesPage() {
  const { token } = useAuth();

  // Recording
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ready audio (from either record or upload)
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<"record" | "upload" | null>(null);

  // Drag & drop
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared
  const [tags, setTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // History
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [search, setSearch] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const histAudioRef = useRef<HTMLAudioElement | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const res = await fetch(
        `${API}/api/voice-notes${search ? `?search=${encodeURIComponent(search)}` : ""}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setNotes(await res.json());
    } finally { setLoadingNotes(false); }
  }, [token, search]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // ── Set ready audio (replaces previous) ────────────────────────────────────
  const setReady = (file: File, url: string, source: "record" | "upload") => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(file);
    setAudioUrl(url);
    setAudioSource(source);
    setUploadMsg(null);
  };

  const discard = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(null);
    setAudioUrl(null);
    setAudioSource(null);
    setElapsed(0);
    setUploadMsg(null);
  };

  // ── Recording ───────────────────────────────────────────────────────────────
  const startRecording = async () => {
    discard();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    mr.start();
    mediaRecorderRef.current = mr;
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current!;
    clearInterval(timerRef.current!);
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: "audio/webm" });
      setReady(file, URL.createObjectURL(blob), "record");
    };
    mr.stop();
    mr.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
  };

  // ── File pick / drop ────────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    if (!file.type.startsWith("audio/")) return;
    setReady(file, URL.createObjectURL(file), "upload");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!audioFile) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", audioFile);
      fd.append("tags", JSON.stringify(tags));
      const res = await fetch(`${API}/api/voice-notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      setUploadMsg({ text: "Uploaded and transcribed successfully", ok: true });
      discard();
      setTags([]);
      fetchNotes();
    } catch (err: any) {
      setUploadMsg({ text: err.message, ok: false });
    } finally {
      setUploading(false);
    }
  };

  // ── History playback ────────────────────────────────────────────────────────
  const toggleHistPlay = async (note: VoiceNote) => {
    if (playingId === note.id) {
      histAudioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    histAudioRef.current?.pause();
    const res = await fetch(`${API}/api/voice-notes/${note.id}/audio`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { url } = await res.json();
    const audio = new Audio(url);
    histAudioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(note.id);
  };

  const deleteNote = async (id: string) => {
    await fetch(`${API}/api/voice-notes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchNotes();
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="h-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Voice Notes</h1>
        <p className="text-sm text-gray-500 mt-1">Record or upload audio — AI transcribes for the content pipeline</p>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* ── LEFT 60% ─────────────────────────────────────────────────────── */}
        <div className="w-[60%] flex flex-col gap-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-6">

            {/* ── Recorder ────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Record</h2>
              <div className="flex items-center gap-5">
                <button
                  id="record-btn"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={uploading}
                  className={`flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                    recording
                      ? "bg-red-500 hover:bg-red-400 ring-4 ring-red-500/30"
                      : "bg-indigo-600 hover:bg-indigo-500 hover:scale-105"
                  }`}
                >
                  {recording ? (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm0 16a7 7 0 007-7h2a9 9 0 01-8 8.94V21h-2v-2.06A9 9 0 013 10h2a7 7 0 007 7z"/>
                    </svg>
                  )}
                </button>
                <div className="flex-1">
                  <Waveform active={recording} />
                  <p className="text-2xl font-mono text-white mt-1.5 tabular-nums">{fmt(elapsed)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {recording ? "Recording… click stop when done" : "Click mic to start recording"}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Divider ─────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-600 font-medium">OR</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            {/* ── Upload / Drop ────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Upload File</h2>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer transition-all ${
                  dragOver
                    ? "border-indigo-400 bg-indigo-500/10"
                    : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/40"
                }`}
              >
                <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0l-3 3m3-3l3 3M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                </svg>
                <p className="text-sm text-gray-400">
                  {dragOver ? "Drop to upload" : "Drag & drop or click to browse"}
                </p>
                <p className="text-xs text-gray-600">.webm · .wav · .mp3 · .m4a · .ogg · .flac — up to 100 MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                className="hidden"
              />
            </div>

            {/* ── Playback + Discard (shown when audio is ready) ───────────── */}
            {audioUrl && !recording && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-xs text-gray-600 font-medium">REVIEW</span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-400">
                      {audioSource === "record" ? "🎙 Recorded audio" : `📁 ${audioFile?.name}`}
                    </p>
                    <button
                      id="discard-btn"
                      onClick={discard}
                      className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                      Discard
                    </button>
                  </div>
                  <AudioPreview src={audioUrl} label={audioSource === "record" ? `Recording (${fmt(elapsed)})` : audioFile?.name ?? ""} />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Tags <span className="text-gray-600">— type and press Enter</span>
                  </label>
                  <TagInput tags={tags} onChange={setTags} />
                </div>

                {uploadMsg && (
                  <p className={`text-xs font-medium ${uploadMsg.ok ? "text-green-400" : "text-red-400"}`}>
                    {uploadMsg.ok ? "✓" : "✕"} {uploadMsg.text}
                  </p>
                )}

                <button
                  id="submit-btn"
                  onClick={submit}
                  disabled={uploading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Uploading & transcribing…
                    </>
                  ) : (
                    "Upload & Transcribe"
                  )}
                </button>
              </>
            )}

            {/* Success msg when no audio loaded */}
            {!audioUrl && uploadMsg?.ok && (
              <p className="text-xs font-medium text-green-400">✓ {uploadMsg.text}</p>
            )}
          </div>
        </div>

        {/* ── RIGHT 40% ─────────────────────────────────────────────────────── */}
        <div className="w-[40%] bg-gray-900 border border-gray-800 rounded-xl flex flex-col min-h-0">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white mb-3">Voice Note History</h2>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text" placeholder="Search transcripts…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
            {loadingNotes ? (
              <div className="p-6 text-center text-gray-500 text-sm">Loading…</div>
            ) : notes.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-600 text-sm">No voice notes yet</p>
                <p className="text-gray-700 text-xs mt-1">Record or upload one to get started</p>
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="p-4 hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500">
                          {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        {note.duration && <span className="text-xs text-gray-600">{fmt(note.duration)}</span>}
                      </div>
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {note.tags.map((t) => (
                            <span key={t} className="text-xs bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 line-clamp-2">
                        {note.transcript || <span className="italic text-gray-600">Transcribing…</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        id={`play-${note.id}`}
                        onClick={() => toggleHistPlay(note)}
                        className={`p-1.5 rounded-lg transition-all ${
                          playingId === note.id ? "text-indigo-400 bg-indigo-500/20" : "text-gray-500 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        {playingId === note.id ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        )}
                      </button>
                      <button
                        id={`delete-${note.id}`}
                        onClick={() => deleteNote(note.id)}
                        className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m5 0V4h4v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-bar {
          0%, 100% { transform: scaleY(0.35); opacity: 0.6; }
          50% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
