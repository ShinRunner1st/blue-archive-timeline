// 1. Accumulation Buffs (e.g. Wakamo)
export const ACCUMULATION_STUDENTS = {
    "10033": { duration: 10 }, 
    "20023": { duration: 15 }
};

// 2. Special Regen Logic (Overrides)
export const SPECIAL_REGEN_LOGIC = {
    "10003": { slot: "ExtraPassive", type: "Active", duration: 5 }, 
    "10017": { slot: "ExtraPassive", type: "PassiveStack", condition: "School_RedWinter" }, 
    "10045": { slot: "ExtraPassive", type: "Active", duration: -1 }, 
    "10071": { slot: "ExtraPassive", type: "Ignore" }, 
    "10104": { slot: "ExtraPassive", type: "Active", duration: 5 }, 
    "10109": { slot: "Public", type: "Active", condition: "Every_2_Ex", duration: 30 }, 
    "10110": { slot: "Ex", type: "Active", duration: 15 }, 
    "10121": { slot: "ExtraPassive", type: "Active", condition: "Every_2_Ex", duration: 10 }, 
    "10126": { slot: "ExtraPassive", type: "PassiveStack", condition: "HeavyArmor_Striker" }, 
    "10129": { slot: "ExtraPassive", type: "Active", duration: 35 } 
};

/**
 * Determines the next skill state (Normal vs Extra) based on usage history.
 * Used for Noa (Pajamas) cycling logic.
 */
export const resolveSkillState = (studentId, time, events, studentData) => {
    let skillData = studentData.exSkill;
    let skillType = "Ex";

    // --- NOA PAJAMA LOGIC (ID: 10109) ---
    if (studentId === 10109) {
        // Count previous EX/Extra usages strictly before this time
        const history = events
            .filter(e => e.studentId === studentId && (e.skillType === 'Ex' || e.skillType === 'ExExtra') && e.startTime < time)
            .length;
        
        // Cycle: Ex (0) -> Ex (1) -> [Public Auto triggers] -> Extra (2) -> Ex (0)
        if (history % 3 === 2 && studentData.extraSkills && studentData.extraSkills.length > 0) {
            skillData = studentData.extraSkills[0];
            skillType = "ExExtra";
        }
    }

    return { skillData, skillType };
};

/**
 * Checks if a Public (Auto) skill should be triggered by the current event.
 * Returns the Public Event object template if triggered, or null.
 */
export const checkAutoSkillTrigger = (event, historyCount, studentData) => {
    // --- NOA PAJAMA LOGIC ---
    if (event.studentId === 10109) {
        // Trigger Public after 2nd Cast (Index 1)
        if (historyCount % 3 === 1 && studentData.publicSkill) {
            const pSkill = studentData.publicSkill;
            
            // FIX: Use startTime + animationDuration (Casting End) instead of endTime (Visual Block End)
            // Added 0.05s buffer to prevent overlap glitches
            const pStart = event.startTime + event.animationDuration + 0.05; 
            
            // Get Public Regen Data if exists
            let pRegenData = null;
            const pRegenEffect = studentData.regenEffects.find(eff => eff.source === 'Public');
            if (pRegenEffect) {
                pRegenData = { delay: pRegenEffect.delay, duration: pRegenEffect.duration };
            }

            let pMax = pSkill.animationDuration;
            if(pSkill.visualEffects) pSkill.visualEffects.forEach(v => pMax = Math.max(pMax, v.delay + v.duration));
            if (pRegenData) pMax = Math.max(pMax, pRegenData.delay + pRegenData.duration);

            return {
                id: `auto-public-${event.id}`, 
                studentId: event.studentId,
                name: pSkill.name,
                skillType: 'Public',
                cost: 0,
                startTime: pStart,
                animationDuration: pSkill.animationDuration,
                visualEffects: pSkill.visualEffects,
                regenData: pRegenData,
                endTime: pStart + pMax,
                rowId: event.rowId,
                isAuto: true
            };
        }
    }
    return null;
};