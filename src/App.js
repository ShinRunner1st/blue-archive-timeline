import React, { useState, useMemo, useEffect, useRef } from 'react';
import Timeline from './Timeline';
import StudentSelector from './StudentSelector';
import rawStudentData from './students.json';

// --- CONSTANTS ---
const FPS = 30;
const FRAME_MS = 1 / FPS; 
const COST_UNIT = 10000; 
const REGEN_START_DELAY = 2.0; 
const MAX_COST = 10;

const snapToFrame = (time) => Math.round(time * FPS) / FPS;

// --- DATA PARSER ---
const parseStudentData = (data) => {
  return Object.values(data).map(student => {
    const exSkill = student.Skills?.Ex || {}; 
    const effects = exSkill.Effects || [];
    
    const effectType = effects.length > 0 ? (effects[0].Type || "Unknown") : "Unknown";
    
    const costChangeEffect = effects.find(e => e.Type === "CostChange");
    let costReduction = null;
    if (costChangeEffect) {
        const val = costChangeEffect.Scale ? costChangeEffect.Scale[0] : 0;
        costReduction = {
            target: costChangeEffect.Target, 
            uses: costChangeEffect.Uses || 1,
            amount: Math.abs(val) / 10000 
        };
    }

    const buffDurationMs = effects.reduce((max, effect) => (effect.Duration > max) ? effect.Duration : max, 0) || 0;
    const costVal = exSkill.Cost && exSkill.Cost.length >= 5 ? exSkill.Cost[4] : (exSkill.Cost ? exSkill.Cost[0] : 0);

    let passiveRegenPercent = 0; 
    let activeRegenFlat = 0;     
    let activeRegenPercent = 0;  
    let activeRegenDuration = 0; 

    const extraPassive = student.Skills?.ExtraPassive;
    if (extraPassive && extraPassive.Effects) {
        extraPassive.Effects.forEach(effect => {
            const isRegenStat = effect.Stat === 'RegenCost_Coefficient' || effect.Stat === 'RegenCost_Base';
            
            if (isRegenStat) {
                let val = 0;
                if (effect.Value && effect.Value[0]) {
                    const maxVal = effect.Value[0][effect.Value[0].length - 1];
                    val = maxVal;
                }

                if (student.SquadType === 'Support') {
                    if (effect.Stat === 'RegenCost_Coefficient') passiveRegenPercent += val / 10000;
                } else {
                    if (effect.Stat === 'RegenCost_Coefficient') activeRegenPercent += val / 10000;
                    if (effect.Stat === 'RegenCost_Base') activeRegenFlat += val;
                    if (effect.Duration) activeRegenDuration = Math.max(activeRegenDuration, effect.Duration / 1000);
                }
            }
        });
    }

    if ((activeRegenFlat > 0 || activeRegenPercent > 0) && activeRegenDuration === 0) {
        activeRegenDuration = buffDurationMs / 1000; 
    }

    return {
      id: student.Id,
      name: student.Name,
      role: student.SquadType === 'Main' ? 'Striker' : 'Special',
      regenCost: student.RegenCost,
      passiveRegenPercent, 
      exSkill: {
        name: exSkill.Name || "Unknown",
        type: effectType,
        cost: costVal, 
        animationDuration: snapToFrame((exSkill.Duration || 0) / 30), 
        buffDuration: buffDurationMs / 1000,
        costRegenFlat: activeRegenFlat,
        costRegenPercent: activeRegenPercent,
        costRegenDuration: activeRegenDuration, 
        costReduction: costReduction 
      }
    };
  });
};

const ALL_STUDENTS = parseStudentData(rawStudentData);

const formatRaidTime = (time, totalTime) => {
  const t = (typeof totalTime !== 'undefined') ? Math.max(0, totalTime - time) : time;
  const totalFrames = Math.round(t * FPS);
  const m = Math.floor(totalFrames / (FPS * 60));
  const s = Math.floor((totalFrames / FPS) % 60);
  const f = totalFrames % FPS;
  const ms = Math.round(f * (1000 / FPS));
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const App = () => {
  // Use arrays with null to represent fixed slots
  const [team, setTeam] = useState({ 
      strikers: [null, null, null, null], 
      specials: [null, null] 
  });
  
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [raidDuration, setRaidDuration] = useState(240); 
  
  const [inputMinutes, setInputMinutes] = useState(4); 
  const [inputSeconds, setInputSeconds] = useState(0);
  const [inputMillis, setInputMillis] = useState(0);
  
  const [targetingSource, setTargetingSource] = useState(null);
  
  // Track which slot is selected for adding a student
  const [selectedSlot, setSelectedSlot] = useState(null); // { role: 'Striker', index: 0 }

  const activeTeam = useMemo(() => {
      return [...team.strikers, ...team.specials].filter(s => s !== null);
  }, [team]);

  // --- COST ENGINE ---
  const getStudentStatus = (studentId) => {
      const buffs = {}; 
      const sortedEvents = [...timelineEvents].sort((a, b) => a.startTime - b.startTime);

      sortedEvents.forEach(e => {
          if (buffs[e.studentId] && buffs[e.studentId].length > 0) {
              const activeBuff = buffs[e.studentId][0];
              activeBuff.uses--;
              if (activeBuff.uses <= 0) buffs[e.studentId].shift(); 
          }
          if (e.costReduction && e.targetId) {
              if (!buffs[e.targetId]) buffs[e.targetId] = [];
              buffs[e.targetId].push({ 
                  amount: e.costReduction.amount,
                  uses: e.costReduction.uses 
              });
          }
      });

      const student = activeTeam.find(s => s.id === studentId);
      if (!student) return { effectiveCost: 0, buff: null };

      let effectiveCost = student.exSkill.cost;
      let activeBuff = null;

      if (buffs[studentId] && buffs[studentId].length > 0) {
          activeBuff = buffs[studentId][0];
          const reduction = Math.floor(effectiveCost * activeBuff.amount);
          effectiveCost = effectiveCost - reduction;
      }

      return { effectiveCost, activeBuff };
  };

  const { baseRegenSpeed, passivePercentTotal } = useMemo(() => {
    const base = activeTeam.reduce((sum, s) => sum + s.regenCost, 0);
    const passive = activeTeam.reduce((sum, s) => sum + (s.passiveRegenPercent || 0), 0);
    return { baseRegenSpeed: base, passivePercentTotal: passive };
  }, [activeTeam]);

  const calculateCostAtTime = (targetElapsed, excludeEventId = null) => {
    if (targetElapsed < REGEN_START_DELAY) return 0;

    const points = new Set([REGEN_START_DELAY, targetElapsed]);
    const sortedEvents = timelineEvents
      .filter(e => e.id !== excludeEventId && e.startTime <= targetElapsed)
      .sort((a, b) => a.startTime - b.startTime);

    sortedEvents.forEach(e => {
        if (e.startTime > REGEN_START_DELAY) points.add(e.startTime);
        if (e.endTime > REGEN_START_DELAY && e.endTime < targetElapsed) points.add(e.endTime);
        if (e.costRegenDuration > 0) {
            const buffEnd = e.startTime + e.costRegenDuration;
            if (buffEnd > REGEN_START_DELAY && buffEnd < targetElapsed) points.add(buffEnd);
        }
    });

    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    let currentCost = 0;
    let tPrev = REGEN_START_DELAY;
    const buffs = {}; 

    for (let i = 0; i < sortedPoints.length; i++) {
        const tCurr = sortedPoints[i];
        if (tCurr <= tPrev) continue;
        const tMid = tPrev + 0.001;
        
        let activeFlatBonus = 0;
        let activePercentBonus = 0;
        timelineEvents.forEach(e => {
            if (e.id !== excludeEventId) {
                const buffEnd = e.startTime + (e.costRegenDuration || 0);
                if (e.startTime <= tMid && buffEnd >= tCurr) {
                    activeFlatBonus += (e.costRegenFlat || 0);
                    activePercentBonus += (e.costRegenPercent || 0);
                }
            }
        });

        const currentSpeed = (baseRegenSpeed + activeFlatBonus) * (1 + passivePercentTotal + activePercentBonus);
        const costPerSec = currentSpeed / COST_UNIT;
        const dt = tCurr - tPrev;
        currentCost = Math.min(MAX_COST, currentCost + (dt * costPerSec));

        if (tCurr <= targetElapsed) {
            sortedEvents.forEach(e => {
                if (Math.abs(e.startTime - tCurr) < 0.0001) {
                    let eventCost = e.cost; 
                    if (buffs[e.studentId] && buffs[e.studentId].length > 0) {
                        const b = buffs[e.studentId][0];
                        const reduction = Math.floor(eventCost * (b.amount || 0));
                        eventCost -= reduction;
                        b.uses--;
                        if (b.uses <= 0) buffs[e.studentId].shift();
                    }
                    currentCost = Math.max(0, currentCost - eventCost);
                    if (e.costReduction && e.targetId) {
                        if (!buffs[e.targetId]) buffs[e.targetId] = [];
                        buffs[e.targetId].push({ ...e.costReduction });
                    }
                }
            });
        }
        tPrev = tCurr;
    }
    return currentCost;
  };

  const getElapsedFromInput = () => {
    const totalInputSeconds = (parseInt(inputMinutes) * 60) + parseInt(inputSeconds) + (parseInt(inputMillis) / 1000);
    const rawElapsed = raidDuration - totalInputSeconds;
    return snapToFrame(Math.max(0, rawElapsed)); 
  };

  const currentElapsed = getElapsedFromInput();
  const currentCostAvailable = calculateCostAtTime(currentElapsed - 0.001); 

  const currentRateDisplay = useMemo(() => {
      let activeFlat = 0;
      let activePercent = 0;
      timelineEvents.forEach(e => {
          const buffEnd = e.startTime + (e.costRegenDuration || 0);
          if (currentElapsed >= e.startTime && currentElapsed < buffEnd) {
              activeFlat += (e.costRegenFlat || 0);
              activePercent += (e.costRegenPercent || 0);
          }
      });
      const speed = (baseRegenSpeed + activeFlat) * (1 + passivePercentTotal + activePercent);
      return speed / COST_UNIT;
  }, [baseRegenSpeed, passivePercentTotal, currentElapsed, timelineEvents]);

  const updateInputsFromElapsed = (newElapsed) => {
    const snapped = snapToFrame(newElapsed);
    const remaining = Math.max(0, raidDuration - snapped);
    const totalFrames = Math.round(remaining * FPS); 
    const m = Math.floor(totalFrames / (FPS * 60));
    const s = Math.floor((totalFrames / FPS) % 60);
    const f = totalFrames % FPS;
    const ms = Math.round(f * (1000 / FPS));
    setInputMinutes(m);
    setInputSeconds(s);
    setInputMillis(ms);
  };

  const stepFrame = (direction) => {
    const currentFrameIndex = Math.round(currentElapsed * FPS);
    const nextFrameIndex = currentFrameIndex + direction;
    let newTime = nextFrameIndex / FPS;
    newTime = Math.max(0, Math.min(newTime, raidDuration));
    updateInputsFromElapsed(newTime);
  };

  const jumpToNextCost = () => {
    if (currentCostAvailable >= MAX_COST) return;
    const targetCost = Math.floor(currentCostAvailable) + 1;
    let time = currentElapsed;
    let safety = 0;
    while (calculateCostAtTime(time) < targetCost - 0.001 && safety < 3000) {
        time += FRAME_MS;
        safety++;
    }
    updateInputsFromElapsed(snapToFrame(time));
  };

  // --- TEAM MANAGEMENT ---
  const handleSlotClick = (role, index) => {
      const currentStudent = role === 'Striker' ? team.strikers[index] : team.specials[index];
      
      if (currentStudent) {
          // Remove student
          setTeam(prev => {
              const newArr = role === 'Striker' ? [...prev.strikers] : [...prev.specials];
              newArr[index] = null;
              return { ...prev, [role === 'Striker' ? 'strikers' : 'specials']: newArr };
          });
          setSelectedSlot(null);
      } else {
          // Select empty slot
          setSelectedSlot({ role, index });
          setTimeout(() => {
              const el = document.getElementById('student-search-input');
              if(el) el.focus();
          }, 50);
      }
  };

  const addStudentToSelectedSlot = (student) => {
      if (!selectedSlot) return;
      
      setTeam(prev => {
          const role = selectedSlot.role;
          const newArr = role === 'Striker' ? [...prev.strikers] : [...prev.specials];
          newArr[selectedSlot.index] = student;
          return { ...prev, [role === 'Striker' ? 'strikers' : 'specials']: newArr };
      });
      setSelectedSlot(null); // Deselect after adding
  };

  const handleSkillClick = (student) => {
      if (targetingSource) {
          addSkillEvent(targetingSource, student.id);
          setTargetingSource(null);
          return;
      }
      if (student.exSkill.costReduction) {
          setTargetingSource(student);
          return;
      }
      addSkillEvent(student, null);
  };

  const addSkillEvent = (student, targetId) => {
    const startTime = currentElapsed;
    const duration = student.exSkill.buffDuration > 2 ? student.exSkill.buffDuration : student.exSkill.animationDuration;
    const { effectiveCost } = getStudentStatus(student.id);

    if (currentCostAvailable < effectiveCost - 0.001) {
      alert(`Not enough cost! Need ${effectiveCost}`);
      return;
    }

    const rowIndex = activeTeam.findIndex(s => s.id === student.id);
    
    const newEvent = {
      id: Date.now(), 
      studentId: student.id, 
      name: student.exSkill.name, 
      skillType: student.exSkill.type,
      cost: student.exSkill.cost, 
      startTime: startTime, 
      duration: duration, 
      animationDuration: student.exSkill.animationDuration, 
      endTime: startTime + duration,
      rowId: rowIndex,
      costReduction: student.exSkill.costReduction, 
      targetId: targetId, 
      costRegenFlat: student.exSkill.costRegenFlat,
      costRegenPercent: student.exSkill.costRegenPercent,
      costRegenDuration: student.exSkill.costRegenDuration 
    };

    setTimelineEvents(prev => [...prev, newEvent].sort((a,b) => a.startTime - b.startTime));
  };

  const handleEventUpdate = (eventId, newProps) => {
    setTimelineEvents(prev => {
        const event = prev.find(e => e.id === eventId);
        if (!event) return prev;
        const updatedEvent = { ...event, ...newProps };
        updatedEvent.endTime = updatedEvent.startTime + updatedEvent.duration;
        const costAtNewTime = calculateCostAtTime(updatedEvent.startTime - 0.001, eventId);

        if (costAtNewTime >= updatedEvent.cost - 0.001) {
            return prev.map(e => e.id === eventId ? updatedEvent : e).sort((a,b) => a.startTime - b.startTime);
        } else {
            let scanTime = updatedEvent.startTime;
            let safety = 0;
            while (calculateCostAtTime(scanTime, eventId) < updatedEvent.cost - 0.001 && safety < 1500) {
                scanTime += FRAME_MS;
                safety++;
            }
            if (scanTime > raidDuration) scanTime = raidDuration;
            const snappedEvent = { ...updatedEvent, startTime: scanTime, endTime: scanTime + updatedEvent.duration };
            return prev.map(e => e.id === eventId ? snappedEvent : e).sort((a,b) => a.startTime - b.startTime);
        }
    });
  };

  // --- HELPER: Slot Component ---
  const StudentSlot = ({ student, label, isSelected, color, onClick }) => (
    <div 
        onClick={onClick}
        style={{
            width: '65px', height: '75px', 
            background: student ? '#2a2a2a' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isSelected ? '#ffeb3b' : (student ? color : '#444')}`, 
            borderRadius: '6px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', position: 'relative', overflow: 'hidden',
            boxShadow: isSelected ? '0 0 8px rgba(255, 235, 59, 0.3)' : 'none',
            transition: 'all 0.2s'
        }}
        title={student ? `Remove ${student.name}` : `Click to Select ${label}`}
    >
        {student ? (
            <>
                <div style={{width:'100%', height:'100%', position:'absolute', top:0, left:0, opacity:0.1, background: color}}></div>
                <div style={{zIndex:1, fontSize:'0.7em', textAlign:'center', padding:'2px', lineHeight:'1.1', fontWeight:'bold', color:'white'}}>
                    {student.name}
                </div>
                <div style={{zIndex:1, fontSize:'0.65em', color:'#aaa', marginTop:'2px'}}>Cost: {student.exSkill.cost}</div>
            </>
        ) : (
            <div style={{color: isSelected ? '#ffeb3b' : '#555', fontSize:'0.7em', textAlign:'center'}}>
                <div style={{fontSize:'1.4em', marginBottom:'0px', opacity:0.5}}>+</div>
                {label}
            </div>
        )}
    </div>
  );

  return (
    <div style={{ padding: '30px', fontFamily: 'monospace', backgroundColor: '#121212', color: '#e0e0e0', minHeight: '100vh' }}>
      
      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
        <h2 style={{color: '#90caf9', margin: 0, fontSize:'1.5rem'}}>Blue Archive Timeline</h2>
        <div style={{fontSize:'0.8em', color:'#666'}}>
            Current Regen: {currentRateDisplay.toFixed(3)}/s 
            {activeTeam.some(s => s.passiveRegenPercent > 0) && <span style={{color:'#66bb6a', marginLeft:5}}>(+Passive)</span>}
        </div>
      </div>
      <hr style={{ borderColor: '#333', marginBottom: '25px' }} />
      
      {/* CONTROLS AREA */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems:'start', marginBottom:'30px' }}>
        
        {/* TIME CONTROLS */}
        <div style={{ background: '#1e1e1e', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ marginBottom: '10px', display:'flex', gap:'10px', alignItems:'center' }}>
            <label style={{ fontSize: '0.8em', color: '#aaa' }}>Raid Time</label>
            <select 
              value={raidDuration} 
              onChange={(e) => { setRaidDuration(Number(e.target.value)); updateInputsFromElapsed(0); }}
              style={{ background: '#333', color: 'white', padding: '4px', borderRadius:'4px', border:'1px solid #555' }}
            >
              <option value={180}>3 Mins</option>
              <option value={240}>4 Mins</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
            <span style={{color: '#66bb6a', fontWeight:'bold', fontSize:'0.9em'}}>Time: </span>
            <input type="number" value={inputMinutes} onChange={e=>setInputMinutes(e.target.value)} style={{width:'40px', background:'#222', color:'#fff', border:'1px solid #444', textAlign:'center', padding:'5px', borderRadius:'4px'}} /> :
            <input type="number" value={inputSeconds} onChange={e=>setInputSeconds(e.target.value)} style={{width:'40px', background:'#222', color:'#fff', border:'1px solid #444', textAlign:'center', padding:'5px', borderRadius:'4px'}} /> .
            <input type="number" value={inputMillis} onChange={e=>setInputMillis(e.target.value)} style={{width:'50px', background:'#222', color:'#fff', border:'1px solid #444', textAlign:'center', padding:'5px', borderRadius:'4px'}} placeholder="ms" />
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
             <button onClick={() => stepFrame(-1)} className="btn-control">-1 Frame</button>
             <button onClick={() => stepFrame(1)} className="btn-control">+1 Frame</button>
             <button onClick={jumpToNextCost} className="btn-control special" disabled={currentCostAvailable>=MAX_COST}>Next Cost &gt;&gt;</button>
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.75em', color: '#666', textAlign:'right' }}>
            Elapsed: {formatRaidTime(currentElapsed)}
          </div>
        </div>

        {/* TEAM & SEARCH PANEL */}
        <div style={{ width:'fit-content', background: '#1e1e1e', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
           
           {/* Search Bar (Compact) */}
           <div style={{marginBottom: '15px', width: '250px'}}>
               <label style={{display:'block', marginBottom:'5px', color: selectedSlot ? '#ffeb3b' : '#aaa', fontSize:'0.8em', fontWeight:'bold'}}>
                   {selectedSlot ? `SELECT ${selectedSlot.role.toUpperCase()} (SLOT ${selectedSlot.index + 1})` : "SELECT SLOT TO ADD"}
               </label>
               <StudentSelector 
                    allStudents={ALL_STUDENTS} 
                    activeTeam={activeTeam} 
                    onAdd={addStudentToSelectedSlot} 
                    filterRole={selectedSlot?.role} 
                    disabled={!selectedSlot}
               />
           </div>

           {/* Team Slots (Compact Layout) */}
           <div style={{display:'flex', gap:'15px'}}>
               {/* STRIKERS */}
               <div>
                   <label style={{display:'block', marginBottom:'5px', color:'#ef5350', fontSize:'0.7em', fontWeight:'bold'}}>STRIKERS</label>
                   <div style={{display:'flex', gap:'5px'}}>
                       {[0, 1, 2, 3].map(i => {
                           const student = team.strikers[i];
                           return <StudentSlot 
                                key={i} 
                                student={student} 
                                label={`S${i+1}`} 
                                isSelected={selectedSlot?.role === 'Striker' && selectedSlot?.index === i}
                                color="#c62828"
                                onClick={() => handleSlotClick('Striker', i)}
                           />
                       })}
                   </div>
               </div>

               <div style={{width:'1px', background:'#444', margin:'0 5px'}}></div>

               {/* SPECIALS */}
               <div>
                   <label style={{display:'block', marginBottom:'5px', color:'#42a5f5', fontSize:'0.7em', fontWeight:'bold'}}>SPECIALS</label>
                   <div style={{display:'flex', gap:'5px'}}>
                       {[0, 1].map(i => {
                           const student = team.specials[i];
                           return <StudentSlot 
                                key={i} 
                                student={student} 
                                label={`Sp${i+1}`} 
                                isSelected={selectedSlot?.role === 'Special' && selectedSlot?.index === i}
                                color="#1565c0"
                                onClick={() => handleSlotClick('Special', i)} 
                           />
                       })}
                   </div>
               </div>
           </div>
        </div>

      </div>

      {/* SKILL BUTTONS */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{display:'flex', justifyContent:'space-between'}}>
            <label style={{display:'block', marginBottom:'8px', color:'#aaa', fontSize:'0.9em'}}>
                {targetingSource 
                    ? <span style={{color:'#ffeb3b', fontSize:'1.1em'}}>SELECT TARGET for {targetingSource.name}</span> 
                    : "Skills (Click to Add at Current Time)"}
            </label>
            {targetingSource && <button onClick={()=>setTargetingSource(null)} style={{background:'transparent', border:'1px solid #555', color:'#aaa', cursor:'pointer'}}>Cancel Target</button>}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {activeTeam.length === 0 && <div style={{color:'#555', fontSize:'0.9em', padding:'10px', fontStyle:'italic'}}>Add students to see skills...</div>}
          
          {activeTeam.map(student => {
            const { effectiveCost, activeBuff } = getStudentStatus(student.id);
            const canAfford = currentCostAvailable >= effectiveCost - 0.01;
            const isBusy = timelineEvents.find(e => 
               e.studentId === student.id && 
               (currentElapsed >= e.startTime && currentElapsed < e.startTime + e.animationDuration)
            );
            const isTargetCandidate = targetingSource && student.id !== targetingSource.id; 
            
            let bg = isBusy ? '#251515' : (canAfford ? (student.role === 'Striker' ? '#b71c1c' : '#0d47a1') : '#222');
            let border = isBusy ? '#d32f2f' : (canAfford ? 'rgba(255,255,255,0.2)' : '#444');
            if (activeBuff) border = '#76ff03'; 
            if (targetingSource) {
                if (isTargetCandidate) { bg = '#f57f17'; border = '#ffeb3b'; } 
                else { bg = '#111'; border = '#333'; }
            }

            return (
              <button 
                key={student.id} 
                onClick={() => handleSkillClick(student)}
                disabled={(!targetingSource && !canAfford) || (!targetingSource && isBusy) || (targetingSource && !isTargetCandidate)}
                title={`Cost: ${effectiveCost}`}
                style={{ 
                  padding: '8px 12px', borderRadius: '4px', border: `1px solid ${border}`,
                  background: bg, color: 'white', cursor: 'pointer',
                  opacity: (targetingSource && !isTargetCandidate) ? 0.3 : (isBusy ? 0.7 : 1),
                  minWidth: '120px', textAlign: 'left',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)', transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize:'0.9em' }}>{student.name}</div>
                <div style={{ fontSize: '0.75em', opacity: 0.8, display:'flex', justifyContent:'space-between' }}>
                   <span style={{ color: activeBuff ? '#76ff03' : 'inherit' }}>
                       Cost: {effectiveCost} {activeBuff && "(-50%)"}
                   </span>
                   {isBusy && <span style={{color:'#ef5350'}}>BUSY</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <Timeline 
        events={timelineEvents} 
        onUpdateEvent={handleEventUpdate}
        onDeleteEvent={(idx) => setTimelineEvents(p => p.filter((_, i) => i !== idx))} 
        activeTeam={activeTeam}
        calculateCostAtTime={calculateCostAtTime} 
        raidDuration={raidDuration}
        currentCost={currentCostAvailable}
        costPerSecond={currentRateDisplay} 
        currentElapsed={currentElapsed}
        formatTimeFn={formatRaidTime}
        onTimeUpdate={updateInputsFromElapsed}
      />
      
      <style>{`
        .btn-control { background:#333; color:white; border:1px solid #555; padding:6px 12px; cursor:pointer; border-radius:4px; font-weight:bold; font-size:0.85em; transition:all 0.1s; }
        .btn-control:hover { background:#444; border-color:#777; }
        .btn-control.special { background:#00695c; border-color:#004d40; }
        .btn-control.special:disabled { background:#222; border-color:#333; color:#555; cursor:not-allowed; }
      `}</style>
    </div>
  );
};

export default App;