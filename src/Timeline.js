import React, { useRef, useState, useEffect } from 'react';
import CostBar from './CostBar';

const BASE_ZOOM = 20;
const BASE_ROW_HEIGHT = 80; 
const HEADER_HEIGHT = 40; 
const GRAPH_HEIGHT = 60; 
const NAME_COLUMN_WIDTH = 120; 

const TYPE_COLORS = {
    Damage: '#d32f2f', Buff: '#388e3c', Heal: '#81c784', Summon: '#f57c00',
    Regen: '#0097a7', CrowdControl: '#7b1fa2', DamageDebuff: '#c2185b', Special: '#512da8',
    Shield: '#fbc02d', Knockback: '#6d4c41', Dispel: '#455a64', CostChange: '#0288d1',
    ConcentratedTarget: '#d84315', Accumulation: '#e64a19', Unknown: '#616161'
};

const getSkillColor = (type) => TYPE_COLORS[type] || TYPE_COLORS.Unknown;

const CostGraph = ({ data, totalWidth, height, onMouseDown, pxPerSec }) => {
    if (!data || data.length === 0) return null;
    const validData = data.filter(d => !isNaN(d.v) && !isNaN(d.t));
    if (validData.length === 0) return null;
    const mappedPoints = validData.map(d => `${d.t * pxPerSec},${height - (d.v / 10) * height}`).join(' ');
    const lastX = validData[validData.length - 1]?.t * pxPerSec || totalWidth;
    const areaPoints = `0,${height} ${mappedPoints} ${lastX},${height}`;
    return (
        <div onMouseDown={onMouseDown} style={{ position: 'absolute', top: 0, left: 0, width: `${totalWidth}px`, height: `${height}px`, background: '#1e1e1e', borderBottom: '1px solid #444', overflow: 'hidden', cursor: 'crosshair', zIndex: 25 }}>
            <svg width={totalWidth} height={height} style={{display:'block'}}>
                {Array.from({ length: 10 }).map((_, i) => { const y = height - ((i+1) / 10) * height; return <line key={i} x1="0" y1={y} x2={totalWidth} y2={y} stroke={(i+1)%5===0?"#555":"#333"} strokeWidth="1" strokeDasharray={(i+1)%5===0?"":"2,2"} />; })}
                <polygon points={areaPoints} fill="rgba(0, 150, 136, 0.2)" />
                <polyline points={mappedPoints} fill="none" stroke="#009688" strokeWidth="1.5" />
            </svg>
            <div style={{ position: 'absolute', left: 4, top: 0, fontSize: '9px', color: '#009688', fontWeight:'bold', pointerEvents:'none' }}>10</div>
            <div style={{ position: 'absolute', left: 4, bottom: 0, fontSize: '9px', color: '#009688', fontWeight:'bold', pointerEvents:'none' }}>0</div>
        </div>
    );
};

const Timeline = ({ 
  events, onUpdateEvent, onDeleteEvent, activeTeam, onClearEvents,
  raidDuration, currentCost, costPerSecond, currentElapsed, formatTimeFn, onTimeUpdate, calculateCostAtTime,
  costGraphData, getEffectiveCostAtTime, currentRateDisplay, isPassiveActive 
}) => {
  
  const [zoomLevel, setZoomLevel] = useState(BASE_ZOOM); 
  const totalWidth = raidDuration * zoomLevel;
  const markers = Array.from({ length: Math.floor(raidDuration / 5) + 1 });
  const scrollRef = useRef(null);
  const [dragState, setDragState] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const rowLayouts = activeTeam.map((student, rowIndex) => {
      const visualChunks = [];
      events.forEach(ev => {
          if (ev.visualEffects) {
              ev.visualEffects.forEach((ve, vIndex) => {
                  if (ve.duration <= 0) return;
                  const targetRowIndex = (ve.target === "AllyMain" && ev.targetId) ? activeTeam.findIndex(s => s.id === ev.targetId) : activeTeam.findIndex(s => s.id === ev.studentId);
                  if (targetRowIndex === rowIndex) {
                      visualChunks.push({
                          eventId: ev.id, name: ev.name, start: ev.startTime + ve.delay, end: ev.startTime + ve.delay + ve.duration,
                          delay: ve.delay, type: ve.type, stat: ve.stat, duration: ve.duration, index: vIndex
                      });
                  }
              });
          }
      });
      const sorted = visualChunks.sort((a,b) => a.start - b.start || b.duration - a.duration);
      const lanes = [];
      const chunkLanes = new Map();
      sorted.forEach((chunk) => {
          let placed = false;
          for (let i = 0; i < lanes.length; i++) {
              const laneChunks = lanes[i].chunks;
              const isSame = laneChunks.some(c => c.eventId === chunk.eventId && c.type === chunk.type && c.stat === chunk.stat);
              if (lanes[i].end <= chunk.start + 0.01 || isSame) {
                  lanes[i].end = Math.max(lanes[i].end, chunk.end);
                  lanes[i].chunks.push(chunk);
                  chunkLanes.set(chunk, i);
                  placed = true; break;
              }
          }
          if (!placed) { lanes.push({ end: chunk.end, chunks: [chunk] }); chunkLanes.set(chunk, lanes.length - 1); }
      });
      const calculatedHeight = Math.max(BASE_ROW_HEIGHT, 40 + (lanes.length * 22));
      return { height: calculatedHeight, chunkLanes, sortedChunks: sorted };
  });

  const rowTops = [0];
  for(let i=0; i<rowLayouts.length; i++) { rowTops.push(rowTops[i] + rowLayouts[i].height); }
  const totalContentHeight = GRAPH_HEIGHT + HEADER_HEIGHT + rowTops[rowTops.length-1];

  const handleZoom = (delta) => { setZoomLevel(prev => Math.max(10, Math.min(100, prev + delta))); };
  const handleScrub = (e) => {
    const container = scrollRef.current; if (!container) return;
    const x = e.clientX - container.getBoundingClientRect().left + container.scrollLeft - NAME_COLUMN_WIDTH;
    onTimeUpdate(Math.max(0, Math.min(x / zoomLevel, raidDuration)));
  };
  const handleScrubMouseDown = (e) => { e.preventDefault(); e.stopPropagation(); handleScrub(e); const mm = (ev)=>handleScrub(ev); const mu = ()=>{window.removeEventListener('mousemove',mm);window.removeEventListener('mouseup',mu)}; window.addEventListener('mousemove',mm); window.addEventListener('mouseup',mu); };
  
  const handleEventMouseDown = (e, event) => { 
      e.stopPropagation(); e.preventDefault(); 
      const student = activeTeam.find(s=>s.id===event.studentId);
      setDragState({ eventId: event.id, startX: e.clientX, originalStartTime: event.startTime, studentId: event.studentId, cost: student?.exSkill.cost }); 
  };
  
  useEffect(() => {
    if (!dragState) return;
    const onMouseMove = (e) => {
      const deltaX = e.clientX - dragState.startX;
      let newStart = Math.max(0, Math.round((dragState.originalStartTime + deltaX / zoomLevel) * 30) / 30);
      let validTime = newStart;
      let attempts = 0;
      while (attempts < 50) {
          const effectiveCost = getEffectiveCostAtTime(dragState.studentId, validTime, dragState.eventId);
          const balance = calculateCostAtTime(validTime, dragState.eventId);
          if (balance >= effectiveCost - 0.001) break;
          validTime += 0.1; attempts++;
      }
      onUpdateEvent(dragState.eventId, { startTime: Math.round(validTime * 30) / 30, isDragging: true });
    };
    const onMouseUp = () => { onUpdateEvent(dragState.eventId, { isDragging: false }); setDragState(null); };
    window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [dragState, onUpdateEvent, zoomLevel, calculateCostAtTime, getEffectiveCostAtTime]);

  // --- FIX: Right-Click Panning ---
  const handlePanMouseDown = (e) => { 
      if (e.button !== 2) return; // Right Click Only
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true); 
      setPanStart({ x: e.clientX, y: e.clientY, scrollLeft: scrollRef.current.scrollLeft, scrollTop: scrollRef.current.scrollTop }); 
  };
  useEffect(() => { if (!isPanning) return; const mm = (e) => { const dx = e.clientX - panStart.x; const dy = e.clientY - panStart.y; if (scrollRef.current) { scrollRef.current.scrollLeft = panStart.scrollLeft - dx; scrollRef.current.scrollTop = panStart.scrollTop - dy; } }; const mu = () => setIsPanning(false); window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); }; }, [isPanning, panStart]);

  return (
    <div style={{ border: '1px solid #444', background: '#222', userSelect: 'none', display: 'flex', flexDirection: 'column', borderRadius:'4px', height: '100%' }}>
      
      <div style={{ padding: '8px 12px', background: '#1a1a1a', borderBottom: '1px solid #444', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
         <div style={{display:'flex', gap:'20px', alignItems:'center', flex: 1}}>
             <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                 <span style={{ fontSize: '0.8em', color: '#aaa', fontWeight: 'bold' }}>COST</span>
                 <span style={{ fontSize: '0.9em', color: '#fff', fontWeight: 'bold', minWidth: '70px', textAlign:'right', fontFamily:'monospace' }}>{currentCost.toFixed(2)}</span>
             </div>
             <div style={{flex: 1, maxWidth: '300px'}}><CostBar maxCost={10} currentCost={currentCost} costPerSecond={costPerSecond} currentElapsed={currentElapsed} raidDuration={raidDuration} formatTimeFn={formatTimeFn} calculateCostAtTime={calculateCostAtTime} onJumpToTime={onTimeUpdate} /></div>
             
             <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                 <span style={{ fontSize: '0.75em', color: '#aaa', fontWeight:'bold' }}>RATE:</span>
                 <span style={{ fontSize: '0.8em', color: '#66bb6a', fontFamily:'monospace' }}>{currentRateDisplay.toFixed(3)}/s</span>
                 {isPassiveActive && <span style={{color:'#66bb6a', marginLeft:5, fontSize:'0.75em', fontWeight:'bold'}}>(+Passive)</span>}
             </div>
         </div>

         <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
             <span style={{color:'#888', fontSize:'0.75em', marginRight:'5px'}}>x{(zoomLevel / BASE_ZOOM).toFixed(1)}</span>
             <button onClick={() => handleZoom(-5)} className="btn-tiny" title="Zoom Out">-</button>
             <button onClick={() => handleZoom(5)} className="btn-tiny" title="Zoom In">+</button>
             <div style={{width:'1px', height:'20px', background:'#444', margin:'0 5px'}}></div>
             <button onClick={onClearEvents} className="btn-tiny" style={{background:'#c62828', borderColor:'#e53935', color:'white', fontWeight:'bold'}}>Clear</button>
         </div>
      </div>

      <div 
          ref={scrollRef} 
          onMouseDown={handlePanMouseDown} 
          onContextMenu={(e) => e.preventDefault()} // Block Context Menu on Timeline Body
          className="no-scrollbar" 
          style={{ overflowX: 'auto', overflowY: 'auto', position: 'relative', background: '#181818', flex: 1, cursor: isPanning ? 'grabbing' : 'default' }} // Change cursor hint
      >
        
        <div style={{ position: 'sticky', left: 0, zIndex: 80, width: `${NAME_COLUMN_WIDTH}px`, background: '#222', borderRight: '1px solid #444', minHeight: `${totalContentHeight}px`, float: 'left' }}>
            <div style={{ height: `${GRAPH_HEIGHT + HEADER_HEIGHT}px`, borderBottom: '1px solid #444', background: '#222' }}></div>
            {activeTeam.map((student, i) => (
                <div key={student.id} style={{ height: `${rowLayouts[i].height}px`, borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', paddingLeft: '10px', color: '#ddd', fontSize: '0.75em', fontWeight: 'bold', boxSizing: 'border-box' }}>{student.name}</div>
            ))}
        </div>

        <div style={{ width: `${totalWidth}px`, height: `${totalContentHeight}px`, position: 'relative', marginLeft: `${NAME_COLUMN_WIDTH}px` }}>
          
          <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#181818', width: '100%', height: `${GRAPH_HEIGHT + HEADER_HEIGHT}px` }}>
              <CostGraph data={costGraphData} totalWidth={totalWidth} height={GRAPH_HEIGHT} onMouseDown={handleScrubMouseDown} pxPerSec={zoomLevel} />
              <div style={{ position: 'absolute', top: `${GRAPH_HEIGHT}px`, left: 0, right: 0, height: `${HEADER_HEIGHT}px`, borderBottom: '1px solid #555', zIndex: 30, background: '#252525', display:'flex', alignItems:'center' }}>
                 <div onMouseDown={handleScrubMouseDown} style={{position:'absolute', width:'100%', height:'100%', cursor: 'crosshair'}}>
                     {markers.map((_, i) => {
                       const elapsed = i * 5;
                       if (i === markers.length - 1) return null;
                       return <div key={i} style={{ position: 'absolute', left: `${elapsed * zoomLevel}px`, top: 0, bottom: 0, borderLeft: '1px solid #444', color: '#777', fontSize: '10px', paddingLeft: '4px', lineHeight: `${HEADER_HEIGHT}px`, whiteSpace: 'nowrap' }}>{formatTimeFn(elapsed, raidDuration)}</div>;
                     })}
                 </div>
              </div>
          </div>

          <div style={{ position: 'absolute', left: `${currentElapsed * zoomLevel}px`, top: 0, bottom: 0, width: '2px', background: '#ffeb3b', zIndex: 70, pointerEvents: 'none', mixBlendMode: 'difference' }} />

          <div style={{ position: 'absolute', top: `${GRAPH_HEIGHT + HEADER_HEIGHT}px`, left: 0, right: 0, bottom: 0 }}>
             {markers.map((_, i) => (<div key={i} style={{ position: 'absolute', left: `${i * 5 * zoomLevel}px`, top: 1, bottom: 0, borderLeft: '1px solid #2a2a2a', pointerEvents: 'none' }} />))}
             
             {activeTeam.map((student, i) => (
                <div key={student.id} style={{ position: 'absolute', top: `${rowTops[i]}px`, left: 0, right: 0, height: `${rowLayouts[i].height}px`, borderBottom: '1px solid #2a2a2a', pointerEvents: 'none', boxSizing: 'border-box' }}></div>
             ))}

             {activeTeam.map((student, rowIndex) => {
                 const { chunkLanes, sortedChunks } = rowLayouts[rowIndex];
                 
                 const activationElements = events.map(event => {
                     const casterRowIndex = activeTeam.findIndex(s => s.id === event.studentId);
                     if (casterRowIndex !== rowIndex) return null;
                     
                     // FIX 2: Clamp Width for Activation
                     const visibleDuration = Math.min(event.animationDuration, raidDuration - event.startTime);
                     const animWidth = Math.max(0, visibleDuration * zoomLevel);
                     if (animWidth <= 0) return null;

                     const bars = [];
                     
                     // Tooltip
                     const tooltip = `[${event.name}]\n` +
                                     `Type: Casting (Animation)\n` +
                                     `Start: ${formatTimeFn(event.startTime)}\n` +
                                     `End: ${formatTimeFn(event.startTime + event.animationDuration)}\n` +
                                     `Duration: ${event.animationDuration}s\n` +
                                     `Cost: ${event.cost}`;

                     bars.push(
                         <div key={`anim-${event.id}`} onMouseDown={(e) => handleEventMouseDown(e, event)} onContextMenu={(e) => { e.preventDefault(); onDeleteEvent(events.indexOf(event)); }}
                             title={tooltip}
                             style={{
                                 position: 'absolute', left: `${event.startTime * zoomLevel}px`, width: `${animWidth}px`,
                                 top: `${rowTops[casterRowIndex] + 2}px`, height: `16px`,
                                 background: '#555', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '2px',
                                 color: 'white', fontSize: '9px', fontWeight: 'bold', display: 'flex', alignItems: 'center', paddingLeft: '3px',
                                 cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap', zIndex: 20, opacity: 0.9
                             }}>Casting...</div>
                     );

                     if (event.regenData && event.regenData.duration > 0) {
                         const regenStart = event.startTime + event.regenData.delay;
                         // FIX 2: Clamp Width for Regen
                         const regenDur = Math.min(event.regenData.duration, raidDuration - regenStart);
                         const regenWidth = Math.max(0, regenDur * zoomLevel);
                         
                         if (regenWidth > 0) {
                             const regenTooltip = `[Cost Regen]\nStart: ${formatTimeFn(regenStart)}\nEnd: ${formatTimeFn(regenStart + event.regenData.duration)}\nDuration: ${event.regenData.duration}s`;
                             bars.push(
                                 <div key={`regen-${event.id}`} onMouseDown={(e) => handleEventMouseDown(e, event)} onContextMenu={(e) => { e.preventDefault(); onDeleteEvent(events.indexOf(event)); }}
                                     title={regenTooltip} style={{
                                         position: 'absolute', left: `${regenStart * zoomLevel}px`, width: `${regenWidth}px`,
                                         top: `${rowTops[casterRowIndex] + 24}px`, height: `1px`, background: '#00e5ff', boxShadow: '0 0 2px #00e5ff', zIndex: 25, cursor: 'grab' }} />
                             );
                         }
                     }
                     return <React.Fragment key={`group-${event.id}`}>{bars}</React.Fragment>;
                 });

                 const effectElements = sortedChunks.map((chunk) => {
                     const event = events.find(e => e.id === chunk.eventId);
                     if (!event) return null;
                     const lane = chunkLanes.get(chunk) || 0;
                     const startY = 30; const laneHeight = 18; const topOffset = startY + (lane * (laneHeight + 4));
                     
                     // FIX 2: Clamp Width for Buffs
                     const visibleDuration = Math.min(chunk.duration, raidDuration - chunk.start);
                     const boxWidth = Math.max(0, visibleDuration * zoomLevel);
                     if (boxWidth <= 0) return null;

                     const tooltip = `[${chunk.name}]\n` +
                                     `Effect: ${chunk.type}\n` +
                                     `Stat: ${chunk.stat}\n` +
                                     `Start: ${formatTimeFn(chunk.start)}\n` +
                                     `Delay: ${chunk.delay.toFixed(2)}s\n` +
                                     `End: ${formatTimeFn(chunk.end)}\n` +
                                     `Duration: ${chunk.duration}s`;

                     return (
                         <div key={`eff-${chunk.eventId}-${chunk.type}-${chunk.index}`} 
                             onMouseDown={(e) => handleEventMouseDown(e, event)} onContextMenu={(e) => { e.preventDefault(); onDeleteEvent(events.indexOf(event)); }}
                             title={tooltip}
                             style={{
                                 position: 'absolute', left: `${chunk.start * zoomLevel}px`, width: `${boxWidth}px`,
                                 top: `${rowTops[rowIndex] + topOffset}px`, height: `${laneHeight}px`,
                                 background: getSkillColor(chunk.type), border: '1px solid rgba(255,255,255,0.3)', borderRadius: '3px',
                                 color: 'white', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', paddingLeft: '4px',
                                 cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap', zIndex: 10 }}>{chunk.name}</div>
                     );
                 });
                 return <React.Fragment key={student.id}>{activationElements}{effectElements}</React.Fragment>;
             })}
          </div>
        </div>
      </div>
      <style>{` .btn-tiny { background:#333; color:#ccc; border:1px solid #555; padding:3px 10px; cursor:pointer; font-size:0.8em; border-radius:3px; transition:0.2s; } .btn-tiny:hover { background:#444; color:#fff; } .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } `}</style>
    </div>
  );
};

export default Timeline;