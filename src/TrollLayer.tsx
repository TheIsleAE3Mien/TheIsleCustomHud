import { useEffect, useRef, useState } from "react";

import type { TrollFrame } from "./preload";

type MediaState = {
  url: string;
  mediaType: "image" | "video";
  volume: number;
  sizePct: number;
};

type MicSession = {
  ms: MediaSource;
  audio: HTMLAudioElement;
  sb: SourceBuffer | null;
  queue: Uint8Array[];
  url: string;
};

export function TrollLayer() {
  const [media, setMedia] = useState<MediaState | null>(null);
  const hideTimer = useRef<number | null>(null);
  const sounds = useRef<Set<HTMLAudioElement>>(new Set());
  const mic = useRef<MicSession | null>(null);

  useEffect(() => {
    const stopSounds = () => {
      for (const a of sounds.current) {
        try {
          a.pause();
          a.src = "";
        } catch {}
      }
      sounds.current.clear();
    };

    const stopMic = () => {
      const s = mic.current;
      mic.current = null;
      if (!s) return;
      try {
        if (s.ms.readyState === "open") s.ms.endOfStream();
      } catch {}
      try {
        s.audio.pause();
        s.audio.src = "";
        URL.revokeObjectURL(s.url);
      } catch {}
    };

    const pump = () => {
      const s = mic.current;
      if (!s || !s.sb || s.sb.updating || s.queue.length === 0) return;
      const chunk = s.queue.shift()!;
      try {
        s.sb.appendBuffer(chunk as unknown as BufferSource);
      } catch {
        return;
      }
      const a = s.audio;
      try {
        if (a.buffered.length > 0) {
          const end = a.buffered.end(a.buffered.length - 1);
          if (end - a.currentTime > 0.6) a.currentTime = end - 0.1;
        }
      } catch {}
    };

    const startMic = () => {
      stopMic();
      const ms = new MediaSource();
      const audio = new Audio();
      const url = URL.createObjectURL(ms);
      audio.src = url;
      audio.autoplay = true;
      const s: MicSession = { ms, audio, sb: null, queue: [], url };
      mic.current = s;
      ms.addEventListener("sourceopen", () => {
        if (mic.current !== s) return;
        try {
          s.sb = ms.addSourceBuffer('audio/webm; codecs="opus"');
          s.sb.addEventListener("updateend", pump);
          pump();
        } catch {}
      });
      audio.play().catch(() => {});
    };

    const offTroll = window.isleOverlay.onTroll((frame: TrollFrame) => {
      if (frame.kind === "sound" && frame.url) {
        const a = new Audio(frame.url);
        a.volume = clamp01(frame.volume ?? 1);
        a.addEventListener("ended", () => sounds.current.delete(a));
        sounds.current.add(a);
        a.play().catch(() => {});
      } else if (frame.kind === "media" && frame.url) {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        setMedia({
          url: frame.url,
          mediaType: frame.mediaType === "video" ? "video" : "image",
          volume: clamp01(frame.volume ?? 1),
          sizePct: Math.max(10, Math.min(100, frame.sizePct ?? 60)),
        });
        const dur = frame.durationMs ?? 5000;
        if (dur > 0) {
          hideTimer.current = window.setTimeout(() => setMedia(null), dur);
        }
      } else if (frame.kind === "stop") {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        setMedia(null);
        stopSounds();
        stopMic();
      } else if (frame.kind === "mic-start") {
        startMic();
      } else if (frame.kind === "mic-stop") {
        stopMic();
      }
    });

    const offAudio = window.isleOverlay.onTrollAudio((chunk: Uint8Array) => {
      const s = mic.current;
      if (!s) return;
      s.queue.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
      pump();
    });

    return () => {
      offTroll();
      offAudio();
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      stopSounds();
      stopMic();
    };
  }, []);

  if (!media) return null;

  return (
    <div className="trollLayer">
      {media.mediaType === "video" ? (
        <video
          className="trollMedia"
          src={media.url}
          autoPlay
          style={{ width: `${media.sizePct}vw`, height: "auto" }}
          ref={(el) => {
            if (el) el.volume = media.volume;
          }}
        />
      ) : (
        <img
          className="trollMedia"
          src={media.url}
          alt=""
          style={{ width: `${media.sizePct}vw`, height: "auto" }}
        />
      )}
    </div>
  );
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
