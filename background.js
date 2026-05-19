chrome.runtime.onInstalled.addListener(() => {
  console.log('[Xiangqi Bot] installed');
});

const NATIVE_HOST = 'com.duongstark.xiangqi_bot';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'NATIVE_START_SERVER' && msg.type !== 'NATIVE_HEALTH') return;

  const nativeMsg = {
    type: msg.type === 'NATIVE_START_SERVER' ? 'START_SERVER' : 'HEALTH',
  };

  chrome.runtime.sendNativeMessage(NATIVE_HOST, nativeMsg, (res) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse(res || { ok: false, error: 'empty native response' });
  });

  return true;
});
