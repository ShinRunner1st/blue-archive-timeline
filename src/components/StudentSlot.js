import React from 'react';

const getIconUrl = (id) => {
    try { return require(`../images/student/icon/${id}.webp`); } 
    catch (err) { return null; }
};

const StudentSlot = ({ student, label, isSelected, color, onClick, onContextMenu }) => (
    <div 
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{
            width: '65px', height: '75px', 
            background: student ? '#2a2a2a' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isSelected ? '#ffeb3b' : (student ? color : '#444')}`, 
            borderRadius: '6px',
            display: 'flex', flexDirection: 'column',
            cursor: 'pointer', position: 'relative', overflow: 'hidden',
            boxShadow: isSelected ? '0 0 8px rgba(255, 235, 59, 0.3)' : 'none',
            transition: 'all 0.2s'
        }}
        title={student ? `Right-Click to Remove` : `Click to Select ${label}`}
    >
        {student ? (
            <>
                <div style={{flex: 1, width:'100%', position:'relative', overflow:'hidden'}}>
                    <img src={getIconUrl(student.id)} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                </div>
                <div style={{width:'100%', padding:'2px 0', background: color, color:'white', fontSize:'0.65em', fontWeight:'bold', textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{student.name}</div>
            </>
        ) : (
            <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color: isSelected ? '#ffeb3b' : '#555'}}>
                <div style={{fontSize:'1.4em', marginBottom:'0px', opacity:0.5}}>+</div><div style={{fontSize:'0.65em'}}>{label}</div>
            </div>
        )}
    </div>
);

export default StudentSlot;