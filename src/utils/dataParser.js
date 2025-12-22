import { snapToFrame } from './timeUtils';
import rawStudentData from '../students.json';

const ACCUMULATION_STUDENTS = {
    "10033": { duration: 10 }, 
    "20023": { duration: 15 }
};

const SPECIAL_REGEN_LOGIC = {
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

const getMaxValue = (valEntry) => {
    if (Array.isArray(valEntry)) return valEntry[valEntry.length - 1];
    return valEntry;
};

const parseStudentData = (data) => {
  return Object.values(data).map(student => {
    const exSkill = student.Skills?.Ex || {}; 
    const effects = exSkill.Effects || [];
    
    const effectType = effects.length > 0 ? (effects[0].Type || "Unknown") : "Unknown";
    const costVal = exSkill.Cost && exSkill.Cost.length >= 5 ? exSkill.Cost[4] : (exSkill.Cost ? exSkill.Cost[0] : 0);
    const animationDuration = snapToFrame((exSkill.Duration || 0) / 30);

    const costChangeEffect = effects.find(e => e.Type === "CostChange");
    let costReduction = null;
    if (costChangeEffect) {
        const val = costChangeEffect.Scale ? costChangeEffect.Scale[0] : 0;
        const delayFrames = costChangeEffect.ApplyFrame || 0;
        costReduction = {
            target: costChangeEffect.Target, 
            uses: costChangeEffect.Uses || 1,
            amount: Math.abs(val) / 10000,
            delay: delayFrames / 30
        };
    }

    const visualEffects = [];
    let requiresTarget = false;
    let mainEffectDelay = 0;

    if (ACCUMULATION_STUDENTS[student.Id]) {
        visualEffects.push({
            type: "Accumulation",
            stat: "Accumulation",
            duration: ACCUMULATION_STUDENTS[student.Id].duration,
            delay: animationDuration 
        });
    } 
    else {
        for (const effect of effects) {
            const type = effect.Type;
            const targets = Array.isArray(effect.Target) ? effect.Target : [effect.Target];
            
            if (["CrowdControl", "Knockback", "Dispel", "ConcentratedTarget", "CostChange"].includes(type)) continue;

            const duration = (effect.Duration || 0) / 1000;
            let delay = (effect.ApplyFrame || 0) / 30;

            if (type === "Summon") {
                delay = Math.max(delay, animationDuration);
            }

            let shouldShow = false;

            if (type === "Buff" || type === "Regen") {
                if (targets.length === 1) {
                    const t = targets[0];
                    if (t === "AllyMain" || (type === "Regen" && t === "Ally")) {
                        requiresTarget = true;
                    }
                }
                if (duration > 0) shouldShow = true;
            }
            else if (type === "Summon" || type === "DamageDebuff" || type === "Special" || type === "Shield") {
                if (duration > 0) shouldShow = true;
            }

            if (shouldShow) {
                visualEffects.push({
                    type: type,
                    stat: effect.Stat || type, // Store Stat for identification
                    duration: duration,
                    delay: delay,
                    target: targets.length === 1 ? targets[0] : "Self"
                });
                if (duration > 0 && mainEffectDelay === 0) mainEffectDelay = delay;
            }
        }
    }

    const regenEffects = [];
    ['Ex', 'Public', 'Passive', 'ExtraPassive', 'GearPublic'].forEach(slot => {
        const skill = student.Skills?.[slot];
        if (!skill || !skill.Effects) return;

        skill.Effects.forEach(effect => {
            if (effect.Stat === 'RegenCost_Base' || effect.Stat === 'RegenCost_Coefficient') {
                const isFlat = effect.Stat === 'RegenCost_Base';
                const isStacking = effect.Value && effect.Value.length > 1 && Array.isArray(effect.Value[0]);
                let value = 0;
                let stackValues = [];

                if (isStacking) {
                    stackValues = effect.Value.map(row => getMaxValue(row));
                } else if (effect.Value && effect.Value[0]) {
                    value = getMaxValue(effect.Value[0]);
                }

                const specLogic = SPECIAL_REGEN_LOGIC[student.Id];
                
                let logicType = 'Passive'; 
                let condition = null;
                let dur = effect.Duration ? effect.Duration / 1000 : 0;
                let delay = effect.ApplyFrame ? effect.ApplyFrame / 30 : 0;

                if (specLogic && specLogic.slot === slot) {
                    if (specLogic.type === 'Ignore') return;
                    logicType = specLogic.type;
                    if (specLogic.duration !== undefined) dur = specLogic.duration;
                    if (specLogic.condition) condition = specLogic.condition;
                } 
                else if (dur > 0) {
                    logicType = 'Active';
                }

                if (logicType === 'Active' && dur === -1) {
                    let maxDur = 0;
                    visualEffects.forEach(v => maxDur = Math.max(maxDur, v.duration));
                    dur = maxDur > 0 ? maxDur : animationDuration; 
                }

                regenEffects.push({
                    type: logicType,
                    isFlat,
                    value,
                    stackValues,
                    duration: dur,
                    delay: delay,
                    condition,
                    source: slot
                });
            }
        });
    });

    return {
      id: student.Id,
      name: student.Name,
      school: student.School,
      role: student.SquadType === 'Main' ? 'Striker' : 'Special',
      armorType: student.ArmorType,
      regenCost: student.RegenCost,
      devName: student.DevName,
      regenEffects,
      exSkill: {
        name: exSkill.Name || "Unknown",
        type: effectType,
        cost: costVal, 
        costReduction: costReduction,
        animationDuration: animationDuration,
        visualEffects: visualEffects,
        mainEffectDelay: mainEffectDelay,
        requiresTarget: requiresTarget
      }
    };
  });
};

export const ALL_STUDENTS = parseStudentData(rawStudentData);