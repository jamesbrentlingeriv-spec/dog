import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BreedStudioModal } from './components/BreedStudioModal';
import { GameHUD } from './components/GameHUD';
import { MobileControls } from './components/MobileControls';
import { RewardsModal } from './components/RewardsModal';
import { BarkshireGameEngine } from './game/engine';
import {
  BUILTIN_BREEDS,
  DogBreedConfig,
  GameHudSnapshot,
  INITIAL_REWARDS,
  SocialReward,
  WeatherMode,
} from './game/types';

const INITIAL_HUD: GameHudSnapshot = {
  zoneName: 'Barkshire Town Square',
  breedName: BUILTIN_BREEDS[0].name,
  breedId: BUILTIN_BREEDS[0].id,
  actionState: 'idle',
  speedMs: 0,
  hunger: 86,
  energy: 92,
  bladder: 28,
  treatsFound: 0,
  treatsTotal: 24,
  friendlyInteractions: 0,
  hydrantsMarked: 0,
  totalHydrants: 7,
  sniffActive: false,
  weather: 'sunny',
  autoWeather: true,
  muted: false,
  nearbyPrompt: null,
  activeSpeech: null,
  notification: {
    id: 0,
    title: 'Welcome to Barkshire',
    detail: 'WASD to roam · Shift to sprint · Drag mouse to look · Press F to sniff treats',
  },
  rewards: INITIAL_REWARDS,
  lowHungerWarning: false,
  lowEnergyWarning: false,
  needsReliefWarning: false,
  fpsMode: 'gpu',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BarkshireGameEngine | null>(null);

  const [hud, setHud] = useState<GameHudSnapshot>(INITIAL_HUD);
  const [breeds, setBreeds] = useState<DogBreedConfig[]>(BUILTIN_BREEDS);
  const [breedModalOpen, setBreedModalOpen] = useState(false);
  const [rewardsModalOpen, setRewardsModalOpen] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [transitionOverlay, setTransitionOverlay] = useState<{ fading: boolean; label?: string }>({
    fading: false,
  });
  const [mobileMode, setMobileMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (Capacitor.isNativePlatform()) return true;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return coarse || navigator.maxTouchPoints > 0 || window.innerWidth < 900;
  });

  // Initialize Three.js engine once in isolated ref container
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    let engine: BarkshireGameEngine | null = null;
    try {
      engine = new BarkshireGameEngine(
        mountEl,
        (snapshot) => setHud(snapshot),
        (lost) => setContextLost(lost),
        (fading, label) => setTransitionOverlay({ fading, label }),
      );
      engineRef.current = engine;
    } catch (err) {
      console.error('Failed to initialize BarkshireGameEngine:', err);
      setInitError(err instanceof Error ? err.message : String(err));
    }

    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleSelectBreed = useCallback((breed: DogBreedConfig) => {
    engineRef.current?.setBreed(breed).catch((err) => {
      console.error('Failed to switch breed:', err);
    });
  }, []);

  const handleAddGlbBreed = useCallback((newBreed: DogBreedConfig) => {
    setBreeds((prev) => [newBreed, ...prev]);
    engineRef.current?.setBreed(newBreed).catch((err) => {
      console.error('Failed to load GLB breed:', err);
    });
  }, []);

  const handleUpdateBreed = useCallback((updated: DogBreedConfig) => {
    setBreeds((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    engineRef.current?.updateActiveBreedSettings(updated);
  }, []);

  const handleWeatherChange = useCallback((mode: WeatherMode) => {
    engineRef.current?.setWeather(mode);
  }, []);

  const handleToggleAutoWeather = useCallback(() => {
    engineRef.current?.setAutoWeather(!hud.autoWeather);
  }, [hud.autoWeather]);

  const handleToggleEquip = useCallback((id: SocialReward['id']) => {
    engineRef.current?.toggleEquipReward(id);
  }, []);

  const handleTeleport = useCallback((landmark: 'town' | 'pet_store' | 'park' | 'pond' | 'gazebo') => {
    engineRef.current?.teleportToLandmark(landmark);
  }, []);

  const handleMobileMove = useCallback((forward: number, right: number, sprint: boolean) => {
    engineRef.current?.setVirtualInput(forward, right, sprint);
  }, []);

  const handleToggleMobileMode = useCallback(() => {
    setMobileMode((prev) => {
      if (prev) {
        engineRef.current?.setVirtualInput(0, 0, false);
      }
      return !prev;
    });
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-stone-950">
      {/* Dedicated isolated Three.js WebGL mount container */}
      <div ref={canvasMountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Smooth Interior Scene Transition Fade */}
      <div
        className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-stone-950 transition-opacity duration-200 ${
          transitionOverlay.fading ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {transitionOverlay.label && (
          <div className="font-display text-lg font-semibold text-amber-200 tracking-wide">
            {transitionOverlay.label}
          </div>
        )}
      </div>

      {/* Startup Error Banner */}
      {initError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/95 p-6 text-center">
          <div className="max-w-md space-y-2 rounded-2xl border border-red-500/40 bg-stone-900 p-6">
            <h2 className="font-display text-xl font-semibold text-red-300">
              3D Engine Initialization Error
            </h2>
            <p className="text-sm text-stone-300">{initError}</p>
          </div>
        </div>
      )}

      {/* Graceful WebGL Context Loss Banner */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/95 p-6 text-center">
          <div className="max-w-md space-y-2">
            <h2 className="font-display text-xl font-semibold text-stone-100">
              Restoring 3D Viewport
            </h2>
            <p className="text-sm text-stone-400">
              The graphics context paused briefly. Waiting for WebGL to resume automatically.
            </p>
          </div>
        </div>
      )}

      {/* Semantic DOM HUD Overlay */}
      <GameHUD
        hud={hud}
        mobileMode={mobileMode}
        onToggleMobileMode={handleToggleMobileMode}
        onBark={() => engineRef.current?.triggerBark()}
        onSniff={() => engineRef.current?.toggleSniff()}
        onPee={() => engineRef.current?.triggerPee()}
        onPoop={() => engineRef.current?.triggerPoop()}
        onInteract={() => engineRef.current?.triggerInteractOrBellyRub()}
        onRest={() => engineRef.current?.triggerRest()}
        onWeatherChange={handleWeatherChange}
        onToggleAutoWeather={handleToggleAutoWeather}
        onToggleMute={() => engineRef.current?.toggleMute()}
        onOpenBreedStudio={() => setBreedModalOpen(true)}
        onOpenRewards={() => setRewardsModalOpen(true)}
      />

      {/* Single-Joystick + Action Buttons Overlay for Android & Touch Devices */}
      {mobileMode && !breedModalOpen && !rewardsModalOpen && (
        <MobileControls
          hud={hud}
          onMove={handleMobileMove}
          onJump={() => engineRef.current?.triggerJump()}
          onBark={() => engineRef.current?.triggerBark()}
          onSniff={() => engineRef.current?.toggleSniff()}
          onInteract={() => engineRef.current?.triggerInteractOrBellyRub()}
          onPee={() => engineRef.current?.triggerPee()}
          onPoop={() => engineRef.current?.triggerPoop()}
          onRest={() => engineRef.current?.triggerRest()}
          onWeatherChange={handleWeatherChange}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onOpenBreedStudio={() => setBreedModalOpen(true)}
          onOpenRewards={() => setRewardsModalOpen(true)}
        />
      )}

      {/* Breeds & Animated GLB Studio */}
      <BreedStudioModal
        open={breedModalOpen}
        onClose={() => setBreedModalOpen(false)}
        breeds={breeds}
        activeBreedId={hud.breedId}
        onSelectBreed={handleSelectBreed}
        onAddGlbBreed={handleAddGlbBreed}
        onUpdateBreed={handleUpdateBreed}
      />

      {/* Social Rewards, Landmark Travel & Controls Modal */}
      <RewardsModal
        open={rewardsModalOpen}
        onClose={() => setRewardsModalOpen(false)}
        rewards={hud.rewards}
        friendlyInteractions={hud.friendlyInteractions}
        treatsFound={hud.treatsFound}
        treatsTotal={hud.treatsTotal}
        hydrantsMarked={hud.hydrantsMarked}
        totalHydrants={hud.totalHydrants}
        onToggleEquip={handleToggleEquip}
        onTeleport={handleTeleport}
      />
    </div>
  );
}
