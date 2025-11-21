
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { VideoPromptResponse, DualVideoPromptResponse, VoiceGender, VoiceAge } from "../types";

const srcToFile = async (src: string, fileName: string, mimeType: string): Promise<File> => {
  const res = await fetch(src);
  const buffer = await res.arrayBuffer();
  return new File([buffer], fileName, { type: mimeType });
}

const fileToBase64 = (file: File): Promise<{ mimeType: string, data: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const mimeType = result.split(';')[0].split(':')[1];
      const data = result.split(',')[1];
      resolve({ mimeType, data });
    };
    reader.onerror = (error) => reject(error);
  });
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export const generateImages = async (
  characterImage: File,
  productImages: File[],
  location: string,
  prompt: string,
  selectedPose: string
): Promise<string[]> => {
  const model = 'gemini-2.5-flash-image';

  const allFiles = [characterImage, ...productImages];
  const base64Parts = await Promise.all(allFiles.map(fileToBase64));
  
  const imageParts = base64Parts.map(part => ({
    inlineData: {
      data: part.data,
      mimeType: part.mimeType,
    },
  }));

  let locationPrompt = '';
  if (location === 'product_original') {
    locationPrompt = ` CRITICAL BACKGROUND INSTRUCTION: Use the background from the first PRODUCT image. The 'SUBJECT' image is the first image provided, and the 'PRODUCT' images follow it. You must take the background from the second image provided overall and use it as the background for the final composite image.`;
  } else if (location !== 'original') {
    locationPrompt = ` Place them in this location: ${location}.`;
  }
  
  const posePrompt = selectedPose && selectedPose !== 'automatic'
    ? ` CRITICAL POSE INSTRUCTION: The subject MUST be in the following pose: '${selectedPose}'. This overrides any other pose suggestion.`
    : '';
  
  // Stronger instruction placed at the start
  const aspectRatioInstruction = "Aspect Ratio 9:16 (Vertical/Portrait). The generated image MUST be vertical.";
  
  // NEW: Instruction for hyper-realism to counter "stiff" AI look
  const realismInstruction = `
    PHOTOREALISM MANDATE:
    1.  **Lighting Integration:** The subject must look like they were physically photographed in the new location. Match color temperature, shadows, and light direction perfectly.
    2.  **No "Cutout" Look:** Soften the edges of the subject. Add light wrap (ambient light spilling onto the edges of the subject).
    3.  **Natural Posture:** Ensure the subject's weight is distributed naturally. No stiff "T-pose" or robotic standing. They should look relaxed and engaged with the environment.
    4.  **Texture:** Keep skin texture realistic (pores, slight imperfections). Do not smooth the skin into plastic.
    5.  **Atmosphere:** Add subtle film grain and depth of field (blur the background slightly) to simulate a high-end camera lens.
  `;


  // Updated prompts to be more specific for full-body, portrait, and back shots.
  const prompts = [
    `${aspectRatioInstruction} ${realismInstruction} ${prompt}${locationPrompt}${posePrompt} Generate a full-body shot of the character, capturing them from head to toe. Ensure the entire body is visible.`,
    `${aspectRatioInstruction} ${realismInstruction} ${prompt}${locationPrompt}${posePrompt} Generate a portrait shot of the character, focusing on them from the chest up. The face should be clear and well-lit.`,
    `${aspectRatioInstruction} ${realismInstruction} ${prompt}${locationPrompt}${posePrompt} Generate a three-quarter back view of the character, capturing them from mid-thigh up, clearly showing the back design of the outfit. The face should not be visible.`
  ];
  
  const generationPromises = prompts.map(p => {
    const textPart = { text: p };
    const content = {
      parts: [...imageParts, textPart],
    };

    return ai.models.generateContent({
      model,
      contents: content,
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });
  });

  const responses = await Promise.all(generationPromises);

  const imageUrls: string[] = [];
  responses.forEach(response => {
    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const { data, mimeType } = part.inlineData;
          imageUrls.push(`data:${mimeType};base64,${data}`);
          break; 
        }
      }
    }
  });

  if (imageUrls.length === 0) {
      throw new Error("The AI did not return any images. Please try adjusting your prompt or images.");
  }
  
  while (imageUrls.length < 3 && imageUrls.length > 0) {
      imageUrls.push(imageUrls[0]);
  }

  return imageUrls;
};

const videoPromptSchema = {
  type: Type.OBJECT,
  properties: {
    prompt: { type: Type.STRING, description: 'A detailed prompt. MUST contain the EXACT phrase: "speaking Vietnamese with a standard Northern accent, medium pitch, warm and consistent tone, natural lip-sync with moderate mouth movements".' },
    voiceoverScript: { type: Type.STRING, description: 'A natural 8-second voiceover script. MUST BE IN VIETNAMESE ONLY (Northern accent style vocabulary). NO ENGLISH.' },
    layout: { type: Type.STRING, description: 'The aspect ratio of the video, must be "9:16" for vertical video.' },
    style: { type: Type.STRING, description: 'The overall visual style of the video (e.g., "realistic lifestyle", "cinematic vlog").' },
    motion: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, description: 'The primary camera motion type (e.g., "static with subject movement", "slight handheld").' },
        speed: { type: Type.STRING, description: 'The speed of the camera motion.' },
        zoom: { type: Type.STRING, description: 'The zoom direction.' },
      },
      required: ['type', 'speed', 'zoom']
    }
  },
  required: ['prompt', 'voiceoverScript', 'layout', 'style', 'motion']
};


export const generateVideoPrompt = async (imageSrc: string, userIdea?: string): Promise<DualVideoPromptResponse> => {
    const model = 'gemini-2.5-flash';
    const imageFile = await srcToFile(imageSrc, 'video-source.png', 'image/png');
    const imagePart = await fileToBase64(imageFile);

    const instructions = `
**CRITICAL INSTRUCTION: VIETNAMESE KOL/INFLUENCER STYLE - NORTHERN ACCENT**

You are an expert video director creating a 16-second vertical video ad (split into two 8s parts) featuring a **Vietnamese KOL/Influencer** introducing the outfit they are currently wearing.

1.  **PERSONA & VIBE:**
    *   **Role:** A professional yet authentic Vietnamese KOL/Influencer.
    *   **Vibe:** Natural, confident, quick-paced, and engaging. NOT robotic. NOT stiff.
    *   **Action:** The model MUST move naturally. **Avoid "stiff" (bị đơ) poses.**
    *   **Gestures:** Use fluid, natural hand gestures common in product reviews: brushing hair, touching the fabric of the shirt/dress, slightly turning the body to show angles, or pointing at a detail while smiling at the camera.

2.  **CONTENT STRATEGY (WEARING THE PRODUCT):**
    *   **Scenario:** The model is wearing the items from the input image.
    *   **Script Focus:** First-person ("Mình", "Em"). A quick, authentic introduction.
    *   **Key Message:** How it fits, the material feeling, or why it's trendy.

3.  **LANGUAGE MANDATE (ABSOLUTE PRIORITY):**
    *   **Language:** **VIETNAMESE (Tiếng Việt) ONLY**. NO English.
    *   **Accent Style:** **Northern Vietnamese (Giọng miền Bắc)**. Use words like "nhé", "đấy", "vâng", "ạ", "cực kỳ", "xinh lắm", "mê chữ ê kéo dài".
    *   **Tone:** Chatty, warm, like talking to a friend on a livestream.

4.  **VISUAL & AUDIO PROMPT STRICT UNIFORMITY:**
    *   You MUST include the following EXACT phrase in the \`prompt\` field for **BOTH** Part 1 and Part 2:
        **"A Vietnamese [man/woman] speaking Vietnamese with a standard Northern accent, medium pitch, warm and consistent tone, natural lip-sync with moderate mouth movements"**
    *   **Visual Prompt Specifics:** explicitly describe "natural gestures," "relaxed shoulders," and "fluid movement" to prevent the "frozen" look.

5.  **CONTINUITY (Part 1 -> Part 2):**
    *   **Part 1 (0-8s):** **The Hook.** Catchy opening. Model greets and touches the outfit.
    *   **Part 2 (8-16s):** **The Details.** Continues the sentence naturally, showing a different angle or gesture.
    *   The script must flow seamlessly.

6.  **OUTPUT FORMAT:**
    *   Return strictly valid JSON adhering to the schema.
`;

    const basePrompt = `Based on the provided image, create a JSON response with 'part1' and 'part2' for a video ad.
${instructions}
    `;
    
    const finalPrompt = userIdea 
        ? `Based on the provided image and this user idea: "${userIdea}", create a JSON response with 'part1' and 'part2'.
${instructions}
**Integration:** Incorporate the user's idea: "${userIdea}" into the script and visual narrative.
`
        : basePrompt;
    
    const textPart = { text: finalPrompt };
    const content = {
        parts: [
            { inlineData: { data: imagePart.data, mimeType: imagePart.mimeType } },
            textPart
        ],
    };

    const response = await ai.models.generateContent({
        model,
        contents: content,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    part1: videoPromptSchema,
                    part2: videoPromptSchema
                },
                required: ['part1', 'part2']
            },
        },
    });
    
    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
};

export const generateAdScript = async (imageSrc: string, gender: VoiceGender, age: VoiceAge): Promise<string> => {
    const model = 'gemini-2.5-flash';
    const imageFile = await srcToFile(imageSrc, 'ad-script-source.png', 'image/png');
    const imagePart = await fileToBase64(imageFile);
    
    const ageDescriptionMap: Record<VoiceAge, string> = {
        'youth': 'một người trẻ tuổi (thanh niên)',
        'middle-aged': 'một người trung niên',
        'elderly': 'một người lớn tuổi',
    };

    const genderDescription = gender === 'female' ? 'phụ nữ' : 'đàn ông';
    const ageDescription = ageDescriptionMap[age] || 'người';

    const voicePersonaInstruction = `- **Voice Persona:** The script should be written from the perspective of a ${ageDescription} Vietnamese ${genderDescription}. The tone must be suitable for this persona. Northern accent style vocabulary.`;

    const prompt = `You are a creative AI assistant specializing in writing short, concise product introduction scripts in Vietnamese.
Your task is to write a short promotional script based on the product in the image.

**Instructions:**
- **Tone:** Friendly, clear, direct, and natural. Avoid overly enthusiastic or "influencer" style language. Do not use emojis.
- **Language:** Vietnamese (Northern style vocabulary).
${voicePersonaInstruction}
- **Structure:**
    1. Start with a simple greeting.
    2. Introduce the product from the image and highlight its key features and benefits (material, design, comfort).
    3. Mention its versatility (who can wear it, how to style it, suitable occasions).
    4. Mention practical advantages (e.g., easy to care for).
    5. Conclude by mentioning its reasonable price.

**Example for a basic t-shirt:**
"Chào mọi người, hôm nay mình muốn giới thiệu đến các bạn một chiếc áo thun basic cực kỳ tiện dụng. Áo được làm từ chất liệu cotton mềm mịn, thoáng mát, mặc cả ngày vẫn thoải mái. Thiết kế form unisex nên cả nam và nữ đều dễ dàng phối đồ, từ quần jean, short cho đến chân váy đều rất hợp. Đi học, đi làm hay đi chơi đều thoải mái, năng động. Đặc biệt, áo có ưu điểm là ít nhăn, không bai giãn, giữ form tốt sau nhiều lần giặt. Giá lại vô cùng hợp lý, phù hợp cho mọi người muốn có một item đơn giản nhưng dùng được trong nhiều hoàn cảnh."

Now, generate a new script in the same style for the product in the provided image, keeping the specified voice persona in mind. The script should be of a similar length to the example.`;
    
    const textPart = { text: prompt };
    const content = {
        parts: [
            { inlineData: { data: imagePart.data, mimeType: imagePart.mimeType } },
            textPart
        ],
    };

    const response = await ai.models.generateContent({
        model,
        contents: content,
    });
    
    return response.text;
};

export const generateFashionPoses = async (category: 'outfit' | 'hold' | 'appliances' | 'sos'): Promise<string[]> => {
    const model = 'gemini-2.5-flash';
    
    let posePrompt = '';
    switch (category) {
        case 'outfit':
            posePrompt = 'List 20 professional fashion photography poses for a female model. The descriptions should be short, evocative, and in Vietnamese. Focus on action and posture.';
            break;
        case 'hold':
            posePrompt = 'List 20 elegant poses for a model holding a small product (like a cosmetic jar, a bottle, or a smartphone). The descriptions should be short, evocative, and in Vietnamese. Focus on hand position and natural interaction.';
            break;
        case 'appliances':
            posePrompt = 'List 20 natural, lifestyle poses for a person interacting with a home appliance (e.g., using a vacuum, standing next to an air purifier, holding a hairdryer). The descriptions should be short, evocative, and in Vietnamese. Focus on realistic use-case scenarios.';
            break;
        case 'sos':
            posePrompt = 'List 20 delicate and elegant poses for a female model holding a lingerie item (like a bra or underwear). The descriptions should be short, evocative, and in Vietnamese. Focus on tasteful presentation, not wearing the item. For example: "holding the bra delicately in both hands", "letting the underwear drape over her shoulder".';
            break;
        default:
             posePrompt = 'List 20 professional fashion photography poses for a female model. The descriptions should be short, evocative, and in Vietnamese. Focus on action and posture.';
    }


    const prompt = `${posePrompt} The output must be a JSON array of strings.`;

    const poseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        description: 'A short description of a pose in Vietnamese.'
      }
    };

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: poseSchema,
        },
    });

    const jsonText = response.text.trim();
    const poses = JSON.parse(jsonText);
    
    if (!Array.isArray(poses) || poses.some(p => typeof p !== 'string')) {
        throw new Error("AI did not return a valid array of strings for poses.");
    }
    
    return poses;
};


export const generateVideoWithVeo = async (promptData: VideoPromptResponse, imageSrc: string): Promise<string> => {
    const imageFile = await srcToFile(imageSrc, 'veo-source.png', 'image/png');
    const { data: imageBytes, mimeType } = await fileToBase64(imageFile);

    let operation = await ai.models.generateVideos({
        model: 'veo-2.0-generate-001',
        prompt: promptData.prompt,
        image: {
            imageBytes: imageBytes,
            mimeType: mimeType,
        },
        config: {
            numberOfVideos: 1,
        }
    });

    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000)); 
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("Video generation completed, but no download link was found.");
    }

    const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!videoResponse.ok) {
        throw new Error(`Failed to download video file. Status: ${videoResponse.status}`);
    }
    const videoBlob = await videoResponse.blob();
    return URL.createObjectURL(videoBlob);
}

export const removeBackgroundImage = async (
  imageFile: File
): Promise<string> => {
  const model = 'gemini-2.5-flash-image-preview';

  const { data, mimeType } = await fileToBase64(imageFile);

  const imagePart = {
    inlineData: { data, mimeType },
  };

  const prompt = `
    MỆNH LỆNH: Nhiệm vụ duy nhất của bạn là thực hiện một cuộc tách nền hoàn hảo, có độ trung thực cao để chiết xuất trang phục ra khỏi người trong ảnh được cung cấp. Kết quả cuối cùng phải là một hình ảnh sản phẩm được tách riêng, cấp độ chuyên nghiệp trên nền trong suốt.

    **HƯỚNG DẪN KHÔNG THỂ THƯƠNG LƯỢNG:**

    1.  **Xác định Mục tiêu Chính:** Mục tiêu chính và duy nhất của bạn là (các) món trang phục mà người đó đang mặc.
    2.  **Loại bỏ Hoàn toàn Người mẫu (QUAN TRỌNG):** BẠN BẮT BUỘC phải loại bỏ hoàn toàn và triệt để người mẫu ra khỏi hình ảnh. Kết quả cuối cùng KHÔNG được có bất kỳ dấu vết nào của con người (da, tóc, tay chân, v.v.). Kết quả CHỈ được chứa trang phục.
    3.  **Độ trung thực Sản phẩm Tuyệt đối (QUAN TRỌNG):** BẠN BẮT BUỘC phải bảo toàn 100% chi tiết của sản phẩm. Mỗi đường kim mũi chỉ, kết cấu, hoa văn, màu sắc và bóng đổ trên chính trang phục phải được giữ lại với độ chính xác hoàn hảo. KHÔNG được đơn giản hóa, thay đổi hoặc diễn giải trang phục theo bất kỳ cách nào. Đây là một nhiệm vụ kỹ thuật, không phải là sáng tạo.
    4.  **Nền trong suốt:** Nền gốc phải được thay thế bằng nền trong suốt 100%.
    5.  **Trạng thái cuối cùng:** Kết quả phải giống như một bức ảnh "ma nơ canh ẩn" hoặc "chụp phẳng" của trang phục, sẵn sàng để sử dụng cho thương mại điện tử.
    6.  **Yêu cầu Yêu cầu Tỷ lệ khung hình:** Hình ảnh đầu ra BẮT BUỘC phải có tỷ lệ khung hình dọc 9:16. Nếu trang phục được tách ra không tự nhiên phù hợp với tỷ lệ này, bạn BẮT BUỘC phải thêm phần đệm trong suốt để đạt được kích thước chính xác. BẠN BỊ CẤM kéo dài, cắt xén hoặc làm biến dạng trang phục để vừa với tỷ lệ.
    7.  **Định dạng đầu ra:** Hình ảnh cuối cùng phải là tệp PNG chất lượng cao, hỗ trợ độ trong suốt hoàn toàn.

    **Tóm tắt Thực thi:**
    -   Bước 1: Tách riêng trang phục.
    -   Bước 2: Xóa hoàn toàn người.
    -   Bước 3: Xóa hoàn toàn nền.
    -   Bước 4: Đảm bảo trang phục giống hệt 100% so với bản gốc.
    -   Bước 5: Định dạng PNG cuối cùng theo tỷ lệ 9:16 với nền trong suốt.
    
    Việc không tuân thủ bất kỳ điểm nào trong số này, đặc biệt là việc loại bỏ người mẫu và độ trung thực của sản phẩm, sẽ dẫn đến nhiệm vụ thất bại.
  `;

  const textPart = { text: prompt };

  const content = {
    parts: [imagePart, textPart],
  };

  const response = await ai.models.generateContent({
    model,
    contents: content,
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  if (response.candidates && response.candidates.length > 0) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  }

  throw new Error("The AI did not return an image. Please try again.");
};

export const separateObjects = async (
  imageFile: File,
  onProgress: (message: string) => void
): Promise<{ name: string; image: string }[]> => {
  onProgress('Đang nhận diện các vật thể...');

  const { data: b64Data, mimeType } = await fileToBase64(imageFile);
  const imagePart = { inlineData: { data: b64Data, mimeType } };

  // Step 1: Detect items
  const detectionModel = 'gemini-2.5-flash';
  const detectionSchema = {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          description: 'The name of a single object, item, or product in Vietnamese (e.g., "máy tính xách tay", "cốc cà phê").'
        }
      }
    },
    required: ['items']
  };

  const detectionPrompt = `CRITICAL TASK: Analyze the provided image. Your goal is to identify EVERY SINGLE distinct object, item, or product present.

**Instructions & Constraints:**
1.  **Output Format:** You MUST return a JSON object with a single key "items". The value for "items" MUST be an array of strings.
2.  **Language:** Each string in the array must be the Vietnamese name for one distinct item.
3.  **Decomposition:** You MUST list all items separately. For example, if there is a laptop and a mouse, the output MUST be \`["máy tính xách tay", "chuột máy tính"]\`, NOT \`["bộ máy tính"]\`.
4.  **Thoroughness:** Be extremely thorough. Identify all significant objects in the foreground and midground. Ignore minor background elements unless they are clearly products.
5.  **Specificity:** Be as specific as possible with the names. For example, use "điện thoại iPhone 15 Pro" instead of just "điện thoại".

**Example Input/Output:**
*   Input: Image of a desk with a laptop, a coffee mug, and a notebook.
*   Output: \`{"items": ["máy tính xách tay", "cốc cà phê", "sổ tay"]}\`

Now, analyze the provided image and generate the JSON output.`;
  
  const detectionResponse = await ai.models.generateContent({
    model: detectionModel,
    contents: { parts: [imagePart, { text: detectionPrompt }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: detectionSchema,
    },
  });

  const detectedItems = JSON.parse(detectionResponse.text.trim()).items as string[];
  if (!detectedItems || detectedItems.length === 0) {
    throw new Error("Không thể nhận diện được vật thể nào trong ảnh.");
  }

  // Step 2: Segment each item
  const segmentationModel = 'gemini-2.5-flash-image-preview';
  const results: { name: string; image: string }[] = [];

  for (let i = 0; i < detectedItems.length; i++) {
    const item = detectedItems[i];
    onProgress(`Đang tách vật thể ${i + 1}/${detectedItems.length}: ${item}`);
    
    const segmentationPrompt = `From the original image provided, your specific task is to perfectly and completely isolate ONLY the object named '${item}'. Create a new image containing ONLY this single object. You MUST remove the background and all other objects. The final output must be a high-quality PNG image with a fully transparent background. Do not alter the isolated '${item}' in any way (shape, color, texture). Do not add padding or change its aspect ratio.`;
    
    const segmentationResponse = await ai.models.generateContent({
      model: segmentationModel,
      contents: { parts: [imagePart, { text: segmentationPrompt }] },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    if (segmentationResponse.candidates && segmentationResponse.candidates.length > 0) {
      const part = segmentationResponse.candidates[0].content.parts.find(p => p.inlineData);
      if (part && part.inlineData) {
        results.push({
          name: item,
          image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
        });
      }
    }
  }

  if (results.length === 0) {
      throw new Error("Tách vật thể thất bại. Vui lòng thử lại.");
  }

  return results;
};
