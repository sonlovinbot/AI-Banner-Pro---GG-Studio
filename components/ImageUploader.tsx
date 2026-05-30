import React, { useEffect, useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, FolderOpen, Trash2, Plus } from 'lucide-react';
import { LibraryImage, UploadedImage } from '../types';

interface ImageUploaderProps {
  title: string;
  images: UploadedImage[];
  onUpload: (files: FileList) => void;
  onRemove: (id: string) => void;
  library?: LibraryImage[];
  onLibrarySelect?: (item: LibraryImage) => void;
  onLibraryDelete?: (id: string) => void;
  accept?: string;
  multiple?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  title,
  images,
  onUpload,
  onRemove,
  library,
  onLibrarySelect,
  onLibraryDelete,
  accept = "image/*",
  multiple = true
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const libraryEnabled = !!library && !!onLibrarySelect && !!onLibraryDelete;

  useEffect(() => {
    if (!showLibrary) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowLibrary(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showLibrary]);

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

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 text-xs py-2 px-3 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          title="Upload one or more images"
        >
          <Upload size={14} /> Tải lên
        </button>
        {libraryEnabled ? (
          <button
            onClick={() => setShowLibrary(true)}
            className="flex items-center justify-center gap-1.5 text-xs py-2 px-3 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors"
            title="Open saved library"
          >
            <FolderOpen size={14} /> Thư viện
            {library!.length > 0 && (
              <span className="ml-0.5 bg-indigo-500/30 text-indigo-200 rounded-full px-1.5 py-px text-[10px] font-mono">
                {library!.length}
              </span>
            )}
          </button>
        ) : (
          <span />
        )}
      </div>

      <div
        className="border-2 border-dashed border-gray-700 bg-gray-900/50 rounded-lg p-3 transition-colors hover:border-indigo-500/50 hover:bg-gray-800/50"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {images.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
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
              title="Add more"
            >
              <Plus size={20} />
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-500 text-xs py-3 pointer-events-none">
            Kéo &amp; thả nhiều ảnh vào đây<br />hoặc bấm "Tải lên" / "Thư viện"
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) onUpload(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
      </div>

      {showLibrary && libraryEnabled && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
          onClick={() => setShowLibrary(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/10 text-indigo-400 p-2 rounded-md"><FolderOpen size={18} /></div>
                <div>
                  <h3 className="text-base font-semibold text-white">Thư viện — {title}</h3>
                  <p className="text-xs text-gray-500">Bấm vào ảnh để dùng lại · {library!.length}/10</p>
                </div>
              </div>
              <button
                onClick={() => setShowLibrary(false)}
                className="p-2 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white"
                aria-label="Close library"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {library!.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-16">
                  Chưa có ảnh nào trong thư viện.
                  <br />
                  <span className="text-xs">Tải ảnh lên — chúng sẽ được lưu tự động (tối đa 10 ảnh).</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                  {library!.map(item => (
                    <div
                      key={item.id}
                      className="relative group aspect-square rounded-lg overflow-hidden bg-gray-950 border border-gray-800 hover:border-indigo-500 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onLibrarySelect!(item);
                          setShowLibrary(false);
                        }}
                        className="w-full h-full"
                        title="Use this image"
                      >
                        <img src={item.base64} alt="library" className="w-full h-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLibraryDelete!(item.id);
                        }}
                        className="absolute top-2 right-2 bg-black/70 hover:bg-red-500/90 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove from library"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
