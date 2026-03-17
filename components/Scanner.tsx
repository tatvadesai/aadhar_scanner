"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import jsQR from "jsqr";
import { parseQRText, parseOCRText, AadhaarData } from "@/lib/parseAadhaar";
import ResultCard from "@/components/ResultCard";

type ScanState = "idle" | "scanning" | "processing" | "done" | "error";

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState<AadhaarData | null>(null);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const runOCR = useCallback(async (imageDataUrl: string) => {
    setStatusMsg("QR not found — running OCR (this may take a few seconds)…");
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(imageDataUrl, "eng+hin", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setStatusMsg(`OCR progress: ${Math.round((m.progress ?? 0) * 100)}%`);
          }
        },
      });
      const parsed = parseOCRText(data.text);
      setResult(parsed);
      setScanState("done");
    } catch {
      setScanState("error");
      setStatusMsg("OCR failed. Please try again with a clearer image.");
    }
  }, []);

  const captureAndProcess = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    stopCamera();
    setScanState("processing");
    setStatusMsg("Trying QR scan…");

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qrResult = jsQR(imageData.data, imageData.width, imageData.height);

    if (qrResult?.data) {
      const parsed = parseQRText(qrResult.data);
      if (parsed) {
        setResult(parsed);
        setScanState("done");
        return;
      }
    }

    // QR failed — run OCR
    runOCR(canvas.toDataURL("image/jpeg", 0.95));
  }, [stopCamera, runOCR]);

  const startCamera = useCallback(async () => {
    setScanState("scanning");
    setResult(null);
    setStatusMsg("Point camera at the Aadhaar QR code");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Auto QR scan loop
      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
          animFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imageData.data, imageData.width, imageData.height);

        if (qr?.data) {
          const parsed = parseQRText(qr.data);
          if (parsed) {
            stopCamera();
            setResult(parsed);
            setScanState("done");
            return;
          }
        }

        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch {
      setScanState("error");
      setStatusMsg("Camera access denied. Please allow camera permission.");
    }
  }, [stopCamera]);

  const reset = () => {
    setResult(null);
    setScanState("idle");
    setStatusMsg("");
  };

  return (
    <div className="w-full max-w-md flex flex-col gap-4">
      {/* Camera view */}
      {scanState === "scanning" && (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="border-2 border-blue-400 rounded-lg w-2/3 h-2/3 opacity-70" />
          </div>
          <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-blue-300">{statusMsg}</div>
          <button
            onClick={captureAndProcess}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-black font-semibold px-5 py-2 rounded-full text-sm shadow-lg"
          >
            Capture manually
          </button>
        </div>
      )}

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Processing state */}
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

      {/* Start button */}
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
