import React, { useRef } from 'react';
import { formatRaidTime } from '../utils/timeUtils';
import TeamPanel from './TeamPanel';

const ControlPanel = ({ 
    raidDuration, setRaidDuration, currentElapsed, updateInputsFromElapsed,
    inputMinutes, setInputMinutes, inputSeconds, setInputSeconds, inputMillis, setInputMillis,
    stepFrame, jumpToNextCost, team, timelineEvents, setTeam, setTimelineEvents,
    currentCost, currentRateDisplay, isPassiveActive, isMaxCost,
    allStudents, activeTeam, selectedSlot, onAddStudent, onSlotClick, onSlotContextMenu
}) => {
  const fileInputRef = useRef(null);

  const handleSave = () => {
      const data = { team, timelineEvents, raidDuration };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ba-timeline-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
  };

  const handleLoad = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const loaded = JSON.parse(evt.target.result);
              if (loaded.team) setTeam(loaded.team);
              if (loaded.timelineEvents) setTimelineEvents(loaded.timelineEvents);
              if (loaded.raidDuration) setRaidDuration(loaded.raidDuration);
          } catch (err) { alert("Invalid JSON"); }
      };
      reader.readAsText(file);
  };

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
            <h2 style={{color: '#90caf9', margin: 0, fontSize:'1.5rem'}}>Blue Archive Timeline</h2>
            <div style={{display:'flex', gap:'5px'}}>
                <button onClick={handleSave} className="btn-control" style={{fontSize:'0.8em'}}>💾 Save</button>
                <input type="file" ref={fileInputRef} onChange={handleLoad} style={{display:'none'}} />
                <button onClick={() => fileInputRef.current.click()} className="btn-control" style={{fontSize:'0.8em'}}>📂 Load</button>
            </div>
        </div>
      </div>
      <hr style={{ borderColor: '#333', marginBottom: '25px' }} />
      
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems:'flex-start', marginBottom:'30px' }}>
        <div style={{ background: '#1e1e1e', padding: '15px', borderRadius: '8px', border: '1px solid #333', minWidth:'220px' }}>
          <div style={{ marginBottom: '10px', display:'flex', gap:'10px', alignItems:'center' }}>
            <label style={{ fontSize: '0.8em', color: '#aaa' }}>Raid Time</label>
            <select value={raidDuration} onChange={(e) => { setRaidDuration(Number(e.target.value)); updateInputsFromElapsed(0); }} style={{ background: '#333', color: 'white', padding: '4px', borderRadius:'4px', border:'1px solid #555' }}>
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
             <button onClick={jumpToNextCost} className="btn-control special" disabled={isMaxCost}>Next Cost &gt;&gt;</button>
          </div>
          {/* FIX: Count UP for elapsed display only */}
          <div style={{ marginTop: '8px', fontSize: '0.75em', color: '#666', textAlign:'right' }}>Elapsed: {formatRaidTime(currentElapsed)}</div>
        </div>
        <div style={{flex: 1}}>
             <TeamPanel allStudents={allStudents} activeTeam={activeTeam} team={team} selectedSlot={selectedSlot} onAddStudent={onAddStudent} onSlotClick={onSlotClick} onSlotContextMenu={onSlotContextMenu} />
        </div>
      </div>
    </>
  );
};
export default ControlPanel;