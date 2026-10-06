import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MeasurementShape } from '../measurement/types';
import type { NormalizedBox } from './cameraOptics';

const AI_API_KEY_STORAGE = '@measure_app_ai_api_key';
export const DEFAULT_AI_API_KEY = 'AQ.Ab8RN6LVHqz0jCUSIhl_5Yo8GnAtOYcGPfRqxA-FlMTH-hcK8Q';

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

export async function getSavedAiApiKey(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(AI_API_KEY_STORAGE);
    return saved?.trim() || DEFAULT_AI_API_KEY;
  } catch {
    return DEFAULT_AI_API_KEY;
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
 * Sends a captured frame to Google Gemini Flash to identify the object,
 * classify its geometry, and estimate its physical dimensions.
 */
export async function identifyObjectWithAiVision(
  base64Image: string,
  customApiKey?: string,
): Promise<AiObjectDetectionResult | undefined> {
  const apiKey = (customApiKey || (await getSavedAiApiKey()))?.trim() || DEFAULT_AI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  // Strip potential data URL prefix
  const cleanBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  const prompt = `You are a precision computer vision, spatial AI, and 3D geometric measurement engine.
Analyze this photo taken by a smartphone camera. Identify the primary foreground object or container in the frame.
Look closely at the object's real-world identity, category, and standard physical dimensions (e.g. shipping box, soda can, laptop, water bottle, phone, book, carton).
Calculate realistic physical dimensions in centimeters (width, length, height), its 2D normalized bounding box, and geometric shape classification.

Return a STRICT JSON response with no markdown fences, no preamble, and no explanation:
{
  "objectName": "Precise name of the physical object (e.g. Shipping Box, Soda Can, Water Bottle, Book, Mobile Phone)",
  "shape": "circle" | "square" | "rectangle" | "cylinder" | "cuboid" | "sphere",
  "shapeCategory": "2d_planar" | "3d_volumetric",
  "boundingBox": { "x": 0.0 to 1.0, "y": 0.0 to 1.0, "width": 0.0 to 1.0, "height": 0.0 to 1.0 },
  "dimensionsCm": { "width": number in cm, "length": number in cm, "height": number in cm },
  "confidence": 0.0 to 1.0,
  "rationale": "Short 1-sentence geometric explanation"
}`;

  // Prefer the primary flash model first; lite often stalls on vision payloads.
  const CANDIDATE_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
  ];
  const REQUEST_TIMEOUT_MS = 25000;

  let candidateText: string | undefined;

  for (const modelName of CANDIDATE_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      console.log(`[AI Vision] Sending camera frame to model: ${modelName}...`);
      const startTime = Date.now();

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
        signal: controller.signal,
      });

      const elapsedMs = Date.now() - startTime;

      if (!response.ok) {
        console.warn(`[AI Vision] ${modelName} returned HTTP ${response.status} (${elapsedMs}ms). Checking fallback...`);
        // If 503, 429, 404, or 400 continue to next model
        continue;
      }

      const data = await response.json();
      candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidateText) {
        console.log(`[AI Vision] Success from ${modelName} in ${elapsedMs}ms`);
        break;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isAbort =
        (err instanceof Error && err.name === 'AbortError') ||
        errMsg.toLowerCase().includes('aborted') ||
        errMsg.toLowerCase().includes('canceled') ||
        errMsg.toLowerCase().includes('cancelled');
      if (isAbort) {
        console.warn(
          `[AI Vision] Request to ${modelName} timed out (${REQUEST_TIMEOUT_MS / 1000}s limit). Trying fallback...`,
        );
      } else {
        console.warn(`[AI Vision] Network error on ${modelName}:`, errMsg);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!candidateText) {
    console.warn('[AI Vision] All Gemini candidate models failed or returned empty. Falling back to local vision.');
    return undefined;
  }

  try {
    const raw = JSON.parse(candidateText);
    const parsed = Array.isArray(raw) ? raw[0] : raw;

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

    const shape = validShapes.includes(parsed?.shape) ? (parsed.shape as MeasurementShape) : 'cuboid';
    const shapeCategory =
      parsed?.shapeCategory === '2d_planar' || parsed?.shapeCategory === '3d_volumetric'
        ? parsed.shapeCategory
        : shape === 'circle' || shape === 'square' || shape === 'rectangle'
          ? '2d_planar'
          : '3d_volumetric';

    let bX = Number(parsed?.boundingBox?.x) || 0.2;
    let bY = Number(parsed?.boundingBox?.y) || 0.2;
    let bW = Number(parsed?.boundingBox?.width) || 0.6;
    let bH = Number(parsed?.boundingBox?.height) || 0.6;

    // Normalize coordinates if the model returned pixel numbers (e.g., > 1.5)
    if (bW > 1.5 || bH > 1.5 || bX > 1.5 || bY > 1.5) {
      const maxDim = Math.max(bX + bW, bY + bH, 1000);
      bX = bX / maxDim;
      bY = bY / maxDim;
      bW = bW / maxDim;
      bH = bH / maxDim;
    }

    const result: AiObjectDetectionResult = {
      boundingBox: {
        height: Math.max(0.05, Math.min(0.95, bH)),
        width: Math.max(0.05, Math.min(0.95, bW)),
        x: Math.max(0.01, Math.min(0.9, bX)),
        y: Math.max(0.01, Math.min(0.9, bY)),
      },
      confidence: Math.max(0.5, Math.min(0.99, Number(parsed?.confidence) || 0.9)),
      dimensionsCm: {
        height: Math.max(0.1, Number(parsed?.dimensionsCm?.height) || 5),
        length: Math.max(0.1, Number(parsed?.dimensionsCm?.length) || 10),
        width: Math.max(0.1, Number(parsed?.dimensionsCm?.width) || 10),
      },
      objectName: String(parsed?.objectName || 'Detected Object'),
      rationale: String(parsed?.rationale || 'AI identified object and shape properties from camera view.'),
      shape,
      shapeCategory,
    };

    console.log(`[AI Vision] Result: ${result.objectName} (${result.shape}) -> ${result.dimensionsCm.length} x ${result.dimensionsCm.width} x ${result.dimensionsCm.height} cm`);
    return result;
  } catch (err) {
    console.error('[AI Vision] Exception during visual reasoning:', err);
    return undefined;
  }
}
