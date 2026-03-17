"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { parseQRText, parseOCRText, AadhaarData } from "@/lib/parseAadhaar";
import ResultCard from "@/components/ResultCard";

type ScanState = "idle" | "qr-scan" | "ask-front" | "ocr-processing" | "done" | "error";

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState<AadhaarData | null>(null);

  const stopCamera = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.95);
  }, []);

  const startQRLoop = useCallback(async () => {
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader();

    tickRef.current = setInterval(async () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || video.readyState < video.HAVE_ENOUGH_DATA) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);

      try {
        const qrResult = await reader.decodeFromCanvas(canvas);
        if (qrResult) {
          const parsed = parseQRText(qrResult.getText());
          if (parsed) {
            if (tickRef.current) clearInterval(tickRef.current);
            stopCamera();
            setResult(parsed);
            setScanState("done");
          }
        }
      } catch {
        // No QR found in this frame — normal, keep trying
      }
    }, 400);
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setScanState("qr-scan");
    setResult(null);
    setStatusMsg("Scanning for QR code…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      startQRLoop();
    } catch {
      setScanState("error");
      setStatusMsg("Camera access denied. Please allow camera permission.");
    }
  }, [startQRLoop]);

  const qrFailed = useCallback(() => {
    // Keep camera running, switch to front-side OCR mode
    if (tickRef.current) clearInterval(tickRef.current);
    setScanState("ask-front");
    setStatusMsg("Flip the card — point camera at the front");
  }, []);

  const runOCR = useCallback(async () => {
    const dataUrl = captureFrame();
    if (!dataUrl) return;

    stopCamera();
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
  }, [captureFrame, stopCamera]);

  const reset = useCallback(() => {
    stopCamera();
    setResult(null);
    setScanState("idle");
    setStatusMsg("");
  }, [stopCamera]);

  const showingCamera = scanState === "qr-scan" || scanState === "ask-front";

  return (
    <div className="w-full max-w-md flex flex-col gap-4">

      {/* Camera — shown during both QR scan and ask-front stages */}
      {showingCamera && (
        <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

          {/* Overlay for QR targeting */}
          {scanState === "qr-scan" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-52 h-52">
                <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-blue-400" />
                <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-blue-400" />
                <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-blue-400" />
                <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-blue-400" />
              </div>
            </div>
          )}

          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 text-center text-xs py-2 bg-black/50">
            {scanState === "qr-scan" && <span className="text-blue-300">🔍 {statusMsg}</span>}
            {scanState === "ask-front" && <span className="text-yellow-300">📷 {statusMsg}</span>}
          </div>

          {/* Bottom actions */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2 pb-4 bg-gradient-to-t from-black/70 to-transparent pt-6">
            {scanState === "qr-scan" && (
              <>
                <p className="text-xs text-gray-300">Point at the QR on the back of the card</p>
                <button
                  onClick={qrFailed}
                  className="bg-white/20 hover:bg-white/30 text-white text-sm px-4 py-2 rounded-full border border-white/40 transition-colors"
                >
                  QR not working? Use front side
                </button>
              </>
            )}
            {scanState === "ask-front" && (
              <>
                <p className="text-xs text-yellow-200">Show the front of the Aadhaar card clearly</p>
                <button
                  onClick={runOCR}
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm px-6 py-2 rounded-full transition-colors"
                >
                  Capture & Extract Text
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* OCR Processing */}
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

      {/* Idle start */}
      {scanState === "idle" && (
        <button
          onClick={startCamera}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl text-lg transition-colors"
        >
          Start Scanning
        </button>
      )}
    </div>
  );
}
