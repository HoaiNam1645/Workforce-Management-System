'use client';

import { Camera, CameraOff, Check, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect(source: CanvasImageSource): Promise<unknown[]>;
};

type SelfieCaptureDialogProps = {
  action: 'check_in' | 'check_out';
  errorMessage?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (selfie: Blob) => void;
};

function frameQuality(canvas: HTMLCanvasElement) {
  const analysis = document.createElement('canvas');
  analysis.width = 160;
  analysis.height = 120;
  const context = analysis.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Không thể kiểm tra chất lượng ảnh');
  context.drawImage(canvas, 0, 0, analysis.width, analysis.height);
  const pixels = context.getImageData(0, 0, analysis.width, analysis.height).data;
  const grayscale = new Uint8Array(analysis.width * analysis.height);
  let brightness = 0;
  for (let source = 0, target = 0; source < pixels.length; source += 4, target += 1) {
    const value = Math.round((pixels[source] * 0.299) + (pixels[source + 1] * 0.587) + (pixels[source + 2] * 0.114));
    grayscale[target] = value;
    brightness += value;
  }
  const averageBrightness = brightness / grayscale.length;
  if (averageBrightness < 15) throw new Error('Ảnh quá tối nên chưa nhìn rõ khuôn mặt. Hãy bật thêm ánh sáng và chụp lại.');
  if (averageBrightness > 248) throw new Error('Ảnh bị trắng sáng nên chưa nhìn rõ khuôn mặt. Hãy chụp lại.');
}

export function SelfieCaptureDialog({ action, errorMessage, isSubmitting, onClose, onConfirm }: SelfieCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [captured, setCaptured] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCameraError('');
    setCaptureError('');
    setIsCameraReady(false);

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Trình duyệt không hỗ trợ mở camera. Hãy dùng Safari hoặc Chrome và truy cập bằng HTTPS.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 960, min: 480 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsCameraReady(true);
        }
      } catch {
        setCameraError('Không thể mở camera trước. Hãy cấp quyền camera cho trình duyệt rồi thử lại.');
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [restartKey]);

  useEffect(() => () => {
    if (captured) URL.revokeObjectURL(captured.url);
  }, [captured]);

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 320 || video.videoHeight < 240) {
      setCaptureError('Camera chưa sẵn sàng hoặc độ phân giải quá thấp. Hãy thử lại.');
      return;
    }
    setCaptureError('');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCaptureError('Không thể chụp ảnh từ camera.');
      return;
    }
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      frameQuality(canvas);
      const FaceDetector = (window as Window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
      if (FaceDetector) {
        let faceFound: boolean | null = null;
        try {
          faceFound = (await new FaceDetector({ fastMode: true, maxDetectedFaces: 2 }).detect(canvas)).length > 0;
        } catch {
          faceFound = null;
        }
        if (faceFound === false) throw new Error('Không nhận diện được khuôn mặt. Hãy nhìn thẳng vào camera và chụp lại.');
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Không thể tạo ảnh selfie')), 'image/jpeg', 0.88);
      });
      setCaptured((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Ảnh selfie chưa đạt yêu cầu.');
    }
  };

  const retake = () => {
    setCaptured((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setCaptureError('');
  };

  const retryCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRestartKey((value) => value + 1);
  };

  const actionLabel = action === 'check_in' ? 'Check-in' : 'Check-out';

  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/70 backdrop-blur-sm sm:items-center sm:p-5">
    <button aria-label="Đóng camera" className="absolute inset-0" disabled={isSubmitting} onClick={onClose} />
    <section className="relative z-10 flex max-h-[96vh] w-full max-w-xl flex-col overflow-hidden border border-white/20 bg-[#07182d] text-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-white/10 px-4 py-4 sm:px-5">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-300">Xác thực bằng selfie</p><h2 className="mt-1 text-lg font-black">Chụp ảnh để {actionLabel.toLowerCase()}</h2><p className="mt-1 text-xs text-white/55">Ảnh cần nhìn rõ khuôn mặt.</p></div>
        <button className="grid size-9 shrink-0 place-items-center text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40" disabled={isSubmitting} onClick={onClose}><X className="size-5" /></button>
      </header>

      <div className="relative min-h-[360px] flex-1 overflow-hidden bg-black sm:min-h-[430px]">
        <video ref={videoRef} muted playsInline className={`h-full min-h-[360px] w-full object-cover -scale-x-100 sm:min-h-[430px] ${captured ? 'invisible' : ''}`} />
        {captured && <img src={captured.url} alt="Ảnh selfie vừa chụp" className="absolute inset-0 h-full w-full object-cover" />}
        {!captured && !cameraError && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[68%] w-[58%] max-w-[260px] border-2 border-dashed border-white/75" /><p className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/55 px-3 py-1.5 text-xs font-bold">Đặt khuôn mặt vào giữa khung</p></div>}
        {cameraError && <div className="absolute inset-0 grid place-items-center bg-[#07182d] p-8 text-center"><div><CameraOff className="mx-auto size-9 text-red-300" /><p className="mt-4 text-sm font-extrabold">Không mở được camera</p><p className="mt-2 text-xs leading-5 text-white/60">{cameraError}</p><Button className="mt-5" variant="outline" onClick={retryCamera}><RefreshCw className="size-4" />Thử mở lại</Button></div></div>}
      </div>

      <div className="border-t border-white/10 bg-[#0b203a] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-xs text-white/60"><ShieldCheck className="size-4 text-blue-300" />Chỉ cần đặt khuôn mặt trong khung và nhìn rõ là được.</div>
        {(captureError || errorMessage) && <p className="mb-4 border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-200">{captureError || errorMessage}</p>}
        {captured ? <div className="grid grid-cols-2 gap-3"><Button variant="outline" disabled={isSubmitting} onClick={retake}><RefreshCw className="size-4" />Chụp lại</Button><Button variant="brand" loading={isSubmitting} loadingText={`Đang ${actionLabel.toLowerCase()}...`} onClick={() => onConfirm(captured.blob)}><Check className="size-4" />Dùng ảnh này</Button></div> : <Button className="h-12 w-full" variant="brand" disabled={!isCameraReady || Boolean(cameraError)} onClick={() => void takePhoto()}><Camera className="size-5" />Chụp selfie</Button>}
      </div>
    </section>
  </div>;
}
