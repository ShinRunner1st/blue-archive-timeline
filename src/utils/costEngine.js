import { COST_UNIT, MAX_COST, REGEN_START_DELAY } from './constants';
import { resolveSkillState } from './skillLogic';
import { resolveTimelineEffects, calculateEffectiveCost } from './effectResolver';

// --- API ALIASES ---
export const getEffectiveCost = (studentId, time, events, activeTeam) => {
    return calculateEffectiveCost(studentId, time, events, activeTeam);
};
export const getEffectiveCostAtTime = (studentId, time, events, activeTeam) => {
    return calculateEffectiveCost(studentId, time, events, activeTeam);
};
export const getCurrentSkillData = (studentId, time, events, activeTeam) => {
    const student = activeTeam.find(s => s.id === studentId);
    if (!student) return null;
    return resolveSkillState(studentId, time, events, student).skillData;
};

// --- CORE ---
export const calculateRegenStats = (activeTeam) => {
    let base = 0;
    let passivePercent = 0;
    let maxSpecialPercent = 0;

    activeTeam.forEach(s => {
        base += s.regenCost;
        for (const eff of s.regenEffects) {
            // ONLY STATIC PASSIVES HERE
            if (eff.type === 'Passive' || eff.type === 'PassiveStack') {
                let val = 0; 
                if (eff.type === 'PassiveStack') {
                    if (eff.condition === 'School_RedWinter') {
                        const count = activeTeam.filter(t => t.id !== s.id && t.school === 'RedWinter').length;
                        val = eff.stackValues[Math.min(count, eff.stackValues.length - 1)] || 0;
                    } else if (eff.condition === 'HeavyArmor_Striker') {
                        const count = activeTeam.filter(t => t.id !== s.id && t.role === 'Striker' && t.armorType === 'HeavyArmor').length;
                        val = eff.stackValues[Math.min(count, eff.stackValues.length - 1)] || 0;
                    }
                } else {
                    val = eff.value;
                }

                if (s.role === 'Special' && !eff.isFlat) {
                    if (val / 10000 > maxSpecialPercent) maxSpecialPercent = val / 10000;
                } else {
                    if (eff.isFlat) base += val;
                    else passivePercent += val / 10000;
                }
            }
        }
    });
    
    passivePercent += maxSpecialPercent;
    return { base: base, percent: passivePercent };
};

export const simulateCost = (targetTime, events, activeTeam, regenStats) => {
    if (targetTime < REGEN_START_DELAY) return 0;

    // 1. DELEGATE TO RESOLVER
    const { consumptionEvents, regenWindows } = resolveTimelineEffects(events, activeTeam);

    const points = new Set([REGEN_START_DELAY, targetTime]);
    consumptionEvents.forEach(c => {
        if (c.time > REGEN_START_DELAY && c.time <= targetTime) points.add(c.time);
    });
    regenWindows.forEach(w => {
        if (w.start > REGEN_START_DELAY && w.start < targetTime) points.add(w.start);
        if (w.end > REGEN_START_DELAY && w.end < targetTime) points.add(w.end);
    });

    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    let currentCost = 0;
    let tPrev = REGEN_START_DELAY;

    for (let i = 0; i < sortedPoints.length; i++) {
        const tCurr = sortedPoints[i];
        if (tCurr <= tPrev) continue;
        
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
        currentCost = Math.min(MAX_COST, currentCost + (dt * speed / COST_UNIT));

        if (tCurr <= targetTime) {
            for (const c of consumptionEvents) {
                if (Math.abs(c.time - tCurr) < 0.0001) {
                    currentCost = Math.max(0, currentCost - c.cost);
                }
            }
        }
        tPrev = tCurr;
    }

    return currentCost;
};

// ... resolveCascade unchanged (calls simulateCost) ...
export const resolveCascade = (events, activeTeam, regenStats) => {
    const reconciled = events.filter(e => e.skillType !== 'Public' && e.skillType !== 'Auto').sort((a,b)=>a.startTime-b.startTime);
    const finalEvents = [];
    
    // Simple cascade for User Events
    for (let i = 0; i < reconciled.length; i++) {
        const ev = reconciled[i];
        if (ev.skillType === 'Move') {
            finalEvents.push(ev);
            continue;
        }
        let validStart = ev.startTime;
        let attempts = 0;
        while (attempts < 200) { 
            const avail = simulateCost(validStart, finalEvents, activeTeam, regenStats);
            const needed = calculateEffectiveCost(ev.studentId, validStart, finalEvents, activeTeam);
            if (avail >= needed - 0.001) break;
            validStart += 0.1; attempts++;
        }
        if (Math.abs(validStart - ev.startTime) > 0.001) {
            ev.startTime = Math.round(validStart * 30) / 30;
            let maxVis = ev.animationDuration;
            if (ev.visualEffects) ev.visualEffects.forEach(v => maxVis = Math.max(maxVis, (v.delay||0) + (v.duration||0)));
            ev.endTime = ev.startTime + maxVis;
        }
        finalEvents.push(ev);
    }
    return finalEvents;
};