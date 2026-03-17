"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { parseOCRText, AadhaarData } from "@/lib/parseAadhaar";
import ResultCard from "@/components/ResultCard";

type ScanState = "idle" | "preview" | "processing" | "done" | "error";

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState<AadhaarData | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setScanState("preview");
    setResult(null);
    setCapturedImage(null);

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
    } catch {
      setScanState("error");
      setStatusMsg("Camera access denied. Please allow camera permission and use HTTPS.");
    }
  }, []);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    stopCamera();
    setCapturedImage(dataUrl);
    setScanState("processing");
    setStatusMsg("Reading text from card…");

    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(dataUrl, "eng+hin", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setStatusMsg(`OCR: ${Math.round((m.progress ?? 0) * 100)}%`);
          }
        },
      });
      console.log("[OCR] raw text:", data.text);
      setResult(parseOCRText(data.text));
      setScanState("done");
    } catch {
      setScanState("error");
      setStatusMsg("OCR failed. Try again with better lighting.");
    }
  }, [stopCamera]);

  const reset = useCallback(() => {
    stopCamera();
    setResult(null);
    setCapturedImage(null);
    setScanState("idle");
    setStatusMsg("");
  }, [stopCamera]);

  return (
    <div className="w-full max-w-md flex flex-col gap-4">

      {/* Live camera preview */}
      {scanState === "preview" && (
        <div className="flex flex-col gap-3">
          <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute top-0 left-0 right-0 text-center text-xs py-2 bg-black/50 text-gray-300">
              Hold the front of the Aadhaar card steady
            </div>
          </div>
          <button
            onClick={capture}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl text-lg transition-colors"
          >
            Capture Card
          </button>
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Processing */}
      {scanState === "processing" && (
        <div className="flex flex-col gap-4">
          {capturedImage && (
            <img src={capturedImage} alt="Captured card" className="rounded-xl w-full object-cover opacity-60" />
          )}
          <div className="bg-gray-800 rounded-xl p-6 text-center flex flex-col items-center gap-3">
            <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-300">{statusMsg}</p>
          </div>
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
        <div className="flex flex-col gap-3">
          <button
            onClick={startCamera}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl text-lg transition-colors"
          >
            Scan Aadhaar Card
          </button>
          <p className="text-center text-xs text-gray-500">
            Point camera at the front of the card · keep it flat and well-lit
          </p>
        </div>
      )}
    </div>
  );
}
