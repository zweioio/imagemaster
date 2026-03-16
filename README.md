# ImageMaster（图片编辑大师）
 
ImageMaster 是一款免费且专业的图片处理 Chrome 扩展，集成「图片压缩、AI 抠图、格式转换」三大核心功能。所有图片处理尽可能在本地浏览器完成，减少上传依赖，更注重隐私与效率。
 
## English
 
ImageMaster is a free, privacy-focused Chrome extension for image processing. It integrates three core features: image compression, AI background removal, and format conversion. Most processing is performed locally in your browser to reduce upload dependency and improve privacy and speed.
 
### Features
 
- Image Compression: JPG / PNG / WebP / GIF, batch processing, real-time preview
- AI Background Remover: one-click background removal (local AI model + WebAssembly)
- Format Conversion: convert between PNG / JPG / WebP
- Context Menu: right-click any image on a webpage to process it
 
### Install
 
- Chrome Web Store:  
  https://chromewebstore.google.com/detail/imagemaster/pkkjfnmjnepmjdijallcigepemjllkao
 
- Offline package (for manual install / testing):  
  https://github.com/zweioio/imagemaster/releases/latest/download/imagemaster.zip
 
### Usage
 
1. Click the extension icon to open the Side Panel
2. Upload/drag images, choose Compression / Matting / Conversion
3. Download the processed result with one click
 
## 功能
 
- 图片压缩：支持 JPG / PNG / WebP / GIF，支持批量处理与实时预览
- AI 抠图：一键去除背景（本地 AI 模型 + WebAssembly）
- 格式转换：PNG / JPG / WebP 互转
- 右键菜单：在网页图片上右键即可快速处理
 
## 安装
 
- Chrome 应用商店：  
  https://chromewebstore.google.com/detail/imagemaster/pkkjfnmjnepmjdijallcigepemjllkao
 
- 本地下载（用于离线安装/内测）：  
  https://github.com/zweioio/imagemaster/releases/latest/download/imagemaster.zip
 
## 使用方式
 
1. 点击浏览器工具栏中的扩展图标，打开侧边栏
2. 上传/拖拽图片，选择「压缩 / 抠图 / 转换」并处理
3. 处理完成后一键下载
 
## 隐私
 
隐私政策页面：`website/privacy.html`  
部署后可通过 `https://<your-domain>/privacy.html` 访问。
 
## 开发
 
本项目使用 React + Webpack（MV3 Side Panel），包含本地模型与 Sandbox 页面。
 
```bash
npm install
npm run build
```
 
构建产物在 `dist/`，可在 Chrome「扩展程序」页面中打开开发者模式后加载该目录。
 
## License
 
MIT
