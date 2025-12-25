import { COST_UNIT, MAX_COST, REGEN_START_DELAY } from './constants';
import { resolveSkillState, checkAutoSkillTrigger, generateAutoAttacks } from './skillLogic';

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
                    if (eff.isFlat) base += val;
                    else passivePercent += val / 10000;
                }
            }
        }
    });
    passivePercent += maxSpecialPercent;
    return { base: base, percent: passivePercent };
};

export const getCurrentSkillData = (studentId, time, events, activeTeam) => {
    const student = activeTeam.find(s => s.id === studentId);
    if (!student) return null;
    return resolveSkillState(studentId, time, events, student).skillData;
};

// COST REDUCTION LOGIC (Fixed)
export const getEffectiveCost = (studentId, time, events, activeTeam) => {
    const student = activeTeam.find(s => s.id === studentId);
    if (!student) return 0;
    
    const { skillData } = resolveSkillState(studentId, time, events, student);
    let cost = skillData ? skillData.cost : student.exSkill.cost;

    // We must simulate the timeline up to 'time' to know which reductions are active/consumed
    const timeline = events.filter(e => e.startTime < time - 0.0001).sort((a,b) => a.startTime - b.startTime);
    
    const activeReductions = {}; // Map<TargetID, {amount, uses}>

    for (const e of timeline) {
        // 1. Register new reduction
        if (e.costReduction) {
            // Target Logic: 'Self' or 'AllyMain' -> mapped to ID
            // Assuming costReduction.target is raw string "AllyMain" or "Self"
            // We need the actual ID. App.js puts specific targetId in e.targetId if manual target.
            
            let applyToIds = [];
            if (e.costReduction.target === 'Self') applyToIds.push(e.studentId);
            else if (e.targetId) applyToIds.push(e.targetId); // Targeted buff
            
            applyToIds.forEach(id => {
                activeReductions[id] = { amount: e.costReduction.amount, uses: e.costReduction.uses };
            });
        }

        // 2. Consume reduction (if this event cost something)
        if (e.cost > 0) {
            if (activeReductions[e.studentId]) {
                activeReductions[e.studentId].uses--;
                if (activeReductions[e.studentId].uses <= 0) delete activeReductions[e.studentId];
            }
        }
    }

    // 3. Apply to current check
    if (activeReductions[studentId]) {
        // Round Up as requested
        cost = Math.ceil(cost * (1 - activeReductions[studentId].amount));
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
            for (const eff of student.regenEffects) {
                if (eff.type === 'Active') {
                    if (eff.source === 'Public' && e.skillType !== 'Public') continue;
                    if (eff.source !== 'Public' && e.skillType === 'Public') continue;

                    const start = e.startTime + eff.delay;
                    const end = start + (eff.duration === -1 ? student.exSkill.effectDuration : eff.duration);
                    
                    // FIX: Ensure Active Regen actually has a duration
                    if (end > start) {
                        if (start > REGEN_START_DELAY && start < targetTime) points.add(start);
                        if (end > REGEN_START_DELAY && end < targetTime) points.add(end);
                    }
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
        const activeKeys = new Set(); // Prevent double counting same buff stack? No, separate stacks ok.

        for (const e of sortedEvents) {
            if (e.startTime > tMid) break;
            const student = activeTeam.find(s => s.id === e.studentId);
            if (!student) continue;
            
            // Auto/Move don't trigger regen skills
            if (e.skillType === 'Auto' || e.skillType === 'Move') continue;

            const useCount = sortedEvents.filter(ev => ev.studentId === e.studentId && ev.startTime <= e.startTime).length;

            for (const eff of student.regenEffects) {
                if (eff.type === 'Active') {
                    if (eff.condition === 'Every_2_Ex' && useCount % 2 !== 0) continue;
                    if (eff.source === 'Public' && e.skillType !== 'Public') continue;
                    if (eff.source !== 'Public' && e.skillType === 'Public') continue;

                    const dur = eff.duration === -1 ? student.exSkill.effectDuration : eff.duration;
                    const start = e.startTime + eff.delay;
                    const end = start + dur;
                    
                    if (start <= tMid && end >= tCurr) {
                        // Unique Key per Event+Effect to allow stacking if multiple casts overlap
                        const key = `${e.id}-${eff.source}`; 
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

        // Deduct cost at tCurr
        if (tCurr <= targetTime) {
            for (const e of sortedEvents) {
                // Use small epsilon for float comparison
                if (Math.abs(e.startTime - tCurr) < 0.0001) {
                    if (e.cost > 0) {
                        const cost = getEffectiveCost(e.studentId, e.startTime, sortedEvents, activeTeam);
                        currentCost -= cost;
                    }
                }
            }
        }
        tPrev = tCurr;
    }
    return Math.max(0, currentCost); // Prevent negative
};

// ... reconcile/resolveCascade same as before ...
export const reconcileTimeline = (events, activeTeam) => {
    let cleanEvents = events.filter(e => e.skillType !== 'Public' && e.skillType !== 'Auto'); 
    cleanEvents.sort((a, b) => a.startTime - b.startTime);

    const reconciledEvents = [];
    const studentCounters = {}; 

    cleanEvents.forEach(ev => {
        if (!studentCounters[ev.studentId]) studentCounters[ev.studentId] = 0;

        const studentData = activeTeam.find(s => s.id === ev.studentId);
        
        if (ev.skillType === 'Move') {
            reconciledEvents.push(ev);
            return; 
        }

        const { skillData, skillType } = resolveSkillState(ev.studentId, ev.startTime, reconciledEvents, studentData);

        ev.name = skillData.name;
        ev.skillType = skillType;
        ev.cost = skillData.cost;
        ev.animationDuration = skillData.animationDuration;
        ev.visualEffects = skillData.visualEffects;
        ev.costReduction = skillData.costReduction;
        
        let maxVis = ev.animationDuration;
        if (ev.visualEffects) ev.visualEffects.forEach(v => maxVis = Math.max(maxVis, v.delay + v.duration));
        if (ev.regenData) maxVis = Math.max(maxVis, ev.regenData.delay + ev.regenData.duration);
        ev.endTime = ev.startTime + maxVis;

        reconciledEvents.push(ev);

        const autoEvent = checkAutoSkillTrigger(ev, studentCounters[ev.studentId], studentData);
        if (autoEvent) {
            reconciledEvents.push(autoEvent);
        }

        studentCounters[ev.studentId]++;
    });

    return reconciledEvents;
};

export const resolveCascade = (events, activeTeam, regenStats, raidDuration = 240) => {
    const reconciled = reconcileTimeline(events, activeTeam);
    const cascadeEvents = [];
    
    for (let i = 0; i < reconciled.length; i++) {
        const ev = reconciled[i];
        if (ev.skillType === 'Public' || ev.skillType === 'Move') {
            cascadeEvents.push(ev);
            continue;
        }

        let validStart = ev.startTime;
        let attempts = 0;
        while (attempts < 200) { 
            const avail = simulateCost(validStart, cascadeEvents, activeTeam, regenStats);
            const needed = getEffectiveCost(ev.studentId, validStart, cascadeEvents, activeTeam);
            if (avail >= needed - 0.001) break;
            validStart += 0.1; attempts++;
        }
        
        if (Math.abs(validStart - ev.startTime) > 0.001) {
            ev.startTime = Math.round(validStart * 30) / 30;
            let maxVis = ev.animationDuration;
            if (ev.visualEffects && Array.isArray(ev.visualEffects)) {
                ev.visualEffects.forEach(v => maxVis = Math.max(maxVis, (v.delay||0) + (v.duration||0)));
            }
            if (ev.regenData) maxVis = Math.max(maxVis, (ev.regenData.delay||0) + (ev.regenData.duration||0));
            ev.endTime = ev.startTime + maxVis;
        }
        cascadeEvents.push(ev);
    }
    
    const finalUserEvents = reconcileTimeline(cascadeEvents, activeTeam);
    const autoAttacks = generateAutoAttacks(finalUserEvents, activeTeam, raidDuration);

    return [...finalUserEvents, ...autoAttacks];
};