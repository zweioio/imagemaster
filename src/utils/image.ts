import imageCompression from 'browser-image-compression';
import GIF from 'gif.js';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getImageDimensions = (input: string | File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof input === 'string' ? input : URL.createObjectURL(input);
    
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      if (typeof input !== 'string') URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
      if (typeof input !== 'string') URL.revokeObjectURL(url);
    };
    img.src = url;
  });
};

export const isAnimatedWebP = async (file: File): Promise<boolean> => {
  if (file.type !== 'image/webp') return false;
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer || buffer.byteLength < 30) {
          resolve(false);
          return;
        }
        
        const view = new DataView(buffer);
        // Check for 'RIFF'
        if (view.getUint32(0, false) !== 0x52494646) {
          resolve(false);
          return;
        }
        // Check for 'WEBP'
        if (view.getUint32(8, false) !== 0x57454250) {
          resolve(false);
          return;
        }
        // Check for 'VP8X' (Extended format, required for animation)
        if (view.getUint32(12, false) !== 0x56503858) {
          // If not VP8X, it's VP8 (simple lossy) or VP8L (simple lossless), which are not animated
          resolve(false);
          return;
        }
        
        // Check Animation Bit (Bit 1 of byte at offset 20)
        // 12 bytes RIFF header + 8 bytes VP8X chunk header = 20 bytes offset
        // The Flags byte is the first byte of VP8X data payload.
        // VP8X Chunk: ID(4) + Size(4) + Flags(4) + Width(3) + Height(3)
        // Flags is at offset 20.
        const flags = view.getUint8(20);
        // Animation bit is 0x02 (second bit)
        resolve((flags & 0x02) !== 0);
        
      } catch (err) {
        console.error('Error parsing WebP:', err);
        resolve(false);
      }
    };
    reader.onerror = () => resolve(false);
    // Read only first 32 bytes
    reader.readAsArrayBuffer(file.slice(0, 32));
  });
};

export const compressImage = async (imageFile: File, options: {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  fileType?: string;
  quality?: number;
  onProgress?: (progress: number) => void;
}): Promise<File> => {
  try {
    // 特殊处理 GIF 输出
    if (options.fileType === 'image/gif') {
      if (imageFile.type === 'image/gif') {
        // GIF -> GIF (Animated)
        // Should be handled by Sandbox (Gifsicle)
        console.warn('Animated GIF compression should be handled via Sandbox.');
        return imageFile;
      } else {
        // Other -> GIF (Static)
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.src = URL.createObjectURL(imageFile);
          img.onload = () => {
            // Map quality (0-1) to gif.js quality (1-30)
            const q = options.quality || 0.8;
            const gifQuality = Math.max(1, Math.round(30 * (1 - q)));
            
            // Calculate dimensions
            let width = img.width;
            let height = img.height;
            if (options.maxWidthOrHeight) {
               const scale = Math.min(1, options.maxWidthOrHeight / Math.max(width, height));
               width = Math.round(width * scale);
               height = Math.round(height * scale);
            }

            const gif = new GIF({
              workers: Math.max(2, navigator.hardwareConcurrency || 4),
              quality: gifQuality,
              width: width,
              height: height,
              workerScript: 'assets/gif.worker.js'
            });
            
            // Report progress
            const onProgress = options.onProgress;
            if (onProgress) {
              gif.on('progress', (p: number) => {
                onProgress(Math.round(p * 100));
              });
            }
            
            // Draw to canvas for resizing if needed
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                gif.addFrame(canvas, { copy: true });
            } else {
                gif.addFrame(img);
            }
            
            gif.on('finished', (blob) => {
              if (onProgress) onProgress(100);
              const file = new File([blob], imageFile.name.replace(/\.\w+$/, '.gif'), { type: 'image/gif' });
              resolve(file);
            });
            
            gif.render();
          };
          img.onerror = reject;
        });
      }
    }

    // 处理 WebP (浏览器原生支持)
    if (options.fileType === 'image/webp' && imageFile.type === 'image/webp') {
        console.warn('WebP animation compression is not supported. Returning original file to preserve animation.');
        if (options.onProgress) options.onProgress(100);
        return imageFile;
    }

    const compressedFile = await imageCompression(imageFile, {
      ...options,
      initialQuality: options.quality, // Map quality to initialQuality for browser-image-compression
    });
    return compressedFile;
  } catch (error) {
    console.error('图片压缩失败:', error);
    throw error;
  }
};
