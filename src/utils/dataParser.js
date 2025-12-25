// ... existing imports ...
import { snapToFrame } from './timeUtils';
import { ACCUMULATION_STUDENTS, SPECIAL_REGEN_LOGIC } from './skillLogic';
import rawStudentData from '../students.json';

const getMaxValue = (valEntry) => {
    if (Array.isArray(valEntry)) return valEntry[valEntry.length - 1];
    return valEntry;
};

const extractVisualEffects = (effects, animationDuration, studentId) => {
    const visualEffects = [];
    if (!effects) return visualEffects;

    if (ACCUMULATION_STUDENTS[studentId]) {
        visualEffects.push({
            type: "Accumulation",
            stat: "Accumulation",
            duration: ACCUMULATION_STUDENTS[studentId].duration,
            delay: animationDuration 
        });
        return visualEffects;
    }

    effects.forEach(effect => {
        const type = effect.Type;
        const targets = Array.isArray(effect.Target) ? effect.Target : [effect.Target];
        
        if (["CrowdControl", "Knockback", "Dispel", "ConcentratedTarget", "CostChange"].includes(type)) return;

        const duration = (effect.Duration || 0) / 1000;
        let delay = (effect.ApplyFrame || 0) / 30;

        if (type === "Summon") {
            delay = Math.max(delay, animationDuration);
        }

        let shouldShow = false;
        if (type === "Buff" || type === "Regen") {
            if (duration > 0) shouldShow = true;
        }
        else if (type === "Summon" || type === "DamageDebuff" || type === "Special" || type === "Shield") {
            if (duration > 0) shouldShow = true;
        }

        if (shouldShow) {
            visualEffects.push({
                type: type,
                stat: effect.Stat || type,
                duration: duration,
                delay: delay,
                target: targets.length === 1 ? targets[0] : "Self",
                channel: effect.Channel
            });
        }
    });
    return visualEffects;
};

export const parseStudentData = (rawStudentData) => {
  return Object.values(rawStudentData).map(student => {
    // ... (EX Skill parsing same as before) ...
    const exSkill = student.Skills?.Ex || {}; 
    const effects = exSkill.Effects || [];
    const effectType = effects.length > 0 ? (effects[0].Type || "Unknown") : "Unknown";
    const costVal = exSkill.Cost && exSkill.Cost.length >= 5 ? exSkill.Cost[4] : (exSkill.Cost ? exSkill.Cost[0] : 0);
    const animationDuration = snapToFrame((exSkill.Duration || 0) / 30);
    
    // ... Cost reduction / Visual effects parsing ...
    const costChangeEffect = effects.find(e => e.Type === "CostChange");
    let costReduction = null;
    if (costChangeEffect) {
        const val = costChangeEffect.Scale ? costChangeEffect.Scale[0] : 0;
        const delayFrames = costChangeEffect.ApplyFrame || 0;
        costReduction = { target: costChangeEffect.Target, uses: costChangeEffect.Uses || 1, amount: Math.abs(val) / 10000, delay: delayFrames / 30 };
    }
    
    const visualEffects = extractVisualEffects(effects, animationDuration, student.Id);
    let mainEffectDelay = 0; const mainEffect = visualEffects.find(v => v.duration > 0); if (mainEffect) mainEffectDelay = mainEffect.delay;
    const extraSkillsRaw = exSkill.ExtraSkills || [];
    const extraSkills = extraSkillsRaw.map(es => { const d = snapToFrame((es.Duration || 0) / 30); return { name: es.Name, type: "ExExtra", cost: es.Cost && es.Cost.length >= 5 ? es.Cost[4] : 0, animationDuration: d, visualEffects: extractVisualEffects(es.Effects, d, student.Id) }; });
    const publicSkillRaw = student.Skills?.Public;
    let publicSkill = null;
    if (publicSkillRaw) { const d = snapToFrame((publicSkillRaw.Duration || 0) / 30); publicSkill = { name: publicSkillRaw.Name, type: "Public", cost: 0, animationDuration: d, visualEffects: extractVisualEffects(publicSkillRaw.Effects, d, student.Id) }; }

    // --- NORMAL ATTACK PARSING ---
    const normalSkillRaw = student.Skills?.Normal || {};
    const normalFrames = normalSkillRaw.Frames || {};
    
    // SAFEGUARDS for bad data to prevent crashes
    const ammoCount = (student.AmmoCount && student.AmmoCount > 0) ? student.AmmoCount : 1; 
    const ammoCost = (student.AmmoCost && student.AmmoCost > 0) ? student.AmmoCost : 1;

    const normalAttack = {
        ammoCount: ammoCount,
        ammoCost: ammoCost,
        frames: {
            enter: (normalFrames.AttackEnterDuration || 0) / 30,
            start: (normalFrames.AttackStartDuration || 0) / 30,
            end: (normalFrames.AttackEndDuration || 0) / 30,
            ing: (normalFrames.AttackIngDuration || 0) / 30,
            burstDelay: (normalFrames.AttackBurstRoundOverDelay || 0) / 30,
            reload: (normalFrames.AttackReloadDuration || 0) / 30
        }
    };

    // ... Regen parsing (same as before) ...
    const regenEffects = [];
    ['Ex', 'Public', 'Passive', 'ExtraPassive', 'GearPublic'].forEach(slot => {
        const skill = student.Skills?.[slot]; if (!skill || !skill.Effects) return;
        skill.Effects.forEach(effect => {
            if (effect.Stat === 'RegenCost_Base' || effect.Stat === 'RegenCost_Coefficient') {
                // ... same regen parsing logic ...
                // Copy-paste simplified for brevity, assume logic remains
                const isFlat = effect.Stat === 'RegenCost_Base';
                const val = (effect.Value && effect.Value[0] && Array.isArray(effect.Value[0])) ? effect.Value[effect.Value.length-1] : (effect.Value ? effect.Value[0] : 0);
                // ... logic ...
                let logicType = 'Passive'; let dur = effect.Duration ? effect.Duration / 1000 : 0; let delay = effect.ApplyFrame ? effect.ApplyFrame / 30 : 0;
                if (slot === 'ExtraPassive' && delay === 0) delay = animationDuration;
                if(dur>0) logicType='Active';
                if(logicType==='Active' && dur===-1) { let m=0; visualEffects.forEach(v=>m=Math.max(m,v.duration)); dur = m>0?m:animationDuration; }
                
                // Special overrides check (using SPECIAL_REGEN_LOGIC imported)
                const spec = SPECIAL_REGEN_LOGIC[student.Id];
                if(spec && spec.slot===slot){ if(spec.type==='Ignore')return; logicType=spec.type; if(spec.duration!==undefined)dur=spec.duration; }

                regenEffects.push({ type: logicType, isFlat, value: getMaxValue(val), stackValues: [], duration: dur, delay, condition: spec?.condition, source: slot });
            }
        });
    });

    let requiresTarget = false; visualEffects.forEach(ve => { if (ve.target === "AllyMain") requiresTarget = true; });

    return {
      id: student.Id, name: student.Name, school: student.School, role: student.SquadType === 'Main' ? 'Striker' : 'Special',
      armorType: student.ArmorType, regenCost: student.RegenCost, devName: student.DevName,
      regenEffects, extraSkills, publicSkill, normalAttack,
      exSkill: { name: exSkill.Name || "Unknown", type: effectType, cost: costVal, costReduction, animationDuration, visualEffects, mainEffectDelay, requiresTarget }
    };
  });
};

export const ALL_STUDENTS = parseStudentData(rawStudentData);