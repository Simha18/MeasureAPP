import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MeasurementShape } from '../measurement/types';
import type { NormalizedBox } from './cameraOptics';

const AI_API_KEY_STORAGE = '@measure_app_ai_api_key';

export type AiObjectDetectionResult = {
  objectName: string;
  shape: MeasurementShape;
  shapeCategory: '2d_planar' | '3d_volumetric';
  boundingBox: NormalizedBox;
  dimensionsCm: {
    width: number;
    length: number;
    height: number;
  };
  confidence: number;
  rationale: string;
};

export async function getSavedAiApiKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AI_API_KEY_STORAGE);
  } catch {
    return null;
  }
}

export async function saveAiApiKey(apiKey: string): Promise<void> {
  try {
    await AsyncStorage.setItem(AI_API_KEY_STORAGE, apiKey.trim());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Sends a captured frame to Google Gemini 1.5/2.0 Flash to identify the object,
 * classify its geometry, and estimate its physical dimensions.
 */
export async function identifyObjectWithAiVision(
  base64Image: string,
  customApiKey?: string,
): Promise<AiObjectDetectionResult | undefined> {
  const apiKey = (customApiKey || (await getSavedAiApiKey()))?.trim();
  if (!apiKey) {
    return undefined;
  }

  // Strip potential data URL prefix
  const cleanBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `You are a precision computer vision and 3D geometric measurement engine.
Analyze this photo taken by a smartphone camera. Look at the primary foreground object in the frame.
Return a STRICT JSON response with no markdown fences, no preamble, and no explanation:
{
  "objectName": "Name of the physical object (e.g. Soda Can, Laptop, Book, Coffee Mug, Box)",
  "shape": "circle" | "square" | "rectangle" | "cylinder" | "cuboid" | "sphere",
  "shapeCategory": "2d_planar" | "3d_volumetric",
  "boundingBox": { "x": 0.0 to 1.0, "y": 0.0 to 1.0, "width": 0.0 to 1.0, "height": 0.0 to 1.0 },
  "dimensionsCm": { "width": number in cm, "length": number in cm, "height": number in cm },
  "confidence": 0.0 to 1.0,
  "rationale": "Short 1-sentence geometric explanation"
}`;

  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: 'image/jpeg',
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      return undefined;
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return undefined;
    }

    const parsed = JSON.parse(candidateText);

    // Validate shape
    const validShapes: MeasurementShape[] = [
      'cuboid',
      'cylinder',
      'sphere',
      'cone',
      'ellipsoid',
      'polygon_prism',
      'sectioned',
      'rectangle',
      'square',
      'circle',
    ];

    const shape = validShapes.includes(parsed.shape) ? (parsed.shape as MeasurementShape) : 'cuboid';
    const shapeCategory =
      parsed.shapeCategory === '2d_planar' || parsed.shapeCategory === '3d_volumetric'
        ? parsed.shapeCategory
        : shape === 'circle' || shape === 'square' || shape === 'rectangle'
          ? '2d_planar'
          : '3d_volumetric';

    return {
      boundingBox: {
        height: Math.max(0.05, Math.min(0.95, Number(parsed.boundingBox?.height) || 0.4)),
        width: Math.max(0.05, Math.min(0.95, Number(parsed.boundingBox?.width) || 0.4)),
        x: Math.max(0.01, Math.min(0.9, Number(parsed.boundingBox?.x) || 0.3)),
        y: Math.max(0.01, Math.min(0.9, Number(parsed.boundingBox?.y) || 0.3)),
      },
      confidence: Math.max(0.5, Math.min(0.99, Number(parsed.confidence) || 0.9)),
      dimensionsCm: {
        height: Math.max(0.1, Number(parsed.dimensionsCm?.height) || 5),
        length: Math.max(0.1, Number(parsed.dimensionsCm?.length) || 10),
        width: Math.max(0.1, Number(parsed.dimensionsCm?.width) || 10),
      },
      objectName: String(parsed.objectName || 'Detected Object'),
      rationale: String(parsed.rationale || 'AI identified object and shape properties from camera view.'),
      shape,
      shapeCategory,
    };
  } catch {
    return undefined;
  }
}
