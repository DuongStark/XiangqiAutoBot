# Xiangqi Bot Helper

Chrome extension học tập cho `play.xiangqi.com`: đọc bàn cờ, gọi Pikafish qua server local, rồi gợi ý hoặc tự đi nước.

Mục tiêu chính là test local / luyện với bot. Không dùng để đánh người thật.

## Cấu trúc

```text
xiangqi-bot/
├── engine/                 gitignored, tải bằng download_engine.py
├── icons/                  icon extension
├── manifest.json           Chrome MV3 manifest
├── content.js              đọc DOM, FEN, highlight, auto move
├── popup.html / popup.js   giao diện extension
├── server.py               HTTP wrapper quanh Pikafish
└── download_engine.py      tải Pikafish binary
```

## Chạy

Tải engine:

```powershell
python download_engine.py
```

Chạy server:

```powershell
python server.py
```

Load extension:

1. Mở `chrome://extensions`
2. Bật `Developer mode`
3. Chọn `Load unpacked`
4. Chọn thư mục repo này

Sau đó mở `play.xiangqi.com`, bấm icon extension, rồi `Start bot`.
