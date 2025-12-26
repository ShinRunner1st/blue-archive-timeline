import { useMemo } from 'react';
import { calculateRegenStats, simulateCost, getEffectiveCost, getCurrentSkillData } from '../utils/costEngine';
import { COST_UNIT, REGEN_START_DELAY, MAX_COST } from '../utils/constants';
import { resolveTimelineEffects } from '../utils/effectResolver';

export const useCostSimulation = (activeTeam, timelineEvents, raidDuration, currentElapsed) => {

  const regenStats = useMemo(() => calculateRegenStats(activeTeam), [activeTeam]);

  // Status for Skill Card UI (Cost vs Effective Cost)
  const getStudentStatus = (studentId) => {
      const cost = getEffectiveCost(studentId, currentElapsed, timelineEvents, activeTeam);
      const currentSkill = getCurrentSkillData(studentId, currentElapsed, timelineEvents, activeTeam);
      
      const base = currentSkill ? currentSkill.cost : 0;
      const buff = cost < base ? { amount: (base-cost)/base } : null;
      
      return { 
          effectiveCost: cost, 
          activeBuff: buff, 
          skillName: currentSkill ? currentSkill.name : "",
          isExtra: currentSkill?.skillType === "ExExtra"
      };
  };

  const calculateCostAtTime = (targetElapsed, excludeEventId = null) => {
      const events = excludeEventId ? timelineEvents.filter(e => e.id !== excludeEventId) : timelineEvents;
      return simulateCost(targetElapsed, events, activeTeam, regenStats);
  };

  const getEffectiveCostAtTime = (studentId, time, excludeEventId) => {
      const events = excludeEventId ? timelineEvents.filter(e => e.id !== excludeEventId) : timelineEvents;
      return getEffectiveCost(studentId, time, events, activeTeam);
  };

  // --- COST GRAPH GENERATION (Resolver Based) ---
  const costGraphData = useMemo(() => {
      // 1. Flatten logic into numbers
      const { consumptionEvents, regenWindows } = resolveTimelineEffects(timelineEvents, activeTeam);

      // 2. Build Time Points
      const points = new Set([0, REGEN_START_DELAY, raidDuration]);
      
      // Add event times
      consumptionEvents.forEach(c => {
          if (c.time >= REGEN_START_DELAY && c.time <= raidDuration) points.add(c.time);
      });
      // Add window boundaries
      regenWindows.forEach(w => {
          if (w.start >= REGEN_START_DELAY && w.start <= raidDuration) points.add(w.start);
          if (w.end >= REGEN_START_DELAY && w.end <= raidDuration) points.add(w.end);
      });

      const sortedPoints = Array.from(points).sort((a, b) => a - b);
      const graphPoints = [{ t: 0, v: 0 }];
      
      let currentCost = 0;
      let tPrev = 0;

      // 3. Integration Loop
      for (let i = 0; i < sortedPoints.length; i++) {
          const tCurr = sortedPoints[i];
          if (tCurr <= tPrev) continue;

          // Before Regen Start
          if (tCurr <= REGEN_START_DELAY) {
              graphPoints.push({ t: tCurr, v: 0 });
              tPrev = tCurr;
              continue;
          }

          // Calculate Rate at mid-point
          const tMid = tPrev + 0.001;
          let activeFlat = 0;
          let activePercent = 0;

          for (const w of regenWindows) {
              if (w.start <= tMid && w.end >= tCurr) {
                  if (w.isFlat) activeFlat += w.value;
                  else activePercent += w.value / 10000;
              }
          }

          const speed = (regenStats.base + activeFlat) * (1 + regenStats.percent + activePercent);
          const dt = tCurr - tPrev;

          // Add Cost (Clamped)
          if (currentCost < MAX_COST && speed > 0) {
              const timeToMax = (MAX_COST - currentCost) / (speed / COST_UNIT);
              if (timeToMax <= dt) {
                  // Hit cap mid-interval
                  graphPoints.push({ t: tPrev + timeToMax, v: MAX_COST });
                  currentCost = MAX_COST;
              } else {
                  currentCost += dt * speed / COST_UNIT;
              }
          } else {
              currentCost = Math.min(MAX_COST, currentCost + (dt * speed / COST_UNIT));
          }

          // Add point before consumption
          graphPoints.push({ t: tCurr, v: currentCost });

          // Consume Cost (Instant)
          for (const c of consumptionEvents) {
              if (Math.abs(c.time - tCurr) < 0.0001) {
                  currentCost = Math.max(0, currentCost - c.cost);
                  // Add point after consumption to create vertical drop
                  graphPoints.push({ t: tCurr, v: currentCost });
              }
          }

          tPrev = tCurr;
      }
      return graphPoints;
  }, [timelineEvents, activeTeam, regenStats, raidDuration]);

  // --- CURRENT RATE DISPLAY (Resolver Based) ---
  const currentRateDisplay = useMemo(() => {
      const { base, percent } = regenStats;
      let activeFlat = 0;
      let activePercent = 0;
      
      // Use Resolver to find active windows at current time
      const { regenWindows } = resolveTimelineEffects(timelineEvents, activeTeam);
      
      for (const w of regenWindows) {
          if (currentElapsed >= w.start && currentElapsed < w.end) {
              if (w.isFlat) activeFlat += w.value;
              else activePercent += w.value / 10000;
          }
      }

      return (base + activeFlat) * (1 + percent + activePercent) / COST_UNIT;
  }, [regenStats, currentElapsed, timelineEvents, activeTeam]);

  return {
      calculateCostAtTime,
      getEffectiveCostAtTime,
      costGraphData,
      getStudentStatus,
      currentRateDisplay,
      regenStats
  };
};