import React, { useState } from 'react';
import { Layers, Wand2, Settings2, AlertCircle, Cpu, Maximize2, Type } from 'lucide-react';
import { UploadedImage, GeneratedBanner } from './types';
import { ImageUploader } from './components/ImageUploader';
import { ResultViewer } from './components/ResultViewer';
import { generateBannerWithGemini } from './services/geminiService';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// Helper function moved outside component to avoid TSX generic syntax issues
function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function App() {
  const [refImages, setRefImages] = useState<UploadedImage[]>([]);
  const [prodImages, setProdImages] = useState<UploadedImage[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [brandContent, setBrandContent] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3-pro-image-preview");
  const [imageSize, setImageSize] = useState<string>("1K");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [results, setResults] = useState<GeneratedBanner[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const processFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleUpload = async (files: FileList, type: 'ref' | 'prod') => {
    const newImages: UploadedImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await processFile(file);
        newImages.push({
          id: Math.random().toString(36).substring(7),
          url: URL.createObjectURL(file),
          file,
          base64,
          mimeType: file.type
        });
      } catch (err) {
        console.error("File processing error", err);
      }
    }

    if (type === 'ref') {
      setRefImages(prev => [...prev, ...newImages]);
    } else {
      setProdImages(prev => [...prev, ...newImages]);
    }
  };

  const handleRemove = (id: string, type: 'ref' | 'prod') => {
    if (type === 'ref') {
      setRefImages(prev => prev.filter(img => img.id !== id));
    } else {
      setProdImages(prev => prev.filter(img => img.id !== id));
    }
  };

  const handleGenerate = async () => {
    if (refImages.length === 0 || prodImages.length === 0) {
      setErrorMsg("Please upload at least one Reference image and one Product image.");
      return;
    }

    // Check for API Key
    try {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
        // After opening, we proceed. The platform handles the key injection.
      }
    } catch (e) {
      console.error("API Key selection error", e);
    }

    setErrorMsg(null);
    setIsGenerating(true);

    // Initialize placeholders for 5 outputs
    const placeholders: GeneratedBanner[] = Array.from({ length: 5 }).map(() => ({
      id: Math.random().toString(36).substring(7),
      imageUrl: '',
      promptUsed: '',
      status: 'loading',
      timestamp: Date.now()
    }));
    
    // Clear previous results
    setResults(placeholders);

    // Launch 5 parallel requests
    const promises = placeholders.map(async (placeholder) => {
      try {
        // Randomly pair a ref and a prod image for variety if multiple exist
        const selectedRef = getRandomItem(refImages) as UploadedImage;
        const selectedProd = getRandomItem(prodImages) as UploadedImage;

        // Add a slight randomization to prompt to encourage variety
        const varietyPrompts = [
            "Focus on clean lines and minimalism.",
            "Use bold, high-contrast aesthetics.",
            "Create a soft, elegant atmosphere.",
            "Make it dynamic and energetic.",
            "Ensure a balanced, professional composition."
        ];
        const randomNuance = getRandomItem(varietyPrompts);
        
        const combinedPrompt = `${userPrompt}. ${randomNuance}`;

        const startTime = Date.now();
        const generatedBase64 = await generateBannerWithGemini(
          selectedRef,
          selectedProd,
          combinedPrompt,
          brandContent,
          aspectRatio,
          selectedModel,
          imageSize
        );
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        setResults(prev => prev.map(p => 
          p.id === placeholder.id 
            ? { ...p, imageUrl: generatedBase64, status: 'success', promptUsed: combinedPrompt, duration, refImage: selectedRef, prodImage: selectedProd } 
            : p
        ));
      } catch (err: any) {
        console.error("Generation failed for one item", err);
        
        // If it's a key error, prompt again
        if (err.message?.includes("Requested entity was not found") || err.message?.includes("API Key is missing")) {
            setErrorMsg("API Key error. Please re-select your API key.");
            await window.aistudio.openSelectKey();
        }

        setResults(prev => prev.map(p => 
          p.id === placeholder.id 
            ? { ...p, status: 'error' } 
            : p
        ));
      }
    });

    await Promise.all(promises);
    setIsGenerating(false);
  };

  const handleRegenerate = async (id: string, adjustmentPrompt: string) => {
    const target = results.find(r => r.id === id);
    if (!target || !target.refImage || !target.prodImage) {
       setErrorMsg("Cannot regenerate: missing reference or product image.");
       return;
    }

    // Set status to loading
    setResults(prev => prev.map(p => p.id === id ? { ...p, status: 'loading' } : p));

    try {
      const combinedPrompt = `${target.promptUsed}. Adjustment: ${adjustmentPrompt}`;
      const startTime = Date.now();
      const generatedBase64 = await generateBannerWithGemini(
        target.refImage,
        target.prodImage,
        combinedPrompt,
        brandContent,
        aspectRatio,
        selectedModel,
        imageSize
      );
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      setResults(prev => prev.map(p =>
        p.id === id
          ? { ...p, imageUrl: generatedBase64, status: 'success', promptUsed: combinedPrompt, duration }
          : p
      ));
    } catch (err: any) {
      console.error("Regeneration failed", err);
      if (err.message?.includes("Requested entity was not found") || err.message?.includes("API Key is missing")) {
          setErrorMsg("API Key error. Please re-select your API key.");
          await window.aistudio.openSelectKey();
      }
      setResults(prev => prev.map(p => p.id === id ? { ...p, status: 'error' } : p));
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-950 text-slate-200 font-sans">
      
      {/* Sidebar Controls */}
      <div className="w-80 sm:w-96 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Layers size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">BannerClone</h1>
            <p className="text-xs text-indigo-400 font-mono">Nano Banana Pro</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Inputs */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Assets</h2>
            <ImageUploader 
              title="Style Reference(s)" 
              images={refImages} 
              onUpload={(f) => handleUpload(f, 'ref')} 
              onRemove={(id) => handleRemove(id, 'ref')} 
            />
            <ImageUploader 
              title="Product Image(s)" 
              images={prodImages} 
              onUpload={(f) => handleUpload(f, 'prod')} 
              onRemove={(id) => handleRemove(id, 'prod')} 
            />
          </div>

          <div className="h-px bg-gray-800" />

          {/* Configuration */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
               <Settings2 size={14} /> Configuration
            </h2>

            {/* Model Selection */}
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 block flex items-center gap-1.5">
                <Cpu size={14} /> Model
              </label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' },
                  { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' }
                ].map(model => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`text-xs py-2 px-3 rounded-md border text-left transition-all ${
                      selectedModel === model.id 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Selection */}
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 block flex items-center gap-1.5">
                <Maximize2 size={14} /> Quality
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['1K', '2K', '4K'].map(size => (
                  <button
                    key={size}
                    onClick={() => setImageSize(size)}
                    className={`text-xs py-2 rounded-md border transition-all ${
                      imageSize === size 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 block">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {['1:1', '9:16', '16:9'].map(ratio => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`text-xs py-2 rounded-md border transition-all ${
                      aspectRatio === ratio 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1 block flex items-center gap-1.5">
                <Type size={14} /> Brand Content
              </label>
              <textarea
                value={brandContent}
                onChange={(e) => setBrandContent(e.target.value)}
                placeholder="e.g. 'Summer Sale 50% Off', Brand Name..."
                className="w-full bg-gray-950 border border-gray-800 rounded-md p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors h-20 resize-none"
              />
            </div>

            <div className="mb-2">
              <label className="text-sm text-gray-400 mb-1 block">Prompt Adjustments (Optional)</label>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="e.g. Make the background darker..."
                className="w-full bg-gray-950 border border-gray-800 rounded-md p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors h-20 resize-none"
              />
            </div>
          </div>
          
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 flex items-start gap-2">
               <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
               <p className="text-xs text-red-200">{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-900 border-t border-gray-800">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all transform ${
              isGenerating 
              ? 'bg-gray-700 cursor-not-allowed opacity-50' 
              : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:scale-[1.02] active:scale-95'
            }`}
          >
            {isGenerating ? (
              <>
                 <Wand2 className="animate-spin" size={20} /> Generating 5 Variants...
              </>
            ) : (
              <>
                 <Wand2 size={20} /> Generate Patterns
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full bg-gray-950 relative overflow-hidden">
         <header className="h-16 flex items-center justify-between px-6 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm z-10">
            <h2 className="font-medium text-gray-300">Generated Workspace</h2>
            <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span>Ready</span>
                <span>Model: {selectedModel}</span>
                <span>Quality: {imageSize}</span>
            </div>
         </header>

         <main className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-gray-950 to-gray-950 pointer-events-none" />
            <ResultViewer results={results} onRegenerate={handleRegenerate} />
         </main>
      </div>
    </div>
  );
}
