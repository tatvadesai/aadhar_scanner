# Aadhaar Scanner — Project Notes for Claude

## What This App Does
Web app (Next.js on Vercel) that scans Aadhaar cards via phone camera, extracts fields using OCR (Tesseract.js), lets users review/edit the data, then pushes it to a shared Google Sheet.

**Target users:** 3–4 people, ~50 cards/month
**Devices:** Phone browser (primary), desktop (secondary)

---

## Architecture

```
Phone Camera
     ↓
Scanner.tsx (captures image via getUserMedia)
     ↓
Tesseract.js (OCR, runs client-side — no server needed)
     ↓
parseAadhaar.ts (extracts Name, DOB, Gender, Aadhaar No, Pincode from raw OCR text)
     ↓
ResultCard.tsx (editable fields, user reviews before saving)
     ↓
[TODO] Google Apps Script endpoint (POST → writes to shared Google Sheet + saves image to Drive)
```

**Stack:** Next.js + TypeScript + Tailwind · Tesseract.js (OCR) · Vercel (hosting)

---

## QR Code — Tried & Abandoned

We attempted QR scanning as the primary extraction method. **Do not re-attempt without addressing the issues below.**

### What we tried
1. `jsQR` — failed silently on every frame, no detections
2. `@zxing/browser` (`decodeFromCanvas` in a 400ms interval loop) — threw `NotFoundException` on every frame
3. `html5-qrcode` — most robust library, but still failed in testing

### Why QR failed
1. **Testing on Mac webcam** — fixed-focus webcam can't reliably decode QR codes on laminated cards at any practical distance
2. **Secure QR format** — newer Aadhaar cards (post ~2017) use a compressed binary Secure QR (deflate + digital signature), not plain XML. Even when a library decodes the raw bytes, `parseQRText()` receives binary garbage and returns null. A proper Secure QR decoder is needed.
3. **HTTPS requirement** — phone browsers block camera on HTTP. Requires HTTPS even on local network (solved with `mkcert` + `local-ssl-proxy` on port 3443).

### If QR is revisited
- Implement a **Secure QR decoder**: decompress with zlib/pako, parse the binary structure per UIDAI spec
- Test only on **phone browser via HTTPS**, never on Mac webcam
- Old cards (pre-2017) use plain XML QR — `parseQRText()` handles those correctly already
- Use `html5-qrcode` — it's the most reliable browser QR library

---

## OCR Notes

- **Library:** Tesseract.js (client-side, no API needed)
- **Languages:** `eng+hin` (English + Hindi)
- **Works best on:** Clean, well-lit, straight-on photo of front of card
- **Known issues:**
  - Name appears mid-line with Hindi/junk chars — fixed with capitalized-word extraction
  - Aadhaar number OCR inconsistency — regex `\d{4}\s\d{4}\s\d{4}` covers spaced format
  - Address extraction not implemented yet (too noisy)
- **Consistency tip:** Capture on phone camera (not webcam) for reliable results

---

## Google Sheets Integration (TODO)

Plan: single Google Apps Script web app deployed as a public POST endpoint.
- No OAuth in the mobile app — just a `fetch()` POST with JSON data
- Apps Script writes a row to a shared Sheet and saves the card image to a shared Drive folder
- One Google account owns the Script — all 3–4 users share the same endpoint URL

---

## Dev Setup

```bash
npm run dev -- -H 0.0.0.0      # bind to all interfaces for phone testing
# For HTTPS on local network (camera requires HTTPS on phone):
local-ssl-proxy --source 3443 --target 3000 --cert cert.pem --key cert-key.pem
# Then open https://172.20.10.2:3443 on phone (IP may change per network)
```

Certs (`cert.pem`, `cert-key.pem`) are generated with `mkcert 172.20.10.2 localhost` — regenerate if IP changes.
