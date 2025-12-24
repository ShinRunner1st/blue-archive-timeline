import { useMemo } from 'react';
import { calculateRegenStats, simulateCost, getEffectiveCost, getCurrentSkillData } from '../utils/costEngine';
import { COST_UNIT, REGEN_START_DELAY, MAX_COST } from '../utils/constants';

export const useCostSimulation = (activeTeam, timelineEvents, raidDuration, currentElapsed) => {

  const regenStats = useMemo(() => calculateRegenStats(activeTeam), [activeTeam]);

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

  const costGraphData = useMemo(() => {
      const points = new Set([REGEN_START_DELAY, raidDuration]);
      const sortedEvents = [...timelineEvents].filter(e => e.id).sort((a, b) => a.startTime - b.startTime);
      for (const e of sortedEvents) {
          if (e.startTime > REGEN_START_DELAY) points.add(e.startTime);
          const student = activeTeam.find(s => s.id === e.studentId);
          if (student) {
              for (const eff of student.regenEffects) {
                  if (eff.type === 'Active') {
                      if (eff.source === 'Public' && e.skillType !== 'Public') continue;
                      if (eff.source !== 'Public' && e.skillType === 'Public') continue;
                      const start = e.startTime + eff.delay;
                      const end = start + (eff.duration === -1 ? student.exSkill.effectDuration : eff.duration);
                      if (start > REGEN_START_DELAY && start < raidDuration) points.add(start);
                      if (end > REGEN_START_DELAY && end < raidDuration) points.add(end);
                  }
              }
          }
      }

      const sortedPoints = Array.from(points).sort((a, b) => a - b);
      const graphPoints = [{ t: 0, v: 0 }, { t: REGEN_START_DELAY, v: 0 }];
      let currentCost = 0;
      let tPrev = REGEN_START_DELAY;

      for (let i = 0; i < sortedPoints.length; i++) {
          const tCurr = sortedPoints[i];
          if (tCurr <= tPrev) continue;
          const tMid = tPrev + 0.001;
          let activeFlat = 0;
          let activePercent = 0;
          const activeKeys = new Set();

          for (const e of sortedEvents) {
              if (e.startTime > tMid) break;
              const student = activeTeam.find(s => s.id === e.studentId);
              if (!student) continue;
              for (const eff of student.regenEffects) {
                  if (eff.type === 'Active') {
                      if (eff.source === 'Public' && e.skillType !== 'Public') continue;
                      if (eff.source !== 'Public' && e.skillType === 'Public') continue;
                      const dur = eff.duration === -1 ? student.exSkill.effectDuration : eff.duration;
                      const start = e.startTime + eff.delay;
                      const end = start + dur;
                      if (start <= tMid && end >= tCurr) {
                          const key = `${student.id}-${eff.source}`;
                          if (!activeKeys.has(key)) {
                              if (eff.isFlat) activeFlat += eff.value; else activePercent += eff.value/10000;
                              activeKeys.add(key);
                          }
                      }
                  }
              }
          }

          const speed = (regenStats.base + activeFlat) * (1 + regenStats.percent + activePercent);
          const dt = tCurr - tPrev;
          if (currentCost < MAX_COST && speed > 0) {
              const timeToMax = (MAX_COST - currentCost) / (speed / COST_UNIT);
              if (timeToMax <= dt) {
                  graphPoints.push({ t: tPrev + timeToMax, v: MAX_COST });
                  currentCost = MAX_COST;
              } else {
                  currentCost += dt * speed / COST_UNIT;
              }
          } else {
              currentCost = Math.min(MAX_COST, currentCost + (dt * speed / COST_UNIT));
          }
          graphPoints.push({ t: tCurr, v: currentCost });

          for (const e of sortedEvents) {
              if (Math.abs(e.startTime - tCurr) < 0.0001) {
                  if(e.cost > 0) {
                      const cost = getEffectiveCost(e.studentId, e.startTime, sortedEvents, activeTeam);
                      currentCost = Math.max(0, currentCost - cost);
                  }
                  graphPoints.push({ t: tCurr, v: currentCost });
              }
          }
          tPrev = tCurr;
      }
      return graphPoints;
  }, [timelineEvents, activeTeam, regenStats, raidDuration]);

  // Rate Display
  const currentRateDisplay = useMemo(() => {
      const { base, percent } = regenStats;
      let activeFlat = 0;
      let activePercent = 0;
      const activeKeys = new Set();
      
      for (const e of timelineEvents) {
          if (e.startTime > currentElapsed) continue;
          const student = activeTeam.find(s=>s.id===e.studentId);
          if(!student) continue;
          
          for (const eff of student.regenEffects) {
              if (eff.type === 'Active') {
                  if (eff.source === 'Public' && e.skillType !== 'Public') continue;
                  if (eff.source !== 'Public' && e.skillType === 'Public') continue;
                  const dur = eff.duration === -1 ? student.exSkill.effectDuration : eff.duration;
                  const start = e.startTime + eff.delay;
                  if (currentElapsed >= start && currentElapsed < start + dur) {
                      const key = `${student.id}-${eff.source}`;
                      if (!activeKeys.has(key)) {
                          if (eff.isFlat) activeFlat += eff.value; else activePercent += eff.value / 10000;
                          activeKeys.add(key);
                      }
                  }
              }
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