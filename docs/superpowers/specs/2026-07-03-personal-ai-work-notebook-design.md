# Personal AI Work Notebook - Design Specification

**Goal:** Xây dựng ứng dụng ghi chú cá nhân thông minh (Personal AI Work Notebook) đa nền tảng (PC Desktop, Web/PWA, Mobile) đạt hiệu năng mượt mà tối đa, giao diện Dark Mode cao cấp (Wow Aesthetics), thiết kế offline-first và tích hợp an toàn với AI cùng hệ thống Jira.

**Architecture:** 
Ứng dụng được thiết kế theo mô hình **Tauri v2 + React (Vite + TypeScript) + SQLite (Offline-First)**:
1. **Frontend (UI Layer):** Sử dụng React, Tailwind CSS, Framer Motion cho animation mượt mà, và Lucide React cho icon. Trình soạn thảo sử dụng TipTap hoặc Monaco Editor cho Markdown.
2. **Desktop Wrapper (Tauri v2 - Rust Backend):** Xử lý các tương tác hệ thống sâu như Global Shortcuts (phục vụ Quick Capture), Clipboard Listener, App Lock PIN bảo mật, và giải quyết các vấn đề CORS khi gọi API Jira hoặc AI.
3. **Database (Local Storage):** SQLite làm database local chính chạy dưới dạng plugin Tauri (`@tauri-apps/plugin-sql`). Trên trình duyệt Web/PWA, sử dụng SQLite WASM hoặc IndexedDB dự phòng.

---

## 1. Hệ Thống Thư Mục Dự Án (File Structure)

```txt
src-tauri/                 # Backend Rust (Tauri v2)
├── src/
│   ├── main.rs            # Entrypoint chính, đăng ký các Tauri command và plugin
│   ├── clipboard.rs       # Module lắng nghe và xử lý sự kiện Clipboard hệ thống
│   ├── shortcuts.rs       # Đăng ký và lắng nghe Global Shortcuts (Quick Capture)
│   └── security.rs        # Mã hóa/giải mã API Keys, xác thực PIN/Biometric
├── Cargo.toml
└── tauri.conf.json        # Cấu hình app, phân quyền và đăng ký plugin (SQL, HTTP)

src/                       # Frontend React (TypeScript + Vite)
├── main.tsx               # Khởi tạo React App
├── index.css              # CSS nền tảng, thiết kế hệ màu Dark Mode và các hiệu ứng Glassmorphism
├── App.tsx                # Quản lý routing và Layout chính (Sidebar + Content)
├── components/            # Các UI component dùng chung
│   ├── ui/                # Các thành phần UI nguyên tử (Button, Input, Modal, Toast)
│   ├── Sidebar.tsx        # Thanh điều hướng trái (Sidebar Navigation)
│   ├── Dashboard.tsx      # Màn hình chính Dashboard tổng hợp
│   ├── CopyBlock.tsx      # Component hiển thị và xử lý Copy Block (hỗ trợ nhập biến và cảnh báo)
│   ├── MarkdownEditor.tsx # Trình soạn thảo Markdown (checklist, render copy block)
│   ├── ConfirmModal.tsx   # Popup xác nhận hành động ghi/xóa (Confirm Before Write)
│   └── ActivityTimeline.tsx # Hiển thị lịch sử hoạt động
├── views/                 # Các trang/màn hình lớn
│   ├── NotesView.tsx      # Quản lý danh sách note và chi tiết editor
│   ├── TasksView.tsx      # Quản lý task dạng List và Kanban board
│   ├── DailyNotesView.tsx # Màn hình quản lý Daily Notes và AI summary
│   ├── AIChatView.tsx     # Giao diện Chat với AI Assistant
│   ├── WorkspacesView.tsx # Quản lý không gian làm việc và dự án
│   └── SettingsView.tsx   # Cấu hình hệ thống (Jira, AI, Data backup)
├── database/              # Quản lý database local
│   ├── db.ts              # Khởi tạo SQLite connection và tạo bảng
│   ├── queries/           # Chứa các hàm truy vấn SQL (notes, tasks, logs, v.v.)
│   └── syncQueue.ts       # Hàng đợi đồng bộ local-to-backend
├── services/              # Tích hợp API bên ngoài
│   ├── aiService.ts       # Gọi API LLM (Gemini/OpenAI) qua proxy Tauri hoặc stream trực tiếp
│   └── jiraService.ts     # Các phương thức gọi Jira API (Authentication, Fetch, Transition, Comment)
├── hooks/                 # Custom React hooks (useLocalStorage, useDebounce, etc.)
└── styles/                # Chứa biến CSS, animation configs
```

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (SQLite Database Schema)

### Bảng `workspaces` (Không gian làm việc)
```sql
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,             -- Tên icon hoặc mã emoji
    color TEXT,            -- Mã màu hex dùng cho UI
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Bảng `projects` (Dự án thuộc Workspace)
```sql
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

### Bảng `notes` (Ghi chú)
```sql
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    project_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT CHECK(type IN ('quick', 'command', 'workflow', 'error_fix', 'prompt', 'daily')) DEFAULT 'quick',
    is_locked INTEGER DEFAULT 0,          -- 0: False, 1: True (Cần PIN để mở)
    is_pending_sync INTEGER DEFAULT 0,    -- 0: Synced, 1: Pending
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);
```

### Bảng `copy_blocks` (Đoạn mã/Lệnh có thể copy nhanh)
```sql
CREATE TABLE IF NOT EXISTS copy_blocks (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    content TEXT NOT NULL,                -- Đoạn text/command gốc (có thể chứa {{variable}})
    type TEXT CHECK(type IN ('text', 'command', 'code', 'sql', 'prompt', 'config')) DEFAULT 'text',
    usage_count INTEGER DEFAULT 0,
    last_copied_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
```

### Bảng `tasks` (Công việc/Todo)
```sql
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    note_id TEXT,                         -- Liên kết với note chứa checklist (nếu có)
    title TEXT NOT NULL,
    status TEXT CHECK(status IN ('todo', 'in_progress', 'done', 'blocked')) DEFAULT 'todo',
    priority TEXT CHECK(priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    due_date DATE,
    workspace_id TEXT,
    project_id TEXT,
    source TEXT CHECK(source IN ('local', 'jira')) DEFAULT 'local',
    external_id TEXT,                     -- Ví dụ: Issue Key của Jira (GL-123)
    external_url TEXT,                    -- Link trực tiếp tới Jira
    is_pending_sync INTEGER DEFAULT 0,    -- Đồng bộ local task
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);
```

### Bảng `activity_logs` (Lịch sử hoạt động)
```sql
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    target_type TEXT CHECK(target_type IN ('note', 'task', 'copy_block', 'jira', 'sync', 'ai')) NOT NULL,
    target_id TEXT,
    action TEXT NOT NULL,                  -- created, updated, deleted, copied, sync_failed, etc.
    description TEXT,                      -- Mô tả chi tiết hành động
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Bảng `settings` (Cấu hình ứng dụng)
```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL                   -- Dạng chuỗi hoặc JSON string
);
```

### Bảng `sync_queue` (Hàng đợi đồng bộ offline-first)
```sql
CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT CHECK(action_type IN ('create_note', 'update_note', 'delete_note', 'create_task', 'update_task', 'delete_task')) NOT NULL,
    payload TEXT NOT NULL,                -- JSON chứa thông tin thay đổi
    status TEXT CHECK(status IN ('pending', 'processing', 'failed')) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Thiết Kế UI/UX (Aesthetics & Layout)

Ứng dụng sẽ áp dụng thiết kế tối giản, hiện đại và tạo chiều sâu thị giác (Wow factor):
*   **Màu sắc:** Tông màu tối (Dark Mode) chủ đạo.
    *   Nền chính (Background): `#0f0f12` (màu đen sẫm sâu).
    *   Bảng điều khiển (Cards/Panels): `#17171c` kết hợp hiệu ứng `backdrop-filter: blur(10px)` và độ trong suốt nhẹ (Glassmorphism).
    *   Màu nhấn (Accent): Neon Purple `#8b5cf6` (tượng trưng cho AI) và Deep Teal `#0d9488` (tượng trưng cho năng suất).
*   **Typography:** Sử dụng font chữ hiện đại, rõ ràng như `Inter` hoặc `Geist` để tối ưu hóa khả năng đọc code/command.
*   **Transitions & Animations (Framer Motion):**
    *   Sidebar đóng/mở êm ái với hiệu ứng Spring animation.
    *   Màn hình chuyển tab sử dụng hiệu ứng trượt nhẹ (slide) và mờ dần (fade).
    *   Các Copy Block có hiệu ứng nháy nhẹ màu lục bảo khi copy thành công kèm theo Toast message mượt mà.

---

## 4. Đặc Tả Chi Tiết 20 Luồng Nghiệp Vụ (Flows)

### Flow 1: Khởi động & Offline-First (Mục 2.1)
1. User mở app.
2. App chạy lệnh kiểm tra kết nối mạng (Tauri Rust `ping` hoặc navigator.onLine).
3. Song song, app khởi tạo kết nối database SQLite local, load toàn bộ workspace, notes gần đây, tasks hôm nay và đổ lên giao diện Dashboard ngay lập tức (< 100ms).
4. Nếu trạng thái là Online: App kích hoạt `sync_service.py` để xử lý hàng đợi trong bảng `sync_queue` lên backend (nếu có).
5. Nếu có lỗi sync hoặc xung đột dữ liệu (Conflict), app hiển thị một Notification Toast nhỏ góc phải màn hình, click vào sẽ mở màn hình Resolve Conflict.

### Flow 2: Thiết kế Dashboard (Mục 2.2)
Dashboard được chia thành layout dạng lưới (Grid CSS) linh hoạt:
*   **Cột Trái:**
    *   *Quick Capture:* Textbox lớn tự động focus để gõ ghi chú nhanh/lệnh nhanh, ấn Ctrl+Enter để tạo nhanh Note vào Inbox.
    *   *Today Tasks:* Danh sách checklist công việc hôm nay (lấy từ Daily Note và Tasks).
*   **Cột Giữa:**
    *   *Recent Notes:* Grid hiển thị 4-6 note vừa chỉnh sửa.
    *   *Recently Copied Blocks:* Danh sách các command/đoạn code vừa được copy gần đây kèm nút Re-copy nhanh.
*   **Cột Phải:**
    *   *Daily Note hôm nay:* Widget tóm tắt nội dung Daily note hôm nay, hiển thị tiến độ công việc.
    *   *Jira Tasks:* Danh sách issue Jira được gán (nếu đã kết nối).
    *   *AI Assistant shortcut:* Các gợi ý nhanh để bắt đầu chat với AI (ví dụ: "Tổng hợp ngày hôm nay của tôi").

### Flow 3: Điều hướng Sidebar (Mục 2.3)
Thanh Sidebar trái có cấu trúc collapsible (thu gọn được):
*   **Nhóm Hộp thư & Hôm nay:** Inbox, Today
*   **Nhóm Cá nhân:** Notes, Tasks, Daily Notes
*   **Nhóm AI & Tiện ích:** AI Chat, Commands (Quản lý các copy blocks), Workspaces, Tags
*   **Nhóm Hệ thống:** Integrations (Cấu hình Jira, GitHub, Slack), Settings.
*   *Tương tác:* Hover vào các phần tử sẽ có hiệu ứng trượt màu nền gradient bo tròn mượt mà.

### Flow 4: Tạo Note Nhanh (Mục 3.1)
1. Người dùng bấm phím tắt `Ctrl+N` hoặc nút "+ New Note" ở Sidebar.
2. App sinh ra UUID mới, tạo record rỗng trong database local bảng `notes` với title mặc định dạng "Untitled Note - [Ngày]".
3. Navigation tự chuyển hướng màn hình sang editor của note này và focus con trỏ vào ô nhập nội dung.
4. Note mới lập tức xuất hiện ở đầu danh sách "Recent Notes" trên Dashboard.

### Flow 5: Tạo Note Từ Template (Mục 3.2)
1. Bấm nút mũi tên bên cạnh nút New Note -> hiện danh sách Template: Quick Note, Command Note, Workflow Note, Error Fix Note, Prompt Note, Daily Note.
2. Chọn loại note -> app tự động nạp khung template tương ứng vào nội dung editor.
    * *Ví dụ Error Fix Note Template:*
      ```markdown
      # Error: [Tên lỗi]
      ## Khắc phục
      - [ ] Bước 1
      - [ ] Bước 2
      ## Lệnh kiểm tra
      ```
3. User chỉnh sửa bình thường.

### Flow 6: Auto-Save với Cơ Chế Debounce (Mục 3.3)
1. Khi user gõ vào Editor, sự kiện `onChange` kích hoạt.
2. Hàm `debounce` trì hoãn việc ghi file trong vòng 800ms.
3. Khi hết thời gian debounce:
    * Lưu nội dung mới vào SQLite Local.
    * Đánh dấu note đó có cột `is_pending_sync = 1`.
    * Thêm hành động `update_note` vào bảng `sync_queue`.
    * Gọi Sync Worker để đồng bộ (nếu đang online). Nếu sync thành công, chuyển `is_pending_sync = 0` và xóa hàng đợi tương ứng. Nếu offline, worker dừng lại và đợi tín hiệu mạng online trở lại.

### Flow 7: Copy Block Cơ Bản & Đếm Lượt Sử Dụng (Mục 4.1 & 4.2)
1. Trong editor Markdown, các đoạn code/lệnh viết trong thẻ rào (ví dụ ` ```bash ` hoặc ` ```sql ` hoặc block được chọn đặc biệt) sẽ được render thành một component **Copy Block** riêng biệt trên UI.
2. Component này hiển thị: Loại block (Bash/SQL/Code/Prompt), nội dung lệnh, nút "Copy" kèm biểu tượng clipboard, số lần đã sử dụng (`usage_count`) và thời gian copy cuối (`lastCopiedAt`).
3. Khi click nút Copy:
    * Gọi API clipboard của Tauri (`write_text`).
    * Tăng `usage_count` lên 1, cập nhật `last_copied_at = NOW()` trong bảng `copy_blocks` ở SQLite.
    * Đẩy log hành động vào bảng `activity_logs` (ví dụ: "Copied command: kubectl get pods").
    * Hiển thị Toast thông báo "Copied to clipboard!" kèm hiệu ứng glow nhẹ quanh block.

### Flow 8: Tạo Copy Block Thủ Công (Mục 4.3)
1. User bôi aden một đoạn text trong editor.
2. Một thanh công cụ nổi (Tooltip Menu) xuất hiện -> bấm nút "Make Copy Block".
3. Chọn loại (Text, Command, Code, Prompt, Config).
4. App chèn cú pháp đánh dấu (ví dụ thẻ custom markdown hoặc định dạng JSON tùy chỉnh của editor) quanh đoạn text đó. Editor tự động render lại đoạn text đó thành một Copy Block thông minh có nút Copy.

### Flow 9: Copy Command Có Biến {{variable}} (Mục 4.4)
1. Khi user bấm nút Copy trên một Command Block có chứa định dạng `{{tên_biến}}` (ví dụ: `kubectl logs {{pod_name}} -n {{namespace}}`):
2. App không copy ngay mà hiển thị một Modal/Form nhập biến ngay dưới block hoặc ở dạng popup nhỏ.
3. Form tự động sinh các trường input dựa trên danh sách biến tìm thấy trong command:
    * Trường `pod_name`
    * Trường `namespace`
4. Khi user nhập giá trị (app có cơ chế tự gợi ý các giá trị đã nhập ở các lần trước bằng cách truy vấn lịch sử copy):
5. App hiển thị một khung preview dòng lệnh cuối cùng đã được thay thế biến.
6. User bấm "Copy Preview" -> Thực hiện copy lệnh hoàn chỉnh vào clipboard, ghi log activity và lưu lại các giá trị biến này làm cache gợi ý cho lần sau.

### Flow 10: Cảnh Báo Command Nguy Hiểm (Mục 4.5)
1. Khi bấm Copy một dòng lệnh, trước khi thực hiện copy, app chạy hàm regex kiểm tra xem lệnh có chứa các từ khóa nguy hiểm sau không:
    * `rm -rf`, `drop database`, `drop table`, `truncate`, `kubectl delete`, `terraform destroy`, `git reset --hard`, `sudo rm`.
2. Nếu phát hiện:
    * App chặn việc copy và hiển thị một Modal cảnh báo màu đỏ (Danger Alert Modal).
    * Tiêu đề: **WARNING: Dangerous Command Detected!**
    * Nội dung hiển thị dòng lệnh nguy hiểm cần copy và cảnh báo rủi ro phá hủy dữ liệu.
    * Hai nút lựa chọn: `[Copy Anyway]` (màu đỏ) và `[Cancel]` (màu xám, mặc định focus).
3. Nếu chọn `Cancel`: Hủy bỏ hành động.
4. Nếu chọn `Copy Anyway`: Tiến hành copy vào clipboard, đồng thời ghi một log đặc biệt vào bảng `activity_logs` với mức cảnh báo HIGH: "USER COPIED DANGEROUS COMMAND: [nội dung lệnh]".

### Flow 11: Quản Lý Checklist / Todo Trong Note (Mục 5.1)
1. Người dùng viết checklist dạng `- [ ] Task 1` trong Markdown.
2. Editor render thành các checkbox tương tác.
3. Khi click tick chọn done (`- [x]`) hoặc bỏ tick (`- [ ]`):
    * Giao diện thay đổi tức thì (chữ bị gạch ngang mượt mà).
    * Kích hoạt auto-save cập nhật nội dung note.
    * Ghi lịch sử hoạt động vào log.

### Flow 12: Đổi Checklist Thành Task Riêng Biệt (Mục 5.2)
1. Hover chuột vào dòng checklist -> hiển thị icon "Convert to Task" (biểu tượng check list có dấu cộng).
2. Click vào icon -> mở một Popup Form tạo Task nhanh:
    * Tiêu đề: Tự động lấy nội dung dòng checklist.
    * Dự án/Workspace: Lấy dự án hiện tại của note.
    * Cho phép chọn thêm: Priority (Low/Medium/High), Due Date.
3. Nhấn "Create Task":
    * Tạo một record mới trong bảng `tasks` ở database local với `note_id = [id_note_hiện_tại]`.
    * Thay đổi dòng checklist trong editor thành định dạng đặc biệt chứa liên kết: `- [ ] [linked-task:id_task] Tên task` (hoặc hiển thị một badge Icon Task kế bên để click là mở chi tiết task).

### Flow 13: Tạo Task Riêng Biệt & Chế Độ Xem (Mục 5.3)
1. Người dùng vào mục **Tasks** ở Sidebar.
2. Có 3 tab chế độ xem chính:
    * **Today:** Hiển thị công việc có due date là hôm nay hoặc quá hạn.
    * **Backlog:** Danh sách toàn bộ task chưa hoàn thành phân theo dự án.
    * **Kanban Board:** Các cột Todo, In Progress, Blocked, Done. Cho phép kéo thả thẻ Task giữa các cột cực kỳ mượt mà nhờ thư viện `@hello-pangea/dnd` hoặc `dnd-kit` với hiệu ứng chuyển động mượt.
3. Nhấp đúp vào Task hoặc bấm nút Add Task -> mở slide-panel bên phải để chỉnh sửa tiêu đề, trạng thái, mức độ ưu tiên, ngày hết hạn và liên kết Jira.

### Flow 14: Cập Nhật Trạng Thái Task & Đồng Bộ Jira (Mục 5.4)
1. Khi user đổi trạng thái một Task (ví dụ chuyển từ `In Progress` sang `Done`):
2. App cập nhật database local trước.
3. Kiểm tra xem task này có chứa liên kết Jira (`source = 'jira'` và có `external_id`) hay không.
4. Nếu **Không**: Kết thúc quy trình, ghi log.
5. Nếu **Có**:
    * Hiển thị một Confirm Dialog nhỏ: *"Task này được liên kết với Jira Issue [GL-123]. Bạn có muốn cập nhật trạng thái này lên Jira không?"*
    * Nếu user chọn *No*: Kết thúc (task local là done nhưng Jira giữ nguyên).
    * Nếu user chọn *Yes*:
        * Gọi API Jira để kiểm tra xem có trạng thái tương ứng hay không.
        * Hiển thị màn hình **Action Preview Confirm** (xem chi tiết ở Flow 18).
        * User bấm Confirm -> Gọi API Jira cập nhật trạng thái thực tế -> ghi activity log.

### Flow 15: Tự Động Tạo Daily Note Mỗi Ngày (Mục 6.1 & 6.2)
1. Khi mở app, hệ thống tự động kiểm tra xem trong bảng `notes` đã tồn tại note nào có `type = 'daily'` và ngày khởi tạo trùng với ngày hiện tại (YYYY-MM-DD) chưa.
2. Nếu **Chưa**:
    * Tạo bản ghi note mới trong SQLite với tiêu đề: `Daily Note - [YYYY-MM-DD]`.
    * Áp dụng Template Daily Note chuẩn (gồm các tiêu đề: ## Todo hôm nay, ## Đang làm, ## Đã xong, ## Command đã dùng hôm nay, ## Summary cuối ngày).
3. Đưa Daily Note này lên vị trí ưu tiên nhất trên Dashboard.

### Flow 16: Tự Tổng Hợp Dữ Liệu Vào Daily Note (Mục 6.3)
App chạy một tác vụ nền liên tục cập nhật nội dung cho Daily Note hôm nay:
*   Mỗi khi user copy một dòng lệnh thành công -> tự động ghi nhận dòng lệnh đó vào mục `## Command đã dùng hôm nay` trong Daily Note.
*   Mỗi khi một task được tích done -> tự động ghi nhận tên task đó vào mục `## Đã xong`.
*   Mỗi khi import một task từ Jira -> hiển thị trong mục `## Jira cập nhật hôm nay`.

### Flow 17: AI Tổng Hợp Cuối Ngày - Daily Summary (Mục 6.4)
1. Vào cuối ngày, user bấm nút **"Generate Daily Summary"** tại cuối Daily Note hoặc Dashboard.
2. App kích hoạt AI Assistant:
    * Đọc dữ liệu Daily note hôm nay.
    * Đọc danh sách log hoạt động (`activity_logs`) trong ngày.
    * Đọc các task đã xong và các command đã copy.
3. AI sinh ra một đoạn tóm tắt ngắn gọn, chuyên nghiệp về tiến độ làm việc, các vấn đề gặp phải và các lệnh quan trọng đã xử lý.
4. Đoạn tóm tắt được hiển thị ở dạng Preview.
5. User chọn `[Insert to Note]` -> App chèn đoạn summary này vào phần `## Summary cuối ngày` của Daily Note.

### Flow 18: Quản Lý Không Gian Làm Việc (Workspace / Project) (Mục 7.1, 7.2, 7.3)
1. Người dùng bấm vào quản lý **Workspaces** trên Sidebar -> Bấm "+ New Workspace" -> Nhập tên (ví dụ: Work, Personal, Game Dev), chọn icon đại diện và mã màu chủ đạo.
2. Trong mỗi Workspace, cho phép tạo các **Projects** nhỏ hơn (ví dụ Workspace "Work" có project "GL Lifestyle").
3. Khi làm việc với Note hoặc Task, trên thanh metadata của editor/task panel sẽ có dropdown cho phép gán nhanh Note/Task đó vào Workspace và Project cụ thể.
4. Khi click vào một Workspace ở Sidebar, giao diện sẽ tự động lọc chỉ hiển thị các Note và Task thuộc Workspace đó.

### Flow 19: Tìm Kiếm Nhanh & Tìm Kiếm Nâng Cao (Mục 8.1, 8.2, 8.3)
1. Nhấn `Ctrl+P` or click ô Search ở Dashboard -> Mở thanh tìm kiếm Spotlight/Omnibar giữa màn hình.
2. Khi user gõ từ khóa:
    * App thực hiện câu lệnh truy vấn FTS5 SQLite local cực nhanh để tìm kiếm trong tiêu đề và nội dung note/task/copy block.
    * Kết quả trả về lập tức dưới dạng phân nhóm rõ ràng: Notes, Tasks, Copy Blocks, Jira Issues.
3. Hỗ trợ cú pháp tìm kiếm nâng cao (Search Filters):
    * `type:command tag:kubernetes` (tìm các lệnh có gắn thẻ kubernetes).
    * `status:todo source:jira` (tìm các task chưa làm đồng bộ từ Jira).
    * `project:gl-lifestyle` (tìm ghi chú thuộc dự án cụ thể).
4. User có thể bấm phím mũi tên lên xuống và bấm `Enter` để thực hiện hành động nhanh (ví dụ: copy command trực tiếp từ kết quả search mà không cần mở note).

### Flow 20: Tích Hợp Jira - Đọc/Ghi An Toàn & Activity Log (Mục 9, 10, 11, 12, 13, 14, 15)
#### 20.1 Kết nối & Import (Read-only):
1. User nhập Jira URL, Email và API Token trong Settings -> Bấm Test Connection (app gọi API `/rest/api/3/myself` để xác thực). Nếu đúng, lưu thông tin mã hóa bằng Tauri Rust Backend.
2. Bấm "Import Jira Tasks" -> Gọi API lấy các issues đang assigned cho user -> hiển thị list -> chọn issue cần import -> Tạo task local tương ứng với `source = 'jira'`, lưu mapping `external_id = [Key]` và trạng thái tương thích.

#### 20.2 AI Đọc & Tương Tác:
1. User chat với AI: *"Hôm nay tôi có task Jira nào cần làm?"*
2. AI gọi tool `search_jira_issues` -> gọi API Jira -> tóm tắt danh sách và đề xuất: *"Bạn có 2 task chưa xử lý, tôi có nên import chúng thành Task local không?"*
3. User gõ *"Đồng ý"* -> AI gọi tool tạo task local -> Ghi log activity.

#### 20.3 Xác Nhận Trước Khi Ghi (Confirm Before Write - Bắt buộc):
1. Bất kỳ hành động nào ghi đè dữ liệu ra bên ngoài (đổi trạng thái Jira, comment Jira, xóa note/task, hoặc copy lệnh nguy hiểm) đều phải qua **Confirm Screen**.
2. Thiết kế màn hình confirm:
    ```txt
    +-----------------------------------------------------------+
    |                      ACTION PREVIEW                       |
    |                                                           |
    |  Nguồn thực hiện: Jira Integration                        |
    |  Mục tiêu: Issue GL-123 (Đang làm app note)               |
    |  Hành động:                                               |
    |    - Cập nhật trạng thái: In Progress -> Done              |
    |    - Thêm comment: "Đã hoàn thành và deploy staging."     |
    |                                                           |
    |  ⚠️ CẢNH BÁO: Hành động này sẽ được ghi trực tiếp ra Jira.  |
    |                                                           |
    |                      [ CONFIRM ]  [ CANCEL ]              |
    +-----------------------------------------------------------+
    ```
3. Chỉ khi bấm **Confirm**, app mới thực sự gọi API write của Jira. Nếu API lỗi, giữ nguyên trạng thái local, hiển thị báo lỗi đỏ và nút Retry.
4. Mỗi hành động thành công đều lưu vào bảng `activity_logs` hiển thị ở tab Activity của từng note/task hoặc trang Settings Activity.

---

## 5. Kế Hoạch Kiểm Thử & Xác Minh (Verification Plan)

### Kiểm thử tự động (Automated Tests)
*   **Database Unit Tests:** Kiểm tra việc tạo bảng, truy vấn FTS5, thêm sửa xóa dữ liệu và cơ chế hàng đợi sync trong SQLite.
    *   *Command:* `npm run test:db` hoặc chạy test Rust backend bằng `cargo test`.
*   **Markdown & Variable Parsing Tests:** Đảm bảo hàm phân tích regex hoạt động đúng với biến `{{variable}}` và phát hiện chính xác các lệnh nguy hiểm.
    *   *Command:* `npm run test:parser`.

### Kiểm thử thủ công (Manual Verification)
1.  **Kiểm tra độ mượt:** Chạy ứng dụng trên máy, thực hiện kéo thả 100 thẻ Task trên Kanban Board, chuyển nhanh giữa 10 note dung lượng lớn để kiểm tra xem có bị giật lag hay giảm khung hình (FPS drop) hay không.
2.  **Kiểm tra Offline-first:**
    *   Ngắt kết nối mạng.
    *   Tạo 1 note mới, chỉnh sửa và tạo 1 task.
    *   Kiểm tra database local xem đã ghi nhận dữ liệu và đánh dấu `is_pending_sync = 1`.
    *   Bật lại mạng, kiểm tra xem Sync worker có tự chạy và đẩy dữ liệu lên đồng bộ thành công không.
3.  **Kiểm tra Confirm Screen:** Thực hiện đổi trạng thái Jira task, bấm từ chối xem Jira có thay đổi không, sau đó bấm đồng ý xem Jira có cập nhật chính xác không.
