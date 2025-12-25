import React from 'react';

const getIconUrl = (id) => {
    try { return require(`../images/student/icon/${id}.webp`); } 
    catch (err) { return null; }
};

const SkillList = ({ 
    activeTeam, timelineEvents, currentElapsed, 
    currentCostAvailable, targetingSource, 
    onSkillClick, setTargetingSource, getStudentStatus,
    interactionMode 
}) => {
  return (
    <div style={{ marginBottom: '20px' }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
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
            const { effectiveCost, activeBuff, skillName, isExtra } = getStudentStatus(student.id);
            const canAfford = currentCostAvailable >= effectiveCost - 0.01;
            const isActivating = timelineEvents.some(e => 
               e.studentId === student.id && 
               e.skillType !== 'Auto' && // Ignore Auto
               (currentElapsed >= e.startTime && currentElapsed < e.startTime + e.animationDuration)
            );
            
            const isTargetCandidate = targetingSource && student.id !== targetingSource.id && student.role !== 'Special'; 
            
            let bg = isActivating ? '#251515' : (canAfford ? (student.role === 'Striker' ? '#b71c1c' : '#0d47a1') : '#222');
            let border = isActivating ? '#d32f2f' : (canAfford ? 'rgba(255,255,255,0.2)' : '#444');
            if (activeBuff) border = '#76ff03'; 
            if (targetingSource) {
                if (isTargetCandidate) { bg = '#f57f17'; border = '#ffeb3b'; } 
                else { bg = '#111'; border = '#333'; }
            }
            
            const disabled = interactionMode === 'normal' || (!targetingSource && !canAfford) || (!targetingSource && isActivating) || (targetingSource && !isTargetCandidate);

            return (
              <div key={student.id} style={{display:'flex', flexDirection:'column', gap:'2px'}}>
                  <button 
                    onClick={() => onSkillClick(student)}
                    disabled={disabled}
                    title={`Cost: ${effectiveCost}`}
                    style={{ 
                      padding: '8px 12px', borderRadius: '4px', border: `1px solid ${border}`,
                      background: bg, color: 'white', cursor: disabled ? 'default' : 'pointer',
                      opacity: disabled ? 0.3 : (isActivating ? 0.7 : 1),
                      minWidth: '130px', textAlign: 'left',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)', transition: 'all 0.2s',
                      display: 'flex', alignItems:'center', gap:'8px', position:'relative'
                    }}
                  >
                    <div style={{width:'30px', height:'30px', borderRadius:'50%', overflow:'hidden', background:'#000'}}>
                        <img src={getIconUrl(student.id)} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize:'0.85em' }}>{isExtra ? skillName : student.name}</div>
                        <div style={{ fontSize: '0.75em', opacity: 0.8, display:'flex', justifyContent:'space-between' }}>
                           <span style={{ color: activeBuff ? '#76ff03' : 'inherit' }}>
                               Cost: {effectiveCost} {activeBuff && "(-)"}
                           </span>
                           {isActivating && <span style={{color:'#ef5350', marginLeft:'5px'}}>CASTING</span>}
                        </div>
                    </div>
                  </button>
              </div>
            )
          })}
        </div>
    </div>
  );
};

export default SkillList;