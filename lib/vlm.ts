/**
 * SmolVLM-256M-Instruct inference via @huggingface/transformers raw API.
 * Uses AutoProcessor + AutoModelForVision2Seq directly — bypasses the
 * pipeline registry which doesn't yet include image-text-to-text.
 *
 * Model weights (~200MB q4 quantized) download from HuggingFace CDN on
 * first use, then cached in browser Cache API permanently.
 *
 * Last updated: 2026-03-18
 */

import {
  AutoProcessor,
  AutoModelForVision2Seq,
  RawImage,
  env,
} from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "HuggingFaceTB/SmolVLM-256M-Instruct";

type ProgressCallback = (msg: string) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let processor: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeProgressCb(onProgress?: ProgressCallback): (info: any) => void {
  return (info) => {
    if (!onProgress) return;
    if (info.status === "downloading" && info.total) {
      const pct = Math.round((info.loaded / info.total) * 100);
      onProgress(`Downloading model: ${pct}%`);
    } else if (info.status === "loading") {
      onProgress("Loading model into memory…");
    }
  };
}

export async function loadVLM(onProgress?: ProgressCallback): Promise<void> {
  if (processor && model) return;

  onProgress?.(
    "Loading SmolVLM — first time takes ~30s (downloads ~200MB, then cached)…"
  );

  [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback: makeProgressCb(onProgress),
    }),
    AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
      dtype: "q4",
      progress_callback: makeProgressCb(onProgress),
    }),
  ]);
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
- If a field is not visible or unreadable use ""
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

  const image = await RawImage.fromURL(imageDataUrl);

  const messages = [
    {
      role: "user",
      content: [
        { type: "image" },
        { type: "text", text: AADHAAR_PROMPT },
      ],
    },
  ];

  const text = processor.apply_chat_template(messages, {
    add_generation_prompt: true,
  });

  const inputs = await processor(text, [image], { return_tensors: "pt" });

  const generatedIds = await model.generate({
    ...inputs,
    max_new_tokens: 256,
  });

  // Slice off the prompt tokens — keep only the generated part
  const newTokens = generatedIds.slice(null, [inputs.input_ids.dims[1], null]);
  const decoded: string[] = processor.batch_decode(newTokens, {
    skip_special_tokens: true,
  });

  const raw = decoded[0] ?? "";
  console.log("[VLM] raw output:", raw);

  // Extract JSON — model sometimes wraps in markdown fences
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
    throw new Error("Failed to parse model JSON. Raw: " + raw);
  }
}
