# Xiangqi Bot Helper

Chrome extension học tập: đọc thế cờ trên play.xiangqi.com → gọi Pikafish (qua Python local server) → highlight nước đi gợi ý lên bàn cờ.

**Mục đích:** học về DOM parsing, UCI protocol, browser extension. Chỉ dùng để tự test với máy/bot, không dùng để đấu người thật.

## Cấu trúc

```
xiangqi-bot/
├── engine/                 (gitignored — chạy download_engine.py để tải)
│   ├── pikafish.exe
│   └── pikafish.nnue
├── manifest.json           Extension manifest (MV3)
├── content.js              Đọc DOM → FEN, highlight overlay
├── popup.html / popup.js   UI nút bấm
├── background.js           Service worker
├── server.py               HTTP wrapper quanh Pikafish (port 8080)
└── download_engine.py      Tải Pikafish binary từ GitHub release
```

## Cài đặt

**1. Tải engine:**
```powershell
python download_engine.py
```

**2. Load extension:**
- Mở `chrome://extensions` → bật Developer mode
- Load unpacked → chọn thư mục này

## Sử dụng

**1. Chạy server (terminal riêng):**
```powershell
python server.py
```

**2. Mở play.xiangqi.com, click icon extension:**
- **Test content script** — verify content script đã chạy
- **Test Pikafish server** — verify server + engine OK
- **Đọc thế cờ → FEN** — parse bàn cờ thành FEN
- **Gợi ý nước đi** — chọn lượt + thinking time, bấm để highlight nước đi tốt nhất (vàng = từ, đỏ = đến)

## Lưu ý

- CPU mặc định dùng `pikafish-bmi2.exe` (Intel/AMD đời mới có BMI2). Nếu CPU cũ hơn, sửa `CPU_BUILD` trong `download_engine.py` thành `pikafish-sse41-popcnt.exe`.
- Phải tự chọn lượt (đỏ/đen) trong popup — chưa auto detect.
