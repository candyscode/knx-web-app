import React, { useState } from 'react';
import { KNXGroupAddressModal } from './KNXGroupAddressModal';
import { Search, Plus, Settings2 } from 'lucide-react';

interface Props {
  onAddFunction: (func: { name: string; type: string; ga: string }) => void;
}

export function AddFunction({ onAddFunction }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [xmlData, setXmlData] = useState<any[]>([]);
  
  // Load XML data when modal opens
  const handleOpenModal = async () => {
    setIsModalOpen(true);
    // Parse XML files and set data
    const parser = new DOMParser();
    const allAddresses: any[] = [];
    
    // Simulated XML parsing - in real implementation, fetch actual XML files
    const sampleData = [
      { address: '3/0/5', name: 'Bad OG: Spots Schalten', dpt: 'DPST-1-1', room: 'Bad OG' },
      { address: '3/0/6', name: 'Schlafzimmer: Licht Schalten', dpt: 'DPST-1-1', room: 'Schlafzimmer' },
      { address: '3/0/7', name: 'Gästezimmer: Licht Schalten', dpt: 'DPST-1-1', room: 'Gästezimmer' },
      { address: '3/1/0', name: 'Bad OG: Sollwertverschiebung', dpt: 'DPST-9-2', room: 'Bad OG' },
      { address: '3/1/1', name: 'Büro: Sollwertverschiebung', dpt: 'DPST-9-2', room: 'Büro' },
      { address: '3/2/0', name: 'Büro: Raffstore Position (%)', dpt: 'DPST-5-1', room: 'Büro' },
      { address: '1/0/0', name: 'Zentral Schalten', dpt: 'DPST-1-1', room: 'Zentral' },
    ];
    setXmlData(sampleData);
  };
  
  const handleSelectGA = (ga: any) => {
    onAddFunction({ name: ga.name, type: 'light', ga: ga.address });
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Add Function Button with magnifying glass */}
      <button
        onClick={handleOpenModal}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        <Search className="w-5 h-5" />
        <span>Add Function</span>
      </button>
      
      {/* Modal */}
      <KNXGroupAddressModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleSelectGA}
        xmlData={xmlData}
        title="Select Group Address"
      />
    </div>
  );
}