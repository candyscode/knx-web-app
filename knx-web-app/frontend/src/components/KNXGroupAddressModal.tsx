/**
 * KNX Group Address Modal Component
 * 
 * Shows searchable, filterable list of GroupAddresses from XML export
 * Supports XML file upload for importing ETS exports
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Search, X, Upload, FileText, Trash2 } from 'lucide-react';
import { parseKNXGroupAddressXML, convertToInternalFormat, GroupAddress as ParsedGroupAddress } from '../knx-xml-parser';

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
  xmlData?: GroupAddress[];
  title?: string;
}

export function KNXGroupAddressModal({
  isOpen,
  onClose,
  onSelect,
  xmlData: initialXmlData = [],
  title = 'Group Addresses'
}: KNXGroupAddressModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [uploadedData, setUploadedData] = useState<GroupAddress[]>(initialXmlData);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleClearUpload = () => {
    setUploadedData([]);
    setUploadSuccess(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
    }
  };
  
  // Use uploaded data or initial data
  const xmlData = uploadedData.length > 0 ? uploadedData : initialXmlData;
  
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
  
  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setUploadError(null);
    setUploadSuccess(null);
    
    // Validate file type
    if (!file.name.endsWith('.xml') && file.type !== 'text/xml' && file.type !== 'application/xml') {
      setUploadError('Please upload a valid XML file (.xml)');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) {
          setUploadError('Failed to read file content');
          return;
        }
        
        // Parse the XML using the existing parser
        const parsed = parseKNXGroupAddressXML(content);
        
        // Flatten addresses from all ranges
        const allAddresses: GroupAddress[] = [];
        parsed.ranges.forEach(range => {
          range.addresses.forEach(addr => {
            allAddresses.push(convertToInternalFormat(addr));
          });
        });
        
        if (allAddresses.length === 0) {
          setUploadError('No GroupAddresses found in the XML file. Please check the file format.');
          return;
        }
        
        setUploadedData(allAddresses);
        setUploadSuccess(`Successfully imported ${allAddresses.length} addresses from ${file.name}`);
        
        // Reset room filter to see all imported data
        setSelectedRoom('all');
      } catch (error) {
        setUploadError(`XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    
    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
    };
    
    reader.readAsText(file);
  }, []);
  
  // Trigger file input click
  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  // Clear uploaded data
  const clearUpload = useCallback(() => {
    setUploadedData([]);
    setUploadError(null);
    setUploadSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            {xmlData.length > 0 && (
              <button
                onClick={clearUpload}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Clear imported addresses"
              >
                <Trash2 className="w-4 h-4" />
                <span>Forget Addresses</span>
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* XML Upload Section */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Import ETS XML Export</span>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            onChange={handleFileUpload}
            className="hidden"
          />
          
          <div className="flex items-center gap-2">
            <button
              onClick={triggerFileInput}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload XML File
            </button>
            
            {uploadedData.length > 0 && initialXmlData.length === 0 && (
              <button
                onClick={handleClearUpload}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Forget Addresses
              </button>
            )}
          </div>
          
          {uploadError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
              ⚠️ {uploadError}
            </div>
          )}
          
          {uploadSuccess && (
            <div className="mt-2 text-sm text-green-600 bg-green-50 p-2 rounded">
              ✅ {uploadSuccess}
            </div>
          )}
          
          {uploadedData.length === 0 && initialXmlData.length === 0 && !uploadError && !uploadSuccess && (
            <p className="mt-2 text-xs text-gray-500">
              Upload an ETS GroupAddress XML export file to import your KNX addresses
            </p>
          )}
        </div>
        
        {/* Room Filter */}
        <div className="p-4 border-b">
          <select 
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="w-full p-2 border rounded"
            disabled={xmlData.length === 0}
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
              placeholder="Search addresses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={xmlData.length === 0}
              className="w-full pl-10 p-2 border rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
        </div>
        
        {/* Address List */}
        <div className="flex-1 overflow-y-auto p-4">
          {xmlData.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No addresses loaded</p>
              <p className="text-sm mt-1">Upload an XML file to see your KNX GroupAddresses</p>
            </div>
          ) : filteredAddresses.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>No addresses found matching your filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAddresses.map((ga) => (
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
          {xmlData.length > 0 ? (
            <span>ℹ️ Showing {filteredAddresses.length} of {xmlData.length} addresses</span>
          ) : (
            <span>ℹ️ Import an XML file to get started</span>
          )}
        </div>
      </div>
    </div>
  );
}