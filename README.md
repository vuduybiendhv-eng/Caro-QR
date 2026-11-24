# Caro LIVE QR — starter kit

Phòng mẫu cho `@mbbb1118`, tên phòng `Caro Live`. Đây là mã nguồn khởi đầu có web game, QR, bảng quản trị, hàng chờ và đồng bộ realtime. Chưa phải dịch vụ đã được deploy và chưa tự nhận quà TikTok cho tới khi nối một nguồn sự kiện LIVE đáng tin cậy.

## Yêu cầu
- Node.js 20+
- Một máy chủ hỗ trợ Node.js + WebSocket + HTTPS (Render, Railway, VPS hoặc máy chủ riêng)
- OBS để đưa overlay QR và bàn cờ lên LIVE

## Chạy thử
```bash
cp .env.example .env
# sửa ADMIN_PIN, GIFT_WEBHOOK_TOKEN, PUBLIC_BASE_URL
npm install
npm start
```
Mở:
- `/play` — người xem
- `/admin.html` — bảng quản trị
- `/qr.html` — QR để thêm vào OBS
- `/api/qr` — ảnh QR PNG

Nếu chạy local, điện thoại không thể quét QR dùng `localhost`. Cần cùng mạng LAN và dùng IP LAN, hoặc deploy HTTPS công khai rồi đặt `PUBLIC_BASE_URL`.

## Kết nối nguồn quà tặng
Máy chủ có endpoint:
`POST /api/gifts`
Header: `x-gift-token: <GIFT_WEBHOOK_TOKEN>`
Body:
```json
{"event":"gift","username":"viewer_handle","giftName":"Rose"}
```
Chỉ cấu hình bridge từ một nhà cung cấp sự kiện LIVE mà bạn tin cậy, có thể gửi webhook/HTTP. Adapter phải chuyển sự kiện quà thật sang đúng cấu trúc trên. Không cho trình duyệt người xem gọi endpoint này. Không nhập mật khẩu TikTok vào ứng dụng.

Lưu ý: cách lấy sự kiện LIVE có thể dựa trên API riêng/không chính thức của bên thứ ba, có thể thay đổi hoặc bị giới hạn. TikTok yêu cầu quy trình xét duyệt đối với các API/SDK chính thức; không được mặc định có API công khai để đọc mọi quà LIVE.

## OBS
1. Thêm Browser Source cho `https://YOUR-DOMAIN/qr.html` để hiển thị mã QR.
2. Thêm Browser Source cho `https://YOUR-DOMAIN/admin.html` nếu muốn xem bảng điều khiển; không phát trang quản trị ra LIVE.
3. Để đưa bàn cờ sạch lên LIVE, dùng `/play` trong Browser Source hoặc tạo overlay riêng sau khi triển khai.

## Bảo mật và giới hạn bản mẫu
- Đổi cả hai secret trước khi public.
- Dùng HTTPS; không public `ADMIN_PIN`.
- Dùng reverse proxy bảo vệ endpoint, rate-limit và lưu trạng thái vào database trước khi chạy lâu dài.
- Bản mẫu giữ trạng thái trong RAM; restart máy chủ sẽ mất ván, hàng chờ và điểm.
- Bản mẫu dùng tên TikTok do người xem nhập để đối chiếu với webhook; nên bổ sung xác minh danh tính/nonce trước khi mở cho công chúng.
- Mỗi ván: chủ LIVE X, người xem O. Chỉ người được chọn mới được đánh O; thắng khi có 5 quân liên tiếp.


## TikFinity-to-Railway bridge (Windows LIVE PC)
The Railway server cannot reach `localhost:21213` on your home PC. Run this bridge on the same PC as TikFinity Desktop; it listens locally and sends only gift events to Railway.

1. Install Node.js 20+ on the LIVE PC.
2. Download/extract this project on that PC.
3. In a terminal in the project folder, run `npm install`.
4. Set environment variables in PowerShell for the current window:
```powershell
$env:CARO_PUBLIC_URL="https://YOUR-RAILWAY-DOMAIN"
$env:GIFT_WEBHOOK_TOKEN="THE_SAME_LONG_SECRET_SET_ON_RAILWAY"
npm run bridge
```
5. Start TikFinity Desktop, complete setup, connect `@mbbb1118` and start/attach to the LIVE.
6. Keep the bridge terminal running. When a gift arrives, it should print `Gift forwarded...` and the viewer appears in the Caro queue.

TikFinity documents its local Event API at `ws://localhost:21213/`, with messages shaped as `{ "event":"gift", "data":{...} }`; Desktop must run on the same computer. Payload fields may vary; if the bridge logs an unrecognized gift payload, inspect that sample and update the field mapper before relying on it. The Event API is not a public remote endpoint, which is why the local bridge is required.

Do not run `npm run bridge` on Railway. Run it on the same computer as TikFinity Desktop. Do not expose port 21213 to the internet.

OBS overlay-only page: `/overlay.html` (read-only board and scores; do not add `/admin.html` as a public stream source).


## Two-Android mode (no computer / no OBS)
Use manual gift confirmation:
1. Phone 1 runs TikTok LIVE.
2. Phone 2 opens `/admin.html`.
3. When a gift appears on Phone 1, type the viewer's TikTok handle into "Thêm người đã tặng quà" on Phone 2 and tap "Xác nhận quà".
4. Choose that viewer from the queue.
5. The viewer opens `/play` on their own phone and taps the board on their turn.
6. Phone 2 controls host X moves on the admin board.

This mode does not automatically read TikTok gifts. It is designed for the stated two-Android-only setup. Do not enter a user until you have visibly confirmed their gift on TikTok LIVE.

QR/visibility limitation: a QR shown on Phone 2 is not automatically overlaid on the TikTok camera feed from Phone 1. You can show the QR on Phone 2 to Phone 1's camera briefly, or pin/share the short `/play` URL in LIVE chat if TikTok features allow. The board on Phone 2 also will not appear as a LIVE overlay without a supported screen-share/broadcast workflow. A two-phone setup can run the game/admin, but cannot guarantee a composited on-stream board and QR simultaneously.
