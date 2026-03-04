import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Image, Scissors, Settings } from 'lucide-react';
import { getLocale } from './locales';

const Popup = () => {
  const [lang] = useState<string>(() => {
    return localStorage.getItem('imagemaster_lang') || navigator.language;
  });
  const t = useMemo(() => getLocale(lang), [lang]);

  const handleOpenTool = async (tool: string) => {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    if (tab?.id) {
      // 打开侧边栏
      await chrome.sidePanel.open({ tabId: tab.id });
      
      // 发送消息给侧边栏，告诉它用户选择了哪个工具
      // 注意：由于侧边栏打开可能需要一点点时间，这里我们可以延迟发送或在侧边栏准备好后拉取
      chrome.runtime.sendMessage({
        type: 'SWITCH_TOOL',
        tool: tool
      });
    }
  };

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>ImageMaster</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          style={buttonStyle}
          onClick={() => handleOpenTool('compress')}
        >
          <Image size={18} /> {t.popupCompress}
        </button>
        <button 
          style={buttonStyle}
          onClick={() => handleOpenTool('matting')}
        >
          <Scissors size={18} /> {t.popupMatting}
        </button>
        <hr style={{ margin: '8px 0', border: '0', borderTop: '1px solid #eee' }} />
        <button 
          style={buttonStyle}
          onClick={() => console.log('Settings clicked')}
        >
          <Settings size={18} /> {t.popupSettings}
        </button>
      </div>
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  backgroundColor: '#fff',
  cursor: 'pointer',
  textAlign: 'left'
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Popup />);
}
