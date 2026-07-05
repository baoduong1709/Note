# Tài liệu Thiết kế: AI Chat Drawer trên Thiết bị Di động (Mobile/Tablet)

Tài liệu thiết kế chi tiết cho việc tối ưu hóa giao diện trợ lý ảo AI Chat Panel trên các thiết bị màn hình nhỏ.

## 1. Vấn đề Hiện tại
* Bảng AI Chat (`AIChatPanel`) hiện đang bị ẩn hoàn toàn trên các màn hình có chiều rộng nhỏ hơn mức `xl` (sử dụng class `hidden xl:flex`).
* Trong khi đó, nút mở "AI Chat" ở bên phải màn hình vẫn luôn hiển thị trên mọi kích thước thiết bị. Khi người dùng di động bấm vào nút này, nút sẽ biến mất (do trạng thái `showAiSidebar` chuyển thành `true`), nhưng bảng chat thực tế lại không hiển thị do CSS ẩn đi. Điều này làm cho tính năng AI Chat không thể sử dụng được trên di động và gây ra trải nghiệm lỗi (UX bug).

---

## 2. Giải pháp Đề xuất (Phương án 1: Mobile Drawer)
Thay vì ẩn hoàn toàn, chúng ta sẽ biến `AIChatPanel` thành dạng **Drawer** (Bảng trượt từ cạnh phải) trên màn hình di động/máy tính bảng (< `xl`).
* **Hiển thị**: Panel sẽ nổi lên trên cùng (có đổ bóng sâu) đè lên nội dung trang chính.
* **Lớp nền mờ (Backdrop Overlay)**: Một lớp nền tối bán trong suốt sẽ xuất hiện phía sau bảng chat để ngăn người dùng tương tác với nội dung trang bên dưới và tạo điểm nhấn cho bảng chat.
* **Tương tác**: Người dùng có thể đóng bảng chat bằng cách bấm nút `X` (nút đóng mặc định của AI chat) hoặc click ra ngoài vùng chat (click vào lớp nền backdrop).
* **Responsive**: Khi màn hình rộng trở lại (>= `xl`), panel tự động chuyển về dạng Sidebar cố định, không đè lên nội dung và ẩn lớp nền backdrop đi.

---

## 3. Các File Thay đổi

### A. [App.tsx](file:///c:/Project/Note/src/App.tsx)
Chúng ta sẽ bổ sung lớp Backdrop phía sau khi `showAiSidebar` là `true` và chỉ hiển thị nó trên các màn hình nhỏ hơn `xl`.

```tsx
{showAiSidebar && (
  <>
    {/* Backdrop mờ tối dành riêng cho mobile/tablet */}
    <div 
      className="xl:hidden fixed inset-0 bg-black/45 backdrop-blur-[2px] z-40 transition-opacity duration-300"
      onClick={() => setShowAiSidebar(false)}
      aria-label="Đóng trợ lý AI"
    />
    
    {/* Panel AI Chat */}
    <AIChatPanel onClose={() => setShowAiSidebar(false)} />
  </>
)}
```

### B. [AIChatPanel.tsx](file:///c:/Project/Note/src/components/AIChatPanel.tsx)
Sửa đổi các class Tailwind CSS của thẻ `<aside>` bên trong `AIChatPanel` để hỗ trợ hiển thị linh hoạt (Drawer trên mobile và Sidebar trên desktop).

* **Trước đây**:
  ```tsx
  <aside className="w-80 glass-panel border-l border-zinc-200 dark:border-white/5 flex flex-col h-full min-h-0 max-h-full shrink-0 z-10 transition-all duration-300 hidden xl:flex relative">
  ```
* **Sau khi sửa**:
  ```tsx
  <aside className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm sm:w-96 xl:static xl:w-80 xl:z-10 xl:h-auto glass-panel border-l border-zinc-200 dark:border-white/5 flex flex-col h-full min-h-0 max-h-full shrink-0 shadow-2xl xl:shadow-none transition-all duration-300">
  ```

---

## 4. Kế hoạch Kiểm thử & Xác minh

### Kiểm thử Thủ công (Manual Testing)
1. **On desktop size (>= 1280px)**:
   * Đảm bảo AI Chat Panel hiển thị cố định ở bên phải như bình thường, đẩy nội dung trang chính sang trái.
   * Lớp nền Backdrop tối không xuất hiện.
   * Bấm nút đóng `X` hoạt động tốt (panel ẩn đi, nút nổi "AI Chat" xuất hiện ở mép phải).
2. **On mobile/tablet size (< 1280px)**:
   * Bấm nút nổi "AI Chat" ở mép phải màn hình.
   * Kiểm tra xem bảng chat có xuất hiện trượt từ phải qua và đè lên màn hình chính hay không.
   * Kiểm tra lớp nền backdrop có hiển thị làm mờ/tối phần nội dung chính phía dưới không.
   * Click vào lớp nền backdrop hoặc bấm nút `X` trong chat panel và xác nhận bảng chat đóng lại thành công, trả lại giao diện ban đầu và nút nổi xuất hiện lại.
