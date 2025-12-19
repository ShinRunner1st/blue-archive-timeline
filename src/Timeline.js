import React, { useRef, useState, useEffect } from 'react';
import CostBar from './CostBar';

const PX_PER_SEC = 20; 
const ROW_HEIGHT = 45; 
const HEADER_HEIGHT = 30;

// Helper to determine color based on skill type
const getSkillColor = (type) => {
  const t = type ? type.toLowerCase() : "unknown";
  if (t.includes("damage") || t.includes("attack")) return 'linear-gradient(to bottom, #e53935, #c62828)';
  if (t.includes("buff") || t.includes("heal") || t.includes("recovery")) return 'linear-gradient(to bottom, #43a047, #2e7d32)';
  if (t.includes("cc") || t.includes("crowd")) return 'linear-gradient(to bottom, #8e24aa, #6a1b9a)';
  return 'linear-gradient(to bottom, #757575, #616161)'; // Default gray
};

const Timeline = ({ 
  events, onUpdateEvent, onDeleteEvent, activeTeam,
  raidDuration, currentCost, costPerSecond, currentElapsed, formatTimeFn, onTimeUpdate, calculateCostAtTime
}) => {
  
  const totalWidth = raidDuration * PX_PER_SEC;
  const markers = Array.from({ length: Math.floor(raidDuration / 5) + 1 });
  const scrollRef = useRef(null);
  const [dragState, setDragState] = useState(null);

  // --- SCRUBBER LOGIC ---
  const handleScrub = (e) => {
    const container = scrollRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const x = e.clientX - bounds.left + container.scrollLeft;
    let newTime = x / PX_PER_SEC;
    newTime = Math.max(0, Math.min(newTime, raidDuration));
    onTimeUpdate(newTime);
  };

  const handleScrubMouseDown = (e) => {
    e.preventDefault();
    handleScrub(e);
    const onMouseMove = (ev) => handleScrub(ev);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // --- DRAG LOGIC ---
  const handleEventMouseDown = (e, event) => {
    e.stopPropagation(); 
    e.preventDefault();
    setDragState({
      eventId: event.id,
      startX: e.clientX,
      originalStartTime: event.startTime,
    });
  };

  useEffect(() => {
    if (!dragState) return;
    const onMouseMove = (e) => {
      const deltaX = e.clientX - dragState.startX;
      const timeDelta = deltaX / PX_PER_SEC;
      let newStartTime = Math.round((dragState.originalStartTime + timeDelta) * 30) / 30;
      newStartTime = Math.max(0, newStartTime);
      onUpdateEvent(dragState.eventId, { startTime: newStartTime });
    };
    const onMouseUp = () => setDragState(null);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState, onUpdateEvent]);

  return (
    <div style={{ border: '1px solid #444', background: '#222', userSelect: 'none', display: 'flex', flexDirection: 'column', borderRadius:'4px', overflow:'hidden' }}>
      
      {/* 1. HEADER & COST BAR */}
      <div style={{ padding: '8px 12px', background: '#1a1a1a', borderBottom: '1px solid #444' }}>
         <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
            <span style={{ fontSize: '0.8em', color: '#aaa', fontWeight: 'bold' }}>COST GAUGE</span>
            <span style={{ fontSize: '0.9em', color: '#fff', fontWeight: 'bold' }}>{currentCost.toFixed(2)} / 10</span>
         </div>
         <CostBar 
            maxCost={10}
            currentCost={currentCost}
            costPerSecond={costPerSecond}
            currentElapsed={currentElapsed}
            raidDuration={raidDuration}
            formatTimeFn={formatTimeFn}
            calculateCostAtTime={calculateCostAtTime}
            onJumpToTime={onTimeUpdate} // Pass jump handler
         />
      </div>

      {/* 2. SCROLL AREA */}
      <div 
         ref={scrollRef}
         style={{ overflowX: 'auto', overflowY: 'hidden', position: 'relative', background: '#181818', height: '360px' }}
      >
        <div style={{ width: `${totalWidth}px`, height: '100%', position: 'relative' }}>
          
          {/* SCRUBBER */}
          <div 
             onMouseDown={handleScrubMouseDown}
             style={{ 
               position: 'absolute', top: 0, left: 0, right: 0, height: `${HEADER_HEIGHT}px`, 
               borderBottom: '1px solid #555', zIndex: 30, cursor: 'crosshair',
               background: '#252525'
             }}
          >
             {markers.map((_, i) => {
               const elapsed = i * 5;
               return (
                 <div key={i} style={{
                   position: 'absolute', left: `${elapsed * PX_PER_SEC}px`, top: 0, bottom: 0,
                   borderLeft: '1px solid #444', color: '#777', fontSize: '10px', paddingLeft: '4px', pointerEvents: 'none',
                   lineHeight: `${HEADER_HEIGHT}px`
                 }}>
                   {formatTimeFn(elapsed, raidDuration)}
                 </div>
               );
             })}
          </div>

          {/* EVENTS */}
          <div style={{ position: 'absolute', top: `${HEADER_HEIGHT}px`, left: 0, right: 0, bottom: 0 }}>
             
             {/* Grid */}
             {markers.map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: `${i * 5 * PX_PER_SEC}px`, top: 0, bottom: 0, borderLeft: '1px solid #2a2a2a', pointerEvents: 'none' }} />
             ))}

             {/* Rows */}
             {activeTeam.map((student, i) => (
                <div key={student.id} style={{ position: 'absolute', top: `${i * ROW_HEIGHT}px`, left: 0, right: 0, height: `${ROW_HEIGHT}px`, borderBottom: '1px solid #2a2a2a', pointerEvents: 'none' }}>
                   <span style={{ position: 'sticky', left: 5, top: 8, color: 'rgba(255,255,255,0.08)', fontSize: '24px', fontWeight: 'bold', zIndex: 0 }}>{student.name}</span>
                </div>
             ))}

             {/* Items */}
             {events.map((event, index) => {
               const rowIndex = activeTeam.findIndex(s => s.id === event.studentId);
               if (rowIndex === -1) return null;

               // Calculate detailed times for tooltip
               const animEnd = event.startTime + event.animationDuration;
               const effectEnd = event.endTime;

               return (
                 <div 
                   key={event.id}
                   onMouseDown={(e) => handleEventMouseDown(e, event)}
                   onDoubleClick={() => onDeleteEvent(index)}
                   title={`[${event.skillType}] ${event.name}
Start: ${formatTimeFn(event.startTime, raidDuration)}
Anim End: ${formatTimeFn(animEnd, raidDuration)}
Effect End: ${formatTimeFn(effectEnd, raidDuration)}
Cost: ${event.cost}`}
                   style={{
                     position: 'absolute',
                     left: `${event.startTime * PX_PER_SEC}px`,
                     width: `${Math.max(event.duration * PX_PER_SEC, 2)}px`,
                     top: `${rowIndex * ROW_HEIGHT + 8}px`,
                     height: `${ROW_HEIGHT - 16}px`,
                     background: getSkillColor(event.skillType),
                     border: dragState?.eventId === event.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.4)',
                     borderRadius: '4px',
                     color: 'white', fontSize: '11px', fontWeight: 'bold',
                     display: 'flex', alignItems: 'center', paddingLeft: '5px',
                     cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap',
                     zIndex: dragState?.eventId === event.id ? 100 : 10,
                     boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                   }}
                 >
                   {event.name}
                 </div>
               );
             })}
          </div>

          {/* PLAYHEAD */}
          <div style={{ position: 'absolute', left: `${currentElapsed * PX_PER_SEC}px`, top: 0, bottom: 0, width: '2px', background: '#ffeb3b', zIndex: 40, pointerEvents: 'none', boxShadow: '0 0 6px rgba(255, 235, 59, 0.6)' }} />
          <div style={{
             position: 'absolute', left: `${currentElapsed * PX_PER_SEC}px`, top: `${HEADER_HEIGHT}px`,
             transform: 'translateX(-50%)', background: '#ffeb3b', color: '#000', fontSize: '10px', fontWeight: 'bold',
             padding: '2px 4px', borderRadius: '0 0 3px 3px', pointerEvents: 'none', zIndex: 100, whiteSpace: 'nowrap'
          }}>
             {formatTimeFn(currentElapsed, raidDuration)}
          </div>

        </div>
      </div>
    </div>
  );
};

export default Timeline;