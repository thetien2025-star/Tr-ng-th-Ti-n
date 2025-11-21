

export type ImageFile = {
  file: File;
  preview: string;
} | null;

export type VideoShot = {
  description: string;
  duration: number;
  camera_angle: string;
  camera_movement: string;
};

export type VideoPromptResponse = {
  prompt: string;
  voiceoverScript?: string;
  layout: string;
  style: string;
  motion: {
    type: string;
    speed: string;
    zoom: string;
  }
};

export type DualVideoPromptResponse = {
  part1: VideoPromptResponse;
  part2: VideoPromptResponse;
};

// Voice Customization Types
export type VoiceGender = 'female' | 'male';
export type VoiceAge = 'youth' | 'middle-aged' | 'elderly';


// History Types
export interface BaseHistoryItem {
  id: string;
  timestamp: number;
}

export interface ImageHistoryItem extends BaseHistoryItem {
  type: 'image';
  generationMode: 'outfit' | 'hold' | 'appliances' | 'shoe_rack' | 'sos';
  characterImagePreview: string; // data URL for person or shoe rack
  productImagePreviews?: string[]; // data URLs, for outfit mode
  cosmeticImagePreview?: string; // data URL, for hold, appliances, or shoe product
  location: string;
  prompt: string;
  customImagePrompt?: string;
  generatedImages: string[]; // data URLs
}

export interface VideoHistoryItem extends BaseHistoryItem {
  type: 'video';
  sourceImageForVideo: string; // data URL
  videoPrompt: DualVideoPromptResponse;
  customVideoIdea: string;
  adScript?: string; // Legacy support or combined
  selectedGender?: VoiceGender;
  selectedAge?: VoiceAge;
  selectedSpeed?: number;
}

export type HistoryItem = ImageHistoryItem | VideoHistoryItem;