import React, { useState } from 'react';
import { KNXGroupAddressModal } from './KNXGroupAddressModal';
import { Search, Plus, Upload } from 'lucide-react';

interface Props {
  onAddFunction: (func: { name: string; type: string; ga: string }) => void;
}

export function AddFunction({ onAddFunction }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [xmlData, setXmlData] = useState<any[]>([]);
  
  const handleOpenModal = () => {
    setIsModalOpen(true);
  };
  
  const handleSelectGA = (ga: any) => {
    onAddFunction({ name: ga.name, type: 'light', ga: ga.address });
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Add Function Button - now clearly shows it's for selecting from XML */}
      <button
        onClick={handleOpenModal}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        <Search className="w-5 h-5" />
        <span>Add Function from ETS</span>
      </button>
      
      {/* Modal with XML upload capability */}
      <KNXGroupAddressModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleSelectGA}
        xmlData={xmlData}
        title="Select Group Address from ETS Export"
      />
    </div>
  );
}