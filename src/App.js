import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Timeline from './Timeline';
import TeamPanel from './components/TeamPanel';
import ControlPanel from './components/ControlPanel';
import SkillList from './components/SkillList';
import { ALL_STUDENTS } from './utils/dataParser';
import { snapToFrame, formatRaidTime, parseRaidTime } from './utils/timeUtils';
import { useCostSimulation } from './hooks/useCostSimulation';
import { FPS, FRAME_MS, MAX_COST } from './utils/constants';
import { resolveCascade, getEffectiveCostAtTime } from './utils/costEngine';

const App = () => {
  const [team, setTeam] = useState({ strikers: [null, null, null, null], specials: [null, null] });
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [raidDuration, setRaidDuration] = useState(240);
  const [inputMinutes, setInputMinutes] = useState(4);
  const [inputSeconds, setInputSeconds] = useState(0);
  const [inputMillis, setInputMillis] = useState(0);
  const [targetingSource, setTargetingSource] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [interactionMode, setInteractionMode] = useState('normal'); 
  const [editingEvent, setEditingEvent] = useState(null);
  const [editTimeInput, setEditTimeInput] = useState("");

  const raidDurationRef = useRef(raidDuration);
  const requestRef = useRef();
  const startTimeRef = useRef();

  useEffect(() => { raidDurationRef.current = raidDuration; }, [raidDuration]);

  const activeTeam = useMemo(() => [...team.strikers, ...team.specials].filter(s => s !== null), [team]);

  // FIX: Robust Initial Move Generation
  useEffect(() => {
      setTimelineEvents(prev => {
          let newEvents = [...prev];
          let changed = false;
          activeTeam.forEach(s => {
              if (s.role === 'Striker') {
                  const hasInitMove = newEvents.some(e => e.studentId === s.id && e.id.toString().startsWith(`init-move-${s.id}`));
                  if (!hasInitMove) {
                      const rowIndex = activeTeam.findIndex(st => st.id === s.id);
                      newEvents.push({
                          id: `init-move-${s.id}`, // Deterministic ID
                          studentId: s.id,
                          name: "Initial Move",
                          skillType: "Move",
                          cost: 0,
                          startTime: 0,
                          animationDuration: 1.0,
                          visualEffects: [],
                          regenData: null,
                          endTime: 1.0,
                          rowId: rowIndex
                      });
                      changed = true;
                  }
              }
          });
          return changed ? resolveCascade(newEvents, activeTeam, {}, raidDuration) : prev;
      });
  }, [activeTeam, raidDuration]);

  const getElapsedFromInput = () => {
    const total = (parseInt(inputMinutes) * 60) + parseInt(inputSeconds) + (parseInt(inputMillis) / 1000);
    return snapToFrame(Math.max(0, raidDuration - total)); 
  };
  const currentElapsed = getElapsedFromInput();
  
  const updateInputsFromElapsed = useCallback((newElapsed) => {
    const duration = raidDurationRef.current; 
    const snapped = snapToFrame(newElapsed);
    const remaining = Math.max(0, duration - snapped);
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    const ms = Math.round((remaining % 1) * 1000);
    setInputMinutes(m); setInputSeconds(s); setInputMillis(ms);
  }, []);

  const animate = (time) => {
    if (startTimeRef.current === undefined) startTimeRef.current = time - (getElapsedFromInput() * 1000);
    const duration = raidDurationRef.current;
    const nextElapsed = (time - startTimeRef.current) / 1000;
    if (nextElapsed >= duration) {
        updateInputsFromElapsed(duration); setIsPlaying(false); startTimeRef.current = undefined;
    } else {
        updateInputsFromElapsed(nextElapsed); requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isPlaying) requestRef.current = requestAnimationFrame(animate);
    else { cancelAnimationFrame(requestRef.current); startTimeRef.current = undefined; }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const { calculateCostAtTime, getEffectiveCostAtTime, costGraphData, getStudentStatus, currentRateDisplay, regenStats } = useCostSimulation(activeTeam, timelineEvents, raidDuration, currentElapsed);
  const currentCostAvailable = calculateCostAtTime(currentElapsed);

  const stepFrame = (dir) => { if(isPlaying) setIsPlaying(false); updateInputsFromElapsed(Math.max(0, Math.min(getElapsedFromInput() + (dir/FPS), raidDuration))); };
  const jumpToNextCost = () => { if(isPlaying) setIsPlaying(false); let t=currentElapsed; let s=0; while(calculateCostAtTime(t)<Math.floor(currentCostAvailable)+1 && s<3000){t+=FRAME_MS;s++} updateInputsFromElapsed(snapToFrame(t)); };

  const handleSlotClick = (role, index) => { setSelectedSlot({ role, index }); setTimeout(() => { const el = document.getElementById('student-search-input'); if(el) el.focus(); }, 50); };
  
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
          // Remove events for this student
          setTimelineEvents(prev => resolveCascade(prev.filter(ev => ev.studentId !== removedId), activeTeam, regenStats, raidDuration));
          if (selectedSlot?.role === role && selectedSlot?.index === index) setSelectedSlot(null);
      }
  };

  const addStudentToSelectedSlot = (student) => {
      if (!selectedSlot) return;
      const currentSlotStudent = selectedSlot.role === 'Striker' ? team.strikers[selectedSlot.index] : team.specials[selectedSlot.index];
      const newTeam = { ...team };
      const arr = selectedSlot.role === 'Striker' ? [...newTeam.strikers] : [...newTeam.specials];
      arr[selectedSlot.index] = student;
      if (selectedSlot.role === 'Striker') newTeam.strikers = arr; else newTeam.specials = arr;
      const newActive = [...newTeam.strikers, ...newTeam.specials].filter(s=>s);
      setTeam(newTeam);
      
      let filteredEvents = [...timelineEvents];
      if (currentSlotStudent) {
          filteredEvents = filteredEvents.filter(ev => ev.studentId !== currentSlotStudent.id);
      }
      setTimelineEvents(resolveCascade(filteredEvents, newActive, regenStats, raidDuration));
      setSelectedSlot(null); 
  };

  const handleSkillClick = (student) => {
      if (interactionMode === 'normal') return;
      if (targetingSource) { addSkillEvent(targetingSource, student.id); setTargetingSource(null); return; }
      
      const isActivating = timelineEvents.some(e => 
          e.studentId === student.id && 
          e.skillType !== 'Auto' && 
          currentElapsed >= e.startTime && 
          currentElapsed < (e.startTime + e.animationDuration)
      );
      if (isActivating) return; 

      if (student.exSkill.costReduction || student.exSkill.requiresTarget) { setTargetingSource(student); return; }
      addSkillEvent(student, null);
  };

  const addSkillEvent = (student, targetId) => {
    const startTime = currentElapsed;
    const effectiveCost = getEffectiveCostAtTime(student.id, startTime);
    if (currentCostAvailable < effectiveCost - 0.0001) { alert(`Not enough cost!`); return; }
    
    let skillData = student.exSkill;
    let regenData = null;
    const activeRegenEffect = student.regenEffects.find(eff => eff.type === 'Active' && eff.source !== 'Public'); 
    if (activeRegenEffect) {
        let dur = activeRegenEffect.duration;
        let delay = activeRegenEffect.delay;
        if (dur === -1) {
            const mainVisual = skillData.visualEffects.find(v => v.duration > 0); 
            dur = mainVisual ? mainVisual.duration : skillData.animationDuration; 
            if (delay === 0 && skillData.mainEffectDelay) delay = skillData.mainEffectDelay;
        }
        regenData = { delay: delay, duration: dur };
    }

    let maxVis = skillData.animationDuration;
    if (skillData.visualEffects) skillData.visualEffects.forEach(v => maxVis = Math.max(maxVis, v.delay + v.duration));
    if (regenData) maxVis = Math.max(maxVis, regenData.delay + regenData.duration);

    const rowIndex = activeTeam.findIndex(s => s.id === student.id);
    const newEvent = {
        id: Date.now(), studentId: student.id, name: skillData.name, skillType: "Ex", 
        cost: skillData.cost, startTime: startTime, animationDuration: skillData.animationDuration,
        visualEffects: skillData.visualEffects, regenData,
        endTime: startTime + maxVis, rowId: rowIndex, costReduction: skillData.costReduction, targetId
    };

    setTimelineEvents(prev => resolveCascade([...prev, newEvent], activeTeam, regenStats, raidDuration));
  };

  const addMoveAfterEvent = (anchorEvent) => {
      const student = activeTeam.find(s => s.id === anchorEvent.studentId);
      if (!student || student.role !== 'Striker') return;

      const durationStr = prompt("Enter Move Duration (seconds):", "2.0");
      if (!durationStr) return;
      const duration = parseFloat(durationStr);
      if (isNaN(duration) || duration <= 0) return;

      const endDelay = student.normalAttack?.frames?.end || 0;
      let startTime = anchorEvent.endTime;
      // Add End Delay if not already a move
      if (anchorEvent.skillType !== 'Move') startTime += endDelay;

      const endTime = startTime + duration;
      const hasCollision = timelineEvents.some(e => 
          e.studentId === student.id && 
          e.skillType !== 'Auto' && 
          e.id !== anchorEvent.id &&
          Math.max(e.startTime, startTime) < Math.min(e.endTime, endTime)
      );

      if (hasCollision) {
          alert("Cannot add Move: Overlaps with existing Skill.");
          return;
      }

      const rowIndex = activeTeam.findIndex(s => s.id === student.id);
      const newEvent = {
          id: Date.now(), studentId: student.id, name: "Move (Manual)", skillType: "Move",
          cost: 0, startTime: startTime,
          animationDuration: duration,
          visualEffects: [], regenData: null,
          endTime: endTime, rowId: rowIndex
      };
      setTimelineEvents(prev => resolveCascade([...prev, newEvent], activeTeam, regenStats, raidDuration));
      closeEditModal();
  };

  const handleEventUpdate = (eventId, newProps) => {
    setTimelineEvents(prev => {
        const event = prev.find(e => e.id === eventId); if (!event) return prev;
        if ((event.skillType === 'Public' || event.skillType === 'Auto') && newProps.startTime !== undefined) return prev;

        if (newProps.startTime !== undefined) {
            const newStart = newProps.startTime;
            const newEndAnim = newStart + event.animationDuration;
            const hasCollision = prev.some(e => 
                e.id !== eventId && e.studentId === event.studentId && 
                e.skillType !== 'Public' && e.skillType !== 'Auto' && 
                Math.max(e.startTime, newStart) < Math.min(e.startTime + e.animationDuration, newEndAnim)
            );
            if (hasCollision) return prev;
        }

        const updatedEvent = { ...event, ...newProps };
        if (newProps.startTime !== undefined) {
             let maxVis = event.animationDuration;
             if (event.visualEffects) event.visualEffects.forEach(v => maxVis = Math.max(maxVis, v.delay + v.duration));
             if (event.regenData) maxVis = Math.max(maxVis, (event.regenData.delay||0) + (event.regenData.duration||0));
             updatedEvent.endTime = updatedEvent.startTime + maxVis;
        }

        const newList = prev.map(e => e.id === eventId ? updatedEvent : e);
        if (newProps.isDragging === false) return resolveCascade(newList, activeTeam, regenStats, raidDuration);
        return newList.sort((a,b)=>a.startTime-b.startTime);
    });
  };

  // FIX: Preserves Initial Moves
  const onClearEvents = () => {
      setTimelineEvents(prev => resolveCascade(prev.filter(e => e.id.toString().startsWith('init-move-')), activeTeam, regenStats, raidDuration));
  };

  const handleDeleteEvent = (eventId) => {
      if (eventId.toString().startsWith('init-move-')) { alert("Cannot delete Initial Move."); return; }
      setTimelineEvents(prev => resolveCascade(prev.filter(e => e.id !== eventId), activeTeam, regenStats, raidDuration));
  };

  const openEditModal = (event) => {
      setEditingEvent(event);
      if (event.skillType === 'Move') setEditTimeInput(event.animationDuration.toString());
      else setEditTimeInput(formatRaidTime(event.startTime, raidDuration));
  };
  const closeEditModal = () => { setEditingEvent(null); setEditTimeInput(""); };
  const saveEditTime = () => {
      if (!editingEvent || interactionMode === 'normal') return;
      if (editingEvent.skillType === 'Move') {
          const newDur = parseFloat(editTimeInput);
          if (isNaN(newDur) || newDur <= 0) { alert("Invalid Duration"); return; }
          handleEventUpdate(editingEvent.id, { animationDuration: newDur, endTime: editingEvent.startTime + newDur, isDragging: false });
      } else {
          const newStartTime = parseRaidTime(editTimeInput, raidDuration);
          if (isNaN(newStartTime) || newStartTime < 0 || newStartTime > raidDuration) { alert("Invalid Time"); return; }
          handleEventUpdate(editingEvent.id, { startTime: newStartTime, isDragging: false });
      }
      closeEditModal();
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'monospace', backgroundColor: '#121212', color: '#e0e0e0', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{flex: '0 0 auto'}}>
          <ControlPanel 
            raidDuration={raidDuration} setRaidDuration={setRaidDuration} currentElapsed={currentElapsed} updateInputsFromElapsed={updateInputsFromElapsed} inputMinutes={inputMinutes} setInputMinutes={setInputMinutes} inputSeconds={inputSeconds} setInputSeconds={setInputSeconds} inputMillis={inputMillis} setInputMillis={setInputMillis} stepFrame={stepFrame} jumpToNextCost={jumpToNextCost} team={team} timelineEvents={timelineEvents} setTeam={setTeam} setTimelineEvents={setTimelineEvents} currentCost={currentCostAvailable} currentRateDisplay={currentRateDisplay} isPassiveActive={activeTeam.some(s => s.regenEffects.some(e=>e.type==='Passive'||e.type==='PassiveStack'))} isMaxCost={currentCostAvailable >= MAX_COST} 
            allStudents={ALL_STUDENTS} activeTeam={activeTeam} selectedSlot={selectedSlot} onAddStudent={addStudentToSelectedSlot} onSlotClick={handleSlotClick} onSlotContextMenu={handleSlotContextMenu}
            isPlaying={isPlaying} togglePlay={togglePlay}
          />
          <SkillList 
            activeTeam={activeTeam} timelineEvents={timelineEvents} currentElapsed={currentElapsed} currentCostAvailable={currentCostAvailable} targetingSource={targetingSource} 
            onSkillClick={handleSkillClick} setTargetingSource={setTargetingSource} getStudentStatus={getStudentStatus}
            interactionMode={interactionMode} 
          />
      </div>
      <div style={{flex: 1, minHeight: 0, marginTop: '10px'}}>
          <Timeline 
            events={timelineEvents} onUpdateEvent={handleEventUpdate} onDeleteEvent={handleDeleteEvent} onClearEvents={onClearEvents} 
            activeTeam={activeTeam} calculateCostAtTime={calculateCostAtTime} raidDuration={raidDuration} currentCost={currentCostAvailable} costPerSecond={currentRateDisplay} currentElapsed={currentElapsed} formatTimeFn={formatRaidTime} onTimeUpdate={updateInputsFromElapsed} costGraphData={costGraphData} getEffectiveCostAtTime={getEffectiveCostAtTime} currentRateDisplay={currentRateDisplay} isPassiveActive={activeTeam.some(s => s.regenEffects.some(e=>e.type==='Passive'||e.type==='PassiveStack'))}
            interactionMode={interactionMode} setInteractionMode={setInteractionMode} onEditEvent={openEditModal}
          />
      </div>
      {editingEvent && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000}}>
            <div style={{background:'#1e1e1e', padding:'25px', borderRadius:'8px', border:'1px solid #444', width:'320px', boxShadow:'0 4px 15px rgba(0,0,0,0.5)'}}>
                <h3 style={{marginTop:0, color:'#ffeb3b', marginBottom:'15px', borderBottom:'1px solid #444', paddingBottom:'10px'}}>{interactionMode === 'normal' ? 'View Details' : 'Edit Event'}</h3>
                <div style={{marginBottom:'20px', color:'#eee', fontSize:'0.9em'}}><strong>Skill:</strong> {editingEvent.name}<br/><strong>Mode:</strong> {interactionMode.toUpperCase()}</div>
                <div style={{marginBottom:'20px'}}>
                    <label style={{display:'block', color:'#aaa', marginBottom:'8px', fontSize:'0.8em'}}>
                        {editingEvent.skillType === 'Move' ? "Duration (sec):" : "Start Time (Countdown):"}
                    </label>
                    <input type="text" value={editTimeInput} onChange={e=>setEditTimeInput(e.target.value)} disabled={interactionMode === 'normal'} placeholder={editingEvent.skillType === 'Move' ? "2.0" : "m:ss.ms"} style={{width:'100%', padding:'10px', background: interactionMode==='normal'?'#333':'#2a2a2a', border:'1px solid #555', color: interactionMode==='normal'?'#aaa':'#fff', borderRadius:'4px', fontSize:'1em', boxSizing:'border-box'}} autoFocus />
                </div>
                <div style={{display:'flex', justifyContent:'flex-end', gap:'10px'}}>
                    <button onClick={closeEditModal} style={{padding:'8px 16px', background:'transparent', border:'1px solid #555', color:'#ccc', borderRadius:'4px', cursor:'pointer'}}>Close</button>
                    {interactionMode !== 'normal' && <button onClick={saveEditTime} style={{padding:'8px 16px', background:'#00695c', border:'none', color:'#fff', borderRadius:'4px', cursor:'pointer'}}>Save</button>}
                    
                    {interactionMode === 'edit' && activeTeam.find(s=>s.id===editingEvent.studentId)?.role === 'Striker' && (
                        <button onClick={() => addMoveAfterEvent(editingEvent)} style={{padding:'8px 16px', background:'#37474f', border:'none', color:'#fff', borderRadius:'4px', cursor:'pointer'}}>+ Move</button>
                    )}
                </div>
            </div>
        </div>
      )}
      <style>{` .btn-control { background:#333; color:white; border:1px solid #555; padding:6px 12px; cursor:pointer; border-radius:4px; font-weight:bold; font-size:0.85em; transition:all 0.1s; } .btn-control:hover { background:#444; border-color:#777; } .btn-control.special { background:#00695c; border-color:#004d40; } .btn-control.special:disabled { background:#222; border-color:#333; color:#555; cursor:not-allowed; } `}</style>
    </div>
  );
};

export default App;