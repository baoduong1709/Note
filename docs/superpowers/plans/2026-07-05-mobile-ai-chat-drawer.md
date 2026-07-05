# Kế hoạch Triển khai: AI Chat Drawer trên Thiết bị Di động (Mobile/Tablet)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đổi bảng AI Chat Panel từ ẩn trên mobile thành một Drawer trượt từ bên phải có lớp nền backdrop mờ tối, giúp người dùng di động sử dụng được tính năng AI Chat bình thường.

**Architecture:** Cập nhật CSS của AIChatPanel thành hiển thị linh hoạt (Drawer `fixed` trên di động, Sidebar `static` trên desktop). Bổ sung thẻ `div` backdrop trong App.tsx điều khiển bởi trạng thái `showAiSidebar` và ẩn đi trên màn hình lớn.

**Tech Stack:** React, Tailwind CSS, Lucide Icons.

## Global Constraints
* Giữ nguyên logic đóng mở của `showAiSidebar` hiện tại.
* Ngôn ngữ comment trong code viết bằng tiếng Anh.
* Đặt tên commit bằng tiếng Anh.
* Không tự động commit khi chưa được người dùng yêu cầu.

---

### Task 1: Cập nhật CSS Responsive cho AIChatPanel

**Files:**
* Modify: [AIChatPanel.tsx](file:///c:/Project/Note/src/components/AIChatPanel.tsx#L540-L545)

**Interfaces:**
* Consumes: Trạng thái hiển thị thông qua component `<aside>`
* Produces: CSS hiển thị linh hoạt (Drawer trên mobile `< xl`, Sidebar trên desktop `>= xl`)

- [ ] **Step 1: Định vị và cập nhật thẻ aside trong AIChatPanel.tsx**

Sửa đổi dòng 542:
```tsx
// TRƯỚC:
<aside className="w-80 glass-panel border-l border-zinc-200 dark:border-white/5 flex flex-col h-full min-h-0 max-h-full shrink-0 z-10 transition-all duration-300 hidden xl:flex relative">
```
Thành:
```tsx
// SAU:
<aside className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm sm:w-96 xl:static xl:w-80 xl:z-10 xl:h-auto glass-panel border-l border-zinc-200 dark:border-white/5 flex flex-col h-full min-h-0 max-h-full shrink-0 shadow-2xl xl:shadow-none transition-all duration-300">
```

- [ ] **Step 2: Lưu tệp và kiểm tra lỗi cú pháp (Linter/Compiler)**
Đảm bảo tệp được lưu thành công và không xảy ra lỗi TypeScript.

---

### Task 2: Cập nhật logic render và Backdrop trong App.tsx

**Files:**
* Modify: [App.tsx](file:///c:/Project/Note/src/App.tsx#L361-L367)

**Interfaces:**
* Consumes: Component `<AIChatPanel>` và trạng thái `showAiSidebar`
* Produces: Lớp nền Backdrop mờ tối trên thiết bị di động, tự động đóng chat khi click vào.

- [ ] **Step 1: Thêm thẻ Backdrop Overlay trong App.tsx**

Tìm đoạn code render AIChatPanel ở dòng 362-365:
```tsx
// TRƯỚC:
{/* 3. AI CHAT PANEL (PC/Web only) */}
{showAiSidebar && (
  <AIChatPanel onClose={() => setShowAiSidebar(false)} />
)}
```
Sửa đổi thành:
```tsx
// SAU:
{/* 3. AI CHAT PANEL (Mobile Drawer & Desktop Sidebar) */}
{showAiSidebar && (
  <>
    {/* Mobile/Tablet Backdrop Overlay */}
    <div 
      className="xl:hidden fixed inset-0 bg-black/45 backdrop-blur-[2px] z-40 transition-opacity duration-300"
      onClick={() => setShowAiSidebar(false)}
      aria-label="Close AI Assistant"
    />
    <AIChatPanel onClose={() => setShowAiSidebar(false)} />
  </>
)}
```

- [ ] **Step 2: Lưu tệp và kiểm tra build**
Đảm bảo không có lỗi biên dịch (build errors).

---

### Task 3: Xác minh Thủ công (Manual Verification)

**Files:**
* Verification only

- [ ] **Step 1: Xác minh trên môi trường Desktop**
1. Mở ứng dụng trong trình duyệt với kích thước màn hình Desktop (ví dụ: Chrome với chiều rộng >= 1280px).
2. Kiểm tra xem bảng chat AI có hiển thị như một sidebar cố định bên phải màn hình không.
3. Nhấp nút đóng `X` ở góc trên bên phải bảng chat. Xác nhận bảng chat đóng và nút nổi "AI Chat" xuất hiện ở mép phải.
4. Nhấp nút nổi "AI Chat" và xác nhận bảng chat hiển thị lại bình thường.

- [ ] **Step 2: Xác minh trên môi trường Mobile**
1. Chuyển đổi trình duyệt sang chế độ giả lập thiết bị di động (ví dụ: iPhone 12 Pro, chiều rộng < 500px).
2. Nhấp nút nổi "AI Chat" ở mép phải.
3. Xác nhận:
   * Bảng chat xuất hiện dạng Drawer trượt, chiếm phần lớn màn hình (khoảng 85% chiều rộng).
   * Lớp nền tối (Backdrop) hiển thị phía sau bảng chat và che mờ nội dung trang chính.
4. Nhấp vào bất kỳ vùng nào trên lớp nền Backdrop bên ngoài bảng chat.
5. Xác nhận bảng chat đóng lại thành công, lớp nền biến mất, và nút nổi "AI Chat" hiển thị lại.
6. Nhấp nút nổi "AI Chat" một lần nữa và thử bấm nút đóng `X` trong bảng chat. Xác nhận bảng chat đóng thành công.
