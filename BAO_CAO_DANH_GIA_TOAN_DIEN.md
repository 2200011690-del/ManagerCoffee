# Báo cáo rà soát và nâng cấp Manager Coffee

**Ngày cập nhật:** 11/07/2026
**Phạm vi:** Frontend, API, cơ sở dữ liệu, bảo mật, nghiệp vụ F&B, đa chi nhánh, offline, realtime, kiểm thử và vận hành production.

## 1. Kết luận ngắn

Manager Coffee hiện đã vượt khỏi mức ứng dụng demo. Hệ thống có thể dùng để **pilot có kiểm soát tại quán thật** sau khi cấu hình hạ tầng production, thiết bị và tài khoản tích hợp thật.

Tuy nhiên, chưa thể kết luận sản phẩm đã ngang hàng 100% với KiotViet, Sapo, iPOS hoặc POS365 ở cấp độ thương mại. Khoảng cách chính không còn nằm ở màn hình bán hàng cơ bản, mà nằm ở hệ sinh thái phần cứng, ứng dụng chuyên biệt, tích hợp đối tác thật, vận hành chuỗi lớn, SLA, hỗ trợ khách hàng và độ sâu của kho/kế toán.

## 2. Những phần đã sửa và nâng cấp

### Bảo mật và phân quyền

- Không còn trả `pin`, `pinHash`, `password` trong hóa đơn hoặc quan hệ nhân viên lồng nhau.
- Socket.IO bắt buộc JWT, xác định store từ token và chặn tham gia phòng của store khác.
- Mỗi request xác thực lại user/store từ database; quyền cũ trong token không còn được tin tuyệt đối.
- Có `authVersion` để thu hồi toàn bộ phiên sau khi đổi quyền, PIN, mật khẩu hoặc dùng “đăng xuất mọi thiết bị”.
- Giới hạn đăng nhập sai theo IP/tài khoản; trả `429` và `Retry-After`.
- Thêm security headers, tắt `x-powered-by`, HSTS production và cấu hình proxy.
- API user, product, table, customer và voucher dùng allowlist, không còn mass assignment.
- Chặn tự xóa tài khoản, xóa/hạ quyền admin cuối cùng và xóa khách hàng đã có lịch sử giao dịch.
- Audit log ghi thao tác quan trọng cùng user, IP, user-agent và metadata.

### Checkout, thanh toán và hoàn tiền

- Server tự đọc giá sản phẩm, thuế, voucher, khuyến mãi và tổng tiền; không tin số tiền frontend gửi lên.
- Checkout có `clientRequestId`/Idempotency-Key để chống tạo trùng khi mạng chập chờn.
- Thanh toán đồng thời chỉ một request được thành công.
- Hoàn tiền dùng khóa giao dịch, chặn trả vượt số lượng, trùng dòng và hoàn vượt giá trị hóa đơn.
- Hoàn tiền, tồn kho, ca tiền mặt và trạng thái hóa đơn cập nhật trong cùng transaction.
- Hỗ trợ tiền mặt, chuyển khoản, thẻ, ví và thanh toán kết hợp.
- Đơn QR đã có luồng tất toán riêng; không thể thanh toán hai lần.
- Ghi chú đơn hàng có trường riêng, không còn dùng nhầm trường “lý do giảm giá”.

### Kho, công thức và giá vốn

- Tự trừ nguyên liệu theo công thức khi hóa đơn được thanh toán.
- Nhập kho cập nhật giá vốn bình quân trong transaction có khóa.
- Mỗi dòng hóa đơn lưu snapshot giá vốn và thành phần nguyên liệu tại thời điểm bán.
- Báo cáo lãi gộp dùng snapshot lịch sử, không bị thay đổi khi sửa công thức về sau.
- Hoàn hàng đảo giá vốn tương ứng.
- Báo cáo hiển thị độ phủ giá vốn và cảnh báo khi dữ liệu nguyên liệu chưa đủ; không dùng giá vốn giả.

### Offline và realtime

- Đơn offline lưu IndexedDB theo store, có trạng thái `pending` và `conflict`.
- Lỗi dữ liệu 4xx được đưa vào hàng xung đột; không chặn đồng bộ các đơn hợp lệ phía sau.
- Có giao diện xem, thử lại hoặc loại bỏ đơn xung đột.
- Giỏ hàng đang mở được lưu database, không còn phụ thuộc RAM của một server.
- Realtime production hỗ trợ Socket.IO PostgreSQL adapter để chạy nhiều instance.
- Event realtime được cô lập theo store và cập nhật menu, bàn, bếp, đơn QR, đặt bàn, tồn kho.

### SaaS và đa chi nhánh

- Có `Organization` sở hữu nhiều `Store`.
- Mỗi cửa hàng mới tạo hoàn toàn trống, không tự sinh nhà cung cấp hoặc dữ liệu mẫu.
- Store demo `espresso-lab` vẫn được giữ đúng yêu cầu để test.
- Admin có thể tạo chi nhánh trống hoặc sao chép catalog; tồn kho chi nhánh mới bắt đầu từ 0.
- Có tổng quan chuỗi và chuyển chi nhánh bằng token mới, giới hạn trong cùng organization.
- Email user chỉ cần duy nhất trong từng store, phù hợp mô hình nhiều chi nhánh.

### QR gọi món tại bàn

- Mỗi bàn có token QR riêng; có thể in, sao chép link hoặc đổi token khi bị lộ.
- Khách mở thực đơn công khai theo đúng store/bàn, tìm món, tạo giỏ và gửi yêu cầu.
- Giá và tên món được lấy lại từ database; khách không thể sửa giá qua request.
- Request công khai có giới hạn tần suất, số dòng và số lượng món.
- Gửi lại cùng Idempotency-Key không tạo yêu cầu trùng.
- Nhân viên có hộp thư nhận/từ chối; nhận đồng thời không tạo hai hóa đơn.
- Sau khi nhận, đơn vào KDS; khách theo dõi trạng thái chờ, pha chế, hoàn thành và thanh toán.
- Thu ngân tất toán đơn QR bằng tiền mặt hoặc chuyển khoản; hệ thống cập nhật tồn kho và bàn.

### Đặt bàn

- Lưu khách, điện thoại, số người, bàn, giờ bắt đầu/kết thúc, tiền cọc và ghi chú.
- Transaction khóa theo bàn và chặn mọi khoảng thời gian giao nhau.
- Chặn số khách vượt sức chứa bàn và lịch trong quá khứ.
- Có tra cứu bàn còn trống theo khung giờ.
- Trạng thái gồm chờ xác nhận, đã xác nhận, nhận bàn, hoàn thành, hủy và không đến.
- Nhận bàn tự đổi bàn sang trạng thái có khách.
- Tiền cọc có trạng thái chưa thu, đã thu, đã hoàn hoặc bị giữ lại.

### Migration và production

- Có baseline migration và các migration tăng dần cho hardening, giá vốn, phiên đăng nhập, realtime, organization, QR và reservation.
- CI dùng `prisma migrate deploy`, không dùng `db push` trên production.
- Dockerfile dùng Node 22 multi-stage và chỉ cài dependency production ở runtime.
- Có `/api/health`, `/api/ready`, chỉ số API cơ bản và hướng dẫn production.
- Audit dependency hiện tại: **0 lỗ hổng frontend, 0 lỗ hổng backend**.

## 3. Bằng chứng kiểm thử

| Bộ kiểm thử | Phạm vi chính | Kết quả |
|---|---|---|
| `test:smoke` | Đăng nhập, phân quyền, socket tenant, throttle, thu hồi token, chi nhánh | Đạt |
| `test:smoke:sales` | Checkout, giá server, voucher/khuyến mãi, tồn kho, trả hàng, tranh chấp thanh toán/hoàn tiền | Đạt |
| `test:smoke:shifts` | Mở/đóng ca, tiền mặt kỳ vọng, chấm công và bàn giao | Đạt |
| `test:smoke:operations` | QR, idempotency, nhận đồng thời, tất toán, đổi token, đặt bàn trùng giờ, customer allowlist | Đạt |
| `test:smoke:load` | Nhiều checkout đồng thời, mã hóa đơn và tồn kho | Đạt |
| `npm run build` | Build frontend production | Đạt |
| `npm run build --prefix server` | Prisma generate/backend | Đạt |
| `npm run lint` | Lỗi lint chặn build | Đạt, còn cảnh báo kỹ thuật không chặn |
| `npm audit` | Dependency frontend/backend | 0 lỗ hổng |
| `prisma migrate status` | Đồng bộ migration với Supabase | Database up to date |

Toàn bộ 5 smoke suite đã chạy liên tiếp trên database Supabase và đạt trong **431 giây**. Sau thay đổi tất toán QR/customer API, hai bộ sales + operations được chạy hồi quy thêm và tiếp tục đạt.

Kiểm tra trực quan tự động bằng browser trong phiên cuối chưa thực hiện được vì runtime điều khiển browser của Codex lỗi đường dẫn hệ thống trước khi mở trang. Đây không phải lỗi app, nhưng vẫn phải chạy lại desktop/mobile visual QA trước bản phát hành chính thức.

## 4. So sánh với các sản phẩm lớn

Thông tin đối chiếu lấy từ tài liệu/trang sản phẩm chính thức:

- [KiotViet quản lý nhà hàng](https://www.kiotviet.vn/quan-ly-nha-hang)
- [KiotViet gọi món qua QR](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thuc-don-dien-tu/goi-mon-qua-ma-qr/)
- [Sapo FnB](https://fnb.sapo.vn/phan-mem-quan-ly-nha-hang-cafe)
- [Ứng dụng vận hành Sapo FnB](https://www.sapo.vn/app-sapo-fnb-quan-ly.html)
- [iPOS quản lý nhà hàng](https://phanmemquanlynhahang.ipos.vn/)
- [POS365 cho quán cafe](https://www.pos365.vn/phan-mem-tinh-tien-quan-cafe-6392.html)

| Nhóm năng lực | Manager Coffee hiện tại | So với nhóm lớn |
|---|---|---|
| POS, bàn, mang về, giảm giá, voucher, điểm | Đã có logic server và kiểm thử | Gần tương đương lõi |
| KDS realtime | Có theo đơn, trạng thái chờ/đang làm/hoàn thành | Còn thiếu điều phối sâu theo món/khu bếp |
| Kho và công thức | Có định lượng, trừ kho, giá vốn, cảnh báo | Khá; thiếu kiểm kê/điều chuyển/mua hàng sâu |
| Hoàn tiền và chống gian lận | Có khóa transaction, audit, phân quyền | Mạnh ở lõi |
| Offline | Có queue và xử lý conflict | Khá; chưa có offline đầy đủ cho mọi module |
| QR tại bàn | Có menu, duyệt, KDS, theo dõi, tất toán | Đã thành luồng dùng được; còn thiếu gọi phục vụ/thanh toán online thật |
| Đặt bàn và cọc | Có chặn trùng và vòng đời trạng thái | Đã có lõi; thiếu sơ đồ lịch nâng cao/nhắc lịch tự động |
| Đa chi nhánh | Có organization, tạo/switch/tổng quan | Có nền tảng; thiếu điều chuyển kho và báo cáo hợp nhất sâu |
| Báo cáo | Có doanh thu, ca, tồn kho, COGS, lãi gộp | Khá; thiếu BI, công nợ và kế toán sâu |
| Nhân sự | Có user, quyền, chấm công, lương, ca | Khá; quyền chưa chi tiết theo từng hành động như hệ lớn |
| Tích hợp thanh toán/HĐĐT/giao đồ ăn | Có cấu hình, secret và webhook framework | Chưa ngang vì chưa kết nối nhà cung cấp thật |
| Phần cứng và app chuyên biệt | Web responsive, LAN print framework | Chưa ngang hệ sinh thái thiết bị/app của hãng lớn |
| Vận hành doanh nghiệp | Có CI, migration, health, Docker | Chưa có SLA, DR drill, pentest và support operation ở quy mô lớn |

## 5. Những việc vẫn phải làm để thật sự cạnh tranh ngang hàng

### Ưu tiên P0 trước khi bán thương mại rộng

1. Chạy visual QA thật trên Chrome/Safari/Android/iPhone cho POS, bàn, QR, KDS và đặt bàn.
2. Thiết lập production monitoring: log tập trung, error tracking, cảnh báo latency/error, uptime và dashboard hạ tầng.
3. Bật backup/PITR, retention, mã hóa và diễn tập restore trên staging.
4. Chạy kiểm thử tải có mục tiêu SLA trên hạ tầng production, không chỉ smoke load.
5. Thuê security review/pentest độc lập; rà OWASP, secret rotation, dependency policy và incident response.
6. Hoàn thiện điều khoản sử dụng, chính sách riêng tư, phân quyền dữ liệu và quy trình xóa/xuất dữ liệu khách hàng.

### Ưu tiên P1 để bắt kịp chiều sâu nghiệp vụ F&B

1. KDS theo từng món: khu bếp/bar, ưu tiên, gom món, ra món một phần, hủy món có lý do, thời gian SLA.
2. Kho nâng cao: phiếu kiểm kê, hao hụt/hủy nguyên liệu, chuyển kho liên chi nhánh, đơn mua hàng, nhận hàng nhiều lần, công nợ nhà cung cấp.
3. Sản phẩm nâng cao: size, topping, biến thể, đơn vị quy đổi, combo linh hoạt, giá theo chi nhánh/khung giờ.
4. Thu chi và công nợ: sổ quỹ, phiếu thu/chi, đối soát ngân hàng, công nợ phải thu/phải trả, khóa sổ ngày.
5. Báo cáo hợp nhất chuỗi, so sánh chi nhánh, menu engineering, dự báo nguyên liệu và cảnh báo bất thường.
6. QR nâng cao: gọi nhân viên, yêu cầu thanh toán, gọi thêm món trên cùng bàn, thanh toán trước bằng cổng thật.
7. Đặt bàn nâng cao: nhắc lịch SMS/Zalo, danh sách chờ, gộp bàn, đổi bàn, sơ đồ timeline và hoàn/giữ cọc có chứng từ.

### Ưu tiên P2 tạo lợi thế thương mại

1. Ứng dụng/PWA riêng cho phục vụ, thu ngân, bếp và chủ quán; hỗ trợ push notification.
2. CRM phân khúc, chiến dịch tự động, gift card, membership nhiều hạng và chăm sóc đa kênh.
3. Marketplace tích hợp giao đồ ăn, kế toán, hóa đơn điện tử, ngân hàng, ví và thiết bị POS.
4. Subscription/billing cho SaaS, quota theo gói, gia hạn, hóa đơn thuê bao và dunning.
5. Trung tâm hướng dẫn, onboarding, import dữ liệu, hỗ trợ khách hàng và công cụ chẩn đoán từ xa.

## 6. Những phần cần môi trường/đối tác thật

- payOS/ngân hàng: cần merchant, API key, webhook secret và tài khoản sandbox/production.
- Hóa đơn điện tử: cần nhà cung cấp hợp pháp, mẫu số/ký hiệu, chứng thư số và môi trường test.
- GrabFood/ShopeeFood: cần hợp đồng partner, merchant ID, webhook và mapping menu chính thức.
- Máy in/bar/bếp: cần test trên model máy, driver, LAN và giấy thật.
- SMS/Zalo: cần brandname/OA, template được duyệt và ngân sách gửi.
- App Store/Google Play: cần tài khoản nhà phát triển, ký ứng dụng, chính sách quyền riêng tư và quy trình phát hành.

## 7. Đánh giá cuối

**Có thể nói Manager Coffee đã có lõi POS/F&B nghiêm túc và đủ điều kiện bước vào pilot.** Những lớp khó như tenant isolation, idempotency, transaction cạnh tranh, offline conflict, giá vốn snapshot, đa chi nhánh, QR và đặt bàn đã được triển khai chứ không chỉ mô phỏng giao diện.

**Chưa nên quảng cáo là ngang hàng 100% với các hãng lớn.** Các hãng đang bán không chỉ một web app mà cả hệ sinh thái thiết bị, ứng dụng, tích hợp, dữ liệu vận hành lâu năm, đội triển khai và cam kết dịch vụ. Mục tiêu đúng tiếp theo là pilot ổn định, đo số liệu thực tế, hoàn thiện P0/P1 rồi mới mở rộng thương mại.
