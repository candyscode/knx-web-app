/**
 * KNX Group Address Modal Component
 * 
 * Shows searchable, filterable list of GroupAddresses from XML export
 */

import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

interface GroupAddress {
  address: string;
  name: string;
  dpt: string;
  room: string;
}

interface KNXGroupAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (address: GroupAddress) => void;
  xmlData: GroupAddress[];
  title?: string;
}

export function KNXGroupAddressModal({
  isOpen,
  onClose,
  onSelect,
  xmlData,
  title = 'Group Addresses'
}: KNXGroupAddressModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('all');
  
  // Extract unique rooms from addresses
  const rooms = useMemo(() => {
    const roomSet = new Set(xmlData.map(ga => ga.room).filter(Boolean));
    return ['all', ...Array.from(roomSet).sort()];
  }, [xmlData]);
  
  // Filter addresses based on room and search
  const filteredAddresses = useMemo(() => {
    return xmlData.filter(ga => {
      const matchesRoom = selectedRoom === 'all' || ga.room === selectedRoom;
      const matchesSearch = !searchQuery || ga.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRoom && matchesSearch;
    });
  }, [xmlData, selectedRoom, searchQuery]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Room Filter */}
        <div className="p-4 border-b">
          <select 
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="w-full p-2 border rounded"
          >
            {rooms.map(room => (
              <option key={room} value={room}>
                {room === 'all' ? 'All Rooms' : room}
              </option>
            ))}
          </select>
        </div>
        
        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 p-2 border rounded"
            />
          </div>
        </div>
        
        {/* Address List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredAddresses.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No addresses found</div>
          ) : (
            <div className="space-y-2">
              {filteredAddresses.map((ga, index) => (
                <button
                  key={ga.address}
                  onClick={() => onSelect(ga)}
                  className="w-full text-left p-3 border rounded hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium">{ga.name}</div>
                  <div className="text-sm text-gray-600">{ga.address}</div>
                  <div className="text-xs text-gray-500">{ga.dpt}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Info Label */}
        <div className="p-4 border-t bg-gray-50 text-sm text-gray-600">
          ℹ️ Filtered list showing {filteredAddresses.length} of {xmlData.length} addresses
        </div>
      </div>
    </div>
  );
}