import React, { useState } from 'react';

const StudentSelector = ({ allStudents, activeTeam, onAdd }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredStudents = allStudents.filter(student => {
    const isInTeam = activeTeam.find(m => m.id === student.id);
    const matchesSearch = searchTerm === "" || student.name.toLowerCase().includes(searchTerm.toLowerCase());
    return !isInTeam && matchesSearch;
  });

  return (
    // CHANGED: width '300px' -> '100%' to fit parent container
    <div style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
      <input
        type="text"
        placeholder="Search or click to list..."
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)} 
        style={{
          width: '100%', padding: '8px', background: '#333', 
          border: '1px solid #555', color: 'white', borderRadius: '4px',
          boxSizing: 'border-box' // Ensure padding doesn't overflow width
        }}
      />
      
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#222', border: '1px solid #444', 
          zIndex: 100, maxHeight: '200px', overflowY: 'auto',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        }}>
          {filteredStudents.length === 0 ? (
            <div style={{ padding: '10px', color: '#777', fontSize: '0.9em' }}>
              {searchTerm ? "No match found" : "All students added"}
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
                  display: 'flex', justifyContent: 'space-between'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#222'}
              >
                <span>{s.name}</span>
                <span style={{ fontSize: '0.8em', color: s.role === 'Striker' ? '#ef5350' : '#42a5f5' }}>
                  {s.role}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default StudentSelector;