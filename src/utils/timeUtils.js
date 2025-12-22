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