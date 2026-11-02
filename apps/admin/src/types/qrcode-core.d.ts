declare module 'qrcode/lib/core/qrcode' {
  export type QrCode = {
    modules: { size: number; data: Uint8Array | boolean[] };
  };
  const QRCore: {
    create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): QrCode;
  };
  export default QRCore;
}
