

import React from 'react';
import { HistoryItem, ImageHistoryItem, VideoHistoryItem, VoiceAge } from '../types';
import { HistoryIcon, XIcon, SparkleIcon, ImageIcon, DocumentTextIcon, MapPinIcon, PencilSquareIcon, VideoIcon, SpeakerWaveIcon, FireIcon } from './icons';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onRestore: (item: HistoryItem) => void;
}

const ImageHistoryCard: React.FC<{ item: ImageHistoryItem; onRestore: (item: HistoryItem) => void }> = ({ item, onRestore }) => (
  <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4 transition-all hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10">
    <div className="flex justify-between items-start">
      <div className="flex flex-col">
        <span className="font-semibold text-cyan-400 text-lg">Tạo Ảnh</span> 
        <span className="text-xs text-gray-400">{new Date(item.timestamp).toLocaleString()}</span>
      </div>
      <button 
        onClick={() => onRestore(item)}
        className="group flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 rounded-md transition-colors text-white shadow-md transform hover:scale-105"
      >
        <SparkleIcon className="h-4 w-4 animate-icon-shiver-on-hover transition-transform" />
        Khôi phục
      </button>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
            <h4 className="font-semibold mb-2 text-slate-300 flex items-center gap-2"><ImageIcon /> Ảnh đầu vào</h4>
            <div className="flex gap-2 items-start bg-slate-900/50 p-2 rounded-md border border-slate-700">
                <div className="text-center shrink-0">
                  <img src={item.characterImagePreview} alt="Base" className="w-20 h-20 object-cover rounded-md" />
                  <span className="text-xs text-gray-400 mt-1 block">{item.generationMode === 'shoe_rack' ? 'Kệ Giày' : 'Nhân vật'}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(item.generationMode === 'hold' || item.generationMode === 'appliances' || item.generationMode === 'shoe_rack') && item.cosmeticImagePreview && (
                        <div className="text-center">
                          <img src={item.cosmeticImagePreview} alt="Product" className="w-20 h-20 object-cover rounded-md" />
                          <span className="text-xs text-gray-400 mt-1 block">{item.generationMode === 'hold' ? 'Sản phẩm' : item.generationMode === 'appliances' ? 'Đồ gia dụng' : 'Giày/Dép'}</span>
                        </div>
                    )}
                    {item.generationMode === 'outfit' && item.productImagePreviews?.map((src, i) => (
                        <div key={i} className="text-center">
                            <img src={src} alt={`Product ${i+1}`} className="w-20 h-20 object-cover rounded-md" />
                            <span className="text-xs text-gray-400 mt-1 block">Sản phẩm {i+1}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
         <div>
            <h4 className="font-semibold mb-2 text-slate-300 flex items-center gap-2"><SparkleIcon /> Kết quả</h4>
            <div className="grid grid-cols-2 gap-2 bg-slate-900/50 p-2 rounded-md border border-slate-700">
                {item.generatedImages.map((src, i) => (
                    <img key={i} src={src} alt={`Generated ${i+1}`} className="w-full object-contain rounded-md" />
                ))}
            </div>
        </div>
    </div>
    
    <details className="bg-slate-900/50 p-3 rounded-md text-sm transition-all">
      <summary className="cursor-pointer font-medium text-gray-300 hover:text-white">Xem chi tiết cài đặt</summary>
      <div className="mt-3 space-y-3 border-t border-slate-700 pt-3">
        <p className="flex items-start gap-2"><MapPinIcon /> <strong className="text-gray-400 shrink-0">Địa điểm:</strong> <span>{item.location}</span></p>
        <p className="flex items-start gap-2"><PencilSquareIcon/> <strong className="text-gray-400 shrink-0">Yêu cầu thêm:</strong> <span>{item.customImagePrompt || 'Không có'}</span></p>
        <div className="space-y-2">
            <p className="flex items-start gap-2"><DocumentTextIcon /> <strong className="text-gray-400">Prompt Tiêu Chuẩn:</strong></p>
            <pre className="bg-slate-950 p-2 rounded-md overflow-x-auto text-left text-xs whitespace-pre-wrap font-mono">
              <code>{item.prompt}</code>
            </pre>
        </div>
      </div>
    </details>
  </div>
);

const ageMap: Record<VoiceAge, string> = {
  'youth': 'Thanh niên',
  'middle-aged': 'Trung niên',
  'elderly': 'Lớn tuổi'
};

const speedMap: Record<number, string> = {
  1.0: 'Chậm',
  1.2: 'Vừa',
  1.25: 'Vừa',
  1.5: 'Nhanh'
};


const VideoHistoryCard: React.FC<{ item: VideoHistoryItem; onRestore: (item: HistoryItem) => void }> = ({ item, onRestore }) => (
  <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4 transition-all hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10">
     <div className="flex justify-between items-start">
      <div className="flex flex-col">
        <span className="font-semibold text-purple-400 text-lg">Tạo Video</span> 
        <span className="text-xs text-gray-400">{new Date(item.timestamp).toLocaleString()}</span>
      </div>
      <button 
        onClick={() => onRestore(item)}
        className="group flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-500 rounded-md transition-colors text-white shadow-md transform hover:scale-105"
      >
        <VideoIcon className="h-4 w-4 animate-icon-shiver-on-hover transition-transform" />
        Khôi phục
      </button>
    </div>
    
    <div>
        <h4 className="font-semibold mb-2 text-slate-300 flex items-center gap-2"><ImageIcon /> Ảnh nguồn</h4>
        <div className="bg-slate-900/50 p-2 rounded-md border border-slate-700 inline-block">
            <img src={item.sourceImageForVideo} alt="Video source" className="w-32 h-auto object-contain rounded-md" />
        </div>
    </div>

    <details className="bg-slate-900/50 p-3 rounded-md text-sm">
      <summary className="cursor-pointer font-medium text-gray-300 hover:text-white">Xem chi tiết prompt và cài đặt</summary>
      <div className="mt-3 space-y-3 border-t border-slate-700 pt-3">
        <p className="flex items-start gap-2"><PencilSquareIcon /> <strong className="text-gray-400 shrink-0">Ý tưởng thêm:</strong> {item.customVideoIdea || 'Không có'}</p>
        <div className="space-y-2">
            <strong className="text-gray-300 flex items-center gap-2"><SpeakerWaveIcon /> Giọng đọc:</strong>
            <div className="text-xs text-gray-400 mb-2">
                <span className="font-semibold text-sky-400">{item.selectedGender === 'female' ? 'Nữ' : 'Nam'}</span>
                {item.selectedAge && ` - ${ageMap[item.selectedAge]}`}
                {item.selectedSpeed && ` | Tốc độ: ${speedMap[item.selectedSpeed] || 'Vừa'}`}
            </div>
        </div>
        
        <div className="space-y-2">
            <p className="flex items-start gap-2"><DocumentTextIcon /> <strong className="text-gray-400">JSON Prompt Phần 1:</strong></p>
            <pre className="bg-slate-950 p-2 rounded-md overflow-x-auto text-left text-xs whitespace-pre-wrap font-mono">
              <code>{JSON.stringify(item.videoPrompt?.part1, null, 2)}</code>
            </pre>
        </div>
         <div className="space-y-2">
            <p className="flex items-start gap-2"><DocumentTextIcon /> <strong className="text-gray-400">JSON Prompt Phần 2:</strong></p>
            <pre className="bg-slate-950 p-2 rounded-md overflow-x-auto text-left text-xs whitespace-pre-wrap font-mono">
              <code>{JSON.stringify(item.videoPrompt?.part2, null, 2)}</code>
            </pre>
        </div>
      </div>
    </details>
  </div>
);


const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, history, onRestore }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="frost-glass w-full max-w-4xl h-[90vh] flex flex-col rounded-xl shadow-2xl shadow-cyan-500/10"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <FireIcon className="text-orange-400" />
            <h2 className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">Lịch sử Tạo</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
            <XIcon />
          </button>
        </header>
        
        <div className="p-6 space-y-6 overflow-y-auto">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 py-10">
              <HistoryIcon />
              <p className="mt-4 text-lg">Chưa có mục nào trong lịch sử.</p>
              <p className="text-sm">Hãy bắt đầu tạo ảnh hoặc video!</p>
            </div>
          ) : (
             history.map(item => (
                item.type === 'image' 
                    ? <ImageHistoryCard key={item.id} item={item} onRestore={onRestore} />
                    : <VideoHistoryCard key={item.id} item={item} onRestore={onRestore} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;