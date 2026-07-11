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

## Migration database

Database mới hoặc CI phải áp dụng schema bằng migration có phiên bản:

```bash
npm run migrate:deploy --prefix server
```

Không dùng `prisma db push` trên production. Với database Manager Coffee đã tồn tại trước migration baseline, kiểm tra schema khớp trước, tạo snapshot/PITR rồi đánh dấu baseline đúng một lần:

```bash
cd server
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
npx prisma migrate resolve --applied 20260710000000_baseline
```

Sau khi baseline đã được ghi nhận, mọi lần deploy tiếp theo chỉ chạy `prisma migrate deploy`.

## Biến môi trường nên có ở production

```env
NODE_ENV=production
JWT_SECRET=chuoi-bi-mat-dai-va-ngau-nhien
INTEGRATION_SECRET_KEY=chuoi-bi-mat-rieng-de-ma-hoa-api-key-tung-store
PLATFORM_ADMIN_EMAIL=owner@domain-cua-ban.vn
PLATFORM_ADMIN_PASSWORD_HASH=bcrypt-hash-cua-mat-khau-platform
CORS_ORIGIN=https://domain-web-app-cua-ban.vn
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
REALTIME_ADAPTER=postgres
REALTIME_DATABASE_URL=postgresql://... # session/direct connection, không dùng transaction pooler
REALTIME_POOL_SIZE=4
TRUST_PROXY_HOPS=1
JSON_BODY_LIMIT=5mb
PUBLIC_ORDER_RATE_LIMIT=30
```

API key/secret của payOS, HĐĐT, GrabFood, ShopeeFood và Web Order được nhập trong Cấu hình cửa hàng -> Tích hợp ngoài cho từng store. Không đặt chung các khóa này trong `.env` nếu đang chạy mô hình SaaS nhiều quán.

## Quản trị SaaS cho chủ nền tảng

Truy cập đường dẫn có hash `#platform`, ví dụ:

```text
https://domain-web-app-cua-ban.vn/#platform
```

Tài khoản đăng nhập lấy từ `PLATFORM_ADMIN_EMAIL` và `PLATFORM_ADMIN_PASSWORD_HASH`. Màn hình này dùng để xem tổng store, số user, số order, chỉ số API cơ bản, khóa/mở store và đổi gói thuê bao.

Không đưa tài khoản platform admin cho chủ quán. Chủ quán chỉ dùng tài khoản admin trong store của họ.

## Những phần cần credential hoặc thiết bị thật

- Hóa đơn điện tử: cần hợp đồng/API key từ nhà cung cấp HĐĐT hợp pháp, mẫu hóa đơn, ký số và môi trường test của họ.
- GrabFood/ShopeeFood: cần API partner/merchant chính thức, webhook URL, secret và mapping menu theo chuẩn từng nền tảng.
- Thanh toán tự động: cần cấu hình webhook thật từ PayOS/ngân hàng hoặc cổng thanh toán, sau đó nhập webhook secret trong Cấu hình cửa hàng -> Tích hợp ngoài của từng store. `PAYMENT_WEBHOOK_SECRET` chỉ nên dùng làm fallback nền tảng.
- Máy in bill: cần test với IP máy in thật trong cùng mạng LAN.
- Backup production đầy đủ: cần bật backup tự động/PITR ở database provider, không chỉ dựa vào JSON export.

## Checklist trước khi chạy thật

- CI pass đủ lint, build và smoke tests.
- CI chạy cả smoke load để kiểm checkout đồng thời không trùng mã hóa đơn và không lệch tồn kho.
- Database production có backup tự động, retention rõ ràng và đã thử restore trên môi trường staging.
- Admin tạo store thật riêng; store demo `espresso-lab` chỉ dùng test.
- Webhook thanh toán dùng nội dung chuyển khoản có prefix mã store.
- Mỗi quầy lưu IP máy in riêng và in thử ít nhất một bill.
- In QR gọi món riêng cho từng bàn; đổi mã ngay nếu ảnh QR bị phát tán sai nơi.
- Chạy thử một lịch đặt bàn trùng giờ để xác nhận production đang áp dụng migration mới.
- Nhân viên dùng PIN đã hash, không dùng PIN demo.
- CORS chỉ mở domain thật, không mở wildcard trong production.
