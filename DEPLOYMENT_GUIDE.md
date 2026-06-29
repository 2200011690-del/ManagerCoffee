# HƯỚNG DẪN TRIỂN KHAI (DEPLOYMENT GUIDE) CHO MANAGER COFFEE POS

Tài liệu này hướng dẫn chi tiết các bước đưa hệ thống lên môi trường Internet (Production) sử dụng hệ sinh thái Cloud hiện đại: **Supabase** (Database), **Render** (Backend Server), và **Vercel** (Frontend).

---

## BƯỚC 1: KHỞI TẠO CƠ SỞ DỮ LIỆU POSTGRESQL TRÊN SUPABASE

1. Truy cập [Supabase.com](https://supabase.com/) và đăng nhập/đăng ký tài khoản.
2. Nhấn **New Project** và điền thông tin (Tên dự án, Mật khẩu Database).
3. Đợi vài phút để Supabase khởi tạo hạ tầng.
4. Ở màn hình trang chủ dự án, kéo xuống tìm mục **Connecting to your new project**. Hoặc vào **Settings > Database**.
5. Trong phần **Connection string**, chọn Node.js và copy chuỗi URL kết nối. (Lưu ý: Bạn phải tự thay thế `[YOUR-PASSWORD]` bằng mật khẩu bạn đã tạo ở bước 2).
   - Ví dụ URL: `postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
6. Lưu tạm URL này ra Notepad để dùng cho Backend.

---

## BƯỚC 2: ĐẨY CODE LÊN GITHUB

Hệ thống CI/CD của Render và Vercel đều lấy mã nguồn tự động từ GitHub. Bạn cần đẩy (push) toàn bộ dự án lên một repo duy nhất (Monorepo).

1. Mở Terminal tại thư mục gốc của dự án (`ManagerCoffee`).
2. Khởi tạo Git và đẩy code:
   ```bash
   git init
   git add .
   git commit -m "Init Manager Coffee POS full-stack"
   ```
3. Tạo một Repository mới trên [GitHub](https://github.com/), đặt chế độ Private hoặc Public.
4. Liên kết repo local với GitHub:
   ```bash
   git remote add origin https://github.com/your-username/manager-coffee.git
   git push -u origin main
   ```

---

## BƯỚC 3: DEPLOY BACKEND LÊN RENDER

Render cung cấp máy chủ miễn phí (Free Tier) phù hợp cho các dự án Node.js có WebSockets.

1. Đăng nhập [Render.com](https://render.com/).
2. Nhấn nút **New** và chọn **Web Service**.
3. Chọn tuỳ chọn **Build and deploy from a Git repository** và kết nối tài khoản GitHub, sau đó chọn repo bạn vừa tạo.
4. Cấu hình Web Service:
   - **Name**: `manager-coffee-api`
   - **Root Directory**: `server` (RẤT QUAN TRỌNG: Phải gõ `server` vào ô này vì mã nguồn node nằm trong thư mục con).
   - **Environment**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
5. Cuộn xuống phần **Environment Variables**, nhấn **Add Environment Variable** để thêm các biến:
   - `DATABASE_URL`: Dán chuỗi kết nối Supabase từ BƯỚC 1.
   - `DIRECT_URL`: Dán chuỗi kết nối direct/session của Supabase nếu Supabase cung cấp riêng. Nếu chưa có, có thể tạm dùng cùng giá trị với `DATABASE_URL`.
   - `JWT_SECRET`: Tạo một chuỗi bí mật dài, ngẫu nhiên. Không dùng giá trị demo hoặc giá trị đã commit trong repo.
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `CORS_ORIGIN`: Dán link Vercel frontend sau khi deploy Vercel thành công, ví dụ `https://manager-coffee.vercel.app`.
6. Nhấn **Create Web Service**. Chờ Render build code (Khoảng 2-5 phút).
7. Khi thành công, copy đường dẫn `.onrender.com` của API (VD: `https://manager-coffee-api.onrender.com`).

---

## BƯỚC 4: PUSH DATABASE (MIGRATION) LÊN SUPABASE

Bạn cần đẩy cấu trúc bảng từ mã nguồn lên Supabase trước khi dùng:

1. Mở Terminal ở máy tính, trỏ vào thư mục `server`:
   ```bash
   cd server
   ```
2. Sửa tạm thời file `.env` local của bạn: dán chuỗi `DATABASE_URL` của Supabase vào.
3. Chạy lệnh để đẩy cấu trúc và tiêm dữ liệu mẫu:
   ```bash
   npx prisma db push
   node seed.cjs
   ```

4. Quay lại thư mục gốc dự án và chạy smoke test trước khi demo:
   ```bash
   cd ..
   npm run test:smoke
   npm run test:smoke:sales
   npm run test:smoke:shifts
   ```

Smoke test sẽ kiểm tra nhanh đăng nhập admin/staff, chặn request không token, chặn staff vào API quản trị/báo cáo, cho phép staff cập nhật trạng thái bàn, checkout bán hàng, trừ kho theo công thức, trả hàng hoàn kho, QR pending/paid, và ca tiền mặt.

---

## BƯỚC 5: DEPLOY FRONTEND LÊN VERCEL

Vercel là nền tảng tốt nhất để host ứng dụng Vite/React.

1. Đăng nhập [Vercel.com](https://vercel.com/).
2. Nhấn **Add New... > Project** và import repository GitHub của bạn.
3. Cấu hình Project:
   - **Framework Preset**: Vite
   - **Root Directory**: Để mặc định (Root, thư mục `./`). Đừng sửa thành server.
4. Mở tab **Environment Variables** và nhập:
   - `VITE_API_URL`: `<URL-Backend-Của-Render-Ở-Bước-3>/api` (VD: `https://manager-coffee-api.onrender.com/api`)
   - `VITE_SOCKET_URL`: `<URL-Backend-Của-Render-Ở-Bước-3>` (VD: `https://manager-coffee-api.onrender.com`)
   - `VITE_BANK_ID`: `MB` (Tên ngân hàng của bạn)
   - `VITE_ACCOUNT_NO`: Số tài khoản nhận tiền thật của bạn.
   - `VITE_ACCOUNT_NAME`: Tên hiển thị chủ tài khoản.
5. Nhấn **Deploy**.
6. Đợi Vercel build (Khoảng 1-2 phút). Sau khi hoàn tất, Vercel sẽ cung cấp cho bạn đường dẫn truy cập trang web.

---

🎉 **HOÀN TẤT!**
Bây giờ bạn có thể truy cập đường dẫn Vercel bằng trình duyệt trên máy tính bảng hoặc iPad. Với dữ liệu seed demo, dùng mã cửa hàng `espresso-lab`, admin `admin@espresso-lab.vn / admin123456`, hoặc nhân viên PIN `2222`.
