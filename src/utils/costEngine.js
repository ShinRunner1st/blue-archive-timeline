import { COST_UNIT, MAX_COST, REGEN_START_DELAY } from './constants';

export const calculateRegenStats = (activeTeam) => {
    let base = 0;
    let passivePercent = 0;
    let maxSpecialPercent = 0;

    activeTeam.forEach(s => {
        base += s.regenCost;
        for (const eff of s.regenEffects) {
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
                    if (eff.isFlat) base += valueToAdd;
                    else passivePercent += valueToAdd / 10000;
                }
            }
        }
    });
    passivePercent += maxSpecialPercent;
    return { base: base, percent: passivePercent };
};

export const getEffectiveCost = (studentId, time, events, activeTeam) => {
    const student = activeTeam.find(s => s.id === studentId);
    if (!student) return 0;
    
    let cost = student.exSkill.cost;
    const sorted = events.filter(e => e.startTime <= time).sort((a,b) => a.startTime - b.startTime);
    const activeReductions = {};

    for (const e of sorted) {
        if (e.costReduction && e.targetId) {
            // Find delay from visualEffects or single visualData
            // Prefer visualEffects array
            let delay = 0;
            if (e.visualEffects) {
                // Find main buff delay? Or just use 0? Usually CostChange applies with buff.
                // We'll search for CostChange delay parsed in dataParser if available, 
                // but currently it's stuck in 'visualData' or 'costReduction.delay' in dataParser.
                // dataParser puts delay inside costReduction object.
                delay = e.costReduction.delay || 0;
            } else if (e.visualData) {
                delay = e.visualData.delay;
            }
            
            const applyTime = e.startTime + delay;
            if (time >= applyTime) {
                activeReductions[e.targetId] = { ...e.costReduction };
            }
        }
        if (e.startTime < time && activeReductions[e.studentId]) {
            activeReductions[e.studentId].uses--;
            if (activeReductions[e.studentId].uses <= 0) delete activeReductions[e.studentId];
        }
    }

    if (activeReductions[studentId]) {
        cost = Math.floor(cost * (1 - activeReductions[studentId].amount));
    }
    return Math.max(0, cost);
};

export const simulateCost = (targetTime, events, activeTeam, regenStats) => {
    if (targetTime < REGEN_START_DELAY) return 0;

    const points = new Set([REGEN_START_DELAY, targetTime]);
    const sortedEvents = [...events].sort((a,b) => a.startTime - b.startTime);

    for (const e of sortedEvents) {
        if (e.startTime > REGEN_START_DELAY && e.startTime <= targetTime) points.add(e.startTime);
        
        const student = activeTeam.find(s => s.id === e.studentId);
        if (student) {
            const useCount = sortedEvents.filter(ev => ev.studentId === e.studentId && ev.startTime <= e.startTime).length;
            for (const eff of student.regenEffects) {
                if (eff.type === 'Active') {
                    if (eff.condition === 'Every_2_Ex' && useCount % 2 !== 0) continue;
                    const start = e.startTime + eff.delay;
                    const end = start + (eff.duration === -1 ? student.exSkill.effectDuration : eff.duration);
                    if (start > REGEN_START_DELAY && start < targetTime) points.add(start);
                    if (end > REGEN_START_DELAY && end < targetTime) points.add(end);
                }
            }
        }
    }

    const sortedPoints = Array.from(points).sort((a, b) => a - b);
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
            
            const useCount = sortedEvents.filter(ev => ev.studentId === e.studentId && ev.startTime <= e.startTime).length;
            for (const eff of student.regenEffects) {
                if (eff.type === 'Active') {
                    if (eff.condition === 'Every_2_Ex' && useCount % 2 !== 0) continue;
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
        currentCost = Math.min(MAX_COST, currentCost + (dt * speed / COST_UNIT));

        if (tCurr <= targetTime) {
            for (const e of sortedEvents) {
                if (Math.abs(e.startTime - tCurr) < 0.0001) {
                    const cost = getEffectiveCost(e.studentId, e.startTime, sortedEvents, activeTeam);
                    currentCost -= cost;
                }
            }
        }
        tPrev = tCurr;
    }
    return currentCost;
};

export const resolveCascade = (events, activeTeam, regenStats) => {
    // 1. Sort by time to process sequentially
    const sorted = [...events].sort((a,b) => a.startTime - b.startTime);
    const resolved = [];
    
    for (let i = 0; i < sorted.length; i++) {
        const ev = { ...sorted[i] };
        let validStart = ev.startTime;
        let attempts = 0;
        
        // Find earliest valid time where cost is sufficient
        while (attempts < 200) { 
            const avail = simulateCost(validStart, resolved, activeTeam, regenStats);
            const needed = getEffectiveCost(ev.studentId, validStart, resolved, activeTeam);
            
            if (avail >= needed - 0.001) {
                break;
            } else {
                validStart += 0.1; 
                attempts++;
            }
        }
        
        // Update Start and End times if shifted
        if (Math.abs(validStart - ev.startTime) > 0.001) {
            ev.startTime = Math.round(validStart * 30) / 30;
            
            let maxVis = ev.animationDuration;
            
            // Handle Multiple Visual Effects (New Logic)
            if (ev.visualEffects && Array.isArray(ev.visualEffects)) {
                ev.visualEffects.forEach(v => {
                    maxVis = Math.max(maxVis, (v.delay || 0) + (v.duration || 0));
                });
            }
            // Fallback for old/mixed structure
            else if (ev.visualData) {
                maxVis = Math.max(maxVis, (ev.visualData.delay || 0) + (ev.visualData.duration || 0));
            }
            
            if (ev.regenData) {
                maxVis = Math.max(maxVis, (ev.regenData.delay || 0) + (ev.regenData.duration || 0));
            }
            
            ev.endTime = ev.startTime + maxVis;
        }
        
        resolved.push(ev);
    }
    return resolved;
};