import React, { useRef, useState } from 'react';
import { Upload, X, RotateCw, Check, Sliders } from 'lucide-react';
import { autoGuessGlbClips, inspectGlbFile } from '../game/dogModels';
import {
  DogBreedConfig,
  GlbAnimationMapping,
  PHYSICS_PRESETS,
  PhysicsPresetId,
} from '../game/types';

interface BreedStudioModalProps {
  open: boolean;
  onClose: () => void;
  breeds: DogBreedConfig[];
  activeBreedId: string;
  onSelectBreed: (breed: DogBreedConfig) => void;
  onAddGlbBreed: (breed: DogBreedConfig) => void;
  onUpdateBreed: (breed: DogBreedConfig) => void;
}

export const BreedStudioModal: React.FC<BreedStudioModalProps> = ({
  open,
  onClose,
  breeds,
  activeBreedId,
  onSelectBreed,
  onAddGlbBreed,
  onUpdateBreed,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingBreedId, setEditingBreedId] = useState<string | null>(null);

  if (!open) return null;

  const editingBreed = breeds.find((b) => b.id === (editingBreedId ?? activeBreedId)) ?? breeds[0];

  const processFile = async (file: File) => {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.glb') && !ext.endsWith('.gltf')) {
      setUploadError('Please upload a .glb or .gltf 3D model file.');
      return;
    }
    setUploadError(null);
    setLoadingFile(true);
    try {
      const objectUrl = URL.createObjectURL(file);
      const { clipNames, meshCount } = await inspectGlbFile(objectUrl);
      if (meshCount === 0) {
        URL.revokeObjectURL(objectUrl);
        throw new Error('No 3D meshes found inside this GLB file.');
      }
      const cleanName = file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]+/g, ' ');
      const newBreed: DogBreedConfig = {
        id: `glb_${Date.now()}`,
        name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        subtitle:
          clipNames.length > 0
            ? `${clipNames.length} embedded animation clip${clipNames.length === 1 ? '' : 's'}`
            : 'Static GLB with procedural body lean & tilt',
        source: 'glb',
        glbUrl: objectUrl,
        fileName: file.name,
        availableClips: clipNames,
        clipMapping: autoGuessGlbClips(clipNames),
        forwardRotationDeg: 0,
        scaleMultiplier: 1.0,
        physics: { ...PHYSICS_PRESETS.balanced_medium },
      };
      onAddGlbBreed(newBreed);
      setEditingBreedId(newBreed.id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to parse this GLB model.');
    } finally {
      setLoadingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const updateClipMap = (slot: keyof GlbAnimationMapping, clipName: string) => {
    if (!editingBreed || editingBreed.source !== 'glb') return;
    const next: DogBreedConfig = {
      ...editingBreed,
      clipMapping: {
        ...(editingBreed.clipMapping ?? {
          idle: '',
          walk: '',
          run: '',
          jump: '',
          action: '',
          bellyRub: '',
        }),
        [slot]: clipName,
      },
    };
    onUpdateBreed(next);
  };

  const updatePhysicsPreset = (presetId: PhysicsPresetId) => {
    if (!editingBreed) return;
    const next: DogBreedConfig = {
      ...editingBreed,
      physics: { ...PHYSICS_PRESETS[presetId] },
    };
    onUpdateBreed(next);
  };

  const updateForwardRotation = (deg: number) => {
    if (!editingBreed || editingBreed.source !== 'glb') return;
    onUpdateBreed({ ...editingBreed, forwardRotationDeg: deg });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Dog Breeds and GLB Upload Studio"
    >
      <div className="w-full max-w-4xl max-h-[86vh] flex flex-col bg-stone-900 border border-stone-700/80 rounded-xl shadow-2xl overflow-hidden text-stone-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <div>
            <h2 className="font-display text-xl font-semibold text-stone-50">
              Breeds & Animated GLB Studio
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Switch dog breeds with tuned movement physics or upload your own animated .glb files.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Close breed studio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column: Breed list + GLB Upload Dropzone */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Upload Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border border-dashed rounded-xl p-5 transition-colors ${
                isDragging
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-stone-700 bg-stone-950/60 hover:border-stone-500'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-stone-100">
                    Upload Animated Dog Model (.glb)
                  </h3>
                  <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                    Drag & drop any rigged .glb file. Clips are auto-detected and smoothly blended
                    with realistic breed acceleration, sprint drift, and jump physics.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {loadingFile ? 'Parsing GLB...' : 'Choose .glb File'}
                </button>
              </div>
              {uploadError && (
                <p className="mt-3 text-xs text-red-400">{uploadError}</p>
              )}
            </div>

            {/* Breed Roster */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-stone-300">
                  Available Dog Breeds ({breeds.length})
                </h3>
                <span className="text-xs text-stone-500">Select to play immediately</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {breeds.map((breed) => {
                  const isActive = breed.id === activeBreedId;
                  return (
                    <button
                      key={breed.id}
                      type="button"
                      onClick={() => {
                        onSelectBreed(breed);
                        setEditingBreedId(breed.id);
                      }}
                      className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-stone-800 border-amber-500/80'
                          : 'bg-stone-950/50 border-stone-800 hover:border-stone-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-stone-100 truncate">
                          {breed.name}
                        </span>
                        {isActive && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                      </div>
                      <p className="text-xs text-stone-400 mt-1 line-clamp-1">{breed.subtitle}</p>
                      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-stone-400 font-mono-num">
                        <span>{breed.source === 'glb' ? 'Animated GLB' : 'Built-in 3D'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{breed.physics.sprintSpeed.toFixed(1)} m/s</span>
                        <span aria-hidden="true">·</span>
                        <span>Turn {breed.physics.turnRate.toFixed(1)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right column: Selected Breed Physics & GLB Animation Mapper */}
          <div className="lg:col-span-5 bg-stone-950/70 border border-stone-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-100">{editingBreed.name}</h3>
                <p className="text-xs text-stone-400">
                  {editingBreed.source === 'glb'
                    ? (editingBreed.fileName ?? editingBreed.glbUrl?.split('/').pop() ?? 'Animated GLB')
                    : 'Procedural Articulated Mesh'}
                </p>
              </div>
              <Sliders className="w-4 h-4 text-stone-500" />
            </div>

            {/* Physics Profile Picker */}
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-2">
                Movement Physics Profile
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PHYSICS_PRESETS) as PhysicsPresetId[]).map((pid) => {
                  const preset = PHYSICS_PRESETS[pid];
                  const selected = editingBreed.physics.presetId === pid;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => updatePhysicsPreset(pid)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Physics Telemetry Readout */}
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-stone-400">
                  <span>Sprint Speed</span>
                  <span className="font-mono-num text-stone-200">
                    {editingBreed.physics.sprintSpeed.toFixed(1)} m/s
                  </span>
                </div>
                <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${(editingBreed.physics.sprintSpeed / 12) * 100}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-stone-400">
                  <span>Corner Agility</span>
                  <span className="font-mono-num text-stone-200">
                    {editingBreed.physics.turnRate.toFixed(1)}
                  </span>
                </div>
                <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${(editingBreed.physics.turnRate / 10.5) * 100}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-stone-400">
                  <span>Jump Impulse</span>
                  <span className="font-mono-num text-stone-200">
                    {editingBreed.physics.jumpVelocity.toFixed(1)} m/s
                  </span>
                </div>
                <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400"
                    style={{ width: `${(editingBreed.physics.jumpVelocity / 8.5) * 100}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-stone-400">
                  <span>Traction Grip</span>
                  <span className="font-mono-num text-stone-200">
                    {Math.round(editingBreed.physics.driftGrip * 100)}%
                  </span>
                </div>
                <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-stone-300"
                    style={{ width: `${editingBreed.physics.driftGrip * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* GLB-Specific Orientation & Animation Clip Mapper */}
            {editingBreed.source === 'glb' && (
              <div className="pt-3 border-t border-stone-800 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-stone-300 inline-flex items-center gap-1.5">
                      <RotateCw className="w-3.5 h-3.5" /> Model Forward Axis
                    </span>
                    <span className="text-xs font-mono-num text-stone-400">
                      {editingBreed.forwardRotationDeg ?? 0}°
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0, 90, 180, 270].map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => updateForwardRotation(deg)}
                        className={`py-1.5 rounded text-xs font-mono-num border cursor-pointer ${
                          (editingBreed.forwardRotationDeg ?? 0) === deg
                            ? 'bg-amber-500 text-stone-950 border-amber-400 font-semibold'
                            : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-600'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                {editingBreed.availableClips && editingBreed.availableClips.length > 0 ? (
                  <div className="space-y-2">
                    <span className="block text-xs font-medium text-stone-300">
                      Embedded Animation Clip Mapping
                    </span>
                    {(
                      [
                        ['idle', 'Idle'],
                        ['walk', 'Walk / Trot'],
                        ['run', 'Run / Gallop'],
                        ['jump', 'Jump'],
                        ['action', 'Bark / Sniff / Eat'],
                        ['bellyRub', 'Belly Rub / Rest'],
                      ] as [keyof GlbAnimationMapping, string][]
                    ).map(([slot, label]) => (
                      <div key={slot} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-stone-400 shrink-0">{label}</span>
                        <select
                          value={editingBreed.clipMapping?.[slot] ?? ''}
                          onChange={(e) => updateClipMap(slot, e.target.value)}
                          className="w-44 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100 focus:outline-none focus:border-amber-400"
                        >
                          <option value="">None</option>
                          {editingBreed.availableClips!.map((clip) => (
                            <option key={clip} value={clip}>
                              {clip}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">
                    This GLB has no embedded keyframe clips; procedural tilt, jump, and belly-rub
                    physics will animate it automatically.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
