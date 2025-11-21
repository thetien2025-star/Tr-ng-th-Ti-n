import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ImageFile, VideoPromptResponse, DualVideoPromptResponse, HistoryItem, ImageHistoryItem, VideoHistoryItem, VoiceGender, VoiceAge } from './types';
import { OUTFIT_LOCATIONS, HOLD_LOCATIONS, OUTFIT_PROMPT, HOLD_PROMPT, APPLIANCE_LOCATIONS, APPLIANCE_PROMPT, SHOE_RACK_LOCATIONS, SHOE_RACK_PROMPT, SOS_LOCATIONS, SOS_PROMPT } from './constants';
import { generateImages, generateVideoPrompt, generateVideoWithVeo, generateAdScript, removeBackgroundImage, generateFashionPoses, separateObjects } from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import HistoryModal from './components/HistoryModal';
import { HistoryIcon, SparkleIcon, DownloadIcon, VideoIcon, CopyIcon, PlayIcon, StopIcon, RefreshIcon, ScissorsIcon, XIcon, ImageIcon, Cog8ToothIcon, UserIcon, ShoppingBagIcon, MapPinIcon, PencilSquareIcon, DocumentTextIcon, SpeakerWaveIcon, SnowflakeIcon, FireIcon, SnowmanIcon } from './components/icons';

type Tab = 'background_removal' | 'image' | 'video';
type GenerationMode = 'outfit' | 'hold' | 'appliances' | 'shoe_rack' | 'sos';
type BgRemovalMode = 'whole' | 'individual' | 'teacher_prompt';
type BgRemovalResultItem = { name: string; image: string };
type ImageSettingsTab = 'location' | 'pose' | 'custom';
type LoaderType = 'aurora' | 'snowfall' | 'thinking' | 'pulsingSnowflake' | 'iceCrystal' | 'steamingMug' | 'frozenWindow' | 'fireplace' | 'winterWind';
type VideoPart = 'part1' | 'part2';

const TEACHER_PROMPT = `{
  "prompt": "A confident, stylish person interacts naturally with a featured product in a modern, well-lit environment. The person showcases the product’s design, comfort, and key features through subtle gestures — holding, turning, or adjusting it with natural movement. The atmosphere feels authentic and inviting, emphasizing lifestyle rather than overt promotion. The camera follows with smooth pan and slight zooms to highlight important details such as the brand logo, texture, and craftsmanship. Background lighting is bright, balanced, and realistic, enhancing the overall aesthetic appeal.",
  "layout": "9:16",
  "style": "realistic lifestyle product advertisement",
  "motion": {
    "type": "pan and track",
    "speed": "medium",
    "zoom": "slight zoom-in",
    "angles": ["front", "side", "detail close-up"]
  },
  "environment": {
    "setting": "modern showroom or boutique space",
    "lighting": "bright, natural, balanced",
    "background": "clean, minimalist, softly blurred"
  },
  "actor": {
    "gender": "neutral",
    "age": "young adult",
    "appearance": "clean, confident, approachable",
    "expression": "friendly, natural smile"
  },
  "product": {
    "type": "customizable",
    "description": "Replace this text with your product — e.g., tracksuit, handbag, perfume, tech device, etc.",
    "focus": "highlight comfort, design, material, or function naturally through action"
  },
  "mood": "confident, elegant, inviting",
  "camera": {
    "movement": "smooth tracking",
    "focus_shots": ["product details", "model movement", "brand logo"]
  }
}`;


// Helper to compress image data URLs to save space in localStorage
const compressImageDataUrl = (dataUrl: string, maxWidth: number, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            let { width, height } = img;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxWidth) {
                    width = Math.round((width * maxWidth) / height);
                    height = maxWidth;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0, width, height);
            // Use JPEG for better compression of photographic images
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (error) => reject(error);
    });
};

// Helper to convert data URL to File object
const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type });
};

// --- Polar Bear Decoration Component ---
const PolarBearDecoration = () => (
  <div className="polar-bear-track">
    <div className="polar-bear">
      <div className="polar-bear-body">🐻‍❄️</div>
    </div>
  </div>
);

const App: React.FC = () => {
  // Common State
  const [activeTab, setActiveTab] = useState<Tab>('background_removal');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);


  // State for Background Remover
  const [bgRemovalMode, setBgRemovalMode] = useState<BgRemovalMode>('whole');
  const [bgRemovalImage, setBgRemovalImage] = useState<ImageFile>(null);
  const [bgRemovalResults, setBgRemovalResults] = useState<BgRemovalResultItem[]>([]);
  const [bgRemovalLoadingMessage, setBgRemovalLoadingMessage] = useState<string | null>(null);
  const [bgRemovalError, setBgRemovalError] = useState<string | null>(null);
  const [bgCopySuccess, setBgCopySuccess] = useState<string>('');

  // State for Image Generator
  const [generationMode, setGenerationMode] = useState<GenerationMode>('outfit');
  const [characterImage, setCharacterImage] = useState<ImageFile>(null);
  const [productImages, setProductImages] = useState<(ImageFile)[]>(Array(3).fill(null));
  const [cosmeticImage, setCosmeticImage] = useState<ImageFile>(null);
  const [shoeRackImage, setShoeRackImage] = useState<ImageFile>(null);
  const [shoeImage, setShoeImage] = useState<ImageFile>(null);
  const [location, setLocation] = useState<string>(OUTFIT_LOCATIONS[0].value);
  const [prompt, setPrompt] = useState<string>(OUTFIT_PROMPT);
  const [customImagePrompt, setCustomImagePrompt] = useState<string>('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [videoCreationLoading, setVideoCreationLoading] = useState<number | null>(null);
  const [generatedPoses, setGeneratedPoses] = useState<string[]>([]);
  const [isPoseLoading, setIsPoseLoading] = useState<boolean>(false);
  const [poseError, setPoseError] = useState<string | null>(null);
  const [selectedPose, setSelectedPose] = useState<string>('automatic');
  const [activeSettingsTab, setActiveSettingsTab] = useState<ImageSettingsTab>('location');
  const [showSnow, setShowSnow] = useState<boolean>(false);
  const [activeLoader, setActiveLoader] = useState<LoaderType>('aurora');


  // State for Video Prompt Generator
  const [sourceImageForVideo, setSourceImageForVideo] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState<DualVideoPromptResponse | null>(null);
  const [activeVideoPart, setActiveVideoPart] = useState<VideoPart>('part1');
  const [editablePromptJsonPart1, setEditablePromptJsonPart1] = useState<string>('');
  const [editablePromptJsonPart2, setEditablePromptJsonPart2] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [customVideoIdea, setCustomVideoIdea] = useState<string>('');
  const [isVideoPromptLoading, setIsVideoPromptLoading] = useState<boolean>(false);
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] = useState<boolean>(false);
  const [videoPromptError, setVideoPromptError] = useState<string | null>(null);
  
  // Video Generation State
  const [videoUrlPart1, setVideoUrlPart1] = useState<string | null>(null);
  const [videoUrlPart2, setVideoUrlPart2] = useState<string | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string>('');
  
  // State for Ad Script Generator (Separate from the embedded prompt)
  const [adScript, setAdScript] = useState<string>('');
  const [isScriptLoading, setIsScriptLoading] = useState<boolean>(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioDownloadHint, setAudioDownloadHint] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [scriptCopySuccess, setScriptCopySuccess] = useState<string>('');
  
  // Voice Customization State
  const [selectedGender, setSelectedGender] = useState<VoiceGender>('female');
  const [selectedAge, setSelectedAge] = useState<VoiceAge>('youth');
  const [selectedSpeed, setSelectedSpeed] = useState<number>(1.2);
  const [voiceMap, setVoiceMap] = useState<Record<string, string | null>>({});
  

  // Load history from localStorage on initial render
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem('generationHistory');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (error) {
      console.error("Failed to load history from localStorage", error);
    }
  }, []);

  // Update prompt and location when generation mode changes
  useEffect(() => {
    if (generationMode === 'outfit') {
      setPrompt(OUTFIT_PROMPT);
      setLocation(OUTFIT_LOCATIONS[0].value);
    } else if (generationMode === 'hold') {
      setPrompt(HOLD_PROMPT);
      setLocation(HOLD_LOCATIONS[0].value);
    } else if (generationMode === 'appliances') {
      setPrompt(APPLIANCE_PROMPT);
      setLocation(APPLIANCE_LOCATIONS[0].value);
    } else if (generationMode === 'shoe_rack') {
      setPrompt(SHOE_RACK_PROMPT);
      setLocation(SHOE_RACK_LOCATIONS[0].value);
    } else if (generationMode === 'sos') {
      setPrompt(SOS_PROMPT);
      setLocation(SOS_LOCATIONS[0].value);
    }
    setCustomImagePrompt(''); // Reset custom prompt on mode change
    setGeneratedPoses([]); // Reset poses
    setSelectedPose('automatic'); // Reset selected pose
    setPoseError(null);
    setActiveSettingsTab('location'); // Reset settings tab to default
  }, [generationMode]);
  
  // Update available age when gender changes
  useEffect(() => {
    if (selectedGender === 'male' && selectedAge === 'elderly') {
      // Keep elderly if male
    } else if (selectedGender === 'female' && selectedAge === 'elderly') {
      // Switch to middle-aged if female doesn't have elderly option
      setSelectedAge('middle-aged');
    }
  }, [selectedGender, selectedAge]);

  // Load voices and map them to profiles
  useEffect(() => {
    const loadAndMapVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices.length === 0) return;

        const vietnameseVoices = availableVoices.filter(v => v.lang.startsWith('vi'));
        setVoices(vietnameseVoices);

        if (vietnameseVoices.length > 0) {
            const newVoiceMap: Record<string, string | null> = {};

            // Prioritize voices with gender in their name using a flexible regex
            let femaleVoices = vietnameseVoices.filter(v => /nữ|female|woman|girl|mai|my/i.test(v.name));
            let maleVoices = vietnameseVoices.filter(v => /nam|male|man|boy|huy/i.test(v.name));

            // Create a pool of unclassified voices
            const classifiedURIs = new Set([...femaleVoices, ...maleVoices].map(v => v.voiceURI));
            const unclassifiedVoices = vietnameseVoices.filter(v => !classifiedURIs.has(v.voiceURI));

            // If classification is poor (e.g., one gender pool is empty), intelligently distribute unclassified voices
            if (femaleVoices.length === 0 && unclassifiedVoices.length > 0) {
                 femaleVoices.push(...unclassifiedVoices);
            } else if (maleVoices.length === 0 && unclassifiedVoices.length > 0) {
                maleVoices.push(...unclassifiedVoices);
            } else {
                 // If both are empty or both have voices, split the remainder
                 unclassifiedVoices.forEach((v, i) => {
                     if (i % 2 === 0) femaleVoices.push(v);
                     else maleVoices.push(v);
                 });
            }

            // Assign female voices by their order in the filtered array
            newVoiceMap['female-youth'] = femaleVoices[0]?.voiceURI || null;
            newVoiceMap['female-middle-aged'] = femaleVoices[1]?.voiceURI || femaleVoices[0]?.voiceURI || null; // fallback to the first available female voice

            // Assign male voices by their order in the filtered array
            newVoiceMap['male-youth'] = maleVoices[0]?.voiceURI || null;
            newVoiceMap['male-middle-aged'] = maleVoices[1]?.voiceURI || maleVoices[0]?.voiceURI || null; // fallback to the first available male voice
            newVoiceMap['male-elderly'] = maleVoices[2]?.voiceURI || maleVoices[1]?.voiceURI || maleVoices[0]?.voiceURI || null; // fallback chain

            setVoiceMap(newVoiceMap);
        }
    };

    // Browsers load voices asynchronously.
    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = loadAndMapVoices;
    } else {
        loadAndMapVoices();
    }

    return () => {
        window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);


  // Cleanup for speech synthesis
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Helper to convert blob URL to data URL for persistent storage
  const blobUrlToDataUrl = (blobUrl: string): Promise<string> => {
      return fetch(blobUrl)
          .then(res => res.blob())
          .then(blob => new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          }));
  };

  const addHistoryItem = useCallback(async (newItem: Omit<ImageHistoryItem, 'id' | 'timestamp'> | Omit<VideoHistoryItem, 'id' | 'timestamp'>) => {
      let compressedItem: any = { ...newItem };
      const MAX_DIMENSION = 512; // Max width/height for history images

      try {
        if (compressedItem.type === 'image') {
          const item = compressedItem as Omit<ImageHistoryItem, 'id' | 'timestamp'>;
          item.characterImagePreview = await compressImageDataUrl(item.characterImagePreview, MAX_DIMENSION);
          
          if (item.generationMode === 'outfit' && item.productImagePreviews) {
            item.productImagePreviews = await Promise.all(
                item.productImagePreviews.map(p => compressImageDataUrl(p, MAX_DIMENSION))
            );
          } else if ((item.generationMode === 'hold' || item.generationMode === 'appliances' || item.generationMode === 'shoe_rack' || item.generationMode === 'sos') && item.cosmeticImagePreview) {
            item.cosmeticImagePreview = await compressImageDataUrl(item.cosmeticImagePreview, MAX_DIMENSION);
          }
          
          item.generatedImages = await Promise.all(
              item.generatedImages.map(g => compressImageDataUrl(g, MAX_DIMENSION))
          );
          compressedItem = item;
        } else if (compressedItem.type === 'video') {
            compressedItem.sourceImageForVideo = await compressImageDataUrl(compressedItem.sourceImageForVideo, MAX_DIMENSION);
        }
      } catch (error) {
          console.error("Failed to compress images for history. History item will not be saved.", error);
          return; // Abort saving if compression fails
      }

      const fullItem: HistoryItem = {
          ...compressedItem,
          id: new Date().toISOString() + Math.random(),
          timestamp: Date.now(),
      };
      
      setHistory(prev => {
          const updatedHistory = [fullItem, ...prev].slice(0, 50); // Increased history limit
          try {
              localStorage.setItem('generationHistory', JSON.stringify(updatedHistory));
          } catch (error) {
              console.error("Failed to save history to localStorage", error);
          }
          return updatedHistory;
      });
  }, []);

  const handleRestoreFromHistory = useCallback(async (item: HistoryItem) => {
    if (item.type === 'image') {
      setActiveTab('image');
      setGenerationMode(item.generationMode || 'outfit');
      setLocation(item.location);
      setPrompt(item.prompt);
      setCustomImagePrompt(item.customImagePrompt || '');
      setGeneratedImages(item.generatedImages);
      setImageError(null); // Clear any previous error messages

      // Clear existing images before restoring
      setCharacterImage(null);
      setProductImages(Array(3).fill(null));
      setCosmeticImage(null);
      setShoeRackImage(null);
      setShoeImage(null);

      try {
        if (item.generationMode === 'shoe_rack') {
          const shoeRackFile = await dataUrlToFile(item.characterImagePreview, 'restored-shoe-rack.png');
          setShoeRackImage({ file: shoeRackFile, preview: item.characterImagePreview });
          if (item.cosmeticImagePreview) {
             const shoeFile = await dataUrlToFile(item.cosmeticImagePreview, 'restored-shoe.png');
             setShoeImage({ file: shoeFile, preview: item.cosmeticImagePreview });
          }
        } else {
          const charFile = await dataUrlToFile(item.characterImagePreview, 'restored-character.png');
          setCharacterImage({ file: charFile, preview: item.characterImagePreview });
        }

        if (item.generationMode === 'outfit' && item.productImagePreviews) {
          const restoredProductImages = await Promise.all(
            item.productImagePreviews.map(async (p, i) => {
              const file = await dataUrlToFile(p, `restored-product-${i}.png`);
              return { file, preview: p };
            })
          );
          const newProductImages: (ImageFile)[] = Array(3).fill(null);
          restoredProductImages.forEach((img, i) => {
            if (i < 3) newProductImages[i] = img;
          });
          setProductImages(newProductImages);
        } else if ((item.generationMode === 'hold' || item.generationMode === 'appliances' || item.generationMode === 'sos') && item.cosmeticImagePreview) {
          const cosmeticFile = await dataUrlToFile(item.cosmeticImagePreview, 'restored-cosmetic.png');
          setCosmeticImage({ file: cosmeticFile, preview: item.cosmeticImagePreview });
        }
      } catch (e) {
        console.error("Failed to restore images from history", e);
        setImageError("Không thể khôi phục ảnh từ lịch sử. Vui lòng tải lại ảnh.");
      }

    } else if (item.type === 'video') {
      setActiveTab('video');
      setSourceImageForVideo(item.sourceImageForVideo);
      setVideoPrompt(item.videoPrompt);
      setEditablePromptJsonPart1(JSON.stringify(item.videoPrompt.part1, null, 2));
      setEditablePromptJsonPart2(JSON.stringify(item.videoPrompt.part2, null, 2));
      setJsonError(null);
      setCustomVideoIdea(item.customVideoIdea || '');
      setAdScript(item.adScript || '');
      setSelectedGender(item.selectedGender || 'female');
      setSelectedAge(item.selectedAge || 'youth');
      setSelectedSpeed(item.selectedSpeed || 1.2);
      // Reset video generation state
      setVideoUrlPart1(null);
      setVideoUrlPart2(null);
      setVideoError(null);
    }
    setIsHistoryModalOpen(false);
  }, []);


  // Handlers for Background Remover
  const handleBgRemovalImageChange = useCallback((file: File) => {
    setBgRemovalImage({ file, preview: URL.createObjectURL(file) });
    setBgRemovalResults([]); // Clear previous result
    setBgRemovalError(null);
  }, []);

  const handleBgRemovalImageClear = useCallback(() => {
    if (bgRemovalImage?.preview) URL.revokeObjectURL(bgRemovalImage.preview);
    setBgRemovalImage(null);
    setBgRemovalResults([]);
    setBgRemovalError(null);
  }, [bgRemovalImage]);

  const handleCopyTeacherPrompt = useCallback(() => {
    navigator.clipboard.writeText(TEACHER_PROMPT).then(() => {
        setBgCopySuccess('Đã sao chép!');
        setTimeout(() => setBgCopySuccess(''), 2000);
    }, (err) => {
        console.error('Could not copy text: ', err);
        setBgCopySuccess('Lỗi!');
        setTimeout(() => setBgCopySuccess(''), 2000);
    });
  }, []);

  const handleBgRemovalClick = async () => {
    if (!bgRemovalImage) {
        setBgRemovalError('Vui lòng tải lên một ảnh.');
        return;
    }
    setBgRemovalLoadingMessage('Đang xử lý...');
    setBgRemovalError(null);
    setBgRemovalResults([]);
    
    // Set a random loader
    const loaders: LoaderType[] = ['aurora', 'snowfall', 'thinking', 'pulsingSnowflake', 'iceCrystal', 'steamingMug', 'frozenWindow', 'fireplace', 'winterWind'];
    const randomLoader = loaders[Math.floor(Math.random() * loaders.length)];
    setActiveLoader(randomLoader);


    if (bgRemovalMode === 'whole') {
        try {
            const resultDataUrl = await removeBackgroundImage(bgRemovalImage.file);
            setBgRemovalResults([{ name: 'Trang phục hoàn chỉnh', image: resultDataUrl }]);
        } catch (e) {
            console.error(e);
            setBgRemovalError('Đã xảy ra lỗi khi tách nền. Vui lòng thử lại.');
        } finally {
            setBgRemovalLoadingMessage(null);
        }
    } else { // 'individual' mode
        try {
            const onProgress = (message: string) => setBgRemovalLoadingMessage(message);
            const results = await separateObjects(bgRemovalImage.file, onProgress);
            setBgRemovalResults(results);
        } catch (e) {
            console.error(e);
            setBgRemovalError(e instanceof Error ? e.message : 'Đã xảy ra lỗi khi tách các vật thể. Vui lòng thử lại.');
        } finally {
            setBgRemovalLoadingMessage(null);
        }
    }
  };

  const handleDownloadBgRemovalItem = async (item: BgRemovalResultItem) => {
    try {
        const response = await fetch(item.image);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const fileName = item.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.href = url;
        link.download = `item-${fileName}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading background removal item:', error);
        window.open(item.image, '_blank');
    }
  };
  
  const handleUseItemForGeneration = useCallback(async (item: BgRemovalResultItem) => {
    // 1. Convert data URL to File
    const fileName = `separated-item-${Date.now()}.png`;
    const file = await dataUrlToFile(item.image, fileName);
    const imageFile = { file, preview: item.image }; // Use dataURL directly for preview

    // 2. Switch tab and mode
    setActiveTab('image');
    setGenerationMode('outfit');

    // 3. Set the product image and reset other inputs for a clean start
    setCharacterImage(null);
    setCosmeticImage(null);
    setShoeRackImage(null);
    setShoeImage(null);
    setGeneratedImages([]);
    setImageError("Sản phẩm đã được thêm. Vui lòng tải lên ảnh nhân vật để bắt đầu ghép.");
    
    // Clean up any existing object URLs in the old product images array
    productImages.forEach(img => {
        if (img?.preview && img.preview.startsWith('blob:')) {
            URL.revokeObjectURL(img.preview);
        }
    });
    
    // Create a new product images array with the new item in the first slot
    const newProductImages: (ImageFile)[] = Array(3).fill(null);
    newProductImages[0] = imageFile;
    setProductImages(newProductImages);
}, [productImages]);


  const handleCharacterImageChange = useCallback((file: File) => {
    setCharacterImage({ file, preview: URL.createObjectURL(file) });
  }, []);
  const handleCharacterImageClear = useCallback(() => {
    if (characterImage?.preview) URL.revokeObjectURL(characterImage.preview);
    setCharacterImage(null);
  }, [characterImage]);

  const handleProductImageChange = useCallback((file: File, index: number) => {
    setProductImages(prev => {
      const newImages = [...prev];
      if (newImages[index]?.preview) URL.revokeObjectURL(newImages[index]!.preview);
      newImages[index] = { file, preview: URL.createObjectURL(file) };
      return newImages;
    });
  }, []);
  const handleProductImageClear = useCallback((index: number) => {
    setProductImages(prev => {
      const newImages = [...prev];
      if (newImages[index]?.preview) URL.revokeObjectURL(newImages[index]!.preview);
      newImages[index] = null;
      return newImages;
    });
  }, []);
  
  const handleCosmeticImageChange = useCallback((file: File) => {
    setCosmeticImage({ file, preview: URL.createObjectURL(file) });
  }, []);
  const handleCosmeticImageClear = useCallback(() => {
    if (cosmeticImage?.preview) URL.revokeObjectURL(cosmeticImage.preview);
    setCosmeticImage(null);
  }, [cosmeticImage]);

  const handleShoeRackImageChange = useCallback((file: File) => {
    setShoeRackImage({ file, preview: URL.createObjectURL(file) });
  }, []);
  const handleShoeRackImageClear = useCallback(() => {
    if (shoeRackImage?.preview) URL.revokeObjectURL(shoeRackImage.preview);
    setShoeRackImage(null);
  }, [shoeRackImage]);

  const handleShoeImageChange = useCallback((file: File) => {
    setShoeImage({ file, preview: URL.createObjectURL(file) });
  }, []);
  const handleShoeImageClear = useCallback(() => {
    if (shoeImage?.preview) URL.revokeObjectURL(shoeImage.preview);
    setShoeImage(null);
  }, [shoeImage]);

  const handleGenerateImageClick = async () => {
    if (generationMode !== 'shoe_rack' && !characterImage) {
      setImageError('Vui lòng tải lên ảnh nhân vật.');
      return;
    }
    
    if ((generationMode === 'hold' || generationMode === 'appliances' || generationMode === 'sos') && !cosmeticImage) {
      setImageError('Vui lòng tải lên ảnh sản phẩm.');
      return;
    }

    if (generationMode === 'shoe_rack' && (!shoeRackImage || !shoeImage)) {
      setImageError('Vui lòng tải lên ảnh kệ giày và ảnh sản phẩm.');
      return;
    }

    // Set a random loader
    const loaders: LoaderType[] = ['aurora', 'snowfall', 'thinking', 'pulsingSnowflake', 'iceCrystal', 'steamingMug', 'frozenWindow', 'fireplace', 'winterWind'];
    const randomLoader = loaders[Math.floor(Math.random() * loaders.length)];
    setActiveLoader(randomLoader);

    setIsImageLoading(true);
    setImageError(null);
    setGeneratedImages([]);

    try {
      const mainImageFile = generationMode === 'shoe_rack' ? shoeRackImage!.file : characterImage!.file;

      const productFiles = generationMode === 'outfit'
        ? productImages.filter(img => img !== null).map(img => img!.file)
        : generationMode === 'shoe_rack'
          ? [shoeImage!.file]
          : (cosmeticImage ? [cosmeticImage.file] : []);

      const finalPrompt = `${prompt}\n\n${customImagePrompt}`.trim();

      const results = await generateImages(mainImageFile, productFiles, location, finalPrompt, selectedPose);
      setGeneratedImages(results);

      if (results.length > 0) {
          setShowSnow(true);
          setTimeout(() => setShowSnow(false), 5000); // Snow animation lasts 5s
      }

      // Save to history
      const mainImagePreviewUrl = generationMode === 'shoe_rack' ? shoeRackImage!.preview : characterImage!.preview;
      const characterImagePreview = await blobUrlToDataUrl(mainImagePreviewUrl);

      const historyItemPayload: Omit<ImageHistoryItem, 'id' | 'timestamp'> = {
          type: 'image',
          generationMode,
          characterImagePreview, // This will be the rack image for shoe_rack mode
          location,
          prompt,
          customImagePrompt,
          generatedImages: results,
      };

      if (generationMode === 'outfit') {
          historyItemPayload.productImagePreviews = await Promise.all(
              productImages.filter(Boolean).map(img => blobUrlToDataUrl(img!.preview))
          );
      } else if (generationMode === 'shoe_rack') {
          historyItemPayload.cosmeticImagePreview = await blobUrlToDataUrl(shoeImage!.preview); // Reusing this field for the shoe
      } else if (cosmeticImage) {
          historyItemPayload.cosmeticImagePreview = await blobUrlToDataUrl(cosmeticImage.preview);
      }

      await addHistoryItem(historyItemPayload);

    } catch (e) {
      console.error(e);
      setImageError('Đã xảy ra lỗi khi tạo ảnh. Vui lòng thử lại.');
    } finally {
      setIsImageLoading(false);
    }
  };

  const handleDownloadImage = async (src: string, index: number) => {
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `generated-image-${Date.now()}.png`; // Shortened name
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading image:', error);
        window.open(src, '_blank');
    }
  };
  
  const handleGeneratePosesClick = async () => {
    if (generationMode === 'shoe_rack') return;

    setIsPoseLoading(true);
    setPoseError(null);
    setGeneratedPoses([]);
    setSelectedPose('automatic'); // Reset selection
    try {
      const poses = await generateFashionPoses(generationMode);
      setGeneratedPoses(poses);
    } catch (e) {
      console.error(e);
      setPoseError('Không thể tạo dáng. Vui lòng thử lại.');
    } finally {
      setIsPoseLoading(false);
    }
  };


  const handleCreateVideoPrompt = useCallback(async (imageSrc: string, index: number) => {
    setVideoCreationLoading(index);
    // Reset all previous video states
    setVideoPrompt(null);
    setEditablePromptJsonPart1('');
    setEditablePromptJsonPart2('');
    setJsonError(null);
    setVideoUrlPart1(null);
    setVideoUrlPart2(null);
    setVideoError(null);
    setVideoPromptError(null);
    setCustomVideoIdea('');
    setAdScript(''); // Reset independent script generator
    setScriptError(null); 
    setSourceImageForVideo(imageSrc);
    setActiveTab('video'); // Switch tab immediately
    setIsVideoPromptLoading(true);
    
    // Set a random loader
    const loaders: LoaderType[] = ['aurora', 'snowfall', 'thinking', 'pulsingSnowflake', 'iceCrystal', 'steamingMug', 'frozenWindow', 'fireplace', 'winterWind'];
    const randomLoader = loaders[Math.floor(Math.random() * loaders.length)];
    setActiveLoader(randomLoader);

    try {
        const promptResult = await generateVideoPrompt(imageSrc);
        setVideoPrompt(promptResult);
        setEditablePromptJsonPart1(JSON.stringify(promptResult.part1, null, 2));
        setEditablePromptJsonPart2(JSON.stringify(promptResult.part2, null, 2));
        // We no longer auto-set a single global adScript, as we have two parts now.
    } catch (e) {
        console.error(e);
        setVideoPromptError('Đã xảy ra lỗi khi tạo prompt video.');
    } finally {
        setIsVideoPromptLoading(false);
        setVideoCreationLoading(null);
    }
  }, []);

  const handleRegenerateVideoPrompt = useCallback(async () => {
    if (!sourceImageForVideo) {
        setVideoPromptError("Không có ảnh nguồn để tạo lại prompt.");
        return;
    }
    setIsRegeneratingPrompt(true);
    setVideoPromptError(null);
    setJsonError(null);
    try {
        const promptResult = await generateVideoPrompt(sourceImageForVideo, customVideoIdea);
        setVideoPrompt(promptResult);
        setEditablePromptJsonPart1(JSON.stringify(promptResult.part1, null, 2));
        setEditablePromptJsonPart2(JSON.stringify(promptResult.part2, null, 2));
    } catch (e) {
        console.error(e);
        setVideoPromptError('Đã xảy ra lỗi khi tạo lại prompt video.');
    } finally {
        setIsRegeneratingPrompt(false);
    }
  }, [sourceImageForVideo, customVideoIdea]);

  const handleEditablePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>, part: VideoPart) => {
    const newJsonString = e.target.value;
    if (part === 'part1') setEditablePromptJsonPart1(newJsonString);
    else setEditablePromptJsonPart2(newJsonString);

    try {
        const parsedJson = JSON.parse(newJsonString);
        if (videoPrompt) {
             const updatedPrompt = { ...videoPrompt };
             if (part === 'part1') updatedPrompt.part1 = parsedJson;
             else updatedPrompt.part2 = parsedJson;
             setVideoPrompt(updatedPrompt);
        }
        setJsonError(null); 
    } catch (error) {
        setJsonError(`Lỗi cú pháp JSON ở ${part === 'part1' ? 'Phần 1' : 'Phần 2'}. Vui lòng kiểm tra lại.`);
    }
  };

  const handleGenerateVideo = useCallback(async (part: VideoPart) => {
      if (!videoPrompt || !sourceImageForVideo) {
          setVideoError("Prompt không hợp lệ hoặc thiếu hình ảnh để tạo video.");
          return;
      }
      setIsVideoLoading(true);
      setVideoError(null);
      if (part === 'part1') setVideoUrlPart1(null);
      else setVideoUrlPart2(null);
      
      // Set a random loader
      const loaders: LoaderType[] = ['aurora', 'snowfall', 'thinking', 'pulsingSnowflake', 'iceCrystal', 'steamingMug', 'frozenWindow', 'fireplace', 'winterWind'];
      const randomLoader = loaders[Math.floor(Math.random() * loaders.length)];
      setActiveLoader(randomLoader);

      try {
          const promptToUse = part === 'part1' ? videoPrompt.part1 : videoPrompt.part2;
          const resultUrl = await generateVideoWithVeo(promptToUse, sourceImageForVideo);
          
          if (part === 'part1') setVideoUrlPart1(resultUrl);
          else setVideoUrlPart2(resultUrl);

           // Save to history (we save the whole set when either is generated, though ideally we'd wait for both or handle partials)
           // For simplicity, we update the history item whenever a generation happens.
          await addHistoryItem({
            type: 'video',
            sourceImageForVideo: sourceImageForVideo,
            videoPrompt: videoPrompt,
            customVideoIdea: customVideoIdea,
            adScript: adScript, // This tracks the independent generator, not the video-embedded scripts
            selectedGender: selectedGender,
            selectedAge: selectedAge,
            selectedSpeed: selectedSpeed,
        });
      } catch (e) {
          console.error(e);
          setVideoError(`Đã xảy ra lỗi khi tạo video ${part === 'part1' ? 'Phần 1' : 'Phần 2'}. Vui lòng thử lại.`);
      } finally {
          setIsVideoLoading(false);
      }
  }, [videoPrompt, sourceImageForVideo, customVideoIdea, adScript, addHistoryItem, selectedGender, selectedAge, selectedSpeed]);

  const copyToClipboard = useCallback((text: string) => {
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        setCopySuccess('Đã sao chép!');
        setTimeout(() => setCopySuccess(''), 2000);
      }, (err) => {
        console.error('Could not copy text: ', err);
        setCopySuccess('Sao chép thất bại');
        setTimeout(() => setCopySuccess(''), 2000);
      });
    }
  }, []);

  const handleGenerateAdScript = useCallback(async () => {
    if (!sourceImageForVideo) return;
    setIsScriptLoading(true);
    setScriptError(null);
    setAdScript('');
    try {
      const script = await generateAdScript(sourceImageForVideo, selectedGender, selectedAge);
      setAdScript(script);
    } catch (e) {
      console.error(e);
      setScriptError('Không thể tạo nội dung quảng cáo. Vui lòng thử lại.');
    } finally {
      setIsScriptLoading(false);
    }
  }, [sourceImageForVideo, selectedGender, selectedAge]);
  
  const handleCopyScript = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        setScriptCopySuccess('Đã sao chép!');
        setTimeout(() => setScriptCopySuccess(''), 2000);
    }).catch(err => {
        console.error('Failed to copy script:', err);
        setScriptCopySuccess('Lỗi!');
        setTimeout(() => setScriptCopySuccess(''), 2000);
    });
  }, []);

  const handlePlayback = useCallback((text: string) => {
    if (!text) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = selectedSpeed;
      
      const voiceKey = `${selectedGender}-${selectedAge}`;
      const targetURI = voiceMap[voiceKey];
      const selectedVoice = voices.find(v => v.voiceURI === targetURI);
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      } else {
        utterance.lang = 'vi-VN';
      }
      
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (e) => {
          console.error("Speech synthesis error", e);
          setIsSpeaking(false);
          setScriptError("Lỗi phát âm thanh. Có thể trình duyệt của bạn không hỗ trợ giọng nói này.");
      };
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  }, [isSpeaking, voices, selectedGender, selectedAge, selectedSpeed, voiceMap]);
  
  const handleDownloadAudio = useCallback(async (text: string) => {
    if (!text || isRecording) return;

    setAudioDownloadHint('Vui lòng chọn tab này và cấp quyền ghi âm để tải xuống.');
    setIsRecording(true);

    try {
        const audioStream = await navigator.mediaDevices.getDisplayMedia({
            video: false,
            audio: true,
        });
        
        const recorder = new MediaRecorder(audioStream);
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => chunks.push(e.data);

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `voice-over-${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            audioStream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
            setAudioDownloadHint('');
        };

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = selectedSpeed;
        const voiceKey = `${selectedGender}-${selectedAge}`;
        const targetURI = voiceMap[voiceKey];
        const selectedVoice = voices.find(v => v.voiceURI === targetURI);
        if (selectedVoice) utterance.voice = selectedVoice;
        else utterance.lang = 'vi-VN';

        utterance.onstart = () => {
            recorder.start();
            setAudioDownloadHint('Đang ghi âm... Tệp sẽ tự động tải xuống khi hoàn tất.');
        };

        utterance.onend = () => {
            if (recorder.state === 'recording') recorder.stop();
        };

        utterance.onerror = (e) => {
            console.error("Speech synthesis error", e);
            if (recorder.state === 'recording') recorder.stop();
            setIsRecording(false);
            setAudioDownloadHint('Lỗi phát âm thanh. Không thể ghi âm.');
        };
        
        // Stop recording if the user stops sharing
        audioStream.getTracks().forEach(track => {
            track.onended = () => {
                if(recorder.state === 'recording') recorder.stop();
                setIsRecording(false);
                setAudioDownloadHint('Đã dừng ghi âm.');
            }
        })

        window.speechSynthesis.speak(utterance);

    } catch (err) {
        console.error('Error capturing audio:', err);
        setIsRecording(false);
        setAudioDownloadHint('Ghi âm đã bị hủy hoặc không được cấp quyền.');
        setTimeout(() => setAudioDownloadHint(''), 6000);
    }
  }, [isRecording, voices, selectedGender, selectedAge, selectedSpeed, voiceMap]);
  
  // --- Reusable UI Components ---
  const panelClasses = "frost-glass rounded-2xl p-6 shadow-2xl snow-topped mt-4"; // ADDED snow-topped and mt-4
  const headingClasses = "text-2xl font-bold pb-4 mb-6 border-b text-transparent bg-clip-text flex items-center gap-3";
  const subHeadingClasses = "flex items-center gap-2 text-lg font-semibold mb-3 text-slate-300";

  const renderEmptyResults = (text: string) => (
    <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-8">
        <ImageIcon className="w-24 h-24" />
        <p className="mt-4 text-lg">{text}</p>
    </div>
  );

  const renderRandomizedLoader = (text: string, shiver: boolean = false) => {
    let loaderComponent;

    switch (activeLoader) {
      case 'aurora':
        loaderComponent = (
          <div className="aurora-loader">
            <div className="aurora-band"></div>
            <div className="aurora-band"></div>
          </div>
        );
        break;
      case 'snowfall':
        loaderComponent = (
          <div className="snowfall-loader">
            <div className="snowflake">❄️</div><div className="snowflake">❅</div>
            <div className="snowflake">❄️</div><div className="snowflake">❆</div>
            <div className="snowflake">❄️</div><div className="snowflake">❅</div>
            <div className="snowflake">❄️</div><div className="snowflake">❆</div>
          </div>
        );
        break;
      case 'pulsingSnowflake':
        loaderComponent = <div className="pulsing-snowflake-loader">❄️</div>;
        break;
      case 'iceCrystal':
        loaderComponent = (
          <div className="ice-crystal-loader">
            <div className="ice-crystal"><span /></div>
          </div>
        );
        break;
      case 'steamingMug':
        loaderComponent = (
          <div className="steaming-mug-loader">
            <div className="steam">
              <div className="steam-line"></div>
              <div className="steam-line"></div>
              <div className="steam-line"></div>
            </div>
            <div className="mug"></div>
          </div>
        );
        break;
      case 'frozenWindow':
        loaderComponent = (
          <div className="frozen-window-loader">
            <div className="frost-overlay"></div>
          </div>
        );
        break;
      case 'fireplace':
        loaderComponent = (
          <div className="fireplace-loader">
            <div className="fireplace">
              <div className="fire">
                <div className="flame"></div>
                <div className="flame red"></div>
                <div className="flame yellow"></div>
              </div>
            </div>
          </div>
        );
        break;
      case 'winterWind':
        loaderComponent = (
          <div className="wind-loader">
            <div className="wind-streak"></div><div className="wind-streak"></div>
            <div className="wind-streak"></div><div className="wind-streak"></div>
            <div className="wind-streak"></div>
          </div>
        );
        break;
      case 'thinking':
      default:
        loaderComponent = (
          <div className="thinking-loader">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
        );
        break;
    }

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 overflow-hidden rounded-lg">
        <div className="absolute inset-0 w-full h-full">
            {loaderComponent}
        </div>
        <p className={`relative text-lg text-slate-300 font-semibold px-4 py-2 bg-black/40 rounded-md backdrop-blur-sm ${shiver ? 'shiver' : 'animate-pulse'}`}>{text}</p>
      </div>
    );
  };

  const renderBackgroundRemover = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Settings Panel */}
      <div className={`${panelClasses} border-sky-500/30 shadow-sky-500/10 space-y-8`}>
        <PolarBearDecoration />
        <h2 className={`${headingClasses} bg-gradient-to-r from-sky-300 to-cyan-400 border-sky-500/30`}>
            <SnowflakeIcon className="text-sky-400" /> TÁCH NỀN SẢN PHẨM
        </h2>
        
        <div className="space-y-4">
          <h3 className={subHeadingClasses}><Cog8ToothIcon /> Chế độ</h3>
            <div className="flex rounded-lg p-1 gap-1 frost-glass">
                <button
                    onClick={() => setBgRemovalMode('whole')}
                    className={`w-full px-4 py-2 text-sm font-medium rounded-md transition-all ${bgRemovalMode === 'whole' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}
                >
                    Tách Nền Trang Phục
                </button>
                <button
                    onClick={() => setBgRemovalMode('individual')}
                    className={`w-full px-4 py-2 text-sm font-medium rounded-md transition-all ${bgRemovalMode === 'individual' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}
                >
                    Tách Từng Món
                </button>
                 <button
                    onClick={() => setBgRemovalMode('teacher_prompt')}
                    className={`w-full px-4 py-2 text-sm font-medium rounded-md transition-all ${bgRemovalMode === 'teacher_prompt' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}
                >
                    Prompt Của Thầy
                </button>
            </div>
        </div>

        {(bgRemovalMode === 'whole' || bgRemovalMode === 'individual') && (
            <>
                <div className="space-y-4">
                    <h3 className={subHeadingClasses}><ImageIcon /> Ảnh Gốc</h3>
                    <p className="text-sm text-gray-400 -mt-2">
                        {bgRemovalMode === 'whole'
                        ? 'Tải lên ảnh sản phẩm. AI sẽ tự động tách nền và định dạng ảnh theo tỷ lệ 9:16 (Dọc).'
                        : 'Tải lên ảnh chứa nhiều vật thể (thời trang, công nghệ, gia dụng, v.v.). AI sẽ nhận diện và tách riêng từng món.'}
                    </p>
                    <ImageUploader 
                        onFileChange={handleBgRemovalImageChange}
                        onFileClear={handleBgRemovalImageClear}
                        preview={bgRemovalImage?.preview ?? null}
                        className="h-80"
                    />
                </div>
                <button
                    onClick={handleBgRemovalClick}
                    disabled={!!bgRemovalLoadingMessage || !bgRemovalImage}
                    className="group w-full flex items-center justify-center gap-3 text-lg font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-sky-600/30 hover:shadow-sky-500/40 border border-sky-500/30 hover:border-sky-400"
                    >
                    <ScissorsIcon className="transition-transform group-hover:animate-icon-shiver-on-hover" />
                    <span>{bgRemovalLoadingMessage ? 'Đang xử lý...' : (bgRemovalMode === 'whole' ? 'Tách Nền' : 'Bắt đầu Tách')}</span>
                </button>
                {bgRemovalError && <p className="text-red-400 text-center mt-2">{bgRemovalError}</p>}
            </>
        )}

        {bgRemovalMode === 'teacher_prompt' && (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className={subHeadingClasses}>
                        <DocumentTextIcon /> Prompt của thầy
                    </h3>
                    <button
                        onClick={handleCopyTeacherPrompt}
                        className="group flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700/80 hover:bg-slate-600/80 rounded-md transition-colors border border-slate-600 hover:border-slate-500"
                    >
                        <CopyIcon className="animate-icon-shiver-on-hover transition-transform" />
                        <span>{bgCopySuccess ? bgCopySuccess : 'Sao chép'}</span>
                    </button>
                </div>
                <textarea
                    readOnly
                    value={TEACHER_PROMPT}
                    rows={20}
                    className="w-full bg-slate-950/70 font-mono text-xs p-3 border rounded-md border-slate-700 resize-y focus:ring-2 focus:ring-sky-500 focus:border-sky-400 transition"
                    spellCheck="false"
                />
            </div>
        )}
      </div>

      {/* Results Panel */}
      <div className={`${panelClasses} border-sky-500/30 shadow-sky-500/10 flex flex-col`}>
        <PolarBearDecoration />
        <h2 className={`${headingClasses} bg-gradient-to-r from-sky-300 to-cyan-400 border-sky-500/30 shrink-0`}>
            <SparkleIcon className="text-cyan-300" /> KẾT QUẢ
        </h2>
        <div className="relative flex-grow flex flex-col items-center justify-center h-full min-h-[400px]">
          {bgRemovalLoadingMessage ? (
             renderRandomizedLoader(bgRemovalLoadingMessage)
          ) : bgRemovalResults.length > 0 ? (
            <div className="w-full">
              {bgRemovalMode === 'whole' ? (
                <div className="w-full flex flex-col items-center gap-4">
                  <div className="w-full max-w-sm p-2 bg-grid-pattern rounded-lg border border-slate-700">
                    <img src={bgRemovalResults[0].image} alt="Background removed result" className="w-full h-auto object-contain" />
                  </div>
                  <div className="w-full max-w-sm flex gap-2">
                    <button onClick={() => handleDownloadBgRemovalItem(bgRemovalResults[0])} className="group flex-1 flex items-center justify-center gap-2 text-md font-bold bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 px-4 rounded-lg transition-all transform hover:scale-105 shadow-md hover:shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30">
                        <DownloadIcon className="animate-icon-shiver-on-hover transition-transform" /> Tải ảnh
                    </button>
                    <button onClick={() => handleUseItemForGeneration(bgRemovalResults[0])} className="group flex-1 flex items-center justify-center gap-2 text-md font-bold bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 px-4 rounded-lg transition-all transform hover:scale-105 shadow-md hover:shadow-lg shadow-cyan-600/20 hover:shadow-cyan-500/30">
                        <SparkleIcon className="animate-icon-shiver-on-hover transition-transform" /> Ghép ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {bgRemovalResults.map((item, index) => (
                        <div key={index} className="flex flex-col items-center gap-2">
                            <div className="w-full p-2 bg-grid-pattern rounded-lg border border-slate-700 aspect-square flex items-center justify-center">
                                <img src={item.image} alt={item.name} className="max-w-full max-h-full object-contain" />
                            </div>
                            <p className="text-sm font-medium text-center truncate w-full">{item.name}</p>
                            <div className="w-full grid grid-cols-2 gap-2">
                                <button onClick={() => handleDownloadBgRemovalItem(item)} className="group flex items-center justify-center gap-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-2 rounded-lg transition-all transform hover:scale-105">
                                    <DownloadIcon className="animate-icon-shiver-on-hover transition-transform" /> Tải
                                </button>
                                <button onClick={() => handleUseItemForGeneration(item)} className="group flex items-center justify-center gap-1 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white py-2 px-2 rounded-lg transition-all transform hover:scale-105">
                                    <SparkleIcon className="animate-icon-shiver-on-hover transition-transform" /> Ghép
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            renderEmptyResults('Kết quả sẽ xuất hiện ở đây.')
          )}
        </div>
      </div>
    </div>
  );

  const renderImageGenerator = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Settings Panel */}
      <div className={`${panelClasses} border-blue-500/30 shadow-blue-500/10 space-y-8`}>
        <PolarBearDecoration />
        <h2 className={`${headingClasses} bg-gradient-to-r from-cyan-300 to-blue-400 border-blue-500/30`}>
            <SnowflakeIcon className="text-cyan-300"/> THIẾT LẬP
        </h2>
        
        <div className="space-y-4">
          <h3 className={subHeadingClasses}>Chế độ tạo ảnh</h3>
          <div className="flex rounded-lg p-1 gap-1 frost-glass text-center text-xs sm:text-sm">
            <button onClick={() => setGenerationMode('outfit')} className={`w-full px-2 py-2 font-medium rounded-md transition-all ${generationMode === 'outfit' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}>Thời trang</button>
            <button onClick={() => setGenerationMode('hold')} className={`w-full px-2 py-2 font-medium rounded-md transition-all ${generationMode === 'hold' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}>Mỹ phẩm</button>
            <button onClick={() => setGenerationMode('appliances')} className={`w-full px-2 py-2 font-medium rounded-md transition-all ${generationMode === 'appliances' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}>Gia Dụng</button>
            <button onClick={() => setGenerationMode('shoe_rack')} className={`w-full px-2 py-2 font-medium rounded-md transition-all ${generationMode === 'shoe_rack' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}>Kệ Giày</button>
            <button onClick={() => setGenerationMode('sos')} className={`w-full px-2 py-2 font-medium rounded-md transition-all ${generationMode === 'sos' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}>SOS</button>
          </div>
        </div>

        {generationMode !== 'shoe_rack' && (
          <div className="space-y-4">
            <h3 className={subHeadingClasses}><UserIcon /> Ảnh Nhân Vật</h3>
            <ImageUploader 
              onFileChange={handleCharacterImageChange}
              onFileClear={handleCharacterImageClear}
              preview={characterImage?.preview ?? null}
              className="h-60"
            />
          </div>
        )}

        {generationMode === 'outfit' ? (
          <div className="space-y-4">
            <h3 className={subHeadingClasses}><ShoppingBagIcon /> Ảnh Sản Phẩm (tối đa 3)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {productImages.map((img, i) => (
                <div key={i}>
                  <span className="text-sm text-gray-400 mb-1 block">Sản phẩm {i + 1}</span>
                  <ImageUploader 
                    onFileChange={(file) => handleProductImageChange(file, i)}
                    onFileClear={() => handleProductImageClear(i)}
                    preview={img?.preview ?? null}
                    className="h-32"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : generationMode === 'shoe_rack' ? (
          <div className="space-y-4">
            <h3 className={subHeadingClasses}><ShoppingBagIcon /> Ảnh Đầu Vào</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-400">Ảnh Kệ Giày</label>
                  <ImageUploader 
                    onFileChange={handleShoeRackImageChange}
                    onFileClear={handleShoeRackImageClear}
                    preview={shoeRackImage?.preview ?? null}
                    className="h-48"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-400">Ảnh Giày/Dép</label>
                  <ImageUploader 
                    onFileChange={handleShoeImageChange}
                    onFileClear={handleShoeImageClear}
                    preview={shoeImage?.preview ?? null}
                    className="h-48"
                  />
                </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className={subHeadingClasses}><ShoppingBagIcon/>
              {generationMode === 'hold' ? 'Ảnh Sản Phẩm (Mỹ phẩm, Công nghệ)' 
               : generationMode === 'appliances' ? 'Ảnh Đồ Gia Dụng' 
               : 'Ảnh Sản Phẩm (Nội y)'}
            </h3>
            <ImageUploader
              onFileChange={handleCosmeticImageChange}
              onFileClear={handleCosmeticImageClear}
              preview={cosmeticImage?.preview ?? null}
              className="h-48"
            />
          </div>
        )}

        <div className="space-y-4">
            <h3 className={subHeadingClasses}>Tùy chỉnh & Nâng cao</h3>
            <div className="flex rounded-lg p-1 gap-1 frost-glass text-center text-xs sm:text-sm">
                <button 
                    onClick={() => setActiveSettingsTab('location')} 
                    className={`w-full px-2 py-2 font-medium rounded-md transition-all flex items-center justify-center gap-1 ${activeSettingsTab === 'location' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}
                >
                    <MapPinIcon /> Địa Điểm
                </button>
                {generationMode !== 'shoe_rack' && (
                    <button 
                        onClick={() => setActiveSettingsTab('pose')} 
                        className={`w-full px-2 py-2 font-medium rounded-md transition-all flex items-center justify-center gap-1 ${activeSettingsTab === 'pose' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}
                    >
                        <SparkleIcon /> Tạo Dáng
                    </button>
                )}
                <button 
                    onClick={() => setActiveSettingsTab('custom')} 
                    className={`w-full px-2 py-2 font-medium rounded-md transition-all flex items-center justify-center gap-1 ${activeSettingsTab === 'custom' ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/20' : 'text-gray-300 hover:bg-sky-900/50 hover:text-white'}`}
                >
                    <PencilSquareIcon /> Yêu Cầu
                </button>
            </div>
            
            <div className="pt-4 border-t border-slate-800">
                {activeSettingsTab === 'location' && (
                    <div className="space-y-4">
                        <select 
                            id="location"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="w-full bg-slate-800/70 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
                        >
                            {(
                              generationMode === 'outfit' ? OUTFIT_LOCATIONS : 
                              generationMode === 'hold' ? HOLD_LOCATIONS : 
                              generationMode === 'appliances' ? APPLIANCE_LOCATIONS : 
                              generationMode === 'sos' ? SOS_LOCATIONS : 
                              SHOE_RACK_LOCATIONS
                            ).map(loc => (
                              <option key={loc.value} value={loc.value}>{loc.label}</option>
                            ))}
                        </select>
                    </div>
                )}

                {activeSettingsTab === 'pose' && generationMode !== 'shoe_rack' && (
                  <div className="space-y-4">
                      <button
                          onClick={handleGeneratePosesClick}
                          disabled={isPoseLoading}
                          className="group w-full flex items-center justify-center gap-3 text-md font-bold bg-sky-700/80 border border-sky-500/50 hover:bg-sky-600/80 disabled:bg-slate-600 disabled:cursor-not-allowed text-white py-2.5 rounded-lg transition-all"
                      >
                          {isPoseLoading ? (
                            <div className="snowflake-loader-small">
                                <span className="text-xl text-white">❄️</span>
                            </div>
                          ) : <SparkleIcon className="animate-icon-shiver-on-hover transition-transform text-yellow-300" />}
                          <span>{isPoseLoading ? 'Đang lấy ý tưởng...' : `Gợi ý 20 Dáng (${
                            generationMode === 'outfit' ? 'Thời Trang' : 
                            generationMode === 'hold' ? 'Sản Phẩm' : 
                            generationMode === 'appliances' ? 'Gia Dụng' : 
                            'Nội Y'
                          })`}</span>
                      </button>
                      {poseError && <p className="text-red-400 text-center mt-2 text-sm">{poseError}</p>}
                      
                      <select 
                        id="pose-select"
                        value={selectedPose}
                        onChange={(e) => setSelectedPose(e.target.value)}
                        disabled={isPoseLoading || generatedPoses.length === 0}
                        className="w-full bg-slate-800/70 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all disabled:opacity-50"
                      >
                        <option value="automatic">Tự động chọn dáng</option>
                        {generatedPoses.map((pose, index) => (
                          <option key={index} value={pose}>{pose}</option>
                        ))}
                      </select>
                  </div>
                )}
                
                {activeSettingsTab === 'custom' && (
                    <div className="space-y-4">
                        <textarea
                          id="custom-prompt"
                          value={customImagePrompt}
                          onChange={(e) => setCustomImagePrompt(e.target.value)}
                          rows={4}
                          placeholder="Ví dụ: thêm một chiếc túi xách màu đỏ, thay đổi kiểu tóc thành tóc ngắn, ảnh theo phong cách vintage..."
                          className="w-full bg-slate-800/70 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors resize-y"
                        />
                    </div>
                )}
            </div>
        </div>

        <button
          onClick={handleGenerateImageClick}
          disabled={isImageLoading || (generationMode !== 'shoe_rack' && !characterImage) || ((generationMode === 'hold' || generationMode === 'appliances' || generationMode === 'sos') && !cosmeticImage) || (generationMode === 'shoe_rack' && (!shoeRackImage || !shoeImage))}
          className="group w-full flex items-center justify-center gap-3 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/40 border border-cyan-500/30 hover:border-cyan-400"
        >
          <SparkleIcon className="text-yellow-300 animate-icon-shiver-on-hover transition-transform" />
          <span>{isImageLoading ? 'Đang tạo ảnh...' : 'Tạo Ảnh'}</span>
        </button>
        {imageError && <p className="text-red-400 text-center mt-2">{imageError}</p>}
      </div>

      {/* Results Panel */}
      <div className={`${panelClasses} border-blue-500/30 shadow-blue-500/10 flex flex-col`}>
        <PolarBearDecoration />
        <h2 className={`${headingClasses} bg-gradient-to-r from-cyan-300 to-blue-400 border-blue-500/30 shrink-0`}>
            <SparkleIcon className="text-cyan-300" /> KẾT QUẢ
        </h2>
        <div className="relative flex-grow flex flex-col items-center justify-center h-full min-h-[400px]">
          {showSnow && (
            <div className="snow-container">
              {Array.from({ length: 30 }).map((_, i) => (
                <div 
                  key={i}
                  className="flake" 
                  style={{
                    left: `${Math.random() * 100}%`,
                    fontSize: `${Math.random() * 1 + 0.5}rem`,
                    animationDuration: `${Math.random() * 3 + 4}s`,
                    animationDelay: `${Math.random() * 5}s`,
                  }}
                >
                  {Math.random() > 0.5 ? '❄️' : '❅'}
                </div>
              ))}
            </div>
          )}
          {isImageLoading ? (
            renderRandomizedLoader('Mùa đông đến rồi, kiếm người yêu thôiiii', true)
          ) : generatedImages.length > 0 ? (
            <div className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {generatedImages.map((src, index) => (
                  <div key={index} className="group relative flex flex-col items-center gap-3">
                    <img src={src} alt={`Generated image ${index + 1}`} className="w-full h-auto object-contain rounded-lg border border-slate-700 transition-all group-hover:border-sky-400/50 group-hover:shadow-xl group-hover:shadow-sky-500/10"/>
                    <div className="w-full flex items-center justify-center gap-2">
                      <button onClick={() => handleDownloadImage(src, index)} className="group/btn flex-1 flex items-center justify-center gap-2 text-md font-bold bg-emerald-700/80 hover:bg-emerald-600/90 text-white py-2.5 px-4 rounded-lg transition-all transform hover:scale-105 border border-emerald-500/50 hover:border-emerald-400">
                        <DownloadIcon className="transition-transform group-hover/btn:animate-icon-shiver-on-hover" /> Ảnh
                      </button>
                      <button onClick={() => handleCreateVideoPrompt(src, index)} disabled={videoCreationLoading !== null} className="group/btn flex-1 flex items-center justify-center gap-2 text-md font-bold bg-indigo-700/80 hover:bg-indigo-600/90 disabled:bg-slate-600 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-lg transition-all transform hover:scale-105 border border-indigo-500/50 hover:border-indigo-400">
                         {videoCreationLoading === index ? (
                            <>
                              <div className="snowflake-loader-small">
                                  <span className="text-xl text-white">❄️</span>
                              </div>
                              <span>Đang tạo...</span>
                            </>
                        ) : (
                            <><VideoIcon className="transition-transform group-hover/btn:animate-icon-shiver-on-hover" /><span>Tạo Video</span></>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            renderEmptyResults('Kết quả của bạn sẽ xuất hiện ở đây.')
          )}
        </div>
      </div>
    </div>
  );

    const renderVideoPromptGenerator = () => {
    if (!sourceImageForVideo && !isVideoLoading && !videoUrlPart1 && !videoUrlPart2) {
      return (
        <div className={`${panelClasses} border-indigo-500/30 shadow-indigo-500/10 text-center py-20`}>
          <PolarBearDecoration />
          {renderEmptyResults('Chọn một ảnh từ tab \'Tạo Ảnh\' để bắt đầu.')}
        </div>
      );
    }
    
    if (isVideoPromptLoading) {
        return (
            <div className={`${panelClasses} border-indigo-500/30 shadow-indigo-500/10 p-6 text-center h-[500px] flex items-center justify-center`}>
                <PolarBearDecoration />
                {renderRandomizedLoader('Đang tạo ý tưởng video (Phần 1 & 2)...')}
            </div>
        );
    }
    
    if (isVideoLoading) {
        return (
            <div className={`${panelClasses} border-indigo-500/30 shadow-indigo-500/10 p-6 text-center h-[500px] flex flex-col items-center justify-center`}>
                <PolarBearDecoration />
                {renderRandomizedLoader(`Đang tạo video bằng Veo (${activeVideoPart === 'part1' ? 'Phần 1' : 'Phần 2'})...`)}
                <p className="text-gray-400 text-sm mt-2 relative z-20">Quá trình này có thể mất vài phút, vui lòng không rời khỏi trang.</p>
            </div>
        );
    }

    // Main UI for creating the video
    return (
        <div className="space-y-6">
            {videoPromptError && <p className="text-red-400 text-center bg-red-900/20 p-3 rounded-md">{videoPromptError}</p>}
            {videoError && <p className="text-red-400 text-center bg-red-900/20 p-3 rounded-md">{videoError}</p>}
        
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                     <div className={`${panelClasses} border-indigo-500/30 shadow-indigo-500/10 space-y-6`}>
                        <PolarBearDecoration />
                        <div className="space-y-4">
                           <h3 className={`${subHeadingClasses} text-indigo-400`}><PencilSquareIcon/> Tạo lại Prompt với ý tưởng mới</h3>
                           <textarea id="custom-idea" value={customVideoIdea} onChange={(e) => setCustomVideoIdea(e.target.value)} rows={3} placeholder="Ví dụ: 'tạo video theo phong cách hoài cổ, tông màu nâu ấm'..." className="w-full bg-slate-800/70 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-y"/>
                           <button onClick={handleRegenerateVideoPrompt} disabled={isRegeneratingPrompt || !customVideoIdea} className="group w-full flex items-center justify-center gap-2 text-md font-bold bg-sky-700/80 hover:bg-sky-600/90 border border-sky-500/50 hover:border-sky-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-lg transition-all">
                               {isRegeneratingPrompt ? (
                                <>
                                  <div className="snowflake-loader-small">
                                      <span className="text-xl text-white">❄️</span>
                                  </div>
                                  <span>Đang tạo lại...</span>
                                </>
                               ) : (
                                <><RefreshIcon className="animate-icon-shiver-on-hover transition-transform" /><span>Tạo lại Prompt</span></>
                               )}
                           </button>
                        </div>
                        <hr className="border-slate-700/50" />
                        
                        {/* Tab Switcher for Part 1 and Part 2 */}
                        <div className="flex rounded-lg p-1 gap-1 frost-glass">
                             <button onClick={() => setActiveVideoPart('part1')} className={`w-full px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeVideoPart === 'part1' ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-300 hover:bg-indigo-900/50 hover:text-white'}`}>Phần 1 (Mở đầu)</button>
                             <button onClick={() => setActiveVideoPart('part2')} className={`w-full px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeVideoPart === 'part2' ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-300 hover:bg-indigo-900/50 hover:text-white'}`}>Phần 2 (Tiếp nối)</button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                               <h3 className={`${subHeadingClasses} text-indigo-400 mb-0`}>
                                   <DocumentTextIcon /> {activeVideoPart === 'part1' ? 'JSON Prompt Phần 1' : 'JSON Prompt Phần 2'}
                               </h3>
                               <button onClick={() => copyToClipboard(activeVideoPart === 'part1' ? editablePromptJsonPart1 : editablePromptJsonPart2)} className="group flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700/80 hover:bg-slate-600/80 rounded-md transition-colors border border-slate-600 hover:border-slate-500">
                                   <CopyIcon className="animate-icon-shiver-on-hover transition-transform" /> <span>{copySuccess ? copySuccess : 'Sao chép'}</span>
                               </button>
                           </div>
                           <textarea 
                                value={activeVideoPart === 'part1' ? editablePromptJsonPart1 : editablePromptJsonPart2} 
                                onChange={(e) => handleEditablePromptChange(e, activeVideoPart)} 
                                rows={10} 
                                placeholder="JSON prompt will appear here..." 
                                className={`w-full bg-slate-950/70 font-mono text-sm p-3 border rounded-md focus:ring-2 focus:ring-indigo-500 transition-colors resize-y ${jsonError ? 'border-red-500' : 'border-slate-700 focus:border-indigo-500'}`} 
                                spellCheck="false"
                           />
                           {jsonError && <p className="text-red-400 text-sm mt-2">{jsonError}</p>}
                        </div>
                    </div>

                    {videoPrompt && (
                        <div className={`${panelClasses} border-indigo-500/30 shadow-indigo-500/10 space-y-4`}>
                            <PolarBearDecoration />
                            <div className="flex justify-between items-center">
                                <h3 className={`${subHeadingClasses} text-indigo-400 mb-0`}><SpeakerWaveIcon /> Script (Phần {activeVideoPart === 'part1' ? '1' : '2'})</h3>
                                <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Giọng miền Bắc (Đồng bộ)
                                </span>
                            </div>
                            
                             {/* Global Voice Settings */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Giới tính</label>
                                    <div className="flex rounded p-0.5 gap-1 bg-slate-900/50">
                                        <button onClick={() => setSelectedGender('female')} className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${selectedGender === 'female' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>Nữ</button>
                                        <button onClick={() => setSelectedGender('male')} className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${selectedGender === 'male' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>Nam</button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Độ tuổi</label>
                                    <div className="flex rounded p-0.5 gap-1 bg-slate-900/50">
                                        <button onClick={() => setSelectedAge('youth')} className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${selectedAge === 'youth' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>Trẻ</button>
                                        <button onClick={() => setSelectedAge('middle-aged')} className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${selectedAge === 'middle-aged' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>Trung</button>
                                        {selectedGender === 'male' && <button onClick={() => setSelectedAge('elderly')} className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${selectedAge === 'elderly' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>Già</button>}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Script Display based on active part */}
                            <div className="space-y-2">
                                <p className="text-xs text-gray-400">Nội dung tự động từ Prompt:</p>
                                <div className="bg-slate-950/50 p-3 rounded border border-slate-700 text-sm italic text-gray-300 min-h-[60px]">
                                    {activeVideoPart === 'part1' ? videoPrompt.part1.voiceoverScript : videoPrompt.part2.voiceoverScript}
                                </div>
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button onClick={() => handlePlayback(activeVideoPart === 'part1' ? videoPrompt.part1.voiceoverScript || '' : videoPrompt.part2.voiceoverScript || '')} className="flex items-center justify-center gap-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white py-2 px-3 rounded-lg transition-all" disabled={voices.length === 0}>
                                        {isSpeaking ? <><StopIcon /> Dừng</> : <><PlayIcon /> Nghe Thử</>}
                                    </button>
                                    <button onClick={() => handleDownloadAudio(activeVideoPart === 'part1' ? videoPrompt.part1.voiceoverScript || '' : videoPrompt.part2.voiceoverScript || '')} className="flex items-center justify-center gap-2 text-xs font-bold bg-slate-600 hover:bg-slate-500 text-white py-2 px-3 rounded-lg transition-all disabled:bg-slate-700 disabled:cursor-not-allowed" disabled={isRecording}>
                                        {isRecording ? 'Đang ghi...' : <><DownloadIcon /> Tải Audio</>}
                                    </button>
                                </div>
                                {audioDownloadHint && <p className="text-xs text-yellow-400 text-center mt-1">{audioDownloadHint}</p>}
                            </div>
                            
                            {/* Independent Script Generator (Optional) */}
                             <div className="pt-4 border-t border-slate-700/50">
                                <button onClick={() => setAdScript(adScript ? '' : ' ')} className="text-xs text-amber-500 hover:text-amber-400 underline mb-2 block text-right">
                                    {adScript ? 'Ẩn trình tạo nội dung riêng' : 'Mở trình tạo nội dung riêng'}
                                </button>
                                {adScript !== '' && (
                                    <div className="space-y-2 animate-fade-in">
                                        <textarea value={adScript} onChange={(e) => setAdScript(e.target.value)} rows={4} className="w-full bg-slate-800/70 border border-slate-600 rounded-md p-3 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors resize-y text-sm placeholder-gray-500" placeholder="Nhập hoặc tạo nội dung quảng cáo riêng tại đây..."/>
                                        <div className="flex gap-2">
                                             <button onClick={handleGenerateAdScript} className="flex-1 flex items-center justify-center gap-2 text-xs font-bold bg-amber-700 hover:bg-amber-600 text-white py-2 rounded transition-all disabled:opacity-50" disabled={isScriptLoading}>{isScriptLoading ? 'Đang viết...' : 'Viết AI'}</button>
                                             <button onClick={() => handlePlayback(adScript)} className="flex-1 flex items-center justify-center gap-2 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition-all">Đọc</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    <button onClick={() => handleGenerateVideo(activeVideoPart)} disabled={!videoPrompt || isVideoLoading} className="group w-full flex items-center justify-center gap-3 text-lg font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-500/40 border border-emerald-500/30 hover:border-emerald-400">
                        <VideoIcon className="animate-icon-shiver-on-hover transition-transform" /> Tạo Video {activeVideoPart === 'part1' ? 'Phần 1' : 'Phần 2'}
                    </button>
                </div>
                
                <div className="space-y-6">
                    {sourceImageForVideo && (
                        <div className={`${panelClasses} border-indigo-500/30 shadow-indigo-500/10`}>
                            <PolarBearDecoration />
                            <h3 className={`${subHeadingClasses} text-indigo-400`}><ImageIcon /> Ảnh Nguồn Cho Video</h3>
                            <img src={sourceImageForVideo} alt="Source for video" className="w-full mx-auto rounded-lg"/>
                        </div>
                    )}
                    
                    {/* Video Results */}
                    {(videoUrlPart1 || videoUrlPart2) && (
                         <div className={`${panelClasses} border-green-500/30 shadow-green-500/10 p-6 text-center space-y-6`}>
                            <PolarBearDecoration />
                            <h3 className="text-2xl font-bold text-green-400 mb-3">Video đã sẵn sàng!</h3>
                            
                            {videoUrlPart1 && (
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-green-300">Phần 1 (Mở đầu)</p>
                                    <video src={videoUrlPart1} controls className="w-full max-w-2xl mx-auto rounded-lg border border-slate-700"></video>
                                    <a href={videoUrlPart1} download={`generated-video-part1-${Date.now()}.mp4`} className="inline-flex items-center justify-center gap-2 text-sm font-bold bg-green-700 hover:bg-green-600 text-white py-2 px-4 rounded-lg transition-all">
                                        <DownloadIcon /> Tải Phần 1
                                    </a>
                                </div>
                            )}
                            
                            {videoUrlPart2 && (
                                <div className="space-y-2 pt-4 border-t border-slate-700/50">
                                    <p className="text-sm font-semibold text-green-300">Phần 2 (Tiếp nối)</p>
                                    <video src={videoUrlPart2} controls className="w-full max-w-2xl mx-auto rounded-lg border border-slate-700"></video>
                                    <a href={videoUrlPart2} download={`generated-video-part2-${Date.now()}.mp4`} className="inline-flex items-center justify-center gap-2 text-sm font-bold bg-green-700 hover:bg-green-600 text-white py-2 px-4 rounded-lg transition-all">
                                        <DownloadIcon /> Tải Phần 2
                                    </a>
                                </div>
                            )}
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
  };
  
  return (
    <div className="text-gray-300 font-sans p-4 sm:p-6 lg:p-8">
      <HistoryModal 
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        history={history}
        onRestore={handleRestoreFromHistory}
      />
      <div className="max-w-screen-2xl mx-auto">
        {/* Header */}
        <header className="grid grid-cols-3 items-start mb-8 mt-12">
          <div></div>
          <div className="text-center flex flex-col items-center relative">
             <div className="absolute -top-20 z-10">
                <SnowmanIcon className="w-24 h-24 text-slate-200 drop-shadow-lg" />
             </div>
             <div className="w-32 h-32 rounded-full bg-slate-800/50 flex items-center justify-center shadow-lg border-4 border-sky-400/20 backdrop-blur-md animate-frosty-glow">
                <SnowflakeIcon className="w-20 h-20 text-sky-300 animate-spin" style={{ animationDuration: '20s' }}/>
            </div>
            <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-200 to-cyan-300">
              Tiến
            </h1>
          </div>
          <div className="flex justify-end">
            <button 
              onClick={() => setIsHistoryModalOpen(true)}
              className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all duration-300 shadow-lg shadow-orange-500/30 transform hover:scale-105 hover:shadow-amber-400/40"
            >
              <FireIcon className="text-amber-200 group-hover:animate-icon-shiver-on-hover" />
              <span>Lịch sử</span>
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="mb-8 flex justify-center">
            <div className="bg-slate-800/50 backdrop-blur-sm p-1.5 rounded-full flex items-center gap-2 border border-sky-500/30 animate-frosty-glow">
                 <button
                    onClick={() => setActiveTab('background_removal')}
                    className={`group relative overflow-hidden flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-full text-sm sm:text-base font-semibold transition-all duration-300 ease-in-out transform hover:scale-105 ${
                        activeTab === 'background_removal'
                        ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/40 active-tab-sparkle snow-mini'
                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <ScissorsIcon className="transition-transform group-hover:animate-icon-shiver-on-hover" />
                    <span>Tách Nền</span>
                </button>
                <button
                    onClick={() => setActiveTab('image')}
                    className={`group relative overflow-hidden flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-full text-sm sm:text-base font-semibold transition-all duration-300 ease-in-out transform hover:scale-105 ${
                        activeTab === 'image'
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/40 active-tab-sparkle snow-mini'
                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <SparkleIcon className="transition-transform group-hover:animate-icon-shiver-on-hover" />
                    <span>Tạo Ảnh</span>
                </button>
                <button
                    onClick={() => setActiveTab('video')}
                    className={`group relative overflow-hidden flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-full text-sm sm:text-base font-semibold transition-all duration-300 ease-in-out transform hover:scale-105 ${
                        activeTab === 'video'
                        ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/40 active-tab-sparkle snow-mini'
                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <VideoIcon className="transition-transform group-hover:animate-icon-shiver-on-hover" />
                    <span>Tạo Video</span>
                </button>
            </div>
        </div>


        {/* Main Content */}
        <main>
          {activeTab === 'background_removal' && renderBackgroundRemover()}
          {activeTab === 'image' && renderImageGenerator()}
          {activeTab === 'video' && renderVideoPromptGenerator()}
        </main>
      </div>
    </div>
  );
};

export default App;