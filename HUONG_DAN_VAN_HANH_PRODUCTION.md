# Hướng dẫn vận hành production - Manager Coffee

## Những phần đã được gia cố

- Checkout/offline sync có `clientRequestId` để chống tạo trùng hóa đơn khi mạng chập chờn hoặc app gửi lại request.
- API có `/api/health` để kiểm tra server còn sống và `/api/ready` để kiểm tra kết nối database.
- Admin có `/api/integrations/status` và tab "Tích hợp ngoài" trong Cấu hình cửa hàng để xem trạng thái QR ngân hàng, webhook, HĐĐT, GrabFood/ShopeeFood/Web Order và máy in.
- Webhook thanh toán chỉ tự đối soát theo mã cửa hàng, kiểm tra số tiền nếu webhook gửi amount, và fallback toàn hệ thống chỉ bật trong dev/test khi cấu hình rõ.
- Endpoint in LAN chỉ cho IP private/LAN và port hợp lệ, tránh việc server bị dùng để mở socket tới địa chỉ tùy ý.
- Backup JSON có cả API export và script CLI. Restore catalog có khóa xác nhận mã store để tránh bấm nhầm.

## Lệnh backup/restore catalog

Tạo backup cho một cửa hàng:

```bash
npm run backup:store -- --store-code espresso-lab
```

Chạy thử restore catalog, chưa ghi dữ liệu:

```bash
npm run restore:catalog -- --file backups/ten-file-backup.json --store-code espresso-lab --confirm-store-code espresso-lab --dry-run
```

Restore catalog thật:

```bash
npm run restore:catalog -- --file backups/ten-file-backup.json --store-code espresso-lab --confirm-store-code espresso-lab
```

Restore catalog sẽ thay menu, công thức, bàn, tồn kho, nhà cung cấp, voucher, khuyến mãi và cấu hình cửa hàng. Nó không khôi phục lại mật khẩu/PIN nhân viên, lịch sử doanh thu hoặc sổ tài chính. Với production thật, phần lịch sử tài chính nên khôi phục bằng snapshot/PITR của database.

## Biến môi trường nên có ở production

```env
NODE_ENV=production
JWT_SECRET=chuoi-bi-mat-dai-va-ngau-nhien
INTEGRATION_SECRET_KEY=chuoi-bi-mat-rieng-de-ma-hoa-api-key-tung-store
CORS_ORIGIN=https://domain-web-app-cua-ban.vn
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
JSON_BODY_LIMIT=5mb
```

API key/secret của payOS, HĐĐT, GrabFood, ShopeeFood và Web Order được nhập trong Cấu hình cửa hàng -> Tích hợp ngoài cho từng store. Không đặt chung các khóa này trong `.env` nếu đang chạy mô hình SaaS nhiều quán.

## Những phần cần credential hoặc thiết bị thật

- Hóa đơn điện tử: cần hợp đồng/API key từ nhà cung cấp HĐĐT hợp pháp, mẫu hóa đơn, ký số và môi trường test của họ.
- GrabFood/ShopeeFood: cần API partner/merchant chính thức, webhook URL, secret và mapping menu theo chuẩn từng nền tảng.
- Thanh toán tự động: cần cấu hình webhook thật từ PayOS/ngân hàng hoặc cổng thanh toán, sau đó nhập webhook secret trong Cấu hình cửa hàng -> Tích hợp ngoài của từng store. `PAYMENT_WEBHOOK_SECRET` chỉ nên dùng làm fallback nền tảng.
- Máy in bill: cần test với IP máy in thật trong cùng mạng LAN.
- Backup production đầy đủ: cần bật backup tự động/PITR ở database provider, không chỉ dựa vào JSON export.

## Checklist trước khi chạy thật

- CI pass đủ lint, build và smoke tests.
- Database production có backup tự động, retention rõ ràng và đã thử restore trên môi trường staging.
- Admin tạo store thật riêng; store demo `espresso-lab` chỉ dùng test.
- Webhook thanh toán dùng nội dung chuyển khoản có prefix mã store.
- Mỗi quầy lưu IP máy in riêng và in thử ít nhất một bill.
- Nhân viên dùng PIN đã hash, không dùng PIN demo.
- CORS chỉ mở domain thật, không mở wildcard trong production.
