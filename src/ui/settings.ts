export interface UserSettings {
  soundEnabled: boolean;
  bgmVolume: number; // 0..1
  sfxVolume: number; // 0..1
  fxEnabled: boolean;
  lobbyAnimationEnabled: boolean;
}

const SETTINGS_KEY = 'narutosim.settings.v1';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function defaultSettings(reducedMotion = prefersReducedMotion()): UserSettings {
  return {
    soundEnabled: true,
    bgmVolume: 0.35,
    sfxVolume: 0.55,
    fxEnabled: !reducedMotion,
    lobbyAnimationEnabled: !reducedMotion,
  };
}

export function loadSettings(): UserSettings {
  const base = defaultSettings();
  if (typeof localStorage === 'undefined') return base;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : base.soundEnabled,
      bgmVolume: typeof parsed.bgmVolume === 'number' ? Math.max(0, Math.min(1, parsed.bgmVolume)) : base.bgmVolume,
      sfxVolume: typeof parsed.sfxVolume === 'number' ? Math.max(0, Math.min(1, parsed.sfxVolume)) : base.sfxVolume,
      fxEnabled: typeof parsed.fxEnabled === 'boolean' ? parsed.fxEnabled : base.fxEnabled,
      lobbyAnimationEnabled:
        typeof parsed.lobbyAnimationEnabled === 'boolean'
          ? parsed.lobbyAnimationEnabled
          : base.lobbyAnimationEnabled,
    };
  } catch {
    return base;
  }
}

export function saveSettings(settings: UserSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
