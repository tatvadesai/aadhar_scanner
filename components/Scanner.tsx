"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { parseQRText, parseOCRText, AadhaarData } from "@/lib/parseAadhaar";
import ResultCard from "@/components/ResultCard";

type ScanState = "idle" | "scanning" | "processing" | "done" | "error";

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef = useRef<any>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState<AadhaarData | null>(null);

  const stopCamera = useCallback(() => {
    try { readerRef.current?.reset(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const runOCR = useCallback(async (imageDataUrl: string) => {
    setStatusMsg("QR not detected — running OCR…");
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(imageDataUrl, "eng+hin", {
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
  }, []);

  const captureAndOCR = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);

    stopCamera();
    setScanState("processing");
    runOCR(canvas.toDataURL("image/jpeg", 0.95));
  }, [stopCamera, runOCR]);

  const startCamera = useCallback(async () => {
    setScanState("scanning");
    setResult(null);
    setStatusMsg("Point at the QR code on the back of Aadhaar");

    try {
      // Get camera stream — prefer back camera, high res for QR
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

      // Use ZXing for continuous QR detection
      const { BrowserQRCodeReader, IScannerControls } = await import("@zxing/browser");
      void IScannerControls; // just for type import
      const reader = new BrowserQRCodeReader();
      readerRef.current = reader;

      reader.decodeFromVideoElement(video, (result, err, controls) => {
        if (result) {
          const parsed = parseQRText(result.getText());
          if (parsed) {
            controls.stop();
            stopCamera();
            setResult(parsed);
            setScanState("done");
          }
        }
        // err is just "no QR found yet" — ignore it
        void err;
      });
    } catch (e) {
      console.error(e);
      setScanState("error");
      setStatusMsg("Camera access denied. Please allow camera permission.");
    }
  }, [stopCamera]);

  const reset = () => {
    stopCamera();
    setResult(null);
    setScanState("idle");
    setStatusMsg("");
  };

  return (
    <div className="w-full max-w-md flex flex-col gap-4">
      {/* Camera view */}
      {scanState === "scanning" && (
        <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {/* Targeting overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-56 h-56">
              {/* Corner markers */}
              <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-sm" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-sm" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-sm" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-sm" />
            </div>
          </div>
          <div className="absolute top-3 left-0 right-0 text-center text-xs text-blue-300 bg-black/40 py-1">
            {statusMsg}
          </div>
          <button
            onClick={captureAndOCR}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-black font-semibold px-5 py-2 rounded-full text-sm shadow-lg"
          >
            No QR? Capture for OCR
          </button>
        </div>
      )}

      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Processing */}
      {scanState === "processing" && (
        <div className="bg-gray-800 rounded-xl p-6 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3" />
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

      {/* Start */}
      {scanState === "idle" && (
        <div className="flex flex-col gap-3">
          <button
            onClick={startCamera}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl text-lg transition-colors"
          >
            Scan QR Code (Back of Card)
          </button>
          <p className="text-center text-xs text-gray-500">
            No QR? Use &quot;Capture for OCR&quot; after starting camera
          </p>
        </div>
      )}
    </div>
  );
}
