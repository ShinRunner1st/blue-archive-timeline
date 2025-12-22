import React, { useState, useEffect } from 'react';

// Simple helper for image requiring
const getIconUrl = (id) => {
    try {
        return require(`./images/student/icon/${id}.webp`);
    } catch (err) {
        return null;
    }
};

const StudentSelector = ({ allStudents, activeTeam, onAdd, filterRole, disabled }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
      setSearchTerm("");
  }, [filterRole]);

  const filteredStudents = allStudents.filter(student => {
    const isInTeam = activeTeam.find(m => m.id === student.id);
    const matchesSearch = searchTerm === "" || student.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Role Filter
    const matchesRole = filterRole ? student.role === filterRole : true;

    return !isInTeam && matchesSearch && matchesRole;
  });

  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
      <input
        id="student-search-input"
        type="text"
        placeholder={disabled ? "Select a slot first..." : (filterRole ? `Search ${filterRole}...` : "Search...")}
        value={searchTerm}
        disabled={disabled}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)} 
        style={{
          width: '100%', padding: '8px', 
          background: disabled ? '#222' : '#333', 
          border: '1px solid #555', 
          color: disabled ? '#555' : 'white', 
          borderRadius: '4px',
          boxSizing: 'border-box',
          cursor: disabled ? 'not-allowed' : 'text'
        }}
      />
      
      {isOpen && !disabled && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#222', border: '1px solid #444', 
          zIndex: 100, maxHeight: '200px', overflowY: 'auto',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        }}>
          {filteredStudents.length === 0 ? (
            <div style={{ padding: '10px', color: '#777', fontSize: '0.9em' }}>
              {searchTerm ? "No match found" : (filterRole ? `All ${filterRole}s available` : "All students added")}
            </div>
          ) : (
            filteredStudents.map(s => (
              <div
                key={s.id}
                onMouseDown={() => {
                  onAdd(s);
                  setSearchTerm("");
                  setIsOpen(false);
                }}
                style={{
                  padding: '8px', cursor: 'pointer', borderBottom: '1px solid #333',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#222'}
              >
                <div style={{width:'30px', height:'30px', background:'#000', borderRadius:'50%', overflow:'hidden'}}>
                    <img src={getIconUrl(s.id)} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                </div>
                <div style={{flex:1}}>
                    <div style={{fontWeight:'bold', fontSize:'0.9em'}}>{s.name}</div>
                    <div style={{ fontSize: '0.75em', color: s.role === 'Striker' ? '#ef5350' : '#42a5f5' }}>
                      {s.role}
                    </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default StudentSelector;