import React, { useState } from 'react';

const FPS = 30;
const FRAME_MS = 1 / FPS;
const snapToFrame = (time) => Math.round(time * FPS) / FPS;

const CostBar = ({ maxCost = 10, currentCost, costPerSecond, currentElapsed, raidDuration, formatTimeFn, calculateCostAtTime, onJumpToTime }) => {
  const [hoveredCost, setHoveredCost] = useState(null);

  // Reusable helper to get the absolute ready time for a target cost
  const getAbsoluteReadyTime = (targetCost) => {
    if (targetCost <= currentCost) return null; // Already ready
    
    const missing = targetCost - currentCost;
    const effectiveStartTime = Math.max(currentElapsed, 2.0);
    const timeNeeded = missing / costPerSecond;
    let absoluteTime = snapToFrame(effectiveStartTime + timeNeeded);

    // Verify
    let safety = 0;
    while (calculateCostAtTime(absoluteTime) < targetCost - 0.001 && safety < 10) {
        absoluteTime += FRAME_MS;
        absoluteTime = snapToFrame(absoluteTime);
        safety++;
    }
    return absoluteTime;
  };

  const handleClick = (costValue) => {
      // Jump to the time this cost becomes available
      if (costValue <= currentCost) return;

      const readyTime = getAbsoluteReadyTime(costValue);
      if (readyTime !== null && onJumpToTime) {
          onJumpToTime(readyTime);
      }
  };

  return (
    <div style={{ width: '100%', padding: '0' }}>
      {/* REMOVED overflow: 'hidden' here so tooltips can pop out */}
      <div style={{ display: 'flex', height: '25px', border: '1px solid #555', background: '#222', position: 'relative', borderRadius: '3px' }}>
        
        {Array.from({ length: maxCost }).map((_, i) => {
          const costValue = i + 1;
          const isFilled = costValue <= currentCost;
          const isPartial = !isFilled && costValue - 1 < currentCost;
          const partialWidth = isPartial ? (currentCost % 1) * 100 : 0;

          return (
            <div 
              key={i}
              onMouseEnter={() => setHoveredCost(costValue)}
              onMouseLeave={() => setHoveredCost(null)}
              onClick={() => handleClick(costValue)}
              style={{ 
                flex: 1, 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isFilled ? '#388e3c' : '#222',
                color: isFilled ? 'white' : '#666',
                fontWeight: 'bold', fontSize: '0.85em',
                position: 'relative',
                borderRight: i < maxCost - 1 ? '1px solid #444' : 'none',
                cursor: isFilled ? 'default' : 'pointer',
                transition: 'background 0.2s'
              }}
            >
              {isPartial && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${partialWidth}%`,
                  background: 'rgba(56, 142, 60, 0.4)',
                  zIndex: 0
                }} />
              )}
              
              <span style={{ zIndex: 1 }}>{costValue}</span>

              {/* TOOLTIP */}
              {hoveredCost === costValue && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                  marginBottom: '6px', padding: '6px 10px',
                  background: 'rgba(0,0,0,0.95)', border: '1px solid #777', borderRadius: '4px',
                  color: 'white', whiteSpace: 'nowrap', fontSize: '0.8em', zIndex: 100,
                  pointerEvents: 'none', textAlign: 'center', boxShadow:'0 2px 5px rgba(0,0,0,0.5)'
                }}>
                  {isFilled ? "Ready" : (
                    <>
                      Ready at:<br/>
                      <span style={{color: '#ffeb3b', fontSize:'1.1em', fontWeight:'bold'}}>
                        {(() => {
                            const t = getAbsoluteReadyTime(costValue);
                            return formatTimeFn(t, raidDuration);
                        })()}
                      </span>
                      <div style={{fontSize:'0.8em', color:'#aaa', marginTop:'2px'}}>(Click to Jump)</div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CostBar;