import React, { useCallback, useState, useEffect } from 'react';
import { UploadIcon } from './icons';

// --- Logic cấp module để xử lý một mục tiêu dán duy nhất ---
let activePasteHandler: ((file: File) => void) | null = null;

// Listener này chỉ được đính kèm một lần khi module được tải.
// Nó kiểm tra xem có ImageUploader nào đang được di chuột qua để nhận ảnh dán không.
if (typeof window !== 'undefined') {
  window.addEventListener('paste', (event: ClipboardEvent) => {
    if (!activePasteHandler) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          activePasteHandler(file);
          // Ngăn hành động dán mặc định của trình duyệt (ví dụ: hiển thị ảnh).
          event.preventDefault();
          // Chúng ta chỉ xử lý ảnh đầu tiên tìm thấy.
          return;
        }
      }
    }
  });
}
// --- Kết thúc logic cấp module ---


interface ImageUploaderProps {
  onFileChange: (file: File) => void;
  onFileClear?: () => void;
  preview: string | null;
  className?: string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ 
    onFileChange, 
    onFileClear, 
    preview, 
    className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isPasteTarget, setIsPasteTarget] = useState(false); // Dành cho việc tô sáng khi di chuột qua

  // This effect handles the case where a drag operation starts over this component
  // but ends somewhere else (e.g., outside the window), leaving the isDragging state stuck.
  useEffect(() => {
    const cleanup = () => setIsDragging(false);
    
    // This event fires when any drag operation that started in the window is finished,
    // regardless of where it's dropped. This is a robust cleanup mechanism.
    document.addEventListener('dragend', cleanup);
    
    // As a fallback for drags starting outside the window, we also clean up on drop.
    document.addEventListener('drop', cleanup);
    
    return () => {
      document.removeEventListener('dragend', cleanup);
      document.removeEventListener('drop', cleanup);
    };
  }, []);


  const handleFileChange = useCallback((files: FileList | null) => {
    if (files && files[0] && files[0].type.startsWith('image/')) {
      onFileChange(files[0]);
    }
  }, [onFileChange]);
  
  // Component này không còn cần hiệu ứng listener dán riêng nữa. Listener toàn cục sẽ xử lý việc đó.

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, [handleFileChange]);

  // Các handler để đặt/bỏ đặt component này làm mục tiêu dán hiện hoạt.
  const handleMouseEnter = useCallback(() => {
    activePasteHandler = onFileChange;
    setIsPasteTarget(true);
  }, [onFileChange]);

  const handleMouseLeave = useCallback(() => {
    // Kiểm tra xem handler hiện tại có còn là của component này không trước khi xóa.
    // Điều này tránh tình trạng race condition nếu chuột di chuyển rất nhanh giữa hai uploader.
    if (activePasteHandler === onFileChange) {
        activePasteHandler = null;
    }
    setIsPasteTarget(false);
  }, [onFileChange]);

  const baseClasses = 'relative flex flex-col items-center justify-center w-full border-2 border-dashed border-slate-700 rounded-lg cursor-pointer bg-slate-800/20 hover:border-cyan-500 hover:bg-slate-800/50 transition-all duration-300 overflow-hidden group';
  // for file drag from OS
  const draggingClasses = 'border-cyan-400 bg-slate-800/80 scale-105';
  // for paste highlight
  const pasteTargetClasses = 'border-green-500 bg-green-900/30 shadow-lg shadow-green-500/20';

  return (
    <label
      className={`${baseClasses} ${isDragging ? draggingClasses : ''} ${isPasteTarget ? pasteTargetClasses : ''} ${className}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {preview ? (
        <>
          <img src={preview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
           {onFileClear && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onFileClear();
              }}
              className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all opacity-0 group-hover:opacity-100"
              aria-label="Xóa ảnh"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
          )}
        </>
      ) : (
        <div className="text-center text-gray-400 p-4 flex flex-col items-center justify-center">
          <UploadIcon />
          <p className="mt-2 text-sm font-semibold">
            <span className="text-cyan-400">Nhấp để tải lên</span> hoặc kéo thả
          </p>
          <p className="text-xs text-slate-500">Dán từ clipboard (Ctrl+V)</p>
          {isPasteTarget && <p className="text-xs text-green-400 animate-pulse mt-1">Sẵn sàng để dán!</p>}
        </div>
      )}
      <input 
        type="file" 
        className="hidden" 
        accept="image/*"
        onChange={(e) => handleFileChange(e.target.files)}
        // Allow re-uploading the same file
        onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
      />
    </label>
  );
};

export default ImageUploader;