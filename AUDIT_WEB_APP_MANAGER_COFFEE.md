# Bao cao ra soat va nang cap Manager Coffee

Ngay lap: 03/07/2026  
Pham vi: codebase `D:\ManagerCoffee`, web app POS/F&B Manager Coffee

## 1. Ket luan ngan gon

Manager Coffee da co nen tang POS/F&B kha ro: ban hang, ban/phong, bep, menu, kho, cong thuc, ca tien, nhan su, khach hang, khuyen mai, tra hang, thanh toan QR va bao cao.

Tuy nhien, app chua nen dua vao van hanh thuong mai nghiem tuc hoac so ngang voi KiotViet, Sapo, iPOS365, POS365. Ly do khong phai thieu giao dien, ma la con nhieu loi logic cot loi co the gay sai tien, sai kho, lap don, lo du lieu va sai bao cao.

Muc hien tai phu hop hon voi: MVP, demo, beta noi bo, hoac quan nho test co kiem soat.

Muc can dat truoc production: sua P0/P1, bo test tu dong cho cac luong tien/kho/ca, chuan hoa bao mat, transaction DB, du lieu that khong mock, va nang do on dinh khi co nhieu giao dich dong thoi.

## 2. Nhung gi da duoc kiem

### 2.1. Kiem tra nen

- `npm run lint`: pass, nhung con nhieu warning ve hook deps, unused vars/imports, fast refresh.
- `npm run build`: pass, nhung bundle frontend lon, file JS chinh khoang 666 KB va Vite canh bao chunk tren 500 KB.
- `npm run build --prefix server`: pass, Prisma generate/db push thanh cong.
- `npm audit --audit-level=moderate`: root project co advisory moderate qua `@hono/node-server` tu dev dependency Prisma; server package audit khong co vulnerability.
- Smoke tests da chay va pass:
  - `npm run test:smoke`
  - `npm run test:smoke:sales`
  - `npm run test:smoke:shifts`

### 2.2. Kiem API

- Da liet ke va kiem thu nhom API chinh: auth, users, attendance, customers, products, tables, orders, inventory, recipe, dashboard, returns, held orders, promotions, kitchen, payments.
- Tong so API route trong `server/index.js`: 68 route.
- Harness API rieng da chay 142 check:
  - 141 pass.
  - 1 check fail do ky vong test `403` nhung app tra `401`; khong phai loi nghiep vu lon.
- Da tao store test rieng va cleanup sau test. Xac nhan khong con store `codex-audit-*`.

### 2.3. Kiem UI

Da mo app local va kiem cac man hinh chinh:

- Ban hang POS.
- So do ban.
- Nha bep.
- Bao cao.
- Quan ly Menu.
- Khuyen mai.
- Nhan su.
- Cai dat.
- Mobile viewport 390x844: POS va cart mobile dung duoc, them mon duoc, mo gio hang duoc, nut thanh toan hien duoc.

### 2.4. Gioi han chua the kiem that

Nhung phan nay can moi truong thuc te moi ket luan 100%:

- May in LAN, may in bep/bar/tem that.
- Thanh toan PayOS/ngan hang that.
- Hoa don dien tu thuc te.
- Tablet/POS hardware that.
- Tai production voi nhieu may ban hang dong thoi.
- Mang chap chon/offline that trong quan.

## 3. Loi P0 - Phai sua truoc khi ban that

### P0.1. Race condition tao so hoa don

Hien tai checkout tao so hoa don bang cach dem so order:

- File: `server/index.js`
- Vi tri: dong 1232-1235
- Logic: `const count = await prisma.order.count({ where: { storeId } })`
- Sau do tao `orderNumber = #HD${1001 + count}`

Khi nhieu cashier/thiet bi checkout dong thoi, 2 request co the doc cung mot `count`, sinh cung mot `orderNumber`, va bi loi unique constraint `storeId/orderNumber`.

Tac dong:

- Giao dich gio cao diem co the fail 500.
- Thu ngan co the bam lai, tao tinh huong lap thao tac.
- Trai nghiem ban hang bi dung dung luc dong khach.

Can sua:

- Dung counter/sequence rieng theo store trong transaction.
- Hoac dung order code co timestamp + suffix random/sequence an toan.
- Dam bao endpoint checkout idempotent neu frontend retry.
- Loi phai tra JSON co ma loi ro, khong tra HTML 500.

### P0.2. Dong modal hoa don nhung gio hang van con

Sau checkout, order da duoc luu. Nhung neu nguoi dung bam dong/huy modal hoa don, cart van giu lai.

- File: `src/pages/POSPage.jsx`
- Vi tri: dong 1135-1139
- Comment hien tai: "order was already saved to history, just close thermal, keep cart"

Tac dong:

- Co the bam thanh toan lai cung cart.
- Co the tao don trung.
- Co the tru kho trung.
- Co the lam sai doanh thu/ca tien.

Can sua:

- Khi order da tao thanh cong, cart phai duoc clear/lock ngay.
- Modal in hoa don chi la buoc in/xem lai, khong quyet dinh viec clear cart.
- Neu can "in lai", dung order history/reprint, khong giu cart cu.

### P0.3. API users lo password hash va PIN

Endpoint `/api/users` tra thang du lieu user tu DB:

- File: `server/index.js`
- Vi tri: dong 556-559

Tac dong:

- Admin UI nhan duoc `password` hash va `pin`.
- Du lieu nhay cam bi lo qua DevTools/API.
- Neu co XSS hoac token admin bi lo, hacker lay duoc hash/PIN.

Can sua:

- Sanitize response: khong tra `password`, khong tra `pin`.
- Neu can reset PIN, dung flow reset/regen, khong show PIN cu.
- PIN nen hash nhu password, khong luu plain text.
- Them rate limit cho login PIN.

### P0.4. UI nhan su hien PIN nhan vien

Trang nhan su hien PIN truc tiep:

- File: `src/pages/EmployeeManagementPage.jsx`
- Vi tri: dong 397

Tac dong:

- Bat ky admin/nguoi nhin man hinh co the doc PIN.
- Mat y nghia bao mat cua ma PIN.
- Nhan vien co the dung PIN cua nhau neu bi lo.

Can sua:

- Chi hien `****`.
- Them nut "dat lai PIN".
- Log lai thao tac reset PIN.
- Khong bao gio hien PIN plain text sau khi tao.

### P0.5. Product trung ten nhung nghiep vu kho/tai chinh lai tim theo ten

DB hien co du lieu demo:

- Store `espresso-lab`.
- San pham `"Sinh to bo"` bi trung 29 lan.

Trong khi nhieu luong lai tim product theo `name`:

- Tru kho sau thanh toan pending: `server/index.js` dong 1147-1149.
- Tra hang/hoan kho: `server/index.js` dong 2284-2286.
- P&L map cong thuc theo ten: `server/index.js` dong 2638.

Schema `OrderItem` chi luu `name`, khong luu `productId`:

- File: `server/prisma/schema.prisma`
- Vi tri: model `OrderItem`, dong 146-159

Tac dong:

- Tru sai nguyen lieu neu co 2 mon cung ten.
- Bao cao lai lo sai.
- Tra hang hoan sai kho.
- Khong audit duoc mon goc neu sau nay doi ten san pham.

Can sua:

- Them `productId` vao `OrderItem`.
- Checkout luu `productId`.
- Tat ca flow kho/return/P&L dung `productId`, khong dung `name`.
- Them unique constraint `@@unique([storeId, name])` neu yeu cau ten mon la duy nhat trong cua hang.
- Hoac cho trung ten nhung bat buoc co SKU/code va order item luu productId.

### P0.6. Dashboard co nguy co hien so lieu mock

Dashboard import `dashboardData` mock:

- File: `src/data/coffeeData.js`
- Vi tri: dong 202

Neu live data invalid/fail, UI fallback ve mock:

- File: `src/pages/DashboardPage.jsx`
- Vi tri: dong 574-579

Tac dong:

- Chu quan co the nhin doanh thu/mon ban chay/don gan day gia.
- Rat nguy hiem cho bao cao tai chinh.

Can sua:

- Production khong duoc fallback sang mock.
- Neu API fail, hien trang thai loi/empty state ro rang.
- Neu can demo mode, tach bang flag `VITE_DEMO_MODE`.

## 4. Loi P1 - Can sua som de van hanh on dinh

### P1.1. Checkout/return/pay chua duoc transaction hoa day du

Cac thao tac nhu tao order, tru kho, update ca tien, update diem khach hang, update ban, tao payment can cung nam trong transaction hoac co co che rollback/retry.

Can sua:

- Dung `prisma.$transaction`.
- Thiet ke idempotency key cho checkout/payment webhook.
- Neu tru kho fail thi order khong duoc coi la thanh cong, hoac phai co trang thai can xu ly.

### P1.2. Ca tien UI stale sau thanh toan tien mat

Da thay backend tang `cashSales` va `expectedCash`, nhung modal dong ca co the hien so cu neu `activeShift` chua refresh.

- File lien quan: `src/pages/POSPage.jsx`
- Vi tri hien thi: dong 1246, 1251

Tac dong:

- Thu ngan dong ca theo so phan mem sai tren UI.
- De tao chenhlech ao.

Can sua:

- Sau moi cash checkout, refresh active shift.
- Hoac update local state `activeShift` theo response backend.
- Khi mo modal dong ca, fetch lai shift moi nhat.

### P1.3. Kitchen bi backlog don cu

UI bep hien nhieu order cu dang pending voi thoi gian rat lau.

Tac dong:

- Bep khong biet don nao that su can lam.
- Don da thanh toan/co lich su cu van lam nhiem man hinh.

Can sua:

- Trang thai bep phai co lifecycle ro: pending -> preparing -> ready -> served/cancelled.
- Loc theo ngay/ca hien tai.
- Auto hide/order archive voi don da xong.
- Khi order thanh toan/takeaway co can vao bep hay khong phai co rule ro.

### P1.4. Khuyen mai cho phep du lieu bat thuong

Da thay nhieu khuyen mai trung ten va co muc 100%.

Tac dong:

- Co the ap dung sai giam gia.
- De that thoat doanh thu.
- Kho quan ly chuong trinh dang chay.

Can sua:

- Validate discount percent 0-100, can can nhac gioi han production nhu <= 80 neu khong co quyen cao.
- Check ngay bat dau/ket thuc.
- Khong cho duplicate code/name trong cung store neu dang active.
- Them trang thai active/inactive/scheduled/expired.
- Audit log khi tao/sua/xoa promotion.

### P1.5. Thieu index cho nhieu foreign key

Can them index cho cac cot foreign key hay join:

- `Attendance.userId`
- `CashShift.userId`
- `HeldOrderItem.heldOrderId`
- `Order.customerId`
- `OrderItem.orderId`
- `OrderPayment.orderId`
- `ReturnItem.returnOrderId`
- `ReturnOrder.orderId`
- `StockTransaction.inventoryId`
- `StockTransaction.supplierId`

Tac dong:

- Truy van cham khi du lieu lon.
- Delete/update relation co the cham.
- Bao cao/lich su co the bi lag.

Can sua:

- Them `@@index([...])` trong Prisma schema.
- Chay migration.
- Kiem query plan voi du lieu lon.

### P1.6. Error response chua chuan

Mot so loi backend tra HTML 500 thay vi JSON.

Tac dong:

- Frontend kho hien thong bao dung.
- Test API kho bat loi.
- User thay loi ky thuat thay vi loi nghiep vu.

Can sua:

- Middleware error handler cuoi Express.
- Tat ca API tra `{ error, code, details? }`.
- Log stack noi bo, khong expose stack production.

### P1.7. DB/pooler/network failure can UX tot hon

Browser logs tung ghi nhan loi ket noi DB pooler Supabase. Can xac minh lai trong moi truong deploy.

Can sua:

- Health check DB.
- Retry/backoff co gioi han.
- UI hien offline/degraded mode ro.
- Khong fallback ve mock khi DB fail.

## 5. P2 - Chat luong code, UX, accessibility

### P2.1. Nut icon khong co accessible name

Vi du nut them mon:

- File: `src/components/pos/ProductGrid.jsx`
- Vi tri: dong 66-70

Nhieu nut gio hang tang/giam/xoa cung thieu `aria-label`.

Can sua:

- Them `aria-label`, `title` cho nut icon.
- Dam bao automation test co the chon nut theo role/name.
- Cai thien kha nang dung voi keyboard/screen reader.

### P2.2. UX mobile/tablet can muot hon

Mobile test dung duoc, nhung:

- Thanh ban/category cuon ngang dai.
- Nhieu nut icon nho/thieu label.
- Cart mobile dung duoc nhung can kiem them tren tablet 7-10 inch.

Can nang cap:

- Tablet-first POS layout.
- Quick search lon hon.
- Category sticky/segmented ro hon.
- Cart drawer ro rang hon.
- Toi uu thao tac 1 cham trong gio cao diem.

### P2.3. Man hinh bep cat dut dieu huong

Khi vao Kitchen, sidebar bien mat, phai bam quay lai POS de di tiep.

Can sua:

- Giu navigation shell hoac them top nav/back ro rang.
- Neu Kitchen la full-screen mode, can co nut thoat/onboarding ro.

### P2.4. Bundle frontend lon

Build pass nhung file JS chinh lon.

Can sua:

- Code split theo route/view.
- Lazy load Dashboard, Employee, Menu, Reports.
- Tach chart/heavy component.
- Kiem tra dependency thua.

### P2.5. Lint warning

Can don:

- React hook dependency warning.
- Unused imports/vars.
- `only-export-components`.

Ly do:

- Giam bug ngua.
- De CI nghiem hon sau nay.

### P2.6. Demo data/dev hint can tach production

Lock screen co thong tin demo PIN.

Can sua:

- Chi hien trong demo/dev mode.
- Production khong hien credential mau.

## 6. Bao mat va SaaS hardening

### 6.1. Auth/session

Can co:

- JWT secret bat buoc trong production.
- Refresh token hoac session expiry ro.
- Logout all devices.
- Rate limit login admin va PIN.
- Lockout tam thoi khi sai PIN nhieu lan.
- Audit login/logout.

### 6.2. PIN/password

Can co:

- PIN hash bang bcrypt/argon2.
- Khong tra PIN ve client.
- Reset PIN thay vi xem PIN.
- Password policy cho admin.
- Force change password/PIN lan dau.

### 6.3. RBAC

Hien co admin/staff la qua tho.

Can them quyen chi tiet:

- Xem bao cao.
- Sua/xoa mon.
- Sua gia.
- Ap dung khuyen mai lon.
- Huy mon da bao bep.
- Hoan tien/tra hang.
- Mo/dong ca.
- Xem PIN/reset PIN.
- Quan ly kho.
- Quan ly nhan vien.

### 6.4. Audit log

Can log:

- Tao/sua/xoa san pham.
- Sua gia.
- Huy order/huy mon.
- Tra hang/hoan tien.
- Mo/dong ca, chenhlech tien.
- Sua ton kho/import/adjust/reset.
- Doi quyen nhan vien.
- Doi cau hinh thanh toan/may in.

### 6.5. Multi-tenant isolation

Can test rieng:

- User store A khong doc/sua duoc data store B.
- Header `x-store-id` khong duoc override khi da co JWT.
- Tat ca route co filter `storeId`.
- Route webhook/payment khong map nham store.

### 6.6. Backup/restore

Can co:

- Backup DB tu dong.
- Restore drill.
- Export data cua mot store.
- Soft delete cho du lieu quan trong hoac recycle/audit.

## 7. Database va data model nen nang cap

### 7.1. Product va OrderItem

Can them:

- `Product.sku` hoac `code`.
- `OrderItem.productId`.
- `OrderItem.productSnapshotName`.
- `OrderItem.productSnapshotPrice`.
- Unique theo `storeId + sku/code`.
- Neu ten mon duy nhat thi unique `storeId + name`.

### 7.2. Order numbering

Can co bang/counter:

- `StoreCounter(storeId, key, value)`.
- Transaction increment.
- Format theo ngay/ca neu can: `HD-20260703-0001`.

### 7.3. Inventory

Can them:

- Don vi tinh chuan.
- Batch/lot neu quan ly han dung.
- Canh bao ton toi thieu.
- Kiem ke theo ky.
- Gia von binh quan/FIFO tuy mo hinh.
- Lich su import/adjust day du nguoi thao tac.

### 7.4. Payment

Can them:

- Idempotency key.
- Provider transaction id.
- Trang thai: pending, paid, failed, expired, refunded, partially_refunded.
- Reconciliation log.
- Webhook signature verify.

### 7.5. Returns/refunds

Can them:

- Return reason bat buoc.
- Anh/ghi chu neu can.
- Quyen approve refund.
- Partial refund theo payment method.
- Anh huong kho/ca tien ro rang.

## 8. Test nen bo sung

### 8.1. Unit/integration test

Can test:

- Checkout cash.
- Checkout QR pending -> paid.
- Mixed payment.
- Split bill.
- Hold order -> restore -> checkout.
- Return partial/full.
- Cash shift open/close/discrepancy.
- Product recipe deduction.
- Duplicate product prevention.
- Promotion application.
- Role permission.

### 8.2. Concurrency test

Can test:

- 10-50 checkout dong thoi cung store.
- Payment webhook den truoc/sau frontend poll.
- 2 thu ngan dong ca/sua order dong thoi.
- 2 nguoi import/adjust kho dong thoi.

### 8.3. E2E browser test

Can test bang Playwright:

- Login admin/staff.
- POS add item -> checkout -> cart clear.
- Reprint bill.
- Table order.
- Kitchen status.
- Dashboard khong mock khi API fail.
- Employee page khong hien PIN.
- Mobile/tablet layout.

### 8.4. Security test

Can test:

- Store isolation.
- Token missing/expired.
- Staff access admin routes bi chan.
- Brute-force PIN bi rate limit.
- API users khong tra password/PIN.

## 9. Tinh nang nen them de tien gan KiotViet/Sapo/iPOS/POS365

### 9.1. QR order tai ban

Tinh nang:

- Moi ban co QR rieng.
- Khach quet QR xem menu.
- Goi mon tu dien thoai.
- Order gui ve thu ngan va bep.
- Ho tro tra truoc/tra sau.
- Goi nhan vien/goi them mon.

Vi sao can:

- Day la tinh nang pho bien cua KiotViet/Sapo/iPOS/POS365.
- Giam tai nhan vien gio cao diem.
- Tang toc do phuc vu.

### 9.2. Offline-first POS

Tinh nang:

- Mat mang van tao don, in bill, in bep.
- Queue sync khi co mang.
- Xu ly conflict order/table/payment.
- Hien ro trang thai online/offline.

Vi sao can:

- Quan F&B khong duoc dung ban hang khi mang loi.
- Sapo/POS365 co noi ve offline/sync.

### 9.3. Hoa don dien tu va thue

Tinh nang:

- Xuat hoa don dien tu tu may tinh tien.
- Luu ma tra cuu.
- Dong bo du lieu thue.
- Bao cao theo quy dinh ho kinh doanh/doanh nghiep.

Vi sao can:

- La yeu cau canh tranh ngay cang quan trong tai Viet Nam.
- Sapo/POS365 nhan manh tinh nang thue/HDDT.

### 9.4. Tich hop giao do an

Tinh nang:

- GrabFood.
- ShopeeFood.
- Web Order rieng.
- Dong bo menu/gia/trang thai mon.
- Don online chay ve bep/thu ngan.
- Doi soat doanh thu kenh online.

### 9.5. CRM va loyalty

Tinh nang:

- Ho so khach hang.
- Lich su mua.
- Tich diem.
- Hang thanh vien.
- Voucher/coupon.
- Sinh nhat/chien dich cham soc.

### 9.6. Da chi nhanh

Tinh nang:

- Dashboard tong cong ty.
- Bao cao tung chi nhanh.
- Kho tung chi nhanh.
- Chuyen kho.
- Gia/menu theo chi nhanh.
- Phan quyen quan ly vung/chi nhanh.

### 9.7. Quan ly thiet bi va in an

Tinh nang:

- May in thu ngan.
- May in bep/bar.
- May in tem ly.
- Mapping mon -> khu vuc in.
- Retry khi in loi.
- Theo doi trang thai may in.
- Mau in tuy bien.

### 9.8. Bao cao nang cao

Tinh nang:

- Doanh thu realtime.
- Doanh thu theo gio.
- Mon ban chay/ban cham.
- Food cost.
- Lai lo theo mon/nhom mon.
- Hieu suat nhan vien.
- Ty le huy/return/refund.
- Ton kho sap het.
- Chenh lech kho.
- Doi soat thanh toan.

### 9.9. Quan ly nhan su nang cao

Tinh nang:

- Ca lam.
- Cham cong.
- Tinh luong.
- Hoa hong/thuong.
- Hieu suat theo order/doanh thu.
- Lich su thao tac.

### 9.10. Reservation/dat ban

Tinh nang:

- Dat ban theo gio.
- Dat coc.
- Ghi chu khach.
- Nhac lich.
- Gan ban khi khach den.

## 10. Doi chieu voi doi thu

### KiotViet

Nguon tham khao:

- https://www.kiotviet.vn/phan-mem-quan-ly-nha-hang/
- https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thuc-don-dien-tu/goi-mon-qua-ma-qr/
- https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-che-bien/thong-bao-che-bien/

Khoang cach chinh:

- Manager Coffee co POS, ban, bep, kho, ca tien.
- Con thieu QR order hoan chinh, thong bao bep chuan, role/huy mon chuan, online channel, thue/HDDT, ecosystem va do on dinh.

### Sapo FnB

Nguon tham khao:

- https://www.sapo.vn/phan-mem-quan-ly-nha-hang.html
- https://help.sapo.vn/qr-order-tren-phan-mem-sapo-fnb

Khoang cach chinh:

- Sapo nhan manh offline, order tai ban, QR order, bep/bar, GrabFood/ShopeeFood, HDDT/thue, app quan ly tu xa.
- Manager Coffee chua co offline sync that, chua co kenh online/giao do an, dashboard con mock risk.

### iPOS

Nguon tham khao:

- https://ipos.vn/
- https://ipos.vn/giai-phap-menu-dien-tu/
- https://ipos.vn/phan-mem-quan-ly-quan-cafe-toi-uu/

Khoang cach chinh:

- iPOS la ecosystem F&B: ban hang, O2O QR, inventory, HRM, CRM, accounting, WebOrder, giao hang/thanh toan.
- Manager Coffee moi co phan loi POS noi bo, chua thanh ecosystem.

### POS365

Nguon tham khao:

- https://www.pos365.vn/nganh-nghe/phan-mem-quan-ly-nha-hang
- https://www.pos365.vn/

Khoang cach chinh:

- POS365 nhan manh so do ban realtime, dinh luong nguyen lieu, da phuong thuc thanh toan, HDDT, bao cao, CRM, offline sync, app quan ly.
- Manager Coffee co mot so nen tang tuong tu, nhung can sua logic va nang do tin cay truoc.

## 11. Lo trinh de xuat

### Giai doan 1: Sua loi song con

Muc tieu: khong sai tien, khong lap don, khong lo du lieu.

Viec can lam:

- Sua order number transaction-safe.
- Clear/lock cart sau khi order tao thanh cong.
- Sanitize `/api/users`.
- An PIN, hash PIN, reset PIN flow.
- Them `productId` vao `OrderItem`.
- Chan duplicate product hoac them SKU.
- Bo fallback mock dashboard trong production.
- Dung transaction cho checkout/pay/return.

### Giai doan 2: Lam app dang tin khi van hanh that

Muc tieu: ban duoc trong quan that, gio cao diem it loi.

Viec can lam:

- Them FK indexes.
- Chuan hoa error JSON.
- Idempotency cho checkout/payment.
- Audit log.
- KDS lifecycle ro.
- Khuyen mai validation.
- Ca tien refresh chuan.
- Test E2E va concurrency.
- Monitoring backend/DB/payment.

### Giai doan 3: Nang UX va hieu nang

Muc tieu: thao tac nhanh nhu POS thuong mai.

Viec can lam:

- Tablet-first POS.
- Cai thien mobile cart.
- Accessibility labels.
- Code split frontend.
- Don lint warning.
- Cai thien navigation Kitchen.
- Doi UI dashboard de ro loading/error/empty.

### Giai doan 4: Them tinh nang canh tranh

Muc tieu: tien gan KiotViet/Sapo/iPOS/POS365.

Viec can lam:

- QR order tai ban.
- Offline-first sync.
- HDDT/thue.
- GrabFood/ShopeeFood/Web Order.
- CRM/loyalty/voucher.
- Da chi nhanh.
- Quan ly thiet bi in.
- Bao cao food cost/lai lo nang cao.

### Giai doan 5: SaaS/thuong mai hoa

Muc tieu: co the ban cho nhieu khach hang.

Viec can lam:

- Subscription/billing.
- Tenant provisioning.
- Backup/restore.
- Data export/import.
- SLA/monitoring.
- Onboarding store.
- Support/admin console.
- Security review dinh ky.

## 12. Checklist tong hop

### Bat buoc truoc production

- [ ] Sua order number race condition.
- [ ] Clear cart dung sau checkout.
- [ ] Sanitize user API.
- [ ] An/hash/reset PIN.
- [ ] Them `productId` vao `OrderItem`.
- [ ] Bo logic tim product bang `name`.
- [ ] Transaction cho checkout/pay/return.
- [ ] Bo mock dashboard production.
- [ ] Validate promotion.
- [ ] Fix cash shift stale UI.
- [ ] Fix kitchen backlog/filter.
- [ ] Them FK indexes.
- [ ] Error handler JSON.
- [ ] Test store isolation.

### Nen lam trong ban beta nghiem tuc

- [ ] E2E Playwright cho luong POS.
- [ ] Concurrency test checkout.
- [ ] Audit log.
- [ ] RBAC chi tiet.
- [ ] Rate limit auth/PIN.
- [ ] Code split.
- [ ] Accessibility label.
- [ ] Monitoring/logging.
- [ ] Backup/restore.

### Nen lam de canh tranh

- [ ] QR order.
- [ ] Offline sync.
- [ ] HDDT/thue.
- [ ] Tich hop giao do an.
- [ ] CRM/loyalty.
- [ ] Da chi nhanh.
- [ ] Quan ly may in.
- [ ] Bao cao food cost/lai lo.
- [ ] App/tablet optimized.

## 13. Danh gia cuoi

Manager Coffee khong phai la app vo dung. Khung san pham da co nhieu module dung huong F&B. Nhung app POS khong duoc danh gia chi bang viec "co man hinh" hay "bam duoc". POS phai dung khi dong khach, khong mat tien, khong sai kho, khong lo PIN, khong hien bao cao gia, va khong chet khi 2 nguoi cung checkout.

Neu sua het P0/P1, app co the len muc beta van hanh noi bo kha on. Neu them offline, QR order, HDDT, CRM, giao do an, da chi nhanh, audit/monitoring va UX tablet tot, luc do moi co co so noi den viec canh tranh voi cac san pham lon.
