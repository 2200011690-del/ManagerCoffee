# Điều khoản sử dụng và bảo mật dữ liệu - bản khung

Tài liệu này là bản khung để dùng khi chạy pilot hoặc thương mại hóa Manager Coffee. Trước khi dùng chính thức cho hợp đồng lớn, nên để luật sư hoặc đơn vị tư vấn pháp lý rà lại.

## Vai trò dữ liệu

- Manager Coffee là nền tảng phần mềm quản lý bán hàng.
- Chủ cửa hàng là bên sở hữu dữ liệu kinh doanh, khách hàng, nhân viên và hóa đơn của cửa hàng đó.
- Mỗi store được tách dữ liệu bằng `storeId`.
- API key, token và secret tích hợp ngoài được lưu theo từng store và không hiển thị lại ở giao diện sau khi lưu.

## Trách nhiệm của chủ cửa hàng

- Tự đăng ký tài khoản ngân hàng, cổng thanh toán, hóa đơn điện tử, GrabFood, ShopeeFood hoặc kênh đặt hàng khác bằng pháp nhân/cá nhân kinh doanh của mình.
- Tự chịu trách nhiệm về tính đúng đắn của thông tin thuế, hóa đơn, tài khoản nhận tiền và dữ liệu khách hàng.
- Quản lý tài khoản admin/nhân viên, mã PIN và phân quyền nội bộ.
- Kiểm tra sao lưu và xuất dữ liệu định kỳ nếu cần lưu trữ riêng.

## Trách nhiệm của nền tảng

- Tách dữ liệu giữa các store.
- Không cố ý chia sẻ dữ liệu store này cho store khác.
- Cung cấp công cụ backup/export và cấu hình tích hợp theo từng store.
- Cung cấp cơ chế khóa/mở store trong trường hợp hết hạn, vi phạm điều khoản hoặc cần bảo vệ hệ thống.

## Thanh toán và hóa đơn

- Tiền thanh toán của khách nên đi trực tiếp về tài khoản của chủ cửa hàng.
- Nền tảng không nên thu hộ, giữ hộ hoặc chia tiền cho cửa hàng nếu chưa có hợp đồng/pháp lý phù hợp.
- Hóa đơn điện tử phải được phát hành bằng thông tin thuế của chủ cửa hàng và nhà cung cấp HĐĐT hợp pháp.

## Bảo mật

- Chủ cửa hàng không chia sẻ tài khoản admin cho nhân viên.
- Mỗi nhân viên nên có tài khoản/PIN riêng.
- API key tích hợp ngoài chỉ nhập ở màn hình Cấu hình cửa hàng -> Tích hợp ngoài.
- Khi nghi ngờ lộ khóa API, chủ cửa hàng cần đổi khóa tại nhà cung cấp và cập nhật lại trong Manager Coffee.

## Sao lưu và khôi phục

- Backup JSON trong app dùng tốt cho catalog, cấu hình, menu, tồn kho và kiểm tra dữ liệu.
- Lịch sử tài chính production nên được bảo vệ bằng backup database tự động hoặc PITR từ nhà cung cấp database.
- Trước khi restore dữ liệu production, nên thử trên staging.

## Giới hạn trách nhiệm

- Nền tảng không thay thế kế toán, tư vấn thuế hoặc tư vấn pháp lý.
- Các tích hợp bên thứ ba phụ thuộc vào điều khoản, API, uptime và chính sách của bên thứ ba.
- Chủ cửa hàng cần kiểm tra số liệu cuối ngày và đối soát thanh toán/hóa đơn theo quy trình riêng.
