/**
 * SmolVLM-256M-Instruct inference via transformers.js
 * Runs entirely in-browser — no API, no server.
 * Model weights (~200MB) download from HuggingFace CDN on first use,
 * then cached in browser's Cache API.
 *
 * Last updated: 2026-03-18
 */

import { pipeline, env } from "@huggingface/transformers";

// Always fetch from HuggingFace CDN — do not look for local model files
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "HuggingFaceTB/SmolVLM-256M-Instruct";

type ProgressCallback = (msg: string) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipe: any = null;

export async function loadVLM(onProgress?: ProgressCallback): Promise<void> {
  if (pipe) return;

  onProgress?.("Loading model — first time takes ~30s (downloads ~200MB, then cached)…");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipe = await (pipeline as any)("image-text-to-text", MODEL_ID, {
    dtype: "q4", // 4-bit quantized — smaller download, faster inference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    progress_callback: (info: any) => {
      if (info.status === "downloading" && info.total) {
        const pct = Math.round((info.loaded / info.total) * 100);
        onProgress?.(`Downloading model: ${pct}%`);
      } else if (info.status === "loading") {
        onProgress?.("Loading model into memory…");
      }
    },
  });
}

const AADHAAR_PROMPT = `You are extracting data from an Indian Aadhaar card image.
Return ONLY a valid JSON object — no explanation, no markdown, no extra text.

{
  "name": "full name in English",
  "aadhaar_number": "12-digit number formatted as XXXX XXXX XXXX",
  "dob": "date of birth as DD/MM/YYYY",
  "gender": "Male or Female",
  "address": "full address if visible, else empty string"
}

Rules:
- Hindi labels: नाम = name, जन्म तिथि = DOB, पुरुष = Male, महिला = Female
- Aadhaar number is always 12 digits, may appear as XXXX XXXX XXXX
- If a field is not visible or unreadable, use ""
- Return ONLY the raw JSON object, nothing else`;

export interface VLMResult {
  name: string;
  aadhaar_number: string;
  dob: string;
  gender: string;
  address: string;
  raw: string;
}

export async function extractFromImage(
  imageDataUrl: string,
  onProgress?: ProgressCallback
): Promise<VLMResult> {
  await loadVLM(onProgress);

  onProgress?.("Analysing card…");

  const messages = [
    {
      role: "user",
      content: [
        { type: "image", url: imageDataUrl },
        { type: "text", text: AADHAAR_PROMPT },
      ],
    },
  ];

  const output = await pipe(messages, { max_new_tokens: 256 });

  // transformers.js v3: output[0].generated_text is array of turns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const turns: any[] = output?.[0]?.generated_text ?? [];
  const lastTurn = turns.at(-1);
  const raw: string =
    typeof lastTurn?.content === "string"
      ? lastTurn.content
      : JSON.stringify(lastTurn?.content ?? "");

  console.log("[VLM] raw output:", raw);

  // Extract JSON from the response (model sometimes wraps it in markdown)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Model did not return valid JSON. Raw: " + raw);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      name: parsed.name ?? "",
      aadhaar_number: parsed.aadhaar_number ?? "",
      dob: parsed.dob ?? "",
      gender: parsed.gender ?? "",
      address: parsed.address ?? "",
      raw,
    };
  } catch {
    throw new Error("Failed to parse JSON from model output. Raw: " + raw);
  }
}
