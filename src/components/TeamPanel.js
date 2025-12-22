import React from 'react';
import StudentSelector from '../StudentSelector';
import StudentSlot from './StudentSlot';

const TeamPanel = ({ allStudents, activeTeam, team, selectedSlot, onAddStudent, onSlotClick, onSlotContextMenu }) => {
  return (
    <div style={{ width:'fit-content', background: '#1e1e1e', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
        <div style={{marginBottom: '15px', width: '250px'}}>
            <label style={{display:'block', marginBottom:'5px', color: selectedSlot ? '#ffeb3b' : '#aaa', fontSize:'0.8em', fontWeight:'bold'}}>
                {selectedSlot?.role ? `SELECT ${selectedSlot.role.toUpperCase()} (SLOT ${selectedSlot.index + 1})` : "SELECT SLOT TO ADD"}
            </label>
            <StudentSelector allStudents={allStudents} activeTeam={activeTeam} onAdd={onAddStudent} filterRole={selectedSlot?.role} disabled={!selectedSlot} />
        </div>
        <div style={{display:'flex', gap:'15px'}}>
            <div>
                <label style={{display:'block', marginBottom:'5px', color:'#ef5350', fontSize:'0.7em', fontWeight:'bold'}}>STRIKERS</label>
                <div style={{display:'flex', gap:'5px'}}>
                    {[0, 1, 2, 3].map(i => {
                        const student = team.strikers[i];
                        return <StudentSlot key={i} student={student} label={`S${i+1}`} isSelected={selectedSlot?.role === 'Striker' && selectedSlot?.index === i} color="#c62828" onClick={() => onSlotClick('Striker', i)} onContextMenu={(e) => onSlotContextMenu(e, 'Striker', i)} />
                    })}
                </div>
            </div>
            <div style={{width:'1px', background:'#444', margin:'0 5px'}}></div>
            <div>
                <label style={{display:'block', marginBottom:'5px', color:'#42a5f5', fontSize:'0.7em', fontWeight:'bold'}}>SPECIALS</label>
                <div style={{display:'flex', gap:'5px'}}>
                    {[0, 1].map(i => {
                        const student = team.specials[i];
                        return <StudentSlot key={i} student={student} label={`Sp${i+1}`} isSelected={selectedSlot?.role === 'Special' && selectedSlot?.index === i} color="#1565c0" onClick={() => onSlotClick('Special', i)} onContextMenu={(e) => onSlotContextMenu(e, 'Special', i)} />
                    })}
                </div>
            </div>
        </div>
    </div>
  );
};
export default TeamPanel;