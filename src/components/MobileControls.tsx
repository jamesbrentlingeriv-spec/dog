import React, { useRef, useState } from 'react';
import {
  ArrowUp,
  Award,
  Dog,
  Droplets,
  Heart,
  Megaphone,
  Menu,
  Moon,
  Search,
  Sparkles,
  Sun,
  Sunset,
  CloudRain,
  Wind,
  Volume2,
  VolumeX,
  X,
  DoorOpen,
} from 'lucide-react';
import type { GameHudSnapshot, WeatherMode } from '../game/types';

interface MobileControlsProps {
  hud: GameHudSnapshot;
  onMove: (forward: number, right: number, sprint: boolean) => void;
  onJump: () => void;
  onBark: () => void;
  onSniff: () => void;
  onInteract: () => void;
  onPee: () => void;
  onPoop: () => void;
  onRest: () => void;
  onWeatherChange: (mode: WeatherMode) => void;
  onToggleMute: () => void;
  onOpenBreedStudio: () => void;
  onOpenRewards: () => void;
}

const WEATHER_MODES: { mode: WeatherMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'sunny', label: 'Sunny', icon: <Sun className="w-3.5 h-3.5" /> },
  { mode: 'sunset', label: 'Sunset', icon: <Sunset className="w-3.5 h-3.5" /> },
  { mode: 'rain', label: 'Rain', icon: <CloudRain className="w-3.5 h-3.5" /> },
  { mode: 'autumn', label: 'Autumn', icon: <Wind className="w-3.5 h-3.5" /> },
];

export const MobileControls: React.FC<MobileControlsProps> = ({
  hud,
  onMove,
  onJump,
  onBark,
  onSniff,
  onInteract,
  onPee,
  onPoop,
  onRest,
  onWeatherChange,
  onToggleMute,
  onOpenBreedStudio,
  onOpenRewards,
}) => {
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyPointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number; active: boolean; sprint: boolean }>({
    x: 0,
    y: 0,
    active: false,
    sprint: false,
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const MAX_RADIUS = 46; // px deflection radius inside 128px base

  const updateStickFromClient = (clientX: number, clientY: number) => {
    const el = joyBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, MAX_RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = clampedDist > 0 ? Math.cos(angle) * clampedDist : 0;
    const ky = clampedDist > 0 ? Math.sin(angle) * clampedDist : 0;

    const normMag = clampedDist / MAX_RADIUS;
    if (normMag < 0.09) {
      setKnob({ x: kx, y: ky, active: true, sprint: false });
      onMove(0, 0, false);
      return;
    }

    const forward = -ky / MAX_RADIUS;
    const right = kx / MAX_RADIUS;
    const isSprint = normMag > 0.82;
    setKnob({ x: kx, y: ky, active: true, sprint: isSprint });
    onMove(forward, right, isSprint);
  };

  const resetStick = () => {
    joyPointerIdRef.current = null;
    setKnob({ x: 0, y: 0, active: false, sprint: false });
    onMove(0, 0, false);
  };

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== null) return;
    e.stopPropagation();
    joyPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateStickFromClient(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointerIdRef.current) return;
    e.stopPropagation();
    updateStickFromClient(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointerIdRef.current) return;
    e.stopPropagation();
    resetStick();
  };

  // Context-aware primary interaction button state
  const prompt = hud.nearbyPrompt;
  const handleContextAction = () => {
    if (prompt?.action === 'pee_mark') {
      onPee();
    } else {
      onInteract();
    }
  };

  const contextLabel =
    prompt?.action === 'enter_store'
      ? 'Enter'
      : prompt?.action === 'exit_store'
        ? 'Exit'
        : prompt?.action === 'pet'
          ? 'Pet'
          : prompt?.action === 'pee_mark'
            ? 'Mark'
            : 'Belly';

  const contextIcon =
    prompt?.action === 'enter_store' || prompt?.action === 'exit_store' ? (
      <DoorOpen className="w-5 h-5" />
    ) : prompt?.action === 'pee_mark' ? (
      <Droplets className="w-5 h-5" />
    ) : prompt ? (
      <Sparkles className="w-5 h-5" />
    ) : (
      <Heart className="w-5 h-5 text-rose-400" />
    );

  return (
    <>
      {/* Top-Right Compact Quick-Menu Pill (Breeds, Teleport/Rewards, Extra Dog Needs, Weather) */}
      <div
        className="pointer-events-auto fixed top-3 right-3 z-20 flex items-center gap-2"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <button
          type="button"
          onClick={onOpenBreedStudio}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-amber-500 active:bg-amber-400 text-stone-950 text-xs font-bold shadow-lg cursor-pointer"
        >
          <Dog className="w-4 h-4" />
          <span>Breeds</span>
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="p-2.5 rounded-full bg-stone-950/90 border border-stone-700/90 text-stone-100 shadow-lg active:bg-stone-800 cursor-pointer"
          aria-label="Open dog menu"
        >
          {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Compact Popover Drawer for Secondary Dog Needs, Rewards & Weather */}
      {menuOpen && (
        <div
          className="pointer-events-auto fixed top-14 right-3 z-30 w-64 rounded-2xl bg-stone-950/95 border border-stone-700/90 p-3.5 shadow-2xl space-y-3 text-stone-100"
          style={{ marginRight: 'env(safe-area-inset-right, 0px)' }}
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenRewards();
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 active:bg-stone-800 border border-stone-700 text-xs font-semibold"
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              Rewards & Map
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 active:bg-stone-800 border border-stone-700 text-xs font-semibold"
            >
              {hud.muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              {hud.muted ? 'Muted' : 'Sound On'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-stone-800">
            <button
              type="button"
              onClick={() => {
                onPee();
                setMenuOpen(false);
              }}
              className="flex flex-col items-center gap-1 py-2 rounded-xl bg-stone-900 active:bg-stone-800 border border-stone-800 text-[11px] font-medium"
            >
              <Droplets className="w-3.5 h-3.5 text-yellow-400" />
              Pee
            </button>
            <button
              type="button"
              onClick={() => {
                onPoop();
                setMenuOpen(false);
              }}
              className="flex flex-col items-center gap-1 py-2 rounded-xl bg-stone-900 active:bg-stone-800 border border-stone-800 text-[11px] font-medium"
            >
              <span className="text-xs leading-none">💩</span>
              Poop
            </button>
            <button
              type="button"
              onClick={() => {
                onRest();
                setMenuOpen(false);
              }}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[11px] font-medium ${
                hud.actionState === 'rest'
                  ? 'bg-sky-500 text-stone-950 border-sky-400 font-bold'
                  : 'bg-stone-900 border-stone-800 text-stone-100'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              Nap
            </button>
          </div>

          <div className="pt-1 border-t border-stone-800">
            <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-1.5 font-semibold">
              Weather
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {WEATHER_MODES.map((w) => (
                <button
                  key={w.mode}
                  type="button"
                  onClick={() => onWeatherChange(w.mode)}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium ${
                    hud.weather === w.mode
                      ? 'bg-amber-500 text-stone-950 font-semibold'
                      : 'bg-stone-900 text-stone-300'
                  }`}
                >
                  {w.icon}
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Contextual Center-Bottom Banner when near a Store Door, Townsperson, or Hydrant */}
      {prompt && (
        <div
          className="pointer-events-auto fixed bottom-6 left-1/2 -translate-x-1/2 z-20"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <button
            type="button"
            onClick={handleContextAction}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400 text-stone-950 font-bold text-xs shadow-xl active:scale-95 transition-transform"
          >
            {contextIcon}
            <span>{prompt.label}</span>
          </button>
        </div>
      )}

      {/* Bottom-Left: ONE Analog Movement Joystick (Walk -> Full-Tilt Auto-Sprint) */}
      <div
        ref={joyBaseRef}
        onPointerDown={handleJoyDown}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyUp}
        onPointerCancel={handleJoyUp}
        onLostPointerCapture={resetStick}
        style={{
          touchAction: 'none',
          marginLeft: 'env(safe-area-inset-left, 0px)',
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        className={`pointer-events-auto fixed bottom-5 left-5 z-20 w-32 h-32 rounded-full flex items-center justify-center select-none transition-colors ${
          knob.sprint
            ? 'bg-stone-950/75 border-2 border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.35)]'
            : knob.active
              ? 'bg-stone-950/70 border-2 border-stone-500/90 shadow-xl'
              : 'bg-stone-950/55 border-2 border-stone-700/80 shadow-lg'
        }`}
        aria-label="Movement joystick"
      >
        {/* Subtle inner walk/sprint guide ring */}
        <div className="w-20 h-20 rounded-full border border-dashed border-stone-600/50 pointer-events-none" />

        {/* Sprint indicator badge at top of ring */}
        {knob.sprint && (
          <span className="absolute -top-6 px-2 py-0.5 rounded-full bg-amber-400 text-stone-950 text-[10px] font-extrabold tracking-wider uppercase pointer-events-none shadow">
            Sprint
          </span>
        )}

        {/* Draggable Thumb Puck */}
        <div
          style={{
            transform: `translate3d(${knob.x}px, ${knob.y}px, 0)`,
          }}
          className={`absolute w-13 h-13 rounded-full pointer-events-none flex items-center justify-center shadow-lg transition-colors ${
            knob.sprint
              ? 'bg-amber-400 text-stone-950 border-2 border-amber-200'
              : knob.active
                ? 'bg-stone-200 text-stone-950 border-2 border-white'
                : 'bg-stone-800/95 text-stone-200 border border-stone-500/80'
          }`}
        >
          <div className="w-4 h-4 rounded-full bg-current opacity-35" />
        </div>
      </div>

      {/* Bottom-Right: Clean Ergonomic 4-Button Thumb Arc (Jump, Bark, Context/Pet, Sniff) */}
      <div
        style={{
          touchAction: 'none',
          marginRight: 'env(safe-area-inset-right, 0px)',
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        className="pointer-events-none fixed bottom-5 right-5 z-20 w-44 h-44 select-none"
      >
        {/* 1. Primary Anchor Button (Bottom-Right): JUMP */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onJump();
          }}
          style={{ touchAction: 'none' }}
          className="pointer-events-auto absolute bottom-0 right-0 w-17 h-17 rounded-full bg-amber-500 active:bg-amber-400 active:scale-95 border-2 border-amber-300 text-stone-950 shadow-xl flex flex-col items-center justify-center gap-0.5 transition-transform cursor-pointer"
          aria-label="Jump"
        >
          <ArrowUp className="w-5 h-5 stroke-[2.6]" />
          <span className="text-[10px] font-extrabold tracking-wide uppercase">Jump</span>
        </button>

        {/* 2. Left of Jump: BARK */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onBark();
          }}
          style={{ touchAction: 'none' }}
          className="pointer-events-auto absolute bottom-1 right-21 w-14 h-14 rounded-full bg-stone-950/85 active:bg-stone-800 active:scale-95 border-2 border-stone-600/90 text-stone-100 shadow-lg flex flex-col items-center justify-center gap-0.5 transition-transform cursor-pointer"
          aria-label="Bark"
        >
          <Megaphone className="w-4 h-4 text-amber-400" />
          <span className="text-[10px] font-bold">Bark</span>
        </button>

        {/* 3. Above Jump: CONTEXT ACTION (Enter Store / Pet NPC / Mark Hydrant / Belly Roll) */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            handleContextAction();
          }}
          style={{ touchAction: 'none' }}
          className={`pointer-events-auto absolute bottom-20 right-1 w-14 h-14 rounded-full active:scale-95 border-2 shadow-lg flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
            prompt
              ? 'bg-emerald-400 border-emerald-200 text-stone-950 shadow-[0_0_20px_rgba(52,211,153,0.45)]'
              : 'bg-stone-950/85 border-stone-600/90 text-stone-100 active:bg-stone-800'
          }`}
          aria-label={contextLabel}
        >
          {contextIcon}
          <span className="text-[10px] font-bold">{contextLabel}</span>
        </button>

        {/* 4. Diagonal Arc Button: SNIFF (Scents & Hidden Treats) */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onSniff();
          }}
          style={{ touchAction: 'none' }}
          className={`pointer-events-auto absolute bottom-17 right-18 w-13 h-13 rounded-full active:scale-95 border-2 shadow-lg flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
            hud.sniffActive
              ? 'bg-amber-400 border-amber-200 text-stone-950'
              : 'bg-stone-950/85 border-stone-600/90 text-stone-100 active:bg-stone-800'
          }`}
          aria-label="Sniff treats"
        >
          <Search className="w-4 h-4" />
          <span className="text-[9px] font-bold">Sniff</span>
        </button>
      </div>
    </>
  );
};
