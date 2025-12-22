import React, { useState, useMemo } from 'react';
import Timeline from './Timeline';
import TeamPanel from './components/TeamPanel';
import ControlPanel from './components/ControlPanel';
import SkillList from './components/SkillList';
import { ALL_STUDENTS } from './utils/dataParser';
import { snapToFrame, formatRaidTime } from './utils/timeUtils';
import { useCostSimulation } from './hooks/useCostSimulation';
import { FPS, FRAME_MS, MAX_COST } from './utils/constants';
import { resolveCascade } from './utils/costEngine';

const App = () => {
  const [team, setTeam] = useState({ strikers: [null, null, null, null], specials: [null, null] });
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [raidDuration, setRaidDuration] = useState(240);
  const [inputMinutes, setInputMinutes] = useState(4);
  const [inputSeconds, setInputSeconds] = useState(0);
  const [inputMillis, setInputMillis] = useState(0);
  const [targetingSource, setTargetingSource] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const activeTeam = useMemo(() => [...team.strikers, ...team.specials].filter(s => s !== null), [team]);

  const getElapsedFromInput = () => {
    const total = (parseInt(inputMinutes) * 60) + parseInt(inputSeconds) + (parseInt(inputMillis) / 1000);
    return snapToFrame(Math.max(0, raidDuration - total)); 
  };
  const currentElapsed = getElapsedFromInput();
  const updateInputsFromElapsed = (newElapsed) => {
    const snapped = snapToFrame(newElapsed);
    const remaining = Math.max(0, raidDuration - snapped);
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    const ms = Math.round((remaining % 1) * 1000);
    setInputMinutes(m); setInputSeconds(s); setInputMillis(ms);
  };

  const { calculateCostAtTime, getEffectiveCostAtTime, costGraphData, getStudentStatus, currentRateDisplay, regenStats } = useCostSimulation(activeTeam, timelineEvents, raidDuration, currentElapsed);
  const currentCostAvailable = calculateCostAtTime(currentElapsed);

  const stepFrame = (dir) => updateInputsFromElapsed(Math.max(0, Math.min(getElapsedFromInput() + (dir/FPS), raidDuration)));
  const jumpToNextCost = () => { let t = currentElapsed; let s=0; while(calculateCostAtTime(t)<Math.floor(currentCostAvailable)+1 && s<3000){t+=FRAME_MS; s++;} updateInputsFromElapsed(snapToFrame(t)); };

  const handleSlotClick = (role, index) => {
      // Left Click: ALWAYS Select (allows swapping)
      setSelectedSlot({ role, index });
      setTimeout(() => { const el = document.getElementById('student-search-input'); if(el) el.focus(); }, 50);
  };

  const handleSlotContextMenu = (e, role, index) => {
      e.preventDefault();
      const currentStudent = role === 'Striker' ? team.strikers[index] : team.specials[index];
      if (currentStudent) {
          const removedId = currentStudent.id;
          setTeam(prev => {
              const newArr = role === 'Striker' ? [...prev.strikers] : [...prev.specials];
              newArr[index] = null;
              return { ...prev, [role === 'Striker' ? 'strikers' : 'specials']: newArr };
          });
          setTimelineEvents(prev => prev.filter(ev => ev.studentId !== removedId));
          if (selectedSlot?.role === role && selectedSlot?.index === index) setSelectedSlot(null);
      }
  };

  const addStudentToSelectedSlot = (student) => {
      if (!selectedSlot) return;
      const currentSlotStudent = selectedSlot.role === 'Striker' ? team.strikers[selectedSlot.index] : team.specials[selectedSlot.index];
      if (currentSlotStudent) setTimelineEvents(prev => prev.filter(ev => ev.studentId !== currentSlotStudent.id));

      setTeam(prev => {
          const role = selectedSlot.role;
          const newArr = role === 'Striker' ? [...prev.strikers] : [...prev.specials];
          newArr[selectedSlot.index] = student;
          return { ...prev, [role === 'Striker' ? 'strikers' : 'specials']: newArr };
      });
      setSelectedSlot(null); 
  };

  const handleSkillClick = (student) => {
      if (targetingSource) { addSkillEvent(targetingSource, student.id); setTargetingSource(null); return; }
      const isActivating = timelineEvents.some(e => e.studentId === student.id && currentElapsed >= e.startTime && currentElapsed < (e.startTime + e.animationDuration));
      if (isActivating) return;
      if (student.exSkill.costReduction || student.exSkill.requiresTarget) { setTargetingSource(student); return; }
      addSkillEvent(student, null);
  };

  const addSkillEvent = (student, targetId) => {
    const startTime = currentElapsed;
    const effectiveCost = getEffectiveCostAtTime(student.id, startTime);
    if (currentCostAvailable < effectiveCost - 0.0001) { alert(`Not enough cost!`); return; }
    
    let regenData = null;
    let effectDuration = student.exSkill.effectDuration;
    let applyDelay = student.exSkill.applyDelay;

    const activeRegenEffect = student.regenEffects.find(eff => eff.type === 'Active');
    if (activeRegenEffect) {
        const currentUseCount = timelineEvents.filter(e => e.studentId === student.id).length + 1;
        if (!(activeRegenEffect.condition === 'Every_2_Ex' && currentUseCount % 2 !== 0)) {
            let dur = activeRegenEffect.duration;
            let delay = activeRegenEffect.delay;
            if (dur === -1) {
                const mainVisual = student.exSkill.visualEffects.find(v => v.duration > 0); 
                dur = mainVisual ? mainVisual.duration : student.exSkill.effectDuration; 
                if (delay === 0) delay = student.exSkill.mainEffectDelay;
            }
            regenData = { delay: delay, duration: dur };
            if (effectDuration <= 0) { effectDuration = dur; applyDelay = activeRegenEffect.delay; }
        }
    }

    let maxVisualEnd = student.exSkill.animationDuration;
    if (student.exSkill.visualEffects) {
        student.exSkill.visualEffects.forEach(v => maxVisualEnd = Math.max(maxVisualEnd, v.delay + v.duration));
    }
    if (regenData) maxVisualEnd = Math.max(maxVisualEnd, regenData.delay + regenData.duration);

    const rowIndex = activeTeam.findIndex(s => s.id === student.id);
    const newEvent = {
        id: Date.now(), studentId: student.id, name: student.exSkill.name, skillType: student.exSkill.type,
        cost: student.exSkill.cost, startTime, animationDuration: student.exSkill.animationDuration,
        visualEffects: student.exSkill.visualEffects,
        regenData: regenData,
        endTime: startTime + maxVisualEnd,
        rowId: rowIndex, costReduction: student.exSkill.costReduction, targetId
    };

    setTimelineEvents(prev => resolveCascade([...prev, newEvent], activeTeam, regenStats));
  };

  const handleEventUpdate = (eventId, newProps) => {
    setTimelineEvents(prev => {
        const event = prev.find(e => e.id === eventId); if (!event) return prev;
        
        if (newProps.startTime !== undefined) {
            const newStart = newProps.startTime;
            const newEndAnim = newStart + event.animationDuration;
            const hasCollision = prev.some(e => e.id !== eventId && e.studentId === event.studentId && Math.max(e.startTime, newStart) < Math.min(e.startTime + e.animationDuration, newEndAnim));
            if (hasCollision) return prev;
        }

        const updatedEvent = { ...event, ...newProps };
        if (newProps.startTime !== undefined) {
             let maxVis = event.animationDuration;
             if (event.visualEffects) event.visualEffects.forEach(v => maxVis = Math.max(maxVis, v.delay + v.duration));
             if (event.regenData) maxVis = Math.max(maxVis, event.regenData.delay + event.regenData.duration);
             updatedEvent.endTime = updatedEvent.startTime + maxVis;
        }

        const newList = prev.map(e => e.id === eventId ? updatedEvent : e);
        if (newProps.isDragging === false) return resolveCascade(newList, activeTeam, regenStats);
        return newList.sort((a,b)=>a.startTime-b.startTime);
    });
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'monospace', backgroundColor: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{flex: '0 0 auto'}}>
          <ControlPanel 
            raidDuration={raidDuration} setRaidDuration={setRaidDuration} currentElapsed={currentElapsed} updateInputsFromElapsed={updateInputsFromElapsed} inputMinutes={inputMinutes} setInputMinutes={setInputMinutes} inputSeconds={inputSeconds} setInputSeconds={setInputSeconds} inputMillis={inputMillis} setInputMillis={setInputMillis} stepFrame={stepFrame} jumpToNextCost={jumpToNextCost} team={team} timelineEvents={timelineEvents} setTeam={setTeam} setTimelineEvents={setTimelineEvents} currentCost={currentCostAvailable} currentRateDisplay={currentRateDisplay} isPassiveActive={activeTeam.some(s => s.regenEffects.some(e=>e.type==='Passive'||e.type==='PassiveStack'))} isMaxCost={currentCostAvailable >= MAX_COST} 
            allStudents={ALL_STUDENTS} activeTeam={activeTeam} selectedSlot={selectedSlot} onAddStudent={addStudentToSelectedSlot} onSlotClick={handleSlotClick} onSlotContextMenu={handleSlotContextMenu}
          />
          <SkillList activeTeam={activeTeam} timelineEvents={timelineEvents} currentElapsed={currentElapsed} currentCostAvailable={currentCostAvailable} targetingSource={targetingSource} onSkillClick={handleSkillClick} setTargetingSource={setTargetingSource} getStudentStatus={getStudentStatus} />
      </div>
      <div style={{flex: 1, minHeight: 0, marginTop: '10px'}}>
          <Timeline 
            events={timelineEvents} 
            onUpdateEvent={handleEventUpdate} 
            onDeleteEvent={(idx) => setTimelineEvents(p => p.filter((_, i) => i !== idx))} 
            onClearEvents={() => setTimelineEvents([])} 
            activeTeam={activeTeam} 
            calculateCostAtTime={calculateCostAtTime} 
            raidDuration={raidDuration} 
            currentCost={currentCostAvailable} 
            costPerSecond={currentRateDisplay} 
            currentElapsed={currentElapsed} 
            formatTimeFn={formatRaidTime} 
            onTimeUpdate={updateInputsFromElapsed} 
            costGraphData={costGraphData} 
            getEffectiveCostAtTime={getEffectiveCostAtTime}
            currentRateDisplay={currentRateDisplay} // Passed
            isPassiveActive={activeTeam.some(s => s.regenEffects.some(e=>e.type==='Passive'||e.type==='PassiveStack'))} // Passed
        />
      </div>
      <style>{` .btn-control { background:#333; color:white; border:1px solid #555; padding:6px 12px; cursor:pointer; border-radius:4px; font-weight:bold; font-size:0.85em; transition:all 0.1s; } .btn-control:hover { background:#444; border-color:#777; } .btn-control.special { background:#00695c; border-color:#004d40; } .btn-control.special:disabled { background:#222; border-color:#333; color:#555; cursor:not-allowed; } `}</style>
    </div>
  );
};

export default App;