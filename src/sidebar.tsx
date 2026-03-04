import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Upload, Image as ImageIcon, Trash2, Scissors, Download, Loader2, Zap, GripVertical, Sparkles, ChevronLeft, Plus, AlertCircle, Brain, Globe, Languages } from 'lucide-react';
import { formatFileSize, getImageDimensions, compressImage, isAnimatedWebP } from './utils/image';
import JSZip from 'jszip';
import { getLocale } from './locales';

interface ImageInfo {
  width: number;
  height: number;
  size: number;
  type: string;
}

const Sidebar = () => {
  const [lang, setLang] = useState<string>(() => {
    // 优先从 localStorage 获取，如果没有则使用浏览器语言
    const savedLang = localStorage.getItem('imagemaster_lang');
    return savedLang || navigator.language;
  });

  const t = useMemo(() => getLocale(lang), [lang]);

  // 当语言改变时保存到 localStorage
  useEffect(() => {
    localStorage.setItem('imagemaster_lang', lang);
  }, [lang]);

  const [activeTool, _setActiveTool] = useState<'compress' | 'matting'>('compress');
  
  const setActiveTool = (tool: 'compress' | 'matting') => {
    // 如果工具切换了，清空处理结果，防止结果混淆
    if (tool !== activeTool) {
        setProcessedUrls(new Array(originalFiles.length).fill(null));
        setCompressedFileSizes(new Array(originalFiles.length).fill(null));
        setProcessing(false);
        setMattingProgress(0);
        setIsCancelled(true); // Cancel any ongoing process
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    }
    _setActiveTool(tool);
  };
  const [processing, setProcessing] = useState<boolean>(false);
  const [mattingProgress, setMattingProgress] = useState<number>(0);

  // Multi-file state
  const [originalFiles, setOriginalFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [imageInfos, setImageInfos] = useState<ImageInfo[]>([]);
  const [processedUrls, setProcessedUrls] = useState<(string | null)[]>([]);
  const [originalFileSizes, setOriginalFileSizes] = useState<(number | null)[]>([]);
  const [compressedFileSizes, setCompressedFileSizes] = useState<(number | null)[]>([]);

  // Compatible state getters
  const originalFile = originalFiles[currentFileIndex] || null;
  const previewUrl = previewUrls[currentFileIndex] || null;
  const imageInfo = imageInfos[currentFileIndex] || null;
  const processedUrl = processedUrls[currentFileIndex] || null;
  const originalFileSize = originalFileSizes[currentFileIndex] || null;
  const compressedFileSize = compressedFileSizes[currentFileIndex] || null;

  // Compatible state setters
  const setProcessedUrl = (url: string | null) => {
    setProcessedUrls(prev => {
      const next = [...prev];
      next[currentFileIndex] = url;
      return next;
    });
  };
  const setCompressedFileSize = (size: number | null) => {
    setCompressedFileSizes(prev => {
      const next = [...prev];
      next[currentFileIndex] = size;
      return next;
    });
  };
  const [compressionQuality, setCompressionQuality] = useState<number>(0.8);
  const [compressionFormat, setCompressionFormat] = useState<string>('image/jpeg');
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isPreloaded, setIsPreloaded] = useState<boolean>(false); // 跟踪模型是否已预加载
  const [hasLoadedModel, setHasLoadedModel] = useState<boolean>(false); // 记录是否首次加载过模型
  const [loadingTimeout, setLoadingTimeout] = useState<boolean>(false); // 记录加载是否超时
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sandboxIframeRef = useRef<HTMLIFrameElement>(null);
  const [mattingFormat, setMattingFormat] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [mattingModel, setMattingModel] = useState<'rmbg14' | 'u2net'>('rmbg14');
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 稿定风格配色常量
  const COLORS = {
    brand: '#2254f4',
    textMain: '#191919',
    textSecondary: '#595959',
    textCaption: '#999999',
    bgMain: '#ffffff',
    bgSecondary: '#f6f7f9',
    border: '#e8eaed',
    success: '#07c160',
    danger: '#ff4d4f',
    purple: '#6f42c1'
  };

  // 注入旋转动画和全局样式
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .spin-animation {
        animation: spin 1s linear infinite;
      }
      .gaoding-btn {
        transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s, color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: none;
        cursor: pointer;
        font-weight: 500;
        user-select: none;
      }
      .gaoding-btn:active {
        transform: scale(0.96);
      }
      .gaoding-btn-primary {
        background-color: ${COLORS.brand};
        color: white;
      }
      .gaoding-btn-primary:hover {
        background-color: #1a44cc;
        box-shadow: 0 4px 12px rgba(34, 84, 244, 0.25);
      }
      .gaoding-btn-secondary {
        background-color: ${COLORS.bgSecondary};
        color: ${COLORS.textMain};
      }
      .gaoding-btn-secondary:hover {
        background-color: #edeff2;
      }
      .icon-btn[title]:hover::after {
        content: attr(title);
        position: absolute;
        bottom: calc(100% + 8px); /* 改为显示在上方 */
        right: 0;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 1000;
        pointer-events: none;
      }
      .gaoding-tool-btn {
        transition: all 0.2s;
        border: 1px solid ${COLORS.border};
        background: white;
        color: ${COLORS.textMain};
      }
      .gaoding-tool-btn:hover {
        border-color: ${COLORS.brand};
        color: ${COLORS.brand} !important;
      }
      .gaoding-tool-btn:hover svg {
        color: ${COLORS.brand} !important;
      }
      .gaoding-tool-btn-active {
        background-color: ${COLORS.brand}08 !important;
        border: 1px solid ${COLORS.brand} !important;
        color: ${COLORS.brand} !important;
      }
      .gaoding-card {
        background: white;
        border-radius: 8px;
        border: 1px solid ${COLORS.border};
        /* 移除全局 transition，避免状态重置时产生奇怪动画 */
      }
      .gaoding-upload-area {
        background-color: white !important;
        border: 1px dashed ${COLORS.border} !important;
        border-radius: 8px !important;
        transition: border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* 仅对边框颜色进行平滑过渡 */
      }
      .gaoding-upload-area:hover {
        border-color: ${COLORS.brand} !important;
      }
      input[type=range] {
        accent-color: ${COLORS.brand};
      }
      /* 自定义滚动条 */
      ::-webkit-scrollbar {
        display: none;
      }
      body {
        margin: 0;
        overflow: hidden; /* 禁止所有方向滚动 */
        user-select: none; /* 全局禁止选中文字，防止拖拽干扰 */
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [isCancelled, setIsCancelled] = useState<boolean>(false);

  // 监听来自沙盒的消息
  useEffect(() => {
    // 检查是否已经加载过模型
    chrome.storage.local.get(['hasLoadedModel'], (result) => {
      if (result.hasLoadedModel) {
        setHasLoadedModel(true);
      }
    });

    const handleSandboxMessage = (event: MessageEvent) => {
      // 验证消息来源（虽然在扩展内部，但这是个好习惯）
      if (sandboxIframeRef.current && event.source !== sandboxIframeRef.current.contentWindow) {
        return;
      }

      const { type, payload } = event.data;

      // 如果已取消，则忽略除了进度以外的所有消息，并确保处理状态为 false
      if (isCancelled && type !== 'MATTING_PRELOAD_DONE') {
          setProcessing(false);
          return;
      }

      if (type === 'MATTING_RESULT') {
        // Double check cancellation right before showing result
        if (isCancelled) {
             console.log('Matting result ignored due to cancellation');
             setProcessing(false);
             return;
        }
        const { dataUrl, size } = payload;
        setProcessedUrl(dataUrl); // Uses compatibility setter which updates array at currentFileIndex
        setCompressedFileSize(size);
        setProcessing(false);
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      } else if (type === 'MATTING_ERROR') {
        if (isCancelled) return;
        console.error('AI 抠图失败:', payload.message);
        setProcessing(false);
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
        alert(`${t.mattingError}: ${payload.message}。${t.mattingErrorNetwork}`);
      } else if (type === 'MATTING_PROGRESS') {
        if (isCancelled) return;
        setMattingProgress(payload.progress);
        console.log('Matting progress:', payload.progress);
        if (payload.progress > 0 && loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      } else if (type === 'MATTING_PRELOAD_DONE') {
        console.log('AI models preloaded successfully.');
        setIsPreloaded(true);
        setHasLoadedModel(true);
        chrome.storage.local.set({ hasLoadedModel: true });
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      } else if (type === 'GIF_COMPRESS_RESULT') {
        if (isCancelled) return;
        const { arrayBuffer, size, type: fileType } = payload;
        const blob = new Blob([arrayBuffer], { type: fileType });
        const url = URL.createObjectURL(blob);
        setProcessedUrl(url);
        setCompressedFileSize(size);
        setProcessing(false);
      } else if (type === 'GIF_COMPRESS_ERROR') {
        if (isCancelled) return;
        console.error('GIF compression failed:', payload.message);
        setProcessing(false);
        alert(`${t.compressError} (GIF): ${payload.message}`);
      } else if (type === 'GIF_COMPRESS_PROGRESS') {
        if (isCancelled) return;
        setMattingProgress(payload.progress);
      }
    };

    window.addEventListener('message', handleSandboxMessage);
    return () => window.removeEventListener('message', handleSandboxMessage);
  }, [isCancelled]); // Add isCancelled to dependency array to capture latest state

  // 预加载 AI 模型
  const preloadModels = () => {
    if (sandboxIframeRef.current && sandboxIframeRef.current.contentWindow) {
      console.log('Sending preload request to sandbox...');
      sandboxIframeRef.current.contentWindow.postMessage({ type: 'MATTING_PRELOAD' }, '*');
    }
  };

  const CustomSelect = ({ value, onChange, options }: { value: string, onChange: (val: string) => void, options: { label: string, value: string }[] }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.value === value);

    return (
      <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            border: `1px solid ${COLORS.border}`,
            backgroundColor: 'white',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
            color: COLORS.textMain
          }}
        >
          {selectedOption?.label}
          <div style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke={COLORS.textCaption} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)', // 确保在上方显示
              left: 0,
              right: 0,
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              padding: '8px',
              zIndex: 100,
              border: `1px solid ${COLORS.border}`
            }}
          >
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: value === opt.value ? COLORS.brand : COLORS.textMain,
                  backgroundColor: value === opt.value ? `${COLORS.brand}08` : 'transparent',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => {
                  if (value !== opt.value) e.currentTarget.style.backgroundColor = COLORS.bgSecondary;
                }}
                onMouseLeave={(e) => {
                  if (value !== opt.value) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };



  const handlePasteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], `pasted_image_${Date.now()}.${imageType.split('/')[1]}`, { type: imageType });
          processFiles([file]);
          return;
        }
      }
      alert(t.clipboardNoImage);
    } catch (err) {
      console.error('无法读取剪贴板:', err);
      alert(t.clipboardError);
    }
  };

  const processFiles = async (files: File[], isAppending: boolean = false) => {
    if (files.length === 0) return;
    
    // Combine if appending, otherwise replace
    const combinedFiles = isAppending ? [...originalFiles, ...files] : files;
    
    // Limit to 20 files
    const validFiles = combinedFiles.slice(0, 20);
    if (combinedFiles.length > 20) {
      alert(t.batchLimit);
    }

    setOriginalFiles(validFiles);
    
    // Initialize new state arrays
    // Reset processing state regardless of appending to allow re-compression of the new batch
    if (isAppending) {
       // Revoke old processed URLs since we are clearing the state
       processedUrls.forEach(url => url && URL.revokeObjectURL(url));
    }

    const finalProcessedUrls = new Array(validFiles.length).fill(null);
    const finalCompressedFileSizes = new Array(validFiles.length).fill(null);
    
    // Correct way: map from validFiles
    const finalOriginalFileSizes = validFiles.map(f => f.size);

    setProcessedUrls(finalProcessedUrls);
    setOriginalFileSizes(finalOriginalFileSizes);
    setCompressedFileSizes(finalCompressedFileSizes);
    
    // If appending, stay on current index or move to first new file? 
    // Usually stay on current or go to the first of the NEW batch. Let's stay on current for stability.
    if (!isAppending) {
        setCurrentFileIndex(0);
    }
    
    setProcessing(false);
    setMattingProgress(0);

    // Generate preview URLs
    // If appending, keep existing preview URLs and generate for new ones
    const filesToGeneratePreview = isAppending ? validFiles.slice(originalFiles.length) : validFiles;
    const newPreviews = filesToGeneratePreview.map(file => URL.createObjectURL(file));
    
    // If appending, we want to KEEP existing preview URLs for existing files
    // BUT we want to ensure they are clean (not showing processed state, which is handled by processedUrl=null)
    // The previewUrl itself is just the blob URL of the original file, so it's fine to keep it.
    
    const finalPreviewUrls = isAppending 
        ? [...previewUrls, ...newPreviews]
        : newPreviews;
        
    setPreviewUrls(finalPreviewUrls);

    // Fetch dimensions for NEW files only if appending, or all if replacing
    const newImageInfos: ImageInfo[] = [];
    for (const file of filesToGeneratePreview) {
      try {
        const dimensions = await getImageDimensions(file);
        newImageInfos.push({
          width: dimensions.width,
          height: dimensions.height,
          size: file.size,
          type: file.type.split('/')[1].toUpperCase()
        });
      } catch (e) {
        newImageInfos.push({
          width: 0,
          height: 0,
          size: file.size,
          type: file.type.split('/')[1]?.toUpperCase() || 'UNKNOWN'
        });
      }
    }
    
    // Update image infos
    if (isAppending) {
        setImageInfos(prev => [...prev, ...newImageInfos]);
    } else {
        setImageInfos(newImageInfos);
    }
  };

  const processImageUrl = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const fileName = url.split('/').pop()?.split('?')[0] || "image.png";
      const file = new File([blob], fileName, { type: blob.type });
      await processFiles([file]);
    } catch (e) {
      console.error('Failed to process image URL', e);
    }
  };

  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'PROCESS_IMAGE' && typeof message.imageUrl === 'string') {
        processImageUrl(message.imageUrl);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const [isAppendingMode, setIsAppendingMode] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (originalFiles.length > 0 && isAppendingMode) {
        // Append mode
        processFiles(Array.from(e.target.files), true);
      } else {
        // Replace mode
        processFiles(Array.from(e.target.files), false);
      }
    }
    // 重置 input value，允许重复上传相同文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsAppendingMode(false); // Reset mode
    setIsDraggingFile(false);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
  };

  const clearImage = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    processedUrls.forEach(url => url && URL.revokeObjectURL(url));
    setPreviewUrls([]);
    setProcessedUrls([]);
    setOriginalFiles([]);
    setImageInfos([]);
    setOriginalFileSizes([]);
    setCompressedFileSizes([]);
    setCurrentFileIndex(0);
    setProcessing(false);
    setMattingProgress(0);
    setActiveTool('compress');
    setSliderPosition(50);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 移除阈值控制逻辑
  };

  const startProcessing = async (tool: 'compress' | 'matting') => {
    if (originalFiles.length === 0) return;

    setActiveTool(tool);
    setProcessing(true);
    setMattingProgress(0);
    setIsCancelled(false); // Reset cancel state when starting
    
    // For matting, simple check on first file for now (or current file)
    const currentFile = originalFiles[currentFileIndex];
    if (tool === 'matting') {
      if (originalFiles.length > 1) {
         alert(t.mattingBatchError);
      }
      if (currentFile.type === 'image/gif') {
        alert(t.mattingGifError);
        setProcessing(false);
        return;
      }
      if (currentFile.type === 'image/webp') {
        const isAnimated = await isAnimatedWebP(currentFile);
        if (isAnimated) {
          alert(t.mattingWebpError);
          setProcessing(false);
          return;
        }
      }
    }

    try {
      if (tool === 'compress') {
        const newProcessedUrls = [...processedUrls];
        const newCompressedSizes = [...compressedFileSizes];

        for (let i = 0; i < originalFiles.length; i++) {
          setMattingProgress(Math.round(((i) / originalFiles.length) * 100));
          
          const file = originalFiles[i];
          
          // GIF Special handling
          if (file.type === 'image/gif' && compressionFormat === 'image/gif') {
            // For batch GIF, we might need a different approach or queue. 
            // Current sandbox implementation expects single response. 
            // Let's skip GIF in batch for now or handle single file case properly.
            if (originalFiles.length > 1) {
                console.warn('Batch GIF compression not fully supported in this UI version, skipping GIF.');
                continue;
            }
             // Single GIF logic (existing)
             if (sandboxIframeRef.current && sandboxIframeRef.current.contentWindow) {
                 const reader = new FileReader();
                 reader.onload = (e) => {
                   if (e.target && e.target.result) {
                     sandboxIframeRef.current?.contentWindow?.postMessage({
                       type: 'GIF_COMPRESS',
                       payload: {
                         imageFile: {
                           name: file.name,
                           type: file.type,
                           arrayBuffer: e.target.result
                         },
                         options: { quality: compressionQuality }
                       }
                     }, '*');
                   }
                 };
                 reader.readAsArrayBuffer(file);
                 return; // Wait for callback
             }
          }

          const compressedFile = await compressImage(file, {
        quality: compressionQuality,
        fileType: compressionFormat,
        useWebWorker: true,
        onProgress: (p: number) => {} // Ignore per-file progress for batch
      } as any);

          const compressedUrl = URL.createObjectURL(compressedFile);
          newProcessedUrls[i] = compressedUrl;
          newCompressedSizes[i] = compressedFile.size;
        }
        
        setProcessedUrls(newProcessedUrls);
        setCompressedFileSizes(newCompressedSizes);
        setMattingProgress(100);
        setProcessing(false);

      } else if (tool === 'matting') {
        // Matting logic for current file only
        if (sandboxIframeRef.current && sandboxIframeRef.current.contentWindow) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target && e.target.result) {
              sandboxIframeRef.current?.contentWindow?.postMessage({
                type: 'MATTING_REQUEST',
                payload: {
                  imageFile: {
                    name: currentFile.name,
                    type: currentFile.type,
                    size: currentFile.size,
                    arrayBuffer: e.target.result
                  },
                  model: mattingModel,
                  outputFormat: mattingFormat
                }
              }, '*');
            }
          };
          reader.readAsArrayBuffer(currentFile);
        }
      }
    } catch (error) {
      console.error('处理失败:', error);
      setProcessing(false);
      alert(`${tool === 'compress' ? t.compressError : t.mattingError}: ${(error as Error).message}`);
    }
  };

  const handleMattingFormatChange = (format: 'image/png' | 'image/jpeg') => {
    setMattingFormat(format);
    // 纯客户端状态切换，不触发 Sandbox 重新生成预览
    // 预览始终保持 PNG (透明)，只有下载时才处理 JPG (白底)
  };

  const exportImage = async () => {
    // 批量导出逻辑
    if (originalFiles.length > 1 && processedUrls.every(url => url)) {
        const zip = new JSZip();
        
        for (let i = 0; i < processedUrls.length; i++) {
            const url = processedUrls[i];
            if (!url) continue;
            
            const response = await fetch(url);
            const blob = await response.blob();
            // 获取对应原文件名（去除扩展名）
            const originalName = originalFiles[i].name.substring(0, originalFiles[i].name.lastIndexOf('.')) || originalFiles[i].name;
            // 确定扩展名
            let ext = 'jpg';
            if (activeTool === 'matting') {
                ext = mattingFormat === 'image/jpeg' ? 'jpg' : 'png';
            } else {
                ext = compressionFormat.split('/')[1] || 'png';
            }
            
            zip.file(`${originalName}_compressed.${ext}`, blob);
        }
        
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = "image.zip";
        link.click();
        return;
    }

    if (!processedUrl) return;
    
    // 如果是 AI 抠图且选择了 JPG，需要在下载前进行白底合成
    if (activeTool === 'matting' && mattingFormat === 'image/jpeg') {
        const img = new Image();
        img.src = processedUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // 填充白底
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                // 绘制原图
                ctx.drawImage(img, 0, 0);
                
                // 导出 JPG 并下载
                const jpgUrl = canvas.toDataURL('image/jpeg', 0.9);
                const link = document.createElement('a');
                link.href = jpgUrl;
                link.download = `imagemaster_matting_${Date.now()}.jpg`;
                link.click();
            }
        };
        return;
    }

    // 默认下载逻辑
    const link = document.createElement('a');
    link.href = processedUrl;
    // 抠图模式下使用 mattingFormat 对应的后缀，否则使用 compressionFormat
    const ext = activeTool === 'matting' ? (mattingFormat === 'image/jpeg' ? 'jpg' : 'png') : (compressionFormat.split('/')[1] || 'png');
    link.download = `imagemaster_${activeTool}_${Date.now()}.${ext}`;
    link.click();
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) processFiles([blob]);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // 全局拖拽事件处理
  const dragCounter = useRef(0);
  
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      // 检查是否包含文件，避免文本拖拽触发高亮
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDraggingFile(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // 必须阻止默认行为，否则 drop 事件不会触发
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      // 计数器归零说明离开了最外层元素
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDraggingFile(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDraggingFile(false);
      
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processFiles(Array.from(files));
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // 滑块拖拽逻辑
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDraggingSlider(true);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingSlider || !sliderRef.current) return; // 这里其实是指滑块拖拽
      const rect = sliderRef.current.parentElement?.getBoundingClientRect();
      if (!rect) return;
      let newPosition = ((e.clientX - rect.left) / rect.width) * 100;
      newPosition = Math.max(0, Math.min(100, newPosition));
      setSliderPosition(newPosition);
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingSlider(false);
    };

    if (isDraggingSlider) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingSlider, sliderRef, setIsDraggingSlider, setSliderPosition]);
  
  const handlePrevImage = () => {
    if (currentFileIndex > 0) {
      setCurrentFileIndex(currentFileIndex - 1);
    }
  };

  const handleNextImage = () => {
    if (currentFileIndex < originalFiles.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
    }
  };

  const deleteCurrentFile = () => {
    if (originalFiles.length <= 1) {
      clearImage();
      return;
    }

    const newOriginalFiles = originalFiles.filter((_, i) => i !== currentFileIndex);
    const newPreviewUrls = previewUrls.filter((_, i) => i !== currentFileIndex);
    const newImageInfos = imageInfos.filter((_, i) => i !== currentFileIndex);
    const newProcessedUrls = processedUrls.filter((_, i) => i !== currentFileIndex);
    const newOriginalFileSizes = originalFileSizes.filter((_, i) => i !== currentFileIndex);
    const newCompressedFileSizes = compressedFileSizes.filter((_, i) => i !== currentFileIndex);

    // Clean up revoked URL
    if (previewUrls[currentFileIndex]) URL.revokeObjectURL(previewUrls[currentFileIndex]);
    if (processedUrls[currentFileIndex]) URL.revokeObjectURL(processedUrls[currentFileIndex]!);

    setOriginalFiles(newOriginalFiles);
    setPreviewUrls(newPreviewUrls);
    setImageInfos(newImageInfos);
    setProcessedUrls(newProcessedUrls);
    setOriginalFileSizes(newOriginalFileSizes);
    setCompressedFileSizes(newCompressedFileSizes);

    // Adjust current index
    if (currentFileIndex >= newOriginalFiles.length) {
      setCurrentFileIndex(newOriginalFiles.length - 1);
    }
  };

  const [isHoveringPreview, setIsHoveringPreview] = useState<boolean>(false);

  return (
    <div style={{ padding: '24px', fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif', height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', backgroundColor: COLORS.bgMain, color: COLORS.textMain, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', height: '32px', flexShrink: 0 }}>
        <img 
          src={chrome.runtime.getURL(lang.startsWith('zh') ? 'assets/icons/logo_cn.svg' : 'assets/icons/logo_en.svg')} 
          alt="ImageMaster" 
          style={{ height: '24px', width: 'auto' }} 
        />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            className="gaoding-btn gaoding-btn-secondary icon-btn"
            style={{ padding: '6px', borderRadius: '6px', color: COLORS.textSecondary, cursor: 'pointer', position: 'relative' }}
            onClick={() => window.open('https://imagemaster.pages.dev/', '_blank')}
          >
            <Globe size={16} />
          </div>
          <div
            className="gaoding-btn gaoding-btn-secondary icon-btn"
            style={{ padding: '6px', borderRadius: '6px', color: COLORS.textSecondary, cursor: 'pointer', position: 'relative' }}
            onClick={() => setLang(prev => prev.startsWith('zh') ? 'en' : 'zh-CN')}
          >
            <Languages size={16} />
          </div>
        </div>
      </div>

      {/* Preview Header / Upload Header */}
      {previewUrl ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', height: '32px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: COLORS.textMain }}>{t.previewTitle}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!processing && !processedUrls.some(url => url !== null) && (
              <button
                onClick={() => {
                  setIsAppendingMode(true);
                  fileInputRef.current?.click();
                }}
                title={t.continueUpload}
                className="gaoding-btn gaoding-btn-secondary"
                style={{ padding: '6px 10px', borderRadius: '6px', color: COLORS.brand, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} /> {t.continueUpload}
              </button>
            )}
            {!processing && !processedUrls.some(url => url !== null) && (
              <button
                onClick={clearImage}
                className="gaoding-btn gaoding-btn-secondary"
                style={{ padding: '6px 10px', borderRadius: '6px', color: COLORS.textSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title={t.back}
              >
                <ChevronLeft size={14} /> {t.back}
              </button>
            )}
            {!processing && processedUrls.some(url => url !== null) && (
                <button
                    onClick={() => {
                        // 返回编辑模式
                        setProcessedUrls(new Array(originalFiles.length).fill(null));
                        setCompressedFileSizes(new Array(originalFiles.length).fill(null));
                        setProcessing(false);
                        setMattingProgress(0);
                        setIsCancelled(true);
                    }}
                    className="gaoding-btn gaoding-btn-secondary"
                    style={{ padding: '6px 10px', borderRadius: '6px', color: COLORS.textSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title={t.back}
                >
                    <ChevronLeft size={14} /> {t.back}
                </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', height: '32px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: COLORS.textMain }}>{t.editTitle}</h3>
          {/* Placeholder for layout stability if needed, but flex-between handles it */}
        </div>
      )}

      {/* Upload/Preview Area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onMouseEnter={() => setIsHoveringPreview(true)}
        onMouseLeave={() => setIsHoveringPreview(false)}
        className={`gaoding-card ${!previewUrl ? 'gaoding-upload-area' : ''}`}
        style={{
          flex: '0 0 300px', // 固定高度，不缩放
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '12px',
          backgroundColor: isDraggingFile ? '#e6f7ff' : (previewUrl ? COLORS.bgSecondary : '#ffffff'),
          cursor: previewUrl ? 'default' : 'pointer',
          overflow: 'hidden',
          position: 'relative',
          border: isDraggingFile ? `2px dashed ${COLORS.brand}` : (previewUrl ? `1px solid ${COLORS.border}` : undefined),
          transition: 'background-color 0.2s, border-color 0.2s',
          /* 移除 transition: all，让清空操作瞬间完成，不再产生背景色渐变的残影 */
        }}
        onClick={() => !previewUrl && fileInputRef.current?.click()}
      >
        {!previewUrl && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            backgroundColor: '#00d1d1', // 青色背景，类似图中样式
            color: 'white',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 'normal',
            borderBottomLeftRadius: '12px',
            zIndex: 5
          }}>
            {t.freeUse}
          </div>
        )}
        {previewUrl ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* Carousel Controls */}
            {originalFiles.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                  disabled={currentFileIndex === 0}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: currentFileIndex === 0 ? 'not-allowed' : 'pointer',
                    opacity: currentFileIndex === 0 ? 0.3 : 1,
                    zIndex: 20,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                  disabled={currentFileIndex === originalFiles.length - 1}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: currentFileIndex === originalFiles.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: currentFileIndex === originalFiles.length - 1 ? 0.3 : 1,
                    zIndex: 20,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                {/* Page Indicator */}
                <div style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '10px',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  zIndex: 20
                }}>
                  {currentFileIndex + 1} / {originalFiles.length}
                </div>
              </>
            )}

            {/* Batch Delete Button */}
            {originalFiles.length > 1 && isHoveringPreview && !processing && !processedUrls[currentFileIndex] && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCurrentFile();
                }}
                className="delete-overlay-btn"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  zIndex: 30,
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.2s',
                  fontSize: '12px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#ff4d4f';
                  const icon = e.currentTarget.querySelector('svg');
                  if (icon) icon.style.color = '#ff4d4f';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = 'white';
                  const icon = e.currentTarget.querySelector('svg');
                  if (icon) icon.style.color = 'white';
                }}
              >
                <Trash2 size={16} style={{ transition: 'color 0.2s' }} />
                <span style={{ fontWeight: 500 }}>{t.deleteImage}</span>
              </button>
            )}

            {processedUrl && activeTool === 'matting' ? (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <img src={previewUrl || ''} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} alt="Original" />
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`, overflow: 'hidden' }}>
                  <img src={processedUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%, #eee), linear-gradient(45deg, #eee 25%, white 25%, white 75%, #eee 75%, #eee)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 10px 10px' }} alt="Matted" />
                </div>
                <div ref={sliderRef} onMouseDown={handleMouseDown} style={{ position: 'absolute', left: `calc(${sliderPosition}% - 20px)`, top: '0', height: '100%', width: '40px', cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                  <div style={{ width: '4px', height: '100%', backgroundColor: 'white', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}></div>
                  <div style={{ position: 'absolute', width: '32px', height: '32px', backgroundColor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}>
                    <GripVertical size={18} color={COLORS.textMain} />
                  </div>
                </div>
              </div>
            ) : processedUrl && activeTool === 'compress' ? (
              <img src={processedUrl} style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain' }} alt="Compressed" />
            ) : (
              <img src={previewUrl || ''} style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain' }} alt="Preview" />
            )}
            {processing && !processedUrl && (
              <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', zIndex: 20 }}>
                <Loader2 size={44} className="spin-animation" style={{ color: COLORS.brand, marginBottom: '16px' }} />
                <span style={{ color: COLORS.textMain, fontWeight: 600, fontSize: '15px' }}>
                  {activeTool === 'matting' && !isPreloaded ? t.loadingModel : (activeTool === 'compress' ? t.processingCompress : t.processingMatting)}
                  {((activeTool === 'matting' && isPreloaded) || activeTool === 'compress') && mattingProgress > 0 && ` (${mattingProgress}%)`}
                </span>
                
                {activeTool === 'matting' && (
                    <button
                        onClick={() => {
                            // 发送取消消息给 sandbox (虽然 sandbox 无法真正中断 JS 执行，但可以停止后续步骤)
                            if (sandboxIframeRef.current && sandboxIframeRef.current.contentWindow) {
                                // 这里我们其实无法真正中断 worker，但可以重置 UI 状态
                                // 实际中断需要 terminate worker，目前架构暂不支持，我们先做 UI 层的"取消"
                            }
                            setProcessing(false);
                            setMattingProgress(0);
                            setIsCancelled(true); // Set cancel state
                            if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = COLORS.danger}
                        onMouseOut={(e) => e.currentTarget.style.color = COLORS.textSecondary}
                        className="gaoding-btn gaoding-btn-secondary"
                        style={{ 
                            marginTop: '12px',
                            padding: '6px 16px', 
                            borderRadius: '6px', 
                            color: COLORS.textSecondary, 
                            fontSize: '13px', 
                            border: `1px solid ${COLORS.border}`,
                            backgroundColor: 'white',
                            transition: 'color 0.2s'
                        }}
                    >
                        {t.cancel}
                    </button>
                )}
              </div>
            )}
            {processing && processedUrl && (
              <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)', zIndex: 20 }}>
                <Loader2 size={32} className="spin-animation" style={{ color: COLORS.brand, marginBottom: '8px' }} />
                <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 500, color: COLORS.textMain }}>
                  {t.converting}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div 
               className="gaoding-btn gaoding-btn-primary" 
               style={{ 
                 width: '80%', 
                 padding: '12px',
                 height: '44px', 
                 borderRadius: '8px', 
                 margin: '0 auto 20px', 
                 fontSize: '15px',
                 boxSizing: 'border-box'
               }}
             >
               <Upload size={20} />
               {t.uploadImage}
             </div>
             <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '16px', color: COLORS.textMain, whiteSpace: 'nowrap' }}>
               <span 
                 onClick={handlePasteClick} 
                 style={{ color: COLORS.brand, cursor: 'pointer', textDecoration: 'none' }}
               >
                 {t.pasteImage}
               </span> {t.dragImage}
             </div>
            <div style={{ fontSize: '13px', color: COLORS.textCaption }}>{t.supportFormats}</div>
          </div>
        )}
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" multiple onChange={handleFileChange} />
        <iframe 
          ref={sandboxIframeRef} 
          src={chrome.runtime.getURL('sandbox.html')} 
          style={{ display: 'none' }} 
          // 显式赋予权限以启用 Cache Storage 和 WebGPU
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          onLoad={preloadModels}
        />
      </div>

      {/* Image Info */}
      {imageInfo && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 0.8fr', gap: '8px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', padding: '12px', marginBottom: '12px', flexShrink: 0 }}>
          {[
            { label: t.sizeLabel, value: `${imageInfo.width} × ${imageInfo.height}` },
            { label: t.fileSizeLabel, value: formatFileSize(imageInfo.size) },
            { label: t.formatLabel, value: imageInfo.type }
          ].map((item, idx) => (
            <div key={idx} style={{ textAlign: 'left', overflow: 'hidden' }}>
              <div style={{ fontSize: '12px', color: COLORS.textCaption, marginBottom: '4px', whiteSpace: 'nowrap' }}>{item.label}</div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: COLORS.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Model Selector - 已移除，默认使用 RMBG-1.4 */}

      {/* AI Loading Hint - 仅在抠图模式且未完成预加载且从未成功加载过模型时显示 */}
      {previewUrl && activeTool === 'matting' && !processedUrl && !isPreloaded && !hasLoadedModel && (
        <div style={{ 
          marginBottom: '12px', 
          padding: '10px 12px', 
          backgroundColor: '#fff7e6', 
          borderRadius: '8px', 
          border: '1px solid #ffe58f',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Zap size={14} color="#faad14" />
          <span style={{ fontSize: '12px', color: '#d48806', lineHeight: 1.4 }}>
            {t.firstTimeModelLoad}
          </span>
        </div>
      )}

      {/* Tools Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
        {previewUrl && !processedUrl && !processing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px', height: '80px', flexShrink: 0 }}>
              {[
                { id: 'compress', name: t.compressTool, icon: ImageIcon, color: COLORS.brand },
                { id: 'matting', name: t.mattingTool, icon: Sparkles, color: COLORS.purple }
              ].map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id as any)}
                  className={`gaoding-btn gaoding-card gaoding-tool-btn ${activeTool === tool.id ? 'gaoding-tool-btn-active' : ''}`}
                  style={{
                    flex: 1, padding: '12px', flexDirection: 'column', gap: '4px',
                    color: activeTool === tool.id ? tool.color : undefined,
                    borderColor: activeTool === tool.id ? tool.color : undefined,
                    justifyContent: 'center'
                  }}
                >
                  <tool.icon size={20} style={{ color: activeTool === tool.id ? tool.color : undefined }} />
                  <span style={{ fontSize: '13px' }}>{tool.name}</span>
                </button>
              ))}
            </div>

            {/* Batch Matting Warning */}
            {activeTool === 'matting' && originalFiles.length > 1 && (
              <div style={{ 
                padding: '10px 12px', 
                backgroundColor: '#fff7e6', 
                borderRadius: '8px', 
                border: '1px solid #ffe58f',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={14} color="#faad14" />
                <span style={{ fontSize: '12px', color: '#d48806', lineHeight: 1.4 }}>
                  {t.batchMattingWarning}
                </span>
              </div>
            )}

            <div style={{ flex: 1 }}>
              {activeTool === 'compress' && (
                <div className="gaoding-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{t.compressQuality}</span>
                      <span style={{ fontSize: '14px', color: COLORS.brand, fontWeight: 600 }}>{Math.round(compressionQuality * 100)}%</span>
                    </div>
                    <input type="range" min="0.1" max="1" step="0.05" value={compressionQuality} onChange={(e) => setCompressionQuality(parseFloat(e.target.value))} style={{ width: '100%' }} />
                    <div style={{ fontSize: '12px', color: COLORS.textCaption, marginTop: '6px' }}>
                      {compressionQuality >= 0.9 ? t.qualityHigh :
                        compressionQuality >= 0.75 ? t.qualityBalanced :
                        compressionQuality >= 0.5 ? t.qualitySize :
                        compressionQuality >= 0.3 ? t.qualityDeep :
                        t.qualityExtreme}
                    </div>
                  </div>
                  <button onClick={() => startProcessing('compress')} className="gaoding-btn gaoding-btn-primary" style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '15px', height: '44px', boxSizing: 'border-box' }}>
                    <Zap size={18} /> {originalFiles.length > 1 ? t.startCompressAll : t.startCompress}
                  </button>
                </div>
              )}

            {activeTool === 'matting' && originalFiles.length === 1 && (
                <div className="gaoding-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* AI Model Selection */}
                  <div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                       <label style={{ fontSize: '14px', fontWeight: 600, color: COLORS.textMain, display: 'flex', alignItems: 'center' }}>
                         {t.aiModel}
                       </label>
                       <div style={{ fontSize: '14px', color: COLORS.textCaption }}>
                          {t.aiModelDesc}
                        </div>
                       </div>
                       
                       <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setMattingModel('rmbg14')}
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: '6px',
                          border: `1px solid ${mattingModel === 'rmbg14' ? COLORS.brand : '#d9d9d9'}`,
                          backgroundColor: mattingModel === 'rmbg14' ? '#e6f7ff' : '#fff',
                          color: mattingModel === 'rmbg14' ? COLORS.brand : COLORS.textMain,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>RMBG-1.4</span>
                      </button>
                      
                      <button
                        onClick={() => setMattingModel('u2net')}
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: '6px',
                          border: `1px solid ${mattingModel === 'u2net' ? COLORS.brand : '#d9d9d9'}`,
                          backgroundColor: mattingModel === 'u2net' ? '#e6f7ff' : '#fff',
                          color: mattingModel === 'u2net' ? COLORS.brand : COLORS.textMain,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>U2Net</span>
                      </button>
                    </div>

                    <div style={{ marginTop: '8px', fontSize: '11px', color: COLORS.textCaption }}>
                        {mattingModel === 'rmbg14' ? t.modelRmbgDesc : t.modelU2netDesc}
                    </div>
                  </div>
                  
                  {/* Format selection moved to result view */}

                  <button 
                    onClick={() => startProcessing('matting')} 
                    className="gaoding-btn gaoding-btn-primary" 
                    style={{ 
                      width: '100%', 
                      padding: '12px', 
                      borderRadius: '8px', 
                      fontSize: '15px', 
                      background: originalFiles.length > 1 ? '#ccc' : 'linear-gradient(90deg, #9F55FF 0%, #7000FF 100%)', 
                      border: 'none',
                      cursor: originalFiles.length > 1 ? 'not-allowed' : 'pointer',
                      opacity: originalFiles.length > 1 ? 0.7 : 1,
                      pointerEvents: originalFiles.length > 1 ? 'none' : 'auto',
                      height: '44px',
                      boxSizing: 'border-box'
                    }}
                    disabled={originalFiles.length > 1}
                    title={originalFiles.length > 1 ? t.batchMattingTooltip : ""}
                  >
                    <Sparkles size={18} /> {t.startMatting}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {processedUrl && !processing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Compression Stats (Only show for compress tool) */}
            {activeTool === 'compress' && originalFileSize && compressedFileSize && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 0.8fr', gap: '8px', backgroundColor: COLORS.bgSecondary, borderRadius: '8px', padding: '12px', flexShrink: 0 }}>
                {[
                  { label: t.originalSize, value: formatFileSize(originalFileSize) },
                  { label: t.compressedSize, value: formatFileSize(compressedFileSize) },
                  { label: t.saved, value: `${Math.round(((originalFileSize - compressedFileSize) / originalFileSize) * 100)}%`, color: COLORS.success }
                ].map((item, idx) => (
                  <div key={idx} style={{ textAlign: 'left', overflow: 'hidden' }}>
                    <div style={{ fontSize: '11px', color: COLORS.textCaption, marginBottom: '4px', whiteSpace: 'nowrap' }}>{item.label}</div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: item.color || COLORS.textMain, whiteSpace: 'nowrap' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}
            
            {activeTool === 'matting' && (
              <div style={{ marginTop: '4px', flexShrink: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>{t.outputFormat}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { label: 'PNG', value: 'image/png' },
                    { label: 'JPG', value: 'image/jpeg' }
                  ].map((format) => (
                    <button
                      key={format.value}
                      onClick={() => handleMattingFormatChange(format.value as any)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: `1px solid ${mattingFormat === format.value ? COLORS.brand : '#d9d9d9'}`,
                        backgroundColor: mattingFormat === format.value ? '#e6f7ff' : '#fff',
                        color: mattingFormat === format.value ? COLORS.brand : COLORS.textMain,
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {format.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: COLORS.textCaption, marginTop: '8px' }}>
                  {mattingFormat === 'image/png' ? t.mattingPngDesc : t.mattingJpgDesc}
                </div>
              </div>
            )}
            
            {activeTool === 'compress' && (
              <div style={{ marginTop: '4px', flexShrink: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>{t.outputFormat}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { label: 'JPG', value: 'image/jpeg', disabled: ['image/gif'].includes(imageInfo?.type ? `image/${imageInfo.type.toLowerCase()}` : '') },
                    { label: 'PNG', value: 'image/png', disabled: ['image/gif'].includes(imageInfo?.type ? `image/${imageInfo.type.toLowerCase()}` : '') },
                    { label: 'WebP', value: 'image/webp', disabled: false }
                  ].map((format) => (
                    <button
                      key={format.value}
                      onClick={() => !format.disabled && setCompressionFormat(format.value)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: `1px solid ${compressionFormat === format.value ? COLORS.brand : '#d9d9d9'}`,
                        backgroundColor: format.disabled 
                          ? '#f5f5f5' 
                          : compressionFormat === format.value ? '#e6f7ff' : '#fff',
                        color: format.disabled 
                          ? '#ccc' 
                          : compressionFormat === format.value ? COLORS.brand : COLORS.textMain,
                        fontSize: '13px',
                        cursor: format.disabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        opacity: format.disabled ? 0.6 : 1
                      }}
                    >
                      {format.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: COLORS.textCaption, marginTop: '8px' }}>
                  {compressionFormat === 'image/jpeg' && t.formatJpgDesc}
                  {compressionFormat === 'image/png' && t.formatPngDesc}
                  {compressionFormat === 'image/webp' && t.formatWebpDesc}
                </div>
              </div>
            )}

            {/* Download Button */}
            {processedUrl && (
              <div>
                <button
                  onClick={exportImage}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: COLORS.brand,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 8px rgba(34, 84, 244, 0.2)',
                    height: '44px',
                    boxSizing: 'border-box'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a44cc';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = COLORS.brand;
                  }}
                >
                  <Download size={18} />
                  {originalFiles.length > 1 ? t.downloadAll : t.downloadImage}
                </button>
              </div>
            )}

            <button 
              onClick={() => {
                setIsAppendingMode(false);
                fileInputRef.current?.click();
              }}
              className="gaoding-btn gaoding-btn-secondary" 
              style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '14px', flexShrink: 0, height: '44px', boxSizing: 'border-box' }}
            >
              <Upload size={18} /> {t.reupload}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Sidebar />);
}