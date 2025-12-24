import { FPS } from './constants';

export const snapToFrame = (time) => Math.round(time * FPS) / FPS;

export const formatRaidTime = (time, totalTime) => {
  const t = (typeof totalTime !== 'undefined') ? Math.max(0, totalTime - time) : time;
  const totalFrames = Math.round(t * FPS);
  const m = Math.floor(totalFrames / (FPS * 60));
  const s = Math.floor((totalFrames / FPS) % 60);
  const f = totalFrames % FPS;
  const ms = Math.round(f * (1000 / FPS));
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

// NEW: Parse "m:ss.ms" back to seconds (Total Raid Time - parsed time if countdown?)
// Actually, the edit popup usually shows "Start Time". 
// If the timeline shows Countdown, the user likely wants to edit in Countdown format (e.g. "At 3:00 remaining").
// But the underlying data is `startTime` (elapsed).
// So: Elapsed = Duration - ParsedCountdown.
export const parseRaidTime = (timeStr, raidDuration) => {
    try {
        const parts = timeStr.split(':');
        if (parts.length !== 2) return NaN;
        const m = parseInt(parts[0], 10);
        const s = parseFloat(parts[1]);
        if (isNaN(m) || isNaN(s)) return NaN;
        
        const totalSeconds = (m * 60) + s;
        
        // If raidDuration is provided, we assume input is in Countdown format, so convert to Elapsed
        if (raidDuration !== undefined) {
            return Math.max(0, raidDuration - totalSeconds);
        }
        return totalSeconds;
    } catch (e) {
        return NaN;
    }
};