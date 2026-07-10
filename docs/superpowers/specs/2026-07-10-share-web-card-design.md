# Thêm Thẻ "Truy cập Share" Trên Trang Chủ

## Tổng quan
Mục tiêu của dự án là thêm một đường dẫn trực tiếp từ trang landing (trang chủ) đến tính năng "Chia sẻ nhanh theo phiên" (Shared Session View). Điều này sẽ giúp người dùng truy cập web dễ dàng hơn mà không cần phải ghi nhớ URL `/shared-view.html`.

## Thiết kế Giao Diện (UI)
- **Vị trí**: Bên trong container `.downloads-wrapper` của file `server/landing/index.html`.
- **Thành phần mới**: Một thẻ (card) thứ 4 (kế bên Windows, macOS, Android).
- **Chi tiết hiển thị**:
  - Tiêu đề (Platform Name): **Web Share** hoặc **Truy cập nhanh**
  - Mô tả (Platform Desc): "Truy cập và xem ghi chú được chia sẻ theo phiên trực tiếp trên trình duyệt."
  - Biểu tượng (Icon): Sử dụng một SVG icon biểu thị cho web/share (như icon globe hoặc link).
  - Nút bấm (Button): Văn bản "Truy cập ngay" thay vì "Tải về (...)".
- **Hành vi Responsive**: Vì các thẻ hiện tại có thuộc tính `width: calc(33.333% - 1.33rem);` và thẻ cha có `flex-wrap: wrap; justify-content: center;`, thẻ thứ 4 sẽ tự động xuống dòng thứ 2 và được căn giữa, tạo bố cục đẹp mắt mà không cần thay đổi CSS hiện tại.

## Luồng Hoạt Động (Data Flow)
- Thẻ mới sẽ là một thẻ `<a>` với thuộc tính `href="/shared-view.html"`.
- Khi người dùng click vào thẻ này, họ sẽ được chuyển hướng thẳng đến trang `/shared-view.html` đã có sẵn.

## Các thành phần cần chỉnh sửa
1. `server/landing/index.html`
   - Bổ sung đoạn HTML cho thẻ mới vào bên trong div `.downloads-wrapper`.

## Kiểm thử (Testing)
- Kiểm tra tính tương thích trên Desktop: đảm bảo thẻ thứ 4 nằm ngay ngắn ở hàng dưới.
- Kiểm tra trên Mobile: các thẻ xếp dọc, thẻ "Web Share" sẽ nằm cuối cùng.
- Kiểm tra link: Nhấn vào thẻ và đảm bảo chuyển đúng sang `/shared-view.html`.
