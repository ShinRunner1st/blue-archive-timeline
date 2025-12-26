// src6/utils/autoEngine.js

const EPS = 1e-6;
let UID = 0;

function uid(prefix) {
  return `${prefix}-${Date.now()}-${UID++}`;
}

const FRAME_MAP = {
    ATTACK_ENTER: 'enter',
    ATTACK_START: 'start',
    ATTACK_ING: 'ing',
    BURST_DELAY: 'burstDelay',
    ATTACK_END: 'end',
    RELOAD: 'reload'
};

const PUBLIC_CONDITIONS = {
  // Noa (Pajamas)
  '10109': [
    { type: 'AFTER_EX', count: 2 } 
  ]
};

const DEFAULT_INIT_MOVE = 2.0;

export const generateAutoTimeline = (userEvents, activeTeam, raidDuration, initialMoves = {}) => {
    const generatedEvents = [];
    
    // Sort User Events (Blockers) - Filter for Ex and Move
    const userBlockers = userEvents.filter(e => 
        ['Ex', 'ExExtra', 'Move'].includes(e.skillType)
    ).sort((a,b) => a.startTime - b.startTime);

    activeTeam.forEach((student, rowIndex) => {
        if (student.role !== 'Striker') return;
        const normal = student.normalAttack;
        if (!normal) return;

        let t = 0;
        let ammo = normal.ammoCount;
        let state = 'ENTER'; 
        let blockIdx = 0;
        
        // Public Skill State
        const publicConds = PUBLIC_CONDITIONS[student.id];
        let publicReady = false;
        let exCountForPublic = 0;

        const emit = (name, type, subType, startTime, duration, data = {}) => {
            if (duration <= 0) return;
            generatedEvents.push({
                id: uid(`auto-${student.id}`),
                studentId: student.id,
                name: name,
                skillType: type, 
                subType: subType, 
                startTime: startTime,
                animationDuration: duration,
                endTime: startTime + duration,
                rowId: rowIndex,
                cost: 0,
                consumesCost: false,
                regenData: data.regenData || null,
                visualEffects: data.visualEffects || [],
                isAuto: true
            });
        };

        // --- PRE-LOOP: INITIAL MOVE ---
        // Lookup configured duration or default
        const initDur = initialMoves[student.id] || DEFAULT_INIT_MOVE;
        // Generate with special ID prefix so App.js knows how to edit it
        const initMoveId = `init-move-${student.id}`;
        
        generatedEvents.push({
            id: initMoveId,
            studentId: student.id,
            name: "Initial Move",
            skillType: "Move",
            subType: "Move",
            startTime: 0,
            animationDuration: initDur,
            endTime: initDur,
            rowId: rowIndex,
            cost: 0,
            consumesCost: false,
            isAuto: true // It's auto-generated, but editable via config
        });
        t = initDur;

        const getNextBlocker = () => {
            if (blockIdx >= userBlockers.length) return null;
            for (let i = blockIdx; i < userBlockers.length; i++) {
                if (userBlockers[i].studentId === student.id) return userBlockers[i];
            }
            return null;
        };

        let loops = 0;
        while (t < raidDuration && loops < 5000) {
            loops++;
            const nextBlock = getNextBlocker();
            const nextBlockTime = nextBlock ? nextBlock.startTime : Infinity;

            // 1. HANDLE INTERRUPTS (EX)
            if (nextBlock && nextBlock.skillType.startsWith('Ex') && nextBlockTime <= t + EPS) {
                if (publicConds) {
                     exCountForPublic++;
                     const cond = publicConds.find(c => c.type === 'AFTER_EX');
                     if (cond && exCountForPublic % cond.count === 0) {
                         publicReady = true;
                     }
                }

                // FIX: Block only for ANIMATION duration (Action), not full Effect duration
                // Buffs are overlays, they do not stop the state machine.
                const actionEndTime = nextBlock.startTime + nextBlock.animationDuration;
                t = Math.max(t, actionEndTime); 
                
                state = null; 
                
                const realIdx = userBlockers.indexOf(nextBlock);
                if (realIdx >= blockIdx) blockIdx = realIdx + 1;
                continue;
            }

            // 2. STATE MACHINE DECISION
            if (!state) {
                if (publicReady && student.publicSkill) {
                    state = 'PUBLIC';
                } else if (ammo <= 0) {
                    state = 'RELOAD';
                } else {
                    state = 'ATTACK_START';
                }
            }

            // 3. HANDLE QUEUED BLOCKS (MOVE)
            if (nextBlock && nextBlock.skillType === 'Move' && nextBlockTime <= t + EPS) {
                if (state !== 'ATTACK_END' && state !== 'ENTER' && state !== 'RELOAD' && state !== 'PUBLIC') {
                    const dur = normal.frames[FRAME_MAP.ATTACK_END];
                    emit("Rest", "Auto", "End", t, dur);
                    t += dur;
                }
                
                // For Move, we DO block for full duration (it's an action)
                // App.js ensures Move events have animationDuration == duration
                t = Math.max(t, nextBlock.endTime);
                state = 'ENTER'; 
                
                const realIdx = userBlockers.indexOf(nextBlock);
                if (realIdx >= blockIdx) blockIdx = realIdx + 1;
                continue;
            }

            // 4. EXECUTE STATES
            let dur = 0;
            let nextState = null;
            let evtName = "";
            let evtSub = "";
            let extraData = {};
            
            if (state === 'ENTER') {
                dur = normal.frames[FRAME_MAP.ATTACK_ENTER];
                evtName = "Ready"; evtSub = "Enter";
                nextState = null; 
            }
            else if (state === 'PUBLIC') {
                const pSkill = student.publicSkill;
                dur = pSkill.animationDuration;
                evtName = pSkill.name; evtSub = "Public";
                
                const pubRegen = student.regenEffects.find(eff => eff.source === 'Public');
                if (pubRegen) {
                    extraData.regenData = { ...pubRegen }; 
                }
                extraData.visualEffects = pSkill.visualEffects;

                publicReady = false; 
                nextState = null; 
                
                emit(evtName, "Public", "Public", t, dur, extraData);
                t += dur;
                state = null;
                continue;
            }
            else if (state === 'RELOAD') {
                dur = normal.frames[FRAME_MAP.RELOAD];
                evtName = "Reload"; evtSub = "Reload";
                nextState = 'ATTACK_START';
            }
            else if (state === 'ATTACK_START') {
                dur = normal.frames[FRAME_MAP.ATTACK_START];
                evtName = "Aim"; evtSub = "Start";
                nextState = 'ATTACK_ING';
            }
            else if (state === 'ATTACK_ING') {
                dur = normal.frames[FRAME_MAP.ATTACK_ING];
                evtName = "Fire"; evtSub = "Ing";
                nextState = 'CHECK_AMMO'; 
            }
            else if (state === 'BURST_DELAY') {
                dur = normal.frames[FRAME_MAP.BURST_DELAY];
                evtName = "Recoil"; evtSub = "Delay";
                nextState = 'ATTACK_ING';
            }
            else if (state === 'ATTACK_END') {
                dur = normal.frames[FRAME_MAP.ATTACK_END];
                evtName = "Rest"; evtSub = "End";
                nextState = 'RELOAD'; 
            }

            let availableTime = Infinity;
            if (nextBlock && nextBlock.skillType.startsWith('Ex')) {
                availableTime = nextBlock.startTime - t;
            }

            if (dur <= availableTime + 0.001) {
                if (state !== 'PUBLIC') { 
                    emit(evtName, "Auto", evtSub, t, dur);
                }
                t += dur;
                
                if (state === 'RELOAD') ammo = normal.ammoCount;
                if (state === 'ATTACK_ING') ammo = Math.max(0, ammo - normal.ammoCost);
                
                if (nextState === 'CHECK_AMMO') {
                    if (ammo > 0) state = 'BURST_DELAY';
                    else state = 'ATTACK_END';
                } else if (nextState) {
                    state = nextState;
                } else {
                    state = null;
                }
            } else {
                if (availableTime > 0.02) {
                    emit(evtName, "Auto", evtSub, t, availableTime);
                }
                t += availableTime;
            }
        }
    });

    return generatedEvents;
};