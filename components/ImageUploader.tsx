import React, { useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { UploadedImage } from '../types';

interface ImageUploaderProps {
  title: string;
  images: UploadedImage[];
  onUpload: (files: FileList) => void;
  onRemove: (id: string) => void;
  accept?: string;
  multiple?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  title, 
  images, 
  onUpload, 
  onRemove,
  accept = "image/*",
  multiple = true
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <ImageIcon size={16} />
          {title}
        </label>
        <span className="text-xs text-gray-500">{images.length} uploaded</span>
      </div>

      <div 
        className="border-2 border-dashed border-gray-700 bg-gray-900/50 rounded-lg p-4 transition-colors hover:border-indigo-500/50 hover:bg-gray-800/50"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="grid grid-cols-4 gap-2 mb-2">
            {images.map((img) => (
            <div key={img.id} className="relative group aspect-square rounded-md overflow-hidden bg-gray-950 border border-gray-800">
                <img src={img.url} alt="upload" className="w-full h-full object-cover" />
                <button 
                onClick={() => onRemove(img.id)}
                className="absolute top-1 right-1 bg-black/70 hover:bg-red-500/90 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                <X size={12} />
                </button>
            </div>
            ))}
            
            <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center aspect-square rounded-md bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700 text-gray-400 hover:text-white"
            >
            <Upload size={20} />
            <span className="text-[10px] mt-1">Add</span>
            </button>
        </div>
        
        {images.length === 0 && (
            <div className="text-center text-gray-500 text-xs py-2 pointer-events-none">
                Drag & drop or click add
            </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            if (e.target.files) onUpload(e.target.files);
            // reset value to allow re-uploading same file if needed
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
      </div>
    </div>
  );
};
