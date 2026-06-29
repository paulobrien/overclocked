/**
 * OVERCLOCKED — root component.
 *
 * Routes between the lobby (before GO) and the stage (the race). The stage is
 * the coin-op cabinet from the mockup; the lobby is the task explorer + run
 * config from §10. The phase comes from the arena store.
 */
import { useEffect } from 'react';
import { useArena } from './store/arena';
import { Lobby } from './lobby/Lobby';
import { Stage } from './stage/Stage';
import { Banner } from './stage/Banner';
import { initAudio, resumeAudio } from './audio/sfx';

export default function App() {
  const phase = useArena((s) => s.phase);

  // Lazily init audio (Howler) on first user gesture — browsers require it.
  useEffect(() => {
    const onFirstGesture = () => {
      resumeAudio();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);
    initAudio();
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  if (phase === 'lobby') {
    return (
      <main id="main-content">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <Lobby />
      </main>
    );
  }

  return (
    <main id="main-content">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Stage />
      {phase === 'ended' && <Banner />}
    </main>
  );
}
