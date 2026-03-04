// content.ts - 运行在网页上下文中的脚本

console.log('ImageMaster content script loaded');

// 可以在这里监听网页中的图片，或者处理从 background 发来的指令
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'OK' });
  }
});
