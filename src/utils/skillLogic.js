// src2/utils/skillLogic.js

export const ACCUMULATION_STUDENTS = {
    "10033": { duration: 10 }, 
    "20023": { duration: 15 }
};

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

export const resolveSkillState = (studentId, time, events, studentData) => {
    let skillData = studentData.exSkill;
    let skillType = "Ex";
    if (studentId === 10109) {
        const history = events
            .filter(e => e.studentId === studentId && (e.skillType === 'Ex' || e.skillType === 'ExExtra') && e.startTime < time)
            .length;
        if (history % 3 === 2 && studentData.extraSkills && studentData.extraSkills.length > 0) {
            skillData = studentData.extraSkills[0];
            skillType = "ExExtra";
        }
    }
    return { skillData, skillType };
};

export const checkAutoSkillTrigger = (event, historyCount, studentData) => {
    if (event.studentId === 10109) {
        if (historyCount % 3 === 1 && studentData.publicSkill) {
            const pSkill = studentData.publicSkill;
            const pStart = event.startTime + event.animationDuration + 0.05; 
            
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

// --- AUTO ATTACK GENERATOR (FIXED) ---
export const generateAutoAttacks = (userEvents, activeTeam, raidDuration) => {
    const generatedEvents = [];
    
    const blockerEvents = userEvents.filter(e => 
        ['Ex', 'ExExtra', 'Public', 'Move'].includes(e.skillType)
    ).sort((a,b) => a.startTime - b.startTime);

    activeTeam.forEach(student => {
        if (student.role !== 'Striker') return;

        const sEvents = blockerEvents.filter(e => e.studentId === student.id);
        const normal = student.normalAttack;
        if (!normal) return;

        let currentTime = 0;
        let ammo = normal.ammoCount;
        let nextAction = 'ENTER'; 
        let nextActionDuration = normal.frames.enter;

        const getNextUserEvent = (t) => sEvents.find(e => e.startTime >= t - 0.0001);

        // Safety Counters
        let loopCounter = 0;
        const MAX_LOOPS = 5000; 

        while (currentTime < raidDuration) {
            loopCounter++;
            if (loopCounter > MAX_LOOPS) break; // Prevent crash

            const nextEvent = getNextUserEvent(currentTime);
            const timeUntilEvent = nextEvent ? nextEvent.startTime - currentTime : raidDuration - currentTime;

            // 1. Collision / Interruption
            if (timeUntilEvent <= 0.001) {
                if (nextEvent) {
                    const blockDuration = nextEvent.animationDuration; 
                    currentTime = nextEvent.startTime + blockDuration;
                    
                    if (nextEvent.skillType === 'Move') {
                        nextAction = 'ENTER';
                        nextActionDuration = normal.frames.enter;
                    } else {
                        if (ammo <= 0) {
                            nextAction = 'RELOAD';
                            nextActionDuration = normal.frames.reload;
                        } else {
                            nextAction = 'ATTACK_START';
                            nextActionDuration = normal.frames.start;
                        }
                    }
                }
                continue;
            }

            // 2. Prepare Action
            let actionName = '';
            let subType = ''; 

            if (nextAction === 'ENTER') {
                actionName = "Ready"; subType = "Enter"; nextActionDuration = normal.frames.enter;
            } else if (nextAction === 'RELOAD') {
                actionName = "Reload"; subType = "Reload"; nextActionDuration = normal.frames.reload;
            } else if (nextAction === 'ATTACK_START') {
                actionName = "Aim"; subType = "Start"; nextActionDuration = normal.frames.start;
            } else if (nextAction === 'ATTACK_ING') {
                actionName = "Fire"; subType = "Ing"; nextActionDuration = normal.frames.ing;
            } else if (nextAction === 'ATTACK_DELAY') {
                actionName = "Recoil"; subType = "Delay"; nextActionDuration = normal.frames.burstDelay;
            } else if (nextAction === 'ATTACK_END') {
                actionName = "Rest"; subType = "End"; nextActionDuration = normal.frames.end;
            }

            // 3. Execute
            if (nextActionDuration <= timeUntilEvent + 0.001) {
                if (nextActionDuration > 0) {
                    generatedEvents.push({
                        // FIX: Added loopCounter to ID to prevent duplicates if time doesn't advance significantly
                        id: `auto-${student.id}-${currentTime.toFixed(3)}-${loopCounter}`,
                        studentId: student.id,
                        name: actionName,
                        skillType: 'Auto',
                        subType: subType,
                        startTime: currentTime,
                        animationDuration: nextActionDuration,
                        endTime: currentTime + nextActionDuration,
                        cost: 0,
                        rowId: sEvents[0]?.rowId || 0
                    });
                }
                currentTime += nextActionDuration;

                // State Transitions (Fixed Sequence)
                if (nextAction === 'ENTER') {
                    nextAction = ammo > 0 ? 'ATTACK_START' : 'RELOAD';
                }
                else if (nextAction === 'RELOAD') { 
                    ammo = normal.ammoCount; 
                    nextAction = 'ATTACK_START'; 
                }
                else if (nextAction === 'ATTACK_START') {
                    if (ammo > 0) nextAction = 'ATTACK_ING';
                    else nextAction = 'RELOAD';
                }
                else if (nextAction === 'ATTACK_ING') {
                    ammo = Math.max(0, ammo - normal.ammoCost);
                    if (ammo > 0) nextAction = 'ATTACK_DELAY';
                    else nextAction = 'ATTACK_END';
                }
                else if (nextAction === 'ATTACK_DELAY') {
                    // Loop back to Fire
                    nextAction = 'ATTACK_ING';
                }
                else if (nextAction === 'ATTACK_END') {
                    nextAction = 'RELOAD';
                }

            } else {
                // 4. Interrupted
                if (timeUntilEvent > 0.01) {
                    generatedEvents.push({
                        id: `auto-${student.id}-${currentTime.toFixed(3)}-${loopCounter}`,
                        studentId: student.id,
                        name: actionName,
                        skillType: 'Auto',
                        subType: subType,
                        startTime: currentTime,
                        animationDuration: timeUntilEvent,
                        endTime: currentTime + timeUntilEvent,
                        cost: 0,
                        rowId: sEvents[0]?.rowId || 0
                    });
                }

                if (nextAction === 'RELOAD') {
                    ammo = normal.ammoCount;
                }

                currentTime += timeUntilEvent;
            }
        }
    });

    return generatedEvents;
};