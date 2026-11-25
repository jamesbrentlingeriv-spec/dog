import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Sun,
  Sunset,
  CloudRain,
  Wind,
  Heart,
  Search,
  Award,
  Dog,
  Droplets,
  Moon,
  Megaphone,
  Gamepad2,
} from 'lucide-react';
import type { GameHudSnapshot, WeatherMode } from '../game/types';

interface GameHUDProps {
  hud: GameHudSnapshot;
  mobileMode: boolean;
  onToggleMobileMode: () => void;
  onBark: () => void;
  onSniff: () => void;
  onPee: () => void;
  onPoop: () => void;
  onInteract: () => void;
  onRest: () => void;
  onWeatherChange: (mode: WeatherMode) => void;
  onToggleAutoWeather: () => void;
  onToggleMute: () => void;
  onOpenBreedStudio: () => void;
  onOpenRewards: () => void;
}

const WEATHER_OPTIONS: { mode: WeatherMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'sunny', label: 'Sunny', icon: <Sun className="w-3.5 h-3.5" /> },
  { mode: 'sunset', label: 'Sunset', icon: <Sunset className="w-3.5 h-3.5" /> },
  { mode: 'rain', label: 'Rain', icon: <CloudRain className="w-3.5 h-3.5" /> },
  { mode: 'autumn', label: 'Autumn', icon: <Wind className="w-3.5 h-3.5" /> },
];

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  mobileMode,
  onToggleMobileMode,
  onBark,
  onSniff,
  onPee,
  onPoop,
  onInteract,
  onRest,
  onWeatherChange,
  onToggleAutoWeather,
  onToggleMute,
  onOpenBreedStudio,
  onOpenRewards,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);

  // Keyboard shortcut 'H' to toggle Zen/Cinema mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
        setWeatherOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Top-Left Minimal Spec & Needs Strip (No side-flank clutter, no backdrop-filter) */}
      <div className="flex items-start justify-between gap-4">
        <div
          className={`pointer-events-auto bg-stone-950/85 border border-stone-800/90 rounded-xl shadow-lg ${
            mobileMode ? 'px-3 py-2 max-w-[235px]' : 'px-4 py-3 max-w-sm'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="font-display text-base sm:text-lg font-semibold text-stone-50 tracking-tight whitespace-nowrap">
                Barkshire
              </h1>
              <span className="text-[11px] sm:text-xs text-stone-400 truncate">{hud.zoneName}</span>
            </div>
            <button
              type="button"
              onClick={onToggleMobileMode}
              title={mobileMode ? 'Switch to Desktop HUD' : 'Switch to Touch Joystick HUD'}
              className={`p-1 rounded-md border transition-colors cursor-pointer shrink-0 ${
                mobileMode
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                  : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-100'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Unboxed clean metadata row with typographic separators */}
          <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-stone-400 font-mono-num">
            <span className="text-stone-200 font-sans font-medium">{hud.breedName}</span>
            <span aria-hidden="true">·</span>
            <span>Treats {hud.treatsFound}/{hud.treatsTotal}</span>
            <span aria-hidden="true">·</span>
            <span>Pets {hud.friendlyInteractions}</span>
          </div>

          {/* Simple Hunger & Energy indicators */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className={hud.lowHungerWarning ? 'text-amber-300 font-semibold' : 'text-stone-400'}>
                  {hud.lowHungerWarning ? 'Hungry!' : 'Hunger'}
                </span>
                <span className="font-mono-num text-stone-300">{hud.hunger}%</span>
              </div>
              <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    hud.lowHungerWarning ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${hud.hunger}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className={hud.lowEnergyWarning ? 'text-sky-300 font-semibold' : 'text-stone-400'}>
                  {hud.lowEnergyWarning ? 'Tired!' : 'Energy'}
                </span>
                <span className="font-mono-num text-stone-300">{hud.energy}%</span>
              </div>
              <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    hud.lowEnergyWarning ? 'bg-rose-400' : 'bg-sky-400'
                  }`}
                  style={{ width: `${hud.energy}%` }}
                />
              </div>
            </div>
          </div>

          {/* Gentle Nature / Relief reminder only when bladder is getting full */}
          {hud.needsReliefWarning && (
            <div className="mt-2.5 text-xs text-amber-300 flex items-center justify-between border-t border-stone-800 pt-2">
              <span>Nature calls — find a tree or hydrant!</span>
              <span className="font-mono-num text-stone-300">[P] / [O]</span>
            </div>
          )}
        </div>

        {/* Transient Top-Center Notification / NPC Speech Banner */}
        <div className={`flex flex-col items-end gap-2 max-w-xs sm:max-w-sm ${mobileMode ? 'mr-28' : ''}`}>
          {hud.notification && (
            <div className="bg-stone-950/90 border border-amber-500/40 rounded-lg px-4 py-2.5 shadow-lg text-right">
              <div className="text-xs font-semibold text-amber-300">{hud.notification.title}</div>
              {hud.notification.detail && (
                <div className="text-[11px] text-stone-300 mt-0.5">{hud.notification.detail}</div>
              )}
            </div>
          )}
          {hud.activeSpeech && (
            <div className="bg-stone-950/90 border border-stone-700 rounded-lg px-4 py-2.5 shadow-lg text-right">
              <div className="text-[11px] font-semibold text-stone-300">{hud.activeSpeech.speaker}</div>
              <div className="text-xs text-stone-100 mt-0.5">“{hud.activeSpeech.text}”</div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Area: Desktop Dock (hidden when Touch Joystick MobileControls are active) */}
      {!mobileMode && (
      <div className="flex flex-col items-center gap-2.5">
        {/* Contextual Nearby Prompt (Store Door, NPC Belly Rub, or Hydrant Marking) */}
        {hud.nearbyPrompt && (
          <button
            type="button"
            onClick={hud.nearbyPrompt.action === 'pee_mark' ? onPee : onInteract}
            className="pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-lg bg-stone-950/92 border border-amber-400/70 text-stone-100 shadow-lg hover:bg-stone-900 transition-colors cursor-pointer"
          >
            <span className="px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 font-mono-num text-xs font-bold">
              {hud.nearbyPrompt.key}
            </span>
            <span className="text-xs font-semibold whitespace-nowrap">{hud.nearbyPrompt.label}</span>
            {hud.nearbyPrompt.sublabel && (
              <span className="text-xs text-stone-400 whitespace-nowrap">
                · {hud.nearbyPrompt.sublabel}
              </span>
            )}
          </button>
        )}

        {/* Weather Popover attached cleanly right above the dock */}
        {weatherOpen && !dockCollapsed && (
          <div className="pointer-events-auto bg-stone-950/95 border border-stone-700 rounded-xl p-3 shadow-xl flex flex-wrap items-center gap-2">
            {WEATHER_OPTIONS.map((w) => (
              <button
                key={w.mode}
                type="button"
                onClick={() => onWeatherChange(w.mode)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  hud.weather === w.mode
                    ? 'bg-amber-500 text-stone-950 font-semibold'
                    : 'bg-stone-900 text-stone-300 hover:bg-stone-800'
                }`}
              >
                {w.icon}
                {w.label}
              </button>
            ))}
            <div className="w-px h-5 bg-stone-800 mx-1" />
            <button
              type="button"
              onClick={onToggleAutoWeather}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                hud.autoWeather
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200'
              }`}
            >
              Auto Cycle: {hud.autoWeather ? 'On' : 'Off'}
            </button>
          </div>
        )}

        {/* Collapse / Expand Toggle Handle */}
        <div className="flex flex-col items-center w-full max-w-[940px]">
          <button
            type="button"
            onClick={() => {
              setDockCollapsed((prev) => !prev);
              setWeatherOpen(false);
            }}
            className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg bg-stone-950/90 border border-b-0 border-stone-800 text-[11px] font-medium text-stone-400 hover:text-stone-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Show Controls (H)
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Hide Controls (H)
              </>
            )}
          </button>

          {/* Unified Horizontal Bottom Dock */}
          {!dockCollapsed && (
            <div className="pointer-events-auto w-full bg-stone-950/92 border border-stone-800 rounded-xl px-3 py-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2">
              {/* Left Group: Dog Actions */}
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={onBark}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-medium text-stone-100 transition-colors cursor-pointer whitespace-nowrap"
                  title="Bark (B)"
                >
                  <Megaphone className="w-3.5 h-3.5 text-amber-400" />
                  Bark <span className="font-mono-num text-[10px] text-stone-500">B</span>
                </button>

                <button
                  type="button"
                  onClick={onSniff}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    hud.sniffActive
                      ? 'bg-amber-500 text-stone-950 border-amber-400 font-semibold'
                      : 'bg-stone-900 hover:bg-stone-800 border-stone-800 text-stone-100'
                  }`}
                  title="Toggle Treat Sniff Trails (F)"
                >
                  <Search className="w-3.5 h-3.5" />
                  Sniff <span className="font-mono-num text-[10px] opacity-70">F</span>
                </button>

                <button
                  type="button"
                  onClick={onPee}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-medium text-stone-100 transition-colors cursor-pointer whitespace-nowrap"
                  title="Pee / Mark Territory (P)"
                >
                  <Droplets className="w-3.5 h-3.5 text-yellow-400" />
                  Pee <span className="font-mono-num text-[10px] text-stone-500">P</span>
                </button>

                <button
                  type="button"
                  onClick={onPoop}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-medium text-stone-100 transition-colors cursor-pointer whitespace-nowrap"
                  title="Poop (O)"
                >
                  Poop <span className="font-mono-num text-[10px] text-stone-500">O</span>
                </button>

                <button
                  type="button"
                  onClick={onInteract}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-medium text-stone-100 transition-colors cursor-pointer whitespace-nowrap"
                  title="Belly Rubs / Greet NPC (E)"
                >
                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                  Belly Rub <span className="font-mono-num text-[10px] text-stone-500">E</span>
                </button>

                <button
                  type="button"
                  onClick={onRest}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    hud.actionState === 'rest'
                      ? 'bg-sky-500 text-stone-950 border-sky-400 font-semibold'
                      : 'bg-stone-900 hover:bg-stone-800 border-stone-800 text-stone-100'
                  }`}
                  title="Nap to Restore Energy (R)"
                >
                  <Moon className="w-3.5 h-3.5" />
                  Nap <span className="font-mono-num text-[10px] opacity-70">R</span>
                </button>
              </div>

              {/* Right Group: Breeds/GLB Studio, Weather, Rewards, Audio */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenBreedStudio}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Dog className="w-3.5 h-3.5" />
                  Breeds & GLB
                </button>

                <button
                  type="button"
                  onClick={() => setWeatherOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    weatherOpen
                      ? 'bg-stone-800 border-stone-600 text-stone-50'
                      : 'bg-stone-900 hover:bg-stone-800 border-stone-800 text-stone-200'
                  }`}
                >
                  {WEATHER_OPTIONS.find((w) => w.mode === hud.weather)?.icon}
                  Weather
                </button>

                <button
                  type="button"
                  onClick={onOpenRewards}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-medium text-stone-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  Rewards
                </button>

                <button
                  type="button"
                  onClick={onToggleMute}
                  className="p-2 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-stone-100 transition-colors cursor-pointer"
                  aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                  title={hud.muted ? 'Unmute audio' : 'Mute audio'}
                >
                  {hud.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
