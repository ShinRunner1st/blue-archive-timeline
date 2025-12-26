import { resolveSkillState } from './skillLogic';

/**
 * effectResolver.js
 * * RESPONSIBILITY:
 * - Translates "Game Events" (Skills, Auto Attacks) into "Numeric Effects".
 * - Handles "Cost Reduction Stacks".
 * - Handles "Regen Triggers" (Counters, Conditions).
 * - Output is strictly for consumption by costEngine and App.js visuals.
 */

export const resolveTimelineEffects = (events, activeTeam) => {
    const consumptionEvents = []; 
    const regenWindows = [];      
    const visualMap = new Map();  // eventId -> regenData (for UI)
    
    // State Tracking
    const reductionState = new Map(); // targetId -> { amount, uses, startTime }
    const studentExCounts = new Map(); // studentId -> integer

    const sortedEvents = [...events].sort((a, b) => a.startTime - b.startTime);

    for (const event of sortedEvents) {
        // --- 0. UPDATE COUNTERS ---
        // Only User EX skills count towards "Every X EX"
        // ExExtra usually counts as EX too, depending on character implementation. 
        // For Noa/Yukari, we count invocations of the Ex Slot.
        // TOP of event loop
        if (event.skillType === 'Ex' || event.skillType === 'ExExtra') {
            const prev = studentExCounts.get(event.studentId) || 0;
            studentExCounts.set(event.studentId, prev + 1);
        }

        // --- A. COST REDUCTIONS ---
        if (event.costReduction) {
            const applyTime = event.startTime + (event.costReduction.delay || 0);
            const targetId = event.targetId || event.studentId;
            reductionState.set(targetId, {
                amount: event.costReduction.amount,
                uses: event.costReduction.uses,
                startTime: applyTime
            });
        }

        // --- B. COST CONSUMPTION ---
        let shouldConsume = event.consumesCost;
        if (shouldConsume === undefined) shouldConsume = ['Ex', 'ExExtra'].includes(event.skillType);

        if (shouldConsume) {
            const student = activeTeam.find(s => s.id === event.studentId);
            if (student) {
                const { skillData } = resolveSkillState(event.studentId, event.startTime, sortedEvents, student);
                let rawCost = skillData ? skillData.cost : (student.exSkill ? student.exSkill.cost : 0);

                if (reductionState.has(event.studentId)) {
                    const red = reductionState.get(event.studentId);
                    if (event.startTime >= red.startTime) {
                        rawCost = Math.ceil(rawCost * (1 - red.amount));
                        let consumesStack = event.consumesReduction;
                        if (consumesStack === undefined) consumesStack = true;
                        if (consumesStack) {
                            red.uses--;
                            if (red.uses <= 0) reductionState.delete(event.studentId);
                        }
                    }
                }

                if (rawCost > 0) {
                    consumptionEvents.push({ time: event.startTime, cost: rawCost });
                }
            }
        }

        // --- C. REGEN EVALUATION (Phase 3 Fix) ---
        // Do NOT trust event.regenData. Re-evaluate from student data + conditions.
        const student = activeTeam.find(s => s.id === event.studentId);
        if (student) {
            for (const eff of student.regenEffects) {
                if (eff.type !== 'Active') continue;

                // 1. Source Matching
                // Public effect -> Only triggers on Public event
                if (eff.source === 'Public' && event.skillType !== 'Public') continue;
                // Ex/Passive effect -> Only triggers on Ex event
                if ((eff.source === 'Ex' || eff.source === 'ExtraPassive') && !['Ex', 'ExExtra'].includes(event.skillType)) continue;

                // 2. Condition Evaluation
                let conditionMet = true;
                if (eff.condition === 'Every_2_Ex') {
                    const count = studentExCounts.get(event.studentId) || 0;
                    if (count === 0 || count % 2 !== 0) continue;
                }

                if (conditionMet) {
                    // Calculate Window
                    const dur = eff.duration === -1 ? (student.exSkill.animationDuration || 2) : eff.duration;
                    const start = event.startTime + eff.delay;
                    const end = start + dur;

                    if (end > start) {
                        const win = { start, end, value: eff.value, isFlat: eff.isFlat };
                        regenWindows.push(win);
                        
                        // Store for Visuals
                        visualMap.set(event.id, { 
                            delay: eff.delay, 
                            duration: dur,
                            value: eff.value,
                            isFlat: eff.isFlat
                        });
                    }
                }
            }
        }
    }

    return { consumptionEvents, regenWindows, reductionState, visualMap };
};

export const calculateEffectiveCost = (studentId, time, events, activeTeam) => {
    const pastEvents = events.filter(e => e.startTime < time - 0.0001);
    const { reductionState } = resolveTimelineEffects(pastEvents, activeTeam);

    const student = activeTeam.find(s => s.id === studentId);
    if (!student) return 0;
    
    const { skillData } = resolveSkillState(studentId, time, events, student);
    let cost = skillData ? skillData.cost : student.exSkill.cost;

    if (reductionState.has(studentId)) {
        const red = reductionState.get(studentId);
        if (time >= red.startTime) {
            cost = Math.ceil(cost * (1 - red.amount));
        }
    }
    return Math.max(0, cost);
};