/**
 * ClipPlayer — renders a "video"-modality scenario.
 *
 * Two honest views of the SAME clip: the keyframe FLIPBOOK (the exact stills the
 * model is handed — Cerebras's Gemma ingests text + images, so a clip is sampled
 * to frames) and the composited MP4 (the smooth "line camera" source). Inline
 * thumbnails flipbook the keyframes; the lightbox plays the mp4. Falls back to
 * the flipbook when no mp4 is present, so the UI works even if ffmpeg wasn't
 * available at asset-gen time.
 */
import { useEffect, useState } from 'react';

interface ClipPlayerProps {
  frames?: string[];
  videoUrl?: string;
  className?: string;
  /** Flipbook rate (frames/sec) when showing keyframes. */
  fps?: number;
  /** Prefer the smooth composited mp4 over the keyframe flipbook. */
  preferVideo?: boolean;
  alt?: string;
}

export function ClipPlayer({ frames, videoUrl, className, fps = 4, preferVideo = false, alt = 'conveyor clip' }: ClipPlayerProps) {
  const [i, setI] = useState(0);
  const useVideo = preferVideo && !!videoUrl;

  useEffect(() => {
    if (useVideo || !frames || frames.length < 2) return;
    setI(0);
    const id = window.setInterval(() => setI((x) => (x + 1) % frames.length), Math.max(120, 1000 / fps));
    return () => window.clearInterval(id);
  }, [useVideo, frames, fps]);

  if (useVideo) {
    return <video src={videoUrl} className={className} autoPlay loop muted playsInline aria-label={alt} />;
  }
  if (!frames?.length) return null;
  return <img src={frames[Math.min(i, frames.length - 1)]} alt={alt} className={className} />;
}
