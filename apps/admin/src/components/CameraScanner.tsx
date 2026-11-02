import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Modal } from './ui';
import { Icon } from './Icons';

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onDetected: (text: string) => void;
};

const CAMERA_ERROR: Record<string, string> = {
  NotAllowedError: '浏览器没有摄像头权限。请在地址栏的权限设置里允许摄像头，或改用扫码枪/手动输入。',
  PermissionDeniedError: '浏览器没有摄像头权限。请允许摄像头后重试，或改用扫码枪/手动输入。',
  NotFoundError: '没有找到可用摄像头。请连接摄像头，或改用扫码枪/手动输入。',
  DevicesNotFoundError: '没有找到可用摄像头。请连接摄像头，或改用扫码枪/手动输入。',
  NotReadableError: '摄像头正被其他应用占用。关闭视频会议等应用后重试。',
  OverconstrainedError: '当前设备不支持后置摄像头，已尝试切换，请重试。'
};

/**
 * 后台摄像头扫码：浏览器内直接预览并识别二维码，识别成功即回填。
 * 只读取二维码内容，不保存照片；关闭弹窗或识别成功后立即释放摄像头。
 */
export function CameraScanner({
  open,
  title = '扫描二维码',
  description = '把二维码放入取景框，识别后自动填入。',
  onClose,
  onDetected
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectedRef = useRef(onDetected);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    detectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setStarting(true);
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let handled = false;

    const release = () => {
      window.clearInterval(timer);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };

    const fail = (message: string) => {
      if (cancelled) return;
      release();
      setStarting(false);
      setError(message);
    };

    const scanFrame = () => {
      if (cancelled || handled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        return;
      }
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      // 多数杯贴/提货码是深色码点配浅底，不启用反色以降低每帧开销。
      const result = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
      if (!result || !result.data) return;
      handled = true;
      release();
      setStarting(false);
      detectedRef.current(result.data.trim());
    };

    const start = async () => {
      if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        fail('摄像头只能在 HTTPS 或 localhost 下使用。请通过 HTTPS 访问后台，或改用扫码枪/手动输入。');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        fail('当前浏览器不支持摄像头调用。请使用 Chrome / Edge 等现代浏览器，或改用扫码枪/手动输入。');
        return;
      }
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
          });
        } catch (err) {
          const name = (err as DOMException)?.name || '';
          // 后置摄像头不可用时退回默认摄像头；权限类错误不再重试，避免重复弹窗。
          if (!['OverconstrainedError', 'NotFoundError', 'DevicesNotFoundError'].includes(name)) throw err;
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setStarting(false);
        timer = window.setInterval(scanFrame, 220);
      } catch (err) {
        const name = (err as DOMException)?.name || '';
        fail(CAMERA_ERROR[name] || '摄像头启动失败，请检查权限后重试，或改用扫码枪/手动输入。');
      }
    };

    void start();
    return () => {
      cancelled = true;
      release();
    };
  }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={<button type="button" className="btn" onClick={onClose}>关闭</button>}
    >
      <div className="camera-scanner">
        <video ref={videoRef} className="camera-view" muted playsInline aria-label="摄像头取景" />
        <div className="camera-corners" aria-hidden="true">
          <i /><i /><i /><i />
        </div>
        {starting && !error ? (
          <div className="camera-status">
            <Icon name="scan" size={18} /> 正在启动摄像头…
          </div>
        ) : null}
        {error ? (
          <div className="camera-status error" role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        ) : null}
        <canvas ref={canvasRef} hidden />
      </div>
      <p className="note">识别结果只用于当前输入框；不会保存照片。也可以继续用扫码枪扫描或手动输入。</p>
    </Modal>
  );
}

/** 输入框旁的摄像头按钮，统一尺寸与文案。 */
export function CameraScanButton({
  onClick,
  label = '摄像头扫码'
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="btn btn-sm btn-outline camera-scan-btn" onClick={onClick}>
      <Icon name="scan" size={14} /> {label}
    </button>
  );
}
