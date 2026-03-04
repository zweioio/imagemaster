// background.ts - Service Worker

// 监听扩展图标点击事件，直接打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidebar.html',
      enabled: true
    });
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// 监听安装事件，创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "processWithImageMaster",
    title: chrome.i18n.getMessage("contextMenuProcess"),
    contexts: ["image"]
  });
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "processWithImageMaster" && info.srcUrl) {
    if (tab?.id) {
      chrome.sidePanel.open({ tabId: tab.id }).then(() => {
        // 确保侧边栏打开后发送消息
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: "PROCESS_IMAGE",
            imageUrl: info.srcUrl
          });
        }, 500);
      });
    }
  }
});
