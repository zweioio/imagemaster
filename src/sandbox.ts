import * as ort from 'onnxruntime-web';
// @ts-ignore
import gifsicle from 'gifsicle-wasm-browser';
import GIF from 'gif.js';
// @ts-ignore
import { parseGIF, decompressFrames } from 'gifuct-js';

console.log('ImageMaster Sandbox Loaded (ONNX Runtime).');

// Helper for dimensions
const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.src = url;
  });
};

const processAnimatedGifCanvas = async (imageFile: File, options: any): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const gif = parseGIF(buffer);
        const frames = decompressFrames(gif, true);

        // Calculate output dimensions
        let width = frames[0].dims.width;
        let height = frames[0].dims.height;
        const needsResize = !!options.maxWidthOrHeight;
        
        // Handle resizing if maxWidthOrHeight is provided
        if (needsResize) {
          const scale = Math.min(1, options.maxWidthOrHeight / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        // Initialize GIF encoder
        // Optimize quality mapping for speed
        const q = options.quality || 0.8;
        const gifQuality = Math.max(1, Math.round(30 * (1 - q * 0.7)));
        
        // Fetch worker script to create a blob URL, avoiding cross-origin issues in sandbox
        let workerUrl = 'assets/gif.worker.js';
        try {
            const workerResponse = await fetch('assets/gif.worker.js');
            if (workerResponse.ok) {
                const workerScriptText = await workerResponse.text();
                const workerBlob = new Blob([workerScriptText], { type: 'application/javascript' });
                workerUrl = URL.createObjectURL(workerBlob);
            }
        } catch (e) {
            console.warn('Failed to fetch worker script for blob URL, using relative path:', e);
        }

        // Fix Transparency: Standard approach
        // Remove Magenta background fix as Gifsicle is now primary
        // and we want standard behavior for fallback.
        
        const gifEncoder = new GIF({
          workers: Math.max(2, navigator.hardwareConcurrency || 4), // Use more workers
          quality: gifQuality,
          width: width,
          height: height,
          workerScript: workerUrl,
          dither: false, // Disable dithering for speed
          transparent: null // gif.js expects a hex string or null for transparency
        });

        // Report progress
        const onProgress = options.onProgress;
        
        if (onProgress) {
          gifEncoder.on('progress', (p: number) => {
            // Mapping encoding progress to 50-100% range
            onProgress(Math.round(50 + p * 50));
          });
        }

        // Create canvas for frame composition
        // Use standard canvas for compatibility
        const hasOffscreen = false; 
        
        let ctx: CanvasRenderingContext2D | null = null;
        let resizeCanvas: HTMLCanvasElement | null = null;

        if (needsResize) {
            resizeCanvas = document.createElement('canvas');
            resizeCanvas.width = width;
            resizeCanvas.height = height;
            ctx = resizeCanvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error('Canvas context not supported');
        }

        // Create temporary canvas for original frame data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frames[0].dims.width;
        tempCanvas.height = frames[0].dims.height;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        if (!tempCtx) throw new Error('Canvas context not supported');
        
        // Frame processing loop
        const compositionCanvas = document.createElement('canvas');
        compositionCanvas.width = frames[0].dims.width;
        compositionCanvas.height = frames[0].dims.height;
        
        const compositionCtx = compositionCanvas.getContext('2d', { willReadFrequently: true });
        if (!compositionCtx) throw new Error('Canvas context not supported');

        let frameImageData: ImageData | undefined;
        let lastYieldTime = performance.now();

        for (let i = 0; i < frames.length; i++) {
          // Report parsing/preparing progress (0-50%)
          if (onProgress) {
            onProgress(Math.round((i / frames.length) * 50));
          }

          const frame = frames[i];
          const dims = frame.dims;

          // 1. Draw current frame patch to temp canvas
          if (!frameImageData || frameImageData.width !== dims.width || frameImageData.height !== dims.height) {
            frameImageData = new ImageData(dims.width, dims.height);
          }
          frameImageData.data.set(frame.patch);
          tempCtx.putImageData(frameImageData, 0, 0);

          // 2. Handle disposal of PREVIOUS frame (if any) before drawing current
          // Draw current patch onto composition canvas
          compositionCtx.drawImage(tempCanvas, dims.left, dims.top);

          // 3. Add frame to encoder
          // Use standard canvas drawing
          
          let outputCtx: CanvasRenderingContext2D;
          let outputCanvas: HTMLCanvasElement;

          if (needsResize && ctx && resizeCanvas) {
            outputCanvas = resizeCanvas;
            outputCtx = ctx;
            outputCtx.clearRect(0, 0, width, height);
            outputCtx.drawImage(compositionCanvas, 0, 0, width, height);
          } else {
            // Need a separate canvas for output to not mess up compositionCanvas state
            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = width;
            frameCanvas.height = height;
            const frameCtx = frameCanvas.getContext('2d');
            if (!frameCtx) throw new Error('Canvas context not supported');
            
            outputCanvas = frameCanvas;
            outputCtx = frameCtx;
            outputCtx.clearRect(0, 0, width, height);
            outputCtx.drawImage(compositionCanvas, 0, 0);
          }

          gifEncoder.addFrame(outputCtx, { copy: true, delay: frame.delay });

          // 4. Handle disposal for NEXT frame
          if (frame.disposalType === 2) {
             compositionCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
          }
          
          // Smart yield: only yield if significant time has passed (e.g., > 100ms) to avoid overhead
          if (performance.now() - lastYieldTime > 100) {
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYieldTime = performance.now();
          }
        }

        gifEncoder.on('finished', (blob) => {
          if (onProgress) onProgress(100);
          if (workerUrl && workerUrl.startsWith('blob:')) {
             URL.revokeObjectURL(workerUrl);
          }
          const file = new File([blob], imageFile.name, { type: 'image/gif' });
          resolve(file);
        });

        gifEncoder.render();

      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(imageFile);
  });
};

const processAnimatedGifGifsicle = async (imageFile: File, options: any): Promise<File> => {
  try {
    const buffer = await imageFile.arrayBuffer();
    
    // Construct commands
    const commands: string[] = [];
    
    // Optimization: Use -O3 for best compression now that WASM is fixed
    // -O3 provides the best size reduction and handles transparency well
    commands.push('-O3');
    
    // Lossy: options.quality (0-1). 
    // Article mentions Gifsicle supports lossy compression.
    // Map our quality slider (0.1-1.0) to Gifsicle's lossy parameter (200-0).
    // Note: Gifsicle's --lossy takes an argument, usually 30-200. 
    // Higher lossy value = more compression = lower quality.
    // Our options.quality: 1 = Best Quality (Lossy=0), 0 = Worst Quality (Lossy=200).
    if (options.quality !== undefined) {
      // If quality is < 1, apply lossy compression
      if (options.quality < 1) {
        // Map 1.0 -> 0, 0.1 -> 180 (approx)
        // Let's use a range of 0 to 200.
        // Formula: (1 - quality) * 200
        // e.g. 0.8 -> 0.2 * 200 = 40 (Light compression)
        // e.g. 0.5 -> 0.5 * 200 = 100 (Heavy compression)
        const lossyValue = Math.round((1 - options.quality) * 200);
        commands.push(`--lossy=${lossyValue}`);
      }
    } else {
       // Default optimization if no quality specified
       // commands.push('--lossy=30'); // Optional default
    }
    
    // Resize
    if (options.maxWidthOrHeight) {
      const { width, height } = await getImageDimensions(URL.createObjectURL(imageFile));
      const scale = Math.min(1, options.maxWidthOrHeight / Math.max(width, height));
      const newW = Math.round(width * scale);
      const newH = Math.round(height * scale);
      commands.push(`--resize ${newW}x${newH}`);
    }
    
    // I/O
    // Fix: Gifsicle command string formatting.
    // The library joins arguments with spaces.
    // We should be careful about spaces in command.
    // The library documentation examples show arguments separated by newlines or spaces in a single string.
    // However, our array join works.
    // BUT, the output path handling in the library is specific.
    // It looks for files in /out/ directory.
    // Let's ensure the input file name matches exactly what we pass in input array.
    commands.push('input.gif');
    // Important: The library automatically mounts the output file if we use -o
    // But sometimes it returns the first file found in /out/
    commands.push('-o /out/output.gif');
    
    const commandStr = commands.join(' ');
    console.log('Running Gifsicle:', commandStr);
    
    // Report start
    if (options.onProgress) options.onProgress(10);

    // Timeout logic: Gifsicle WASM might hang on certain files or settings
    // Increased timeout to 30s for larger files
    // The library expects input files as { file: File|Blob|string(url), name: string }
    // It does NOT support Uint8Array directly in the 'file' property according to docs/error message.
    // We must pass a Blob or File object.
    const fileBlob = new Blob([buffer], { type: 'image/gif' });
    
    const result = await Promise.race([
      gifsicle.run({
        input: [{
          file: fileBlob,
          name: 'input.gif'
        }],
        command: [commandStr] // command must be an array of strings
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gifsicle timeout')), 30000))
    ]);
    
    // Check if result is valid
    if (result && result.length > 0) {
      const outputFile = result[0];
      
      // Fix: Accessing file.size might be undefined if it's a Uint8Array or similar
      // The library returns { file: Uint8Array|File|Blob, name: string }
      // We need to handle different types safely.
      let fileSize = 0;
      let fileBlob: Blob;
      
      if (outputFile.file instanceof Blob) {
          fileSize = outputFile.file.size;
          fileBlob = outputFile.file;
      } else if (outputFile.file instanceof Uint8Array || outputFile.file instanceof ArrayBuffer) {
          fileSize = outputFile.file.byteLength;
          fileBlob = new Blob([outputFile.file], { type: 'image/gif' });
      } else {
          // Fallback
          fileBlob = new Blob([outputFile.file], { type: 'image/gif' });
          fileSize = fileBlob.size;
      }

      // Check if file size is suspicious (e.g. < 20 bytes)
      if (fileSize < 20) {
          throw new Error(`Gifsicle output corrupted: ${fileSize} bytes`);
      }

      if (options.onProgress) options.onProgress(100);
      return new File([fileBlob], imageFile.name, { type: 'image/gif' });
    } else {
      throw new Error('No output from Gifsicle');
    }
  } catch (error) {
    console.warn('Gifsicle failed or timed out, falling back to Canvas:', error);
    if (options.onProgress) options.onProgress(20); // Reset progress for fallback
    
    // Fallback: Recreate a proper File object for the fallback function
    let fallbackFile: File;
    try {
        // Use the original arrayBuffer if possible, or try to get it again
        let buffer: ArrayBuffer;
        if (imageFile instanceof File && imageFile.arrayBuffer) {
             // It's a real File object (first run)
             buffer = await imageFile.arrayBuffer();
        } else if ((imageFile as any).arrayBuffer instanceof ArrayBuffer) {
             // It's the payload object from postMessage
             buffer = (imageFile as any).arrayBuffer;
        } else {
             // Last resort
             buffer = await (imageFile as any).arrayBuffer();
        }

        fallbackFile = new File([buffer], (imageFile as any).name || 'fallback.gif', { type: (imageFile as any).type || 'image/gif' });
    } catch (e) {
        console.error('Failed to create fallback file:', e);
        // If we can't create a file, we can't proceed.
        throw new Error('Invalid image data for fallback');
    }
    
    return processAnimatedGifCanvas(fallbackFile, options);
  }
};

// 配置 WASM 路径
// 强制使用本地 models/ 目录
// 终极方案：显式映射所有可能的 WASM 文件名到本地存在的文件
const modelsDir = new URL('models/', window.location.href).href;

// 强制指定所有变体都使用本地的 sim.wasm (因为它是最通用的)
// 使用 any 绕过类型检查，因为我们需要覆盖所有可能的请求
(ort.env.wasm as any).wasmPaths = {
  'ort-wasm.wasm': modelsDir + 'ort-wasm.wasm',
  'ort-wasm-simd.wasm': modelsDir + 'ort-wasm-simd.wasm',
  // Fallback for threaded versions to non-threaded since we don't ship threaded wasm
  'ort-wasm-threaded.wasm': modelsDir + 'ort-wasm.wasm', 
  'ort-wasm-simd-threaded.wasm': modelsDir + 'ort-wasm-simd.wasm',
};

// 彻底禁用多线程和 WebGPU，防止它去请求 .jsep.mjs 或 .threaded.wasm
ort.env.wasm.numThreads = 1; 
ort.env.wasm.proxy = false;
ort.env.wasm.simd = true; // 明确启用 SIMD (我们有 simd.wasm)

let session: ort.InferenceSession | null = null;
let loadedModelType: 'rmbg14' | 'u2net' | 'birefnet' | null = null; // 记录当前加载的模型类型
let lastOutputTensor: ort.Tensor | null = null;
let lastOriginalImage: HTMLImageElement | null = null;

// 定义远程模型地址 (作为本地文件的备份)
const REMOTE_MODELS = {
    'u2net': 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx',
    // 'rmbg14': '...' // RMBG-1.4 总是内置，不需要远程
};

// 获取模型路径 (支持本地优先，远程兜底)
const getModelUrl = async (type: 'rmbg14' | 'u2net' | 'birefnet'): Promise<string> => {
  const localFileName =
    type === 'u2net'
      ? 'u2net.onnx'
      : type === 'birefnet'
        ? 'BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx'
        : 'rmbg-1.4.onnx';
  const localUrl = modelsDir + localFileName;

  // 对于 RMBG-1.4，总是使用本地文件
  if (type === 'rmbg14') {
      return localUrl;
  }

  if (type === 'birefnet') {
    try {
      const response = await fetch(localUrl, { method: 'HEAD' });
      if (response.ok) {
        return localUrl;
      }
    } catch (e) {
    }
    throw new Error('BiRefNet model file not found. Please put BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx into public/models/.');
  }

  // 对于大模型 U2Net，检查本地是否存在
  try {
      const response = await fetch(localUrl, { method: 'HEAD' });
      if (response.ok) {
          console.log(`Sandbox: Found local model for ${type}`);
          return localUrl;
      }
  } catch (e) {
      console.warn(`Sandbox: Local model check failed for ${type}, trying remote...`);
  }

  // 本地不存在，使用远程 URL
  console.log(`Sandbox: Local model missing, switching to remote download for ${type}`);
  // 注意：直接返回 URL 给 onnxruntime 可能面临 CORS 问题，最好先下载为 Blob
  // 但 onnxruntime-web 内部有 fetch 逻辑，我们可以先试着返回 URL
  // 如果需要更稳健，可以先在此处 fetch 到 Blob
  return REMOTE_MODELS[type];
};

// 预加载模型
async function loadModel(modelType: 'rmbg14' | 'u2net' | 'birefnet' = 'rmbg14') {
  if (session && loadedModelType === modelType) {
    return session;
  }
  
  // Dispose previous session
  if (session) {
    try {
      await session.release();
    } catch (e) {
      console.warn('Failed to release session:', e);
    }
    session = null;
  }

  try {
    // 动态获取模型 URL (本地或远程)
    const modelUrl = await getModelUrl(modelType);
    console.log(`Loading model: ${modelType} from ${modelUrl}`);
    
    // Create new session
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'], // Force WASM
      graphOptimizationLevel: 'all'
    });
    
    loadedModelType = modelType;
    console.log('Model loaded successfully');
    return session;
  } catch (e) {
    console.error(`Failed to load model ${modelType}:`, e);
    throw e;
  }
}

// 图像处理辅助函数
async function processImage(imageFile: { arrayBuffer: ArrayBuffer, type: string }, modelType: 'rmbg14' | 'u2net' | 'birefnet'): Promise<{ original: HTMLImageElement, tensor: ort.Tensor }> {
  // 1. 加载图像
  const blob = new Blob([imageFile.arrayBuffer], { type: imageFile.type });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await new Promise((resolve) => { img.onload = resolve; });

  let width = 1024;
  let height = 1024;
  
  if (modelType === 'u2net') {
      width = 320;
      height = 320;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  const float32Data = new Float32Array(3 * width * height);

  if (modelType !== 'rmbg14') {
      // U2Net Normalization (ImageNet)
      // mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
      const mean = [0.485, 0.456, 0.406];
      const std = [0.229, 0.224, 0.225];
      
      for (let i = 0; i < width * height; i++) {
        // R
        float32Data[i] = ((data[i * 4] / 255.0) - mean[0]) / std[0];
        // G
        float32Data[width * height + i] = ((data[i * 4 + 1] / 255.0) - mean[1]) / std[1];
        // B
        float32Data[2 * width * height + i] = ((data[i * 4 + 2] / 255.0) - mean[2]) / std[2];
      }
  } else {
      // RMBG-1.4 Normalization
      // mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]
      const mean = [0.5, 0.5, 0.5];
      const std = [0.5, 0.5, 0.5];

      for (let i = 0; i < width * height; i++) {
        float32Data[i] = ((data[i * 4] / 255.0) - mean[0]) / std[0];
        float32Data[width * height + i] = ((data[i * 4 + 1] / 255.0) - mean[1]) / std[1];
        float32Data[2 * width * height + i] = ((data[i * 4 + 2] / 255.0) - mean[2]) / std[2];
      }
  }

  const tensor = new ort.Tensor('float32', float32Data, [1, 3, height, width]);
  return { original: img, tensor };
}

// 应用抠图后处理
const applyMatting = async (output: ort.Tensor, original: HTMLImageElement, modelType: 'rmbg14' | 'u2net' | 'birefnet' = 'rmbg14') => {
  try {
    const maskData = output.data as Float32Array; 
    
    const dims = output.dims || [];
    const maybeH = dims.length >= 2 ? dims[dims.length - 2] : undefined;
    const maybeW = dims.length >= 1 ? dims[dims.length - 1] : undefined;
    const maskHeight = typeof maybeH === 'number' ? maybeH : (modelType === 'u2net' ? 320 : 1024);
    const maskWidth = typeof maybeW === 'number' ? maybeW : (modelType === 'u2net' ? 320 : 1024);
    
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskWidth;
    maskCanvas.height = maskHeight;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) throw new Error('Mask canvas context unavailable');
    
    const maskImgData = maskCtx.createImageData(maskWidth, maskHeight);

    // Check value range to determine if Sigmoid is needed
    // u2netp output is usually logits, but sometimes ONNX export includes sigmoid.
    // If min < 0 or max > 1.2, it's definitely logits.
    // If range is [0, 1], it's probability.
    let minVal = Infinity, maxVal = -Infinity;
    for (let i = 0; i < maskData.length; i++) {
        const v = maskData[i];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
    }
    
    const needsSigmoid = (minVal < -0.1 || maxVal > 1.1); 

    for (let i = 0; i < maskData.length; i++) {
        let val = maskData[i];
        if (needsSigmoid) {
            val = 1 / (1 + Math.exp(-val));
        }
        
        // Refined Thresholding logic
        if (modelType === 'rmbg14') {
             // RMBG 1.4: Aggressive noise suppression
             // Any low probability (< 10%) is forced to 0 (Transparent)
             // Any high probability (> 90%) is forced to 1 (Opaque)
             // This removes "gray/blue noise" in background
             if (val < 0.10) val = 0;
             else if (val > 0.90) val = 1;
             else {
                // Smooth transition for edges (0.1 - 0.9) -> (0 - 1)
                val = (val - 0.10) / 0.80; 
             }
        } else {
            // U2Net Logic - Standard Thresholding
            // U2Net is generally robust, but standard thresholding helps reduce halo
            // Use standard thresholding instead of complex contrast enhancement
            // This is closer to "Official Default" behavior
            if (val < 0.1) val = 0;
            else if (val > 0.9) val = 1;
        }
        
        // Simple mapping
        let alpha = Math.round(val * 255);
        
        const idx = i * 4;
        maskImgData.data[idx] = 0; // RGB doesn't matter for mask
        maskImgData.data[idx + 1] = 0;
        maskImgData.data[idx + 2] = 0;
        maskImgData.data[idx + 3] = alpha;
    }
    
    maskCtx.putImageData(maskImgData, 0, 0);
    
    // Create output canvas
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = original.width;
    outputCanvas.height = original.height;
    const finalCtx = outputCanvas.getContext('2d');
    if (!finalCtx) throw new Error('Output canvas context unavailable');

    // PNG supports transparency, clear canvas
    finalCtx.clearRect(0, 0, original.width, original.height);

    // Draw original image first? No, we need masking.
    
    // 1. Draw mask scaled to original size
    const tempMaskCanvas = document.createElement('canvas');
    tempMaskCanvas.width = original.width;
    tempMaskCanvas.height = original.height;
    const tempCtx = tempMaskCanvas.getContext('2d');
    if (!tempCtx) throw new Error('Temp context unavailable');
    
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';
    tempCtx.drawImage(maskCanvas, 0, 0, original.width, original.height);
    
    // 2. Composite
    // Apply morphological erosion ONLY for RMBG to clean up artifacts
    // U2Net should use standard masking to avoid edge blur
    
    if (modelType === 'rmbg14') {
        // Always use erosion canvas for better quality
        const erodedMaskCanvas = document.createElement('canvas');
        erodedMaskCanvas.width = original.width;
        erodedMaskCanvas.height = original.height;
        const erodedCtx = erodedMaskCanvas.getContext('2d');
        if (!erodedCtx) throw new Error('Eroded context unavailable');
        
        // Draw initial mask
        erodedCtx.drawImage(tempMaskCanvas, 0, 0);
        
        // Perform Erosion (Shrink mask slightly to remove noise)
        const w = original.width;
        const h = original.height;
        const sourceImageData = tempCtx.getImageData(0, 0, w, h);
        const srcData = sourceImageData.data;
        
        const targetImageData = erodedCtx.createImageData(w, h);
        const targetData = targetImageData.data;

        // Kernel size: 1 means 3x3 window. 
        // We check neighbors. If any neighbor is 0 (transparent), we reduce our alpha.
        // This effectively "erodes" the white mask.
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                // Border pixels always transparent
                if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
                    targetData[idx + 3] = 0;
                    continue;
                }
                
                const currentAlpha = srcData[idx + 3];
                
                if (currentAlpha > 0) {
                    // Check 4-connected neighbors (Top, Bottom, Left, Right)
                    const up = srcData[((y - 1) * w + x) * 4 + 3];
                    const down = srcData[((y + 1) * w + x) * 4 + 3];
                    const left = srcData[(y * w + (x - 1)) * 4 + 3];
                    const right = srcData[(y * w + (x + 1)) * 4 + 3];
                    
                    let newAlpha = currentAlpha;

                     // RMBG 1.4: "Smart Edge Recovery"
                     // 1. If we are deep inside the object (surrounded by high alpha), keep it solid (255)
                     // 2. If we are at the edge, apply soft erosion to kill noise but keep hair
                     
                     const minNeighbor = Math.min(up, down, left, right);
                     
                     if (minNeighbor > 200) {
                         // Solid interior, keep it crisp
                         newAlpha = 255;
                     } else {
                         // Edge region:
                         // Feathering: Take average of neighbors to smooth out single-pixel noise
                         // Use weighted average to prioritize current pixel but blend with neighbors
                         const avg = (up + down + left + right + currentAlpha * 4) / 8;
                         
                         // Alpha Matting Heuristic:
                         // If it's a weak signal (noise), kill it aggressively.
                         if (avg < 20) {
                             newAlpha = 0; 
                         } else {
                             // Smooth edge, but maintain structure
                             newAlpha = avg; 
                         }
                     }
                    
                    targetData[idx] = srcData[idx];
                    targetData[idx + 1] = srcData[idx + 1];
                    targetData[idx + 2] = srcData[idx + 2];
                    targetData[idx + 3] = newAlpha;
                } else {
                    targetData[idx + 3] = 0;
                }
            }
        }
        
        erodedCtx.putImageData(targetImageData, 0, 0);
        
        // Final Composition using Eroded Mask
        finalCtx.globalCompositeOperation = 'source-over';
        finalCtx.drawImage(original, 0, 0);
        
        finalCtx.globalCompositeOperation = 'destination-in';
        finalCtx.drawImage(erodedMaskCanvas, 0, 0);
        
    } else {
        // U2Net: Direct Masking (Official Style)
        // No erosion, no complex contrast enhancement.
        // Just use the resized mask directly to preserve edge details.
        
        finalCtx.globalCompositeOperation = 'source-over';
        finalCtx.drawImage(original, 0, 0);
        
        finalCtx.globalCompositeOperation = 'destination-in';
        // Use the high-quality scaled mask directly
        finalCtx.drawImage(tempMaskCanvas, 0, 0);
    }
    
    finalCtx.globalCompositeOperation = 'source-over';
    
    // Always export as PNG for preview
    const quality = 0.8;
    const dataUrl = outputCanvas.toDataURL('image/png', quality);
    const size = Math.round((dataUrl.length - 22) * 0.75);

    window.parent.postMessage({
      type: 'MATTING_RESULT',
      payload: { dataUrl, size }
    }, '*');

  } catch (error) {
    console.error('Matting post-processing error:', error);
    window.parent.postMessage({
      type: 'MATTING_ERROR',
      payload: { message: (error as Error).message }
    }, '*');
  }
};

window.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  // 移除手动阈值更新逻辑，默认使用最佳参数

  if (type === 'MATTING_PRELOAD') {
    try {
      if (!session) {
        // Switch to rmbg14 for better artifact handling
        const defaultModel = 'rmbg14';
        console.log(`Sandbox: Preloading ${defaultModel} model...`);
        const modelUrl = await getModelUrl(defaultModel);
        console.log('Sandbox: Model URL:', modelUrl);
        session = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ['wasm'], 
        });
        loadedModelType = defaultModel;
      }
      console.log('Sandbox: Model loaded.');
      window.parent.postMessage({ type: 'MATTING_PRELOAD_DONE' }, '*');
    } catch (e) {
      console.error('Sandbox: Load failed. Details:', e);
      // 尝试打印更具体的错误信息
      const errorMessage = e instanceof Error ? e.message : String(e);
      window.parent.postMessage({ type: 'MATTING_ERROR', payload: { message: `加载失败: ${errorMessage}` } }, '*');
    }
    return;
  }

  if (type === 'GIF_COMPRESS') {
    const { imageFile, options } = payload;
    try {
      // Reconstruct File object from payload (which is structured clone or array buffer)
      // payload.imageFile should be { name, type, arrayBuffer }
      const file = new File([imageFile.arrayBuffer], imageFile.name, { type: imageFile.type });
      
      const compressedFile = await processAnimatedGifGifsicle(file, {
        ...options,
        onProgress: (p: number) => {
          window.parent.postMessage({
            type: 'GIF_COMPRESS_PROGRESS',
            payload: { progress: p }
          }, '*');
        }
      });
      
      const arrayBuffer = await compressedFile.arrayBuffer();
      
      window.parent.postMessage({
        type: 'GIF_COMPRESS_RESULT',
        payload: {
          dataUrl: URL.createObjectURL(compressedFile), // Sandbox URL might not work in parent?
          // Better send ArrayBuffer or Blob back?
          // Actually, createObjectURL in sandbox creates a blob:null/uuid URL.
          // Parent might not be able to read it if it's cross-origin.
          // But sandbox is same-origin (chrome-extension://).
          // However, sending ArrayBuffer is safer.
          // Let's send ArrayBuffer and let parent create URL.
          arrayBuffer: arrayBuffer,
          size: compressedFile.size,
          type: compressedFile.type
        }
      }, '*');
      
    } catch (error) {
      console.error('GIF compression error:', error);
      window.parent.postMessage({
        type: 'GIF_COMPRESS_ERROR',
        payload: { message: (error as Error).message }
      }, '*');
    }
    return;
  }


  if (type === 'MATTING_REQUEST') {
    // Check payload
    if (!payload) return;
    
    // 1. Handle Conversion Request (No imageFile needed, use cached data)
    if (payload.isConversion) {
        if (!lastOutputTensor || !lastOriginalImage) {
             window.parent.postMessage({
                type: 'MATTING_ERROR',
                payload: { message: 'Session expired, please re-upload image.' }
              }, '*');
             return;
        }
        try {
             // Skip inference, just re-apply matting with new format
             window.parent.postMessage({ type: 'MATTING_PROGRESS', payload: { progress: 90 } }, '*');
             applyMatting(lastOutputTensor, lastOriginalImage, loadedModelType!);
        } catch(e) { 
             console.error('Conversion error:', e);
             window.parent.postMessage({
                type: 'MATTING_ERROR',
                payload: { message: (e as Error).message }
              }, '*');
        }
        return;
    }

    // 2. Handle Normal Request (Requires imageFile)
    if (payload.imageFile) {
      try {
        const requestedModel: 'rmbg14' | 'u2net' | 'birefnet' = payload.model || 'rmbg14';

        // 检查是否需要重新加载模型
        if (!session || loadedModelType !== requestedModel) {
            window.parent.postMessage({ type: 'MATTING_PROGRESS', payload: { progress: 10 } }, '*');
            
            if (session) {
                // Release old session if needed (though ort.js handles this mostly)
                session = null;
            }
            
            console.log(`Sandbox: Switching model to ${requestedModel}...`);

            session = await loadModel(requestedModel);
            loadedModelType = requestedModel;
        }

        window.parent.postMessage({ type: 'MATTING_PROGRESS', payload: { progress: 30 } }, '*');
        
        // Ensure image processing doesn't block immediately
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        const { original, tensor } = await processImage(payload.imageFile, loadedModelType!);
        lastOriginalImage = original; // 保存原图用于后续调整

        window.parent.postMessage({ type: 'MATTING_PROGRESS', payload: { progress: 50 } }, '*');

        // 推理
        const feeds = { [session.inputNames[0]]: tensor };
        
        // Add a small delay to allow UI to update to 50%
        await new Promise(resolve => setTimeout(resolve, 50));
        
        let results: Record<string, ort.Tensor> | null = null;
        try {
          results = await session.run(feeds);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const isOom = msg.includes('std::bad_alloc') || msg.includes('bad_alloc') || msg.includes('OOM') || msg.includes('out of memory');
          if (isOom && loadedModelType === 'birefnet') {
            loadedModelType = 'rmbg14';
            session = await loadModel('rmbg14');
            const fallbackInput = await processImage(payload.imageFile, 'rmbg14');
            const fallbackFeeds = { [session.inputNames[0]]: fallbackInput.tensor };
            const fallback = await session.run(fallbackFeeds);
            results = fallback;
          } else {
            throw e;
          }
        }
        const output = results[session.outputNames[0]];
        lastOutputTensor = output; // 保存推理结果

        window.parent.postMessage({ type: 'MATTING_PROGRESS', payload: { progress: 80 } }, '*');
        
        // Add a small delay to allow UI to update to 80%
        await new Promise(resolve => setTimeout(resolve, 50));

        // 默认阈值 0.5 (Not used anymore in signature)
        await applyMatting(output, lastOriginalImage!, loadedModelType!);
        
        // applyMatting sends the final result message which implies 100%

      } catch (error) {
        console.error('Sandbox matting error:', error);
        const message = error instanceof Error ? error.message : String(error);
        window.parent.postMessage({
          type: 'MATTING_ERROR',
          payload: { message }
        }, '*');
      }
    }
  }
});
