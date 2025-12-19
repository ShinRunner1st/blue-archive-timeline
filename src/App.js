import React, { useState, useMemo } from 'react';
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
    const buffDurationMs = effects.reduce((max, effect) => (effect.Duration > max) ? effect.Duration : max, 0) || 0;
    const costVal = exSkill.Cost && exSkill.Cost.length >= 5 ? exSkill.Cost[4] : (exSkill.Cost ? exSkill.Cost[0] : 0);

    return {
      id: student.Id,
      name: student.Name,
      role: student.SquadType === 'Main' ? 'Striker' : 'Special',
      regenCost: student.RegenCost,
      exSkill: {
        name: exSkill.Name || "Unknown",
        type: effectType,
        cost: costVal, 
        animationDuration: snapToFrame((exSkill.Duration || 0) / 30), 
        buffDuration: buffDurationMs / 1000 
      }
    };
  });
};

const ALL_STUDENTS = parseStudentData(rawStudentData);

// --- FORMATTER ---
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
  const [team, setTeam] = useState({ strikers: [], specials: [] });
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [raidDuration, setRaidDuration] = useState(240); 
  
  // Inputs
  const [inputMinutes, setInputMinutes] = useState(4); 
  const [inputSeconds, setInputSeconds] = useState(0);
  const [inputMillis, setInputMillis] = useState(0);

  const activeTeam = [...team.strikers, ...team.specials];

  // --- COST ENGINE ---
  const totalRegenSpeed = useMemo(() => activeTeam.reduce((sum, s) => sum + s.regenCost, 0), [activeTeam]);
  const costPerSecond = totalRegenSpeed / COST_UNIT;

  const calculateCostAtTime = (targetElapsed, excludeEventId = null) => {
    if (targetElapsed < REGEN_START_DELAY) return 0;
    let currentCost = 0;
    let lastTime = REGEN_START_DELAY;

    const pastEvents = timelineEvents
      .filter(e => e.id !== excludeEventId && e.startTime <= targetElapsed) 
      .sort((a, b) => a.startTime - b.startTime);

    for (const event of pastEvents) {
      if (event.startTime > lastTime) {
        const delta = event.startTime - lastTime;
        currentCost = Math.min(MAX_COST, currentCost + (delta * costPerSecond));
        lastTime = event.startTime;
      }
      if (event.startTime <= targetElapsed) {
         currentCost = Math.max(0, currentCost - event.cost);
      }
    }
    if (targetElapsed > lastTime) {
      const finalDelta = targetElapsed - lastTime;
      currentCost = Math.min(MAX_COST, currentCost + (finalDelta * costPerSecond));
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

  // --- ACTIONS ---
  const stepFrame = (direction) => {
    let newTime = currentElapsed + (direction * FRAME_MS);
    newTime = Math.max(0, Math.min(newTime, raidDuration));
    updateInputsFromElapsed(newTime);
  };

  const jumpToNextCost = () => {
    if (currentCostAvailable >= MAX_COST) return;
    
    const targetCost = Math.floor(currentCostAvailable) + 1;
    const missing = targetCost - currentCostAvailable;
    const effectiveStart = Math.max(currentElapsed, REGEN_START_DELAY);
    const timeNeeded = missing / costPerSecond;
    
    let targetTime = snapToFrame(effectiveStart + timeNeeded);

    let safety = 0;
    while (calculateCostAtTime(targetTime) < targetCost - 0.001 && safety < 5) {
        targetTime += FRAME_MS;
        targetTime = snapToFrame(targetTime);
        safety++;
    }
    updateInputsFromElapsed(targetTime);
  };

  const addToTeam = (student) => {
    if (student.role === 'Striker' && team.strikers.length < 4 && !team.strikers.find(x=>x.id===student.id)) setTeam(p => ({ ...p, strikers: [...p.strikers, student] }));
    else if (student.role === 'Special' && team.specials.length < 2 && !team.specials.find(x=>x.id===student.id)) setTeam(p => ({ ...p, specials: [...p.specials, student] }));
  };

  const removeFromTeam = (id, role) => {
    if (role === 'Striker') setTeam(p => ({ ...p, strikers: p.strikers.filter(s => s.id !== id) }));
    else setTeam(p => ({ ...p, specials: p.specials.filter(s => s.id !== id) }));
  };

  const addSkillEvent = (student) => {
    const startTime = currentElapsed;
    const duration = student.exSkill.buffDuration > 2 ? student.exSkill.buffDuration : student.exSkill.animationDuration;

    if (currentCostAvailable < student.exSkill.cost - 0.001) {
      alert(`Not enough cost! Need ${student.exSkill.cost}`);
      return;
    }

    const rowIndex = activeTeam.findIndex(s => s.id === student.id);
    
    const newEvent = {
      id: Date.now(), studentId: student.id, name: student.exSkill.name, skillType: student.exSkill.type,
      cost: student.exSkill.cost, startTime: startTime, duration: duration, 
      animationDuration: student.exSkill.animationDuration, endTime: startTime + duration,
      rowId: rowIndex 
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
            const missing = updatedEvent.cost - costAtNewTime;
            const timeToWait = missing / costPerSecond;
            let snappedTime = snapToFrame(updatedEvent.startTime + timeToWait);
            
            let safety = 0;
            while (calculateCostAtTime(snappedTime, eventId) < updatedEvent.cost - 0.001 && safety < 5) {
                snappedTime += FRAME_MS;
                snappedTime = snapToFrame(snappedTime);
                safety++;
            }
            if (snappedTime > raidDuration) snappedTime = raidDuration;

            const snappedEvent = { ...updatedEvent, startTime: snappedTime, endTime: snappedTime + updatedEvent.duration };
            return prev.map(e => e.id === eventId ? snappedEvent : e).sort((a,b) => a.startTime - b.startTime);
        }
    });
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'monospace', backgroundColor: '#121212', color: '#e0e0e0', minHeight: '100vh' }}>
      
      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
        <h2 style={{color: '#90caf9', margin: 0, fontSize:'1.5rem'}}>Blue Archive Timeline</h2>
        <div style={{fontSize:'0.8em', color:'#666'}}>Total Regen: {totalRegenSpeed.toFixed(0)}</div>
      </div>
      <hr style={{ borderColor: '#333', marginBottom: '25px' }} />
      
      {/* CONTROLS */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems:'start', marginBottom:'30px' }}>
        
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

        <div style={{ flex: 1, minWidth: '300px' }}>
           {/* Added flexWrap: wrap here to fix overlap */}
           <div style={{display:'flex', gap:'20px', flexWrap:'wrap'}}>
             <div style={{width:'250px', flexShrink: 0}}>
                <StudentSelector allStudents={ALL_STUDENTS} activeTeam={activeTeam} onAdd={addToTeam} />
             </div>
             <div style={{flex:1, minWidth: '200px'}}>
                <label style={{display:'block', marginBottom:'5px', color:'#aaa', fontSize:'0.9em'}}>Active Team (Click to Remove)</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {activeTeam.map(s => (
                    <div key={s.id} onClick={() => removeFromTeam(s.id, s.role)} style={{ 
                      background: s.role === 'Striker' ? '#c62828' : '#1565c0', 
                      padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8em',
                      border: '1px solid rgba(255,255,255,0.2)', color:'white', display:'flex', alignItems:'center'
                    }}>
                      {s.name} <span style={{opacity:0.6, marginLeft:'4px'}}>x</span>
                    </div>
                  ))}
                  {activeTeam.length === 0 && <span style={{color:'#555', fontSize:'0.9em', fontStyle:'italic'}}>Team empty...</span>}
                </div>
             </div>
           </div>
        </div>

      </div>

      {/* SKILL BUTTONS */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{display:'block', marginBottom:'8px', color:'#aaa', fontSize:'0.9em'}}>Skills (Click to Add at Current Time)</label>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {activeTeam.map(student => {
            const canAfford = currentCostAvailable >= student.exSkill.cost - 0.01;
            
            // BUSY check strictly using Animation Duration
            const isBusy = timelineEvents.find(e => 
               e.studentId === student.id && 
               (currentElapsed >= e.startTime && currentElapsed < e.startTime + e.animationDuration)
            );

            let tooltip = `Cost: ${student.exSkill.cost}`;
            if (!canAfford) {
                const missing = student.exSkill.cost - currentCostAvailable;
                const effectiveStart = Math.max(currentElapsed, REGEN_START_DELAY);
                const timeNeeded = missing / costPerSecond;
                let readyTime = snapToFrame(effectiveStart + timeNeeded);
                if (calculateCostAtTime(readyTime) < student.exSkill.cost - 0.001) readyTime += FRAME_MS;
                tooltip += `\nReady at: ${formatRaidTime(readyTime, raidDuration)}`;
            }

            return (
              <button 
                key={student.id} 
                onClick={() => addSkillEvent(student)}
                disabled={!canAfford || isBusy}
                title={isBusy ? "Animation" : tooltip}
                style={{ 
                  padding: '8px 12px', borderRadius: '4px', border: '1px solid',
                  borderColor: isBusy ? '#d32f2f' : (canAfford ? 'rgba(255,255,255,0.2)' : '#444'),
                  background: isBusy ? '#251515' : (canAfford ? (student.role === 'Striker' ? '#b71c1c' : '#0d47a1') : '#222'),
                  color: (canAfford && !isBusy) ? 'white' : '#666',
                  cursor: (canAfford && !isBusy) ? 'pointer' : 'not-allowed',
                  opacity: isBusy ? 0.7 : 1,
                  minWidth: '120px', textAlign: 'left',
                  boxShadow: (canAfford && !isBusy) ? '0 2px 4px rgba(0,0,0,0.3)' : 'none'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize:'0.9em' }}>{student.name}</div>
                <div style={{ fontSize: '0.75em', opacity: 0.8, display:'flex', justifyContent:'space-between' }}>
                   <span>Cost: {student.exSkill.cost}</span>
                   {isBusy && <span style={{color:'#ef5350'}}>Action</span>}
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
        costPerSecond={costPerSecond}
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