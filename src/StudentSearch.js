import React, { useState } from 'react';

const StudentSearch = ({ students, onSelectStudent }) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Logic: If query is empty, return ALL students. Otherwise filter by name.
  const filteredStudents = students.filter((student) => {
    if (!query) return true; 
    return student.name.toLowerCase().includes(query.toLowerCase());
  });

  const handleSelect = (student) => {
    setQuery(student.name);
    onSelectStudent(student); // Pass data back to parent
    setIsFocused(false);
  };

  return (
    <div className="relative w-64">
      <label className="block text-sm font-bold mb-1 text-gray-700">Find Student</label>
      
      <div className="relative">
        <input
          type="text"
          className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          placeholder="Select a student..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          // Delay blur to allow click event to register on the list item
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        />
        
        {/* Clear Button */}
        {query && (
          <button 
            onClick={() => { setQuery(''); onSelectStudent(null); }}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-red-500"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {isFocused && filteredStudents.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-xl max-h-60 overflow-y-auto">
          {filteredStudents.map((student) => (
            <li
              key={student.id}
              className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 border-b border-gray-100 last:border-0"
              onMouseDown={() => handleSelect(student)}
            >
              {student.name} <span className="text-gray-400 text-xs ml-2">ID: {student.id}</span>
            </li>
          ))}
        </ul>
      )}
      
      {isFocused && filteredStudents.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 p-2 text-sm text-gray-500 shadow-xl">
          No students found.
        </div>
      )}
    </div>
  );
};

export default StudentSearch;