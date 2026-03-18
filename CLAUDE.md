# Aadhaar Scanner — Project Notes for Claude

**Last updated: 2026-03-18**

## What This App Does
Web app (Next.js on Vercel) that scans Aadhaar cards via phone camera, extracts fields
using an on-device vision LLM (SmolVLM-256M-Instruct via transformers.js), lets users
review/edit the data, then pushes it to a shared Google Sheet.

**Target users:** 3–4 people, ~50 cards/month
**Devices:** Phone browser (primary), desktop (secondary)

---

## Architecture

```
Phone Camera
     ↓
Scanner.tsx  (getUserMedia → canvas capture)
     ↓
lib/vlm.ts  (SmolVLM-256M-Instruct via @huggingface/transformers)
     ↓        runs 100% in browser — no server, no API key
     ↓        model weights ~200MB, downloaded from HuggingFace CDN
     ↓        cached in browser Cache API after first download
     ↓
Structured JSON  { name, aadhaar_number, dob, gender, address }
     ↓
ResultCard.tsx  (editable fields, user reviews before saving)
     ↓
[TODO] /api/save → Google Apps Script endpoint
        → writes row to shared Google Sheet
        → saves card image to shared Google Drive folder
```

**Stack:** Next.js 16 + TypeScript + Tailwind · @huggingface/transformers (SmolVLM) · Vercel

---

## Why SmolVLM Instead of Tesseract/Regex

Aadhaar cards come in 5+ varieties (original laminated, PVC, e-Aadhaar PDF, mAadhaar,
Aadhaar letter). Each has different layouts, font sizes, label languages, and field positions.
Regex-based extraction on raw OCR text fails across varieties. SmolVLM understands context:
- Knows पुरुष = Male, महिला = Female
- Understands field labels in Hindi and English
- Returns structured JSON regardless of card layout
- Handles mixed Hindi/English text naturally

---

## SmolVLM Integration Details

- **Model:** `HuggingFaceTB/SmolVLM-256M-Instruct`
- **Quantization:** `q4` (4-bit) — reduces download and speeds up inference
- **Task:** `image-text-to-text` pipeline via `@huggingface/transformers`
- **Model loading:** Pre-warmed on app start via `loadVLM()` in background
- **Inference:** `extractFromImage(dataUrl)` → `VLMResult` JSON
- **Headers required:** `COOP: same-origin` + `COEP: require-corp` for WASM SharedArrayBuffer
  (set in `next.config.ts`)

**Prompt strategy:** Single-shot structured extraction with explicit JSON schema +
Hindi label translations. Model must return raw JSON only (no markdown, no explanation).
JSON is extracted via regex `/{[\s\S]*}/` in case model wraps it in markdown fences.

**If SmolVLM accuracy is insufficient**, next step is **Gemini Flash Vision API**:
- `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash`
- Free tier: 1500 requests/day (50 cards/month = essentially free)
- Same JSON prompt structure, same ResultCard UI — just swap `lib/vlm.ts` call
- Requires `GEMINI_API_KEY` env var in Vercel dashboard

---

## QR Code — Tried & Abandoned (2026-03-18)

**Do not re-attempt without addressing the issues below.**

### What we tried
1. `jsQR` — failed silently on every frame
2. `@zxing/browser` (`decodeFromCanvas` loop) — NotFoundException on every frame
3. `html5-qrcode` — most robust library, still failed in testing

### Why QR failed
1. **Mac webcam** — fixed-focus, can't reliably decode QR on laminated cards
2. **Secure QR format** — newer Aadhaar cards use compressed binary Secure QR
   (deflate + digital signature), not plain XML. Parser gets binary garbage.
3. **HTTPS requirement** — phone browsers block camera on HTTP
   (solved with `mkcert` + `local-ssl-proxy` on port 3443)

### If QR is revisited
- Implement Secure QR decoder: decompress with pako/zlib, parse per UIDAI spec
- Test on **phone browser via HTTPS only** — never on Mac webcam
- Use `html5-qrcode` — most reliable browser QR library
- Old cards (pre-2017) use plain XML QR — `parseQRText()` logic still valid

---

## Google Sheets Integration (TODO)

Plan: single Google Apps Script web app deployed as a public POST endpoint.
- App sends `fetch()` POST with JSON fields + base64 image to the Apps Script URL
- Apps Script writes a row to shared Sheet + saves image to shared Drive folder
- One Google account owns the Script — all 3–4 users share the same endpoint URL
- No OAuth in the mobile app

---

## Dev Setup

```bash
# Dev server (bind to all interfaces for phone testing)
npm run dev -- -H 0.0.0.0

# For HTTPS on local network (camera requires HTTPS on phone):
local-ssl-proxy --source 3443 --target 3000 --cert cert.pem --key cert-key.pem
# Open https://172.20.10.2:3443 on phone (IP changes per network — check with ifconfig)

# Certs generated with:
mkcert 172.20.10.2 localhost
# Regenerate if local IP changes
```

**Note:** `cert.pem` and `cert-key.pem` are gitignored — regenerate locally if needed.
