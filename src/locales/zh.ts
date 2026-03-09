export default {
  // Sidebar
  previewTitle: "图片预览",
  editTitle: "图片编辑",
  continueUpload: "继续上传",
  back: "返回",
  freeUse: "免费使用",
  deleteImage: "删除图片",
  processingCompress: "正在压缩...",
  processingMatting: "正在抠图...",
  loadingModel: "正在加载 AI 模型...",
  cancel: "取消",
  converting: "正在转换...",
  uploadImage: "上传图片",
  pasteImage: "粘贴图片",
  dragImage: "或 拖拽图片 到此处",
  supportFormats: "支持 WebP、JPG、PNG 格式",
  
  // Image Info
  sizeLabel: "尺寸",
  fileSizeLabel: "大小",
  formatLabel: "格式",
  
  // Warnings & Hints
  firstTimeModelLoad: "首次使用将会自动加载 AI 模型，预计10~30秒...",
  batchMattingWarning: "多张图片暂不支持 AI 抠图，请修改为单张图片",
  batchMattingTooltip: "批量模式下暂不支持 AI 抠图，请切换到单张模式",
  
  // Tools
  compressTool: "图片压缩",
  mattingTool: "AI 抠图",
  
  // Compression Settings
  compressQuality: "压缩质量",
  qualityHigh: "画质优先：肉眼无损，保留细节",
  qualityBalanced: "平衡推荐：最佳平衡，体积减半",
  qualitySize: "体积优先：体积超小，画质尚可",
  qualityDeep: "深度压缩：适合预览，画质一般",
  qualityExtreme: "极限压缩：仅关注体积，画质较差",
  startCompress: "开始压缩",
  startCompressAll: "开始压缩所有图片",
  
  // Matting Settings
  aiModel: "AI 模型",
  aiModelDesc: "自动识别主体并去除背景",
  modelRmbgDesc: "通用 / 快速：适合大多数场景，速度快，边缘处理自然，适合简单场景",
  modelU2netDesc: "高精度 / 大模型：U2Net 模型较大 (约170MB)，首次加载慢，细节更丰富。建议在 Wi-Fi 下使用",
  startMatting: "开始抠图",
  
  // Result
  originalSize: "原来大小",
  compressedSize: "压缩后",
  saved: "已节省",
  outputFormat: "输出格式",
  mattingPngDesc: "背景透明，高清无损",
  mattingJpgDesc: "白色背景，体积更小",
  formatJpgDesc: "适合照片，体积小，有损",
  formatPngDesc: "适合截图/透明图，体积大，无损",
  formatWebpDesc: "谷歌推荐，体积超小",
  downloadImage: "下载图片",
  downloadAll: "下载所有图片",
  reupload: "重新上传",
  
  // Errors & Alerts
  mattingError: "AI 抠图失败",
  mattingErrorNetwork: "请确保网络连接正常（可能需要魔法）。",
  mattingGifError: "AI 抠图不支持 GIF 动图，请上传静态图片。",
  mattingWebpError: "AI 抠图不支持 WebP 动图，请上传静态图片。",
  mattingBatchError: "AI 抠图目前仅支持单张图片处理，将只处理当前选中的图片。",
  compressError: "压缩失败",
  clipboardNoImage: "剪贴板中没有图片，请先复制图片后再试。",
  clipboardError: "无法直接读取剪贴板（可能需要授权）。您可以直接使用 Ctrl+V 或右键粘贴。",
  batchLimit: "最多支持批量上传 20 张图片，已自动截取前 20 张。",
  batchGifWarning: "批量处理暂不支持 GIF 格式，已自动过滤 GIF 文件。如需处理 GIF，请单独上传。",

  // Popup
  popupCompress: "图片压缩",
  popupMatting: "AI 抠图",
  popupSettings: "设置",
  
  // Header
  website: "访问官网"
};
