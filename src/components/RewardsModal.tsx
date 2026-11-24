import React from 'react';
import { X, Award, MapPin, Check } from 'lucide-react';
import type { SocialReward } from '../game/types';

interface RewardsModalProps {
  open: boolean;
  onClose: () => void;
  rewards: SocialReward[];
  friendlyInteractions: number;
  treatsFound: number;
  treatsTotal: number;
  hydrantsMarked: number;
  totalHydrants: number;
  onToggleEquip: (id: SocialReward['id']) => void;
  onTeleport: (landmark: 'town' | 'park' | 'pond' | 'gazebo') => void;
}

export const RewardsModal: React.FC<RewardsModalProps> = ({
  open,
  onClose,
  rewards,
  friendlyInteractions,
  treatsFound,
  treatsTotal,
  hydrantsMarked,
  totalHydrants,
  onToggleEquip,
  onTeleport,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Social Rewards and World Guide"
    >
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-stone-900 border border-stone-700/80 rounded-xl shadow-2xl overflow-hidden text-stone-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <div>
            <h2 className="font-display text-xl font-semibold text-stone-50">
              Social Rewards & Barkshire Guide
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Greet townspeople for belly rubs to unlock wearable gear and perks.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Close rewards modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Progress Summary Row */}
          <div className="grid grid-cols-3 gap-4 border-b border-stone-800 pb-5">
            <div>
              <div className="text-xs text-stone-400">Hidden Treats</div>
              <div className="text-2xl font-semibold font-mono-num text-amber-400 mt-0.5">
                {treatsFound} / {treatsTotal}
              </div>
            </div>
            <div>
              <div className="text-xs text-stone-400">Belly Rubs & Pets</div>
              <div className="text-2xl font-semibold font-mono-num text-rose-400 mt-0.5">
                {friendlyInteractions}
              </div>
            </div>
            <div>
              <div className="text-xs text-stone-400">Hydrants Marked</div>
              <div className="text-2xl font-semibold font-mono-num text-emerald-400 mt-0.5">
                {hydrantsMarked} / {totalHydrants}
              </div>
            </div>
          </div>

          {/* Unlockable Social Rewards */}
          <div>
            <h3 className="text-xs font-semibold text-stone-300 mb-3 inline-flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              Unlockable Wearable Rewards
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rewards.map((reward) => {
                const progress = Math.min(friendlyInteractions, reward.requiredInteractions);
                return (
                  <div
                    key={reward.id}
                    className={`p-4 rounded-lg border ${
                      reward.unlocked
                        ? 'bg-stone-800/80 border-stone-600'
                        : 'bg-stone-950/50 border-stone-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-stone-100">{reward.name}</div>
                        <div className="text-xs text-amber-300/90 mt-0.5">{reward.perkLabel}</div>
                      </div>
                      {reward.unlocked ? (
                        <button
                          type="button"
                          onClick={() => onToggleEquip(reward.id)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                            reward.equipped
                              ? 'bg-emerald-500 text-stone-950 font-semibold'
                              : 'bg-stone-700 text-stone-200 hover:bg-stone-600'
                          }`}
                        >
                          {reward.equipped && <Check className="w-3.5 h-3.5" />}
                          {reward.equipped ? 'Equipped' : 'Equip'}
                        </button>
                      ) : (
                        <span className="text-xs font-mono-num text-stone-400 whitespace-nowrap">
                          {progress}/{reward.requiredInteractions} pets
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                      {reward.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fast Travel Landmarks */}
          <div>
            <h3 className="text-xs font-semibold text-stone-300 mb-3 inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-sky-400" />
              Quick Travel Landmarks
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  ['town', 'Town Square', 'Bakery, Cafe & Hydrants'],
                  ['park', 'Sunbeam Fountain', 'Central Park Plaza'],
                  ['pond', 'Willow Pond', 'Arched Wooden Bridge'],
                  ['gazebo', 'Oakridge Gazebo', 'Hidden Meadow Treats'],
                ] as const
              ).map(([id, title, sub]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onTeleport(id);
                    onClose();
                  }}
                  className="text-left p-3 rounded-lg bg-stone-950/60 border border-stone-800 hover:border-stone-500 transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold text-stone-100">{title}</div>
                  <div className="text-[11px] text-stone-400 mt-0.5">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Controls Cheat Sheet */}
          <div className="pt-3 border-t border-stone-800 text-xs text-stone-400 grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
            <div><span className="font-mono-num text-stone-200">WASD / Arrows</span> — Run & Steer</div>
            <div><span className="font-mono-num text-stone-200">Shift</span> — Sprint Zoomies</div>
            <div><span className="font-mono-num text-stone-200">Space</span> — Jump</div>
            <div><span className="font-mono-num text-stone-200">Mouse Drag</span> — Orbit Camera</div>
            <div><span className="font-mono-num text-stone-200">E</span> — Belly Rubs / Greet</div>
            <div><span className="font-mono-num text-stone-200">B / F</span> — Bark / Sniff Treats</div>
            <div><span className="font-mono-num text-stone-200">P / O</span> — Pee / Poop</div>
            <div><span className="font-mono-num text-stone-200">R</span> — Curl Up & Nap</div>
            <div><span className="font-mono-num text-stone-200">H</span> — Hide / Show Dock</div>
          </div>
        </div>
      </div>
    </div>
  );
};
