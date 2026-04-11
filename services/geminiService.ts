import { GoogleGenAI } from "@google/genai";
import { UploadedImage } from "../types";
import { getGeminiApiKey } from "./storageService";

export const generateBannerWithGemini = async (
  referenceImage: UploadedImage,
  productImage: UploadedImage,
  userPrompt: string,
  brandContent: string,
  aspectRatio: string,
  modelName: string,
  imageSize: string
): Promise<string> => {
  // Check localStorage first, then .env.local
  const localKey = getGeminiApiKey();
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  const apiKey = localKey || (envKey !== 'your_api_key_here' ? envKey : '');
  if (!apiKey) {
    throw new Error("Google API Key is missing. Please configure it in API Settings.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Remove data:image/...;base64, prefix for the API
  const cleanRefBase64 = referenceImage.base64.split(',')[1];
  const cleanProdBase64 = productImage.base64.split(',')[1];

  const promptText = `
    You are an expert graphic designer.
    Task: Create a high-quality professional advertising banner or poster.
    
    Inputs:
    1. STYLE REFERENCE IMAGE (First image provided): Strictly follow the composition, color palette, lighting, and typography style of this image.
    2. PRODUCT IMAGE (Second image provided): Seamlessly integrate this product into the design. The product is the main focus.
    
    Brand Messaging/Content: ${brandContent || "No specific brand content provided."}
    
    Additional User Instructions: ${userPrompt || "Make it look high-end and commercial."}
    
    Requirements:
    - The output must look like a finished marketing asset.
    - Maintain the product's integrity but blend it into the scene.
    - Do not just copy the reference pixel-for-pixel, but clone its "vibe" and layout structure for the new product.
    - If brand messaging is provided, incorporate it naturally into the design using appropriate typography.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
            { text: promptText },
            {
                inlineData: {
                    mimeType: referenceImage.mimeType,
                    data: cleanRefBase64
                }
            },
            {
                inlineData: {
                    mimeType: productImage.mimeType,
                    data: cleanProdBase64
                }
            }
        ]
      },
      config: {
        imageConfig: {
            aspectRatio: aspectRatio as any || "1:1",
            imageSize: imageSize as any || "1K"
        }
      },
    });

    // Extract image from response
    // gemini-3-pro-image-preview returns the image in the candidates content parts
    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }

    throw new Error("No image data found in response");

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};
