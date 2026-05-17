export const NOTIFICATION_SOUND_ENABLED_KEY = "mktre_sound_enabled";

const MIN_NOTIFICATION_SOUND_INTERVAL_MS = 800;
const NOTIFICATION_SOUND_VOLUME = 0.65;

let lastPlayedAt = 0;

function isSoundEnabled() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(NOTIFICATION_SOUND_ENABLED_KEY);
  return stored == null || stored === "true" || stored === "1";
}

export function playNotification() {
  if (!isSoundEnabled()) return;

  const now = Date.now();
  if (now - lastPlayedAt < MIN_NOTIFICATION_SOUND_INTERVAL_MS) return;
  lastPlayedAt = now;

  try {
    const audio = new Audio("/sounds/notify.wav");
    audio.volume = NOTIFICATION_SOUND_VOLUME;
    void audio.play().catch(() => {
      // Browser autoplay policies can block audio before user interaction.
    });
  } catch {
    // Audio should never break the user workflow.
  }
}
