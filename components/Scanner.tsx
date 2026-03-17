"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { parseQRText, parseOCRText, AadhaarData } from "@/lib/parseAadhaar";
import ResultCard from "@/components/ResultCard";

type ScanState = "idle" | "qr-scan" | "ask-front" | "ocr-processing" | "done" | "error";

const QR_ELEMENT_ID = "aadhaar-qr-reader";

export default function Scanner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrRef = useRef<any>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState<AadhaarData | null>(null);

  const stopQrScanner = useCallback(async () => {
    try {
      if (html5QrRef.current) {
        await html5QrRef.current.stop();
        html5QrRef.current = null;
      }
    } catch { /* ignore */ }
  }, []);

  const stopFrontCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopQrScanner();
      stopFrontCamera();
    };
  }, [stopQrScanner, stopFrontCamera]);

  // ── Stage 1: QR scan via html5-qrcode ──────────────────────────────────────
  const startQRScan = useCallback(async () => {
    setScanState("qr-scan");
    setResult(null);
    setStatusMsg("Point at the QR code on the back of the card");

    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(QR_ELEMENT_ID);
    html5QrRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          console.log("[QR] decoded:", decodedText);
          const parsed = parseQRText(decodedText);
          if (parsed) {
            stopQrScanner();
            setResult(parsed);
            setScanState("done");
          } else {
            console.warn("[QR] parsed as null, raw:", decodedText);
          }
        },
        () => { /* frame with no QR — ignore */ }
      );
    } catch (e) {
      console.error("[QR] start error:", e);
      setScanState("error");
      setStatusMsg("Camera access denied or not available.");
    }
  }, [stopQrScanner]);

  // ── Stage 2: Front-side OCR ─────────────────────────────────────────────────
  const switchToFrontOCR = useCallback(async () => {
    await stopQrScanner();
    setScanState("ask-front");
    setStatusMsg("Flip the card — show the front side clearly");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
    } catch {
      setScanState("error");
      setStatusMsg("Camera error. Please try again.");
    }
  }, [stopQrScanner]);

  const runOCR = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    stopFrontCamera();
    setScanState("ocr-processing");
    setStatusMsg("Running OCR…");

    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(dataUrl, "eng+hin", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setStatusMsg(`OCR: ${Math.round((m.progress ?? 0) * 100)}%`);
          }
        },
      });
      setResult(parseOCRText(data.text));
      setScanState("done");
    } catch {
      setScanState("error");
      setStatusMsg("OCR failed. Try again with better lighting.");
    }
  }, [stopFrontCamera]);

  const reset = useCallback(async () => {
    await stopQrScanner();
    stopFrontCamera();
    setResult(null);
    setScanState("idle");
    setStatusMsg("");
  }, [stopQrScanner, stopFrontCamera]);

  return (
    <div className="w-full max-w-md flex flex-col gap-4">

      {/* Stage 1: QR scanner — html5-qrcode mounts into this div */}
      {scanState === "qr-scan" && (
        <div className="flex flex-col gap-3">
          <div id={QR_ELEMENT_ID} className="rounded-xl overflow-hidden w-full" />
          <p className="text-center text-xs text-gray-400">{statusMsg}</p>
          <button
            onClick={switchToFrontOCR}
            className="w-full border border-gray-600 text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors"
          >
            QR not working? Use front side →
          </button>
        </div>
      )}

      {/* Stage 2: Front-side capture */}
      {scanState === "ask-front" && (
        <div className="flex flex-col gap-3">
          <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute top-0 left-0 right-0 text-center text-xs py-2 bg-black/50 text-yellow-300">
              {statusMsg}
            </div>
          </div>
          <button
            onClick={runOCR}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Capture & Extract Text
          </button>
        </div>
      )}

      {/* Hidden canvas for OCR capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* OCR processing */}
      {scanState === "ocr-processing" && (
        <div className="bg-gray-800 rounded-xl p-8 text-center flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-300">{statusMsg}</p>
        </div>
      )}

      {/* Result */}
      {scanState === "done" && result && (
        <ResultCard data={result} onReset={reset} />
      )}

      {/* Error */}
      {scanState === "error" && (
        <div className="bg-red-900/40 border border-red-600 rounded-xl p-4 text-center">
          <p className="text-red-300 text-sm mb-3">{statusMsg}</p>
          <button onClick={reset} className="text-sm underline text-red-300">Try again</button>
        </div>
      )}

      {/* Idle */}
      {scanState === "idle" && (
        <button
          onClick={startQRScan}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl text-lg transition-colors"
        >
          Start Scanning
        </button>
      )}
    </div>
  );
}
