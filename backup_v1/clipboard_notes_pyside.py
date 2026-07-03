import sys
import json
import os
import hashlib
import shutil
import ctypes  # Để set icon trên Windows taskbar
import subprocess


from datetime import datetime
from threading import Lock
from io import BytesIO
from pathlib import Path

# Import các thành phần giao diện từ PySide6 (Qt framework)
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QTextEdit, QScrollArea, QFrame, QMessageBox,
    QDialog, QSystemTrayIcon, QMenu, QStackedWidget, QSizePolicy
)
# Import các thành phần xử lý lõi (Core)
from PySide6.QtCore import Qt, QTimer, QPoint, QSize, QThread, Signal, QByteArray, QBuffer
# Import các thành phần đồ họa (GUI)
from PySide6.QtGui import (
    QPixmap, QImage, QClipboard, QIcon, QPainter, QColor, QBrush, QPen,
    QCursor, QFont, QFontDatabase
)
from PySide6.QtSvg import QSvgRenderer  # Cần thiết để render SVG
from icons import ICONS_DATA  # Import dữ liệu icon

# Import file giao diện tùy chỉnh (styles.py)
from styles import AppTheme, ThemeColors

def create_icon(name, color="#000000"):
    """
    Tạo icon từ SVG Data (Vector) để có chất lượng cao nhất mà không cần thư viện ngoài.
    """
    svg_data = ICONS_DATA.get(name)
    
    if not svg_data:
        # Fallback nếu không tìm thấy icon
        return QIcon()
        
    # Inject màu vào SVG
    # Lưu ý: color có thể là hex (#ffffff) hoặc tên.
    svg_content = svg_data.format(color=color)
    
    # Render SVG ra QPixmap
    renderer = QSvgRenderer(QByteArray(svg_content.encode('utf-8')))
    pixmap = QPixmap(64, 64) # Kích thước gốc đủ lớn
    pixmap.fill(Qt.transparent)
    
    painter = QPainter(pixmap)
    renderer.render(painter)
    painter.end()
    
    return QIcon(pixmap)

# =================================================================================
# DỮ LIỆU ĐA NGÔN NGỮ (TRANSLATIONS)
# =================================================================================
TRANSLATIONS = {
    "en": {
        "app_title": "Clipboard & Notes Manager",
        "app_subtitle": "SMART MANAGER",
        "notes_tab": "Notes",
        "clipboard_tab": "Clipboard", 
        "settings": "Settings",
        "always_on_top": "Always on top",
        "theme": "Theme",
        "language": "Language",
        "dark": "🌙 Dark",
        "light": "☀️ Light",
        "english": "🇬🇧 English",
        "vietnamese": "🇻🇳 Tiếng Việt",
        "close": "Close",
        "version": "Version",
        "add_note": "Add Note",
        "placeholder_note": "Type your note here...",
        "edit": "Edit",
        "delete": "Delete",
        "copy": "Copy",
        "copied": "✅ Copied",
        "group": "Group",
        "create_group": "Create New Group",
        "group_name": "Group name",
        "enter_group_name": "Enter group name...",
        "choose_color": "Choose color",
        "create": "Create",
        "cancel": "Cancel",
        "rename_group": "Rename Group",
        "delete_group": "Delete Group",
        "confirm": "Confirm",
        "delete_group_confirm": "Delete group '{}'?\nNotes in this group will not be deleted.",
        "error": "Error",
        "group_exists": "Group name already exists!",
        "enter_name": "Please enter a name!",
        "rename": "Rename",
        "notes_count": "{}",
        "new_name_for_group": "New name for group '{}':",
        "show_app": "Show App",
        "quit": "Quit",
        "app_running_background": "App is running in background. Double-click icon to show.",
        "no_notes": "No notes yet",
        "add_first_note": "Add your first note!",
        "no_clipboard": "No history",
        "copy_something": "Copy something to get started!",
        "edit_group": "Edit group",
        "edit_note": "Edit note",
        "save": "Save",
        "clear_all": "Clear All",
        "clipboard_history": "Clipboard History",
        "upload": "Upload",
        "reset": "Reset",
        "icon": "Icon",
        "size": "Size",
        "clear_history_confirm": "Clear all history?",
        "yes": "Yes",
        "no": "No",
        "bubble_character": "Bubble Character",
        "preset_default": "Default (Panda)",
        "preset_cat": "Cute Cat",
        "preset_shiba": "Cute Shiba Dog",
        "preset_ghost": "Little Ghost",
        "preset_penguin": "Playful Penguin",
        "preset_custom": "Custom (Selected)",
        "custom_upload": "Custom Upload",
        "favorites": "Favorites",
        "trash": "Trash",
        "pin_note": "Pin Note",
        "unpin_note": "Unpin Note",
        "favorite_note": "Add to Favorites",
        "unfavorite_note": "Remove from Favorites",
        "restore": "Restore",
        "delete_permanently": "Delete Permanently",
        "confirm_delete_permanently": "Are you sure you want to permanently delete this note? This action cannot be undone.",
        "empty_trash": "Empty Trash",
        "confirm_empty_trash": "Are you sure you want to permanently delete all notes in Trash?",
        "cannot_add_to_virtual_group": "Cannot add notes directly to Favorites or Trash! Please select a standard group.",
    },
    "vi": {
        "app_title": "Quản lý Ghi chú & Bộ nhớ tạm",
        "app_subtitle": "QUẢN LÝ THÔNG MINH",
        "notes_tab": "Ghi chú",
        "clipboard_tab": "Bộ nhớ tạm",
        "settings": "Cài đặt",
        "always_on_top": "Luôn hiển thị trên cùng",
        "theme": "Giao diện",
        "language": "Ngôn ngữ",
        "dark": "🌙 Tối",
        "light": "☀️ Sáng",
        "english": "🇬🇧 English",
        "vietnamese": "🇻🇳 Tiếng Việt",
        "close": "Đóng",
        "version": "Phiên bản",
        "add_note": "Thêm ghi chú",
        "placeholder_note": "Nhập ghi chú của bạn...",
        "edit": "Sửa",
        "delete": "Xóa",
        "copy": "Sao chép",
        "copied": "✅ Đã sao chép",
        "group": "Nhóm",
        "create_group": "Tạo nhóm mới",
        "group_name": "Tên nhóm",
        "enter_group_name": "Nhập tên nhóm...",
        "choose_color": "Chọn màu",
        "create": "Tạo",
        "cancel": "Hủy",
        "rename_group": "Đổi tên nhóm",
        "delete_group": "Xóa nhóm",
        "confirm": "Xác nhận",
        "delete_group_confirm": "Xóa nhóm '{}'?\nGhi chú trong nhóm sẽ không bị xóa.",
        "error": "Lỗi",
        "group_exists": "Tên nhóm đã tồn tại!",
        "enter_name": "Vui lòng nhập tên!",
        "rename": "Đổi tên",
        "notes_count": "{}",
        "new_name_for_group": "Tên mới cho nhóm '{}':",
        "show_app": "Hiện ứng dụng",
        "quit": "Thoát",
        "app_running_background": "Ứng dụng đang chạy nền. Click đúp vào icon để hiện lại.",
        "no_notes": "Chưa có ghi chú nào",
        "add_first_note": "Thêm ghi chú đầu tiên của bạn!",
        "no_clipboard": "Chưa có lịch sử",
        "copy_something": "Sao chép gì đó để bắt đầu!",
        "edit_group": "Sửa nhóm",
        "edit_note": "Sửa ghi chú",
        "save": "Lưu",
        "clear_all": "Xóa tất cả",
        "clipboard_history": "Lịch sử bộ nhớ tạm",
        "upload": "Tải lên",
        "reset": "Đặt lại",
        "icon": "Biểu tượng",
        "size": "Kích thước",
        "clear_history_confirm": "Xóa toàn bộ lịch sử?",
        "yes": "Có",
        "no": "Không",
        "bubble_character": "Nhân vật bong bóng",
        "preset_default": "Mặc định (Gấu trúc)",
        "preset_cat": "Mèo con dễ thương",
        "preset_shiba": "Chó Shiba đáng yêu",
        "preset_ghost": "Ma nhỏ vui nhộn",
        "preset_penguin": "Chim cánh cụt tinh nghịch",
        "preset_custom": "Tự chọn (Đã tải)",
        "custom_upload": "Tải ảnh lên",
        "favorites": "Mục yêu thích",
        "trash": "Thùng rác",
        "pin_note": "Ghim ghi chú",
        "unpin_note": "Bỏ ghim ghi chú",
        "favorite_note": "Thêm vào yêu thích",
        "unfavorite_note": "Bỏ yêu thích",
        "restore": "Khôi phục",
        "delete_permanently": "Xóa vĩnh viễn",
        "confirm_delete_permanently": "Bạn có chắc chắn muốn xóa vĩnh viễn ghi chú này? Hành động này không thể hoàn tác.",
        "empty_trash": "Dọn sạch thùng rác",
        "confirm_empty_trash": "Bạn có chắc chắn muốn xóa vĩnh viễn tất cả ghi chú trong Thùng rác?",
        "cannot_add_to_virtual_group": "Không thể thêm ghi chú trực tiếp vào mục Yêu thích hoặc Thùng rác! Vui lòng chọn một nhóm cụ thể.",
    }
}


class ClipboardMonitor(QThread):
    """
    Luồng (Thread) riêng biệt để theo dõi Clipboard mà không làm treo giao diện chính.
    Tuy nhiên, hiện tại logic chính đang dùng ClipboardWatcher (Timer-based) an toàn hơn cho GUI.
    """
    text_copied = Signal(str)            # Tín hiệu phát ra khi có text mới
    image_copied = Signal(QImage, str)   # Tín hiệu phát ra khi có ảnh mới
    
    def __init__(self, app_ref):
        super().__init__()
        self.app_ref = app_ref
        self.last_text = ""
        self.last_image_hash = ""
    
    def get_image_hash(self, image):
        """Tạo mã hash duy nhất cho ảnh để tránh lưu trùng lặp."""
        buffer = QByteArray()
        buf = QBuffer(buffer)
        buf.open(QBuffer.WriteOnly)
        image.save(buf, "PNG")
        return hashlib.md5(buffer.data()).hexdigest()


class ClipboardWatcher:
    """
    Bộ theo dõi Clipboard sử dụng QTimer.
    Lý do: Clipboard của hệ thống nên được truy cập từ Luồng Chính (Main Thread) để tránh lỗi.
    """
    def __init__(self, main_window):
        self.main_window = main_window
        self.last_text = ""
        self.last_image_hash = ""
        self.screenshots_folder = Path.home() / "Pictures" / "Screenshots"
        self.last_screenshot_time = None
        
        # Tạo Timer kiểm tra mỗi 0.5 giây (500ms)
        self.timer = QTimer()
        self.timer.timeout.connect(self.check_clipboard)
        self.timer.start(500)
    
    def get_image_hash(self, image):
        """Tính mã băm (MD5) của ảnh để so sánh trùng lặp"""
        buffer = QByteArray()
        buf = QBuffer(buffer)
        buf.open(QBuffer.WriteOnly)
        image.save(buf, "PNG")
        return hashlib.md5(buffer.data()).hexdigest()
    
    def check_clipboard(self):
        """Hàm được gọi định kỳ để kiểm tra nội dung Clipboard"""
        try:
            clipboard = QApplication.clipboard()
            mime = clipboard.mimeData()
            
            # 1. Kiểm tra xem có ẢNH trong clipboard không
            if mime.hasImage():
                image = clipboard.image()
                if not image.isNull():
                    h = self.get_image_hash(image)
                    # Nếu ảnh khác với ảnh lần trước (không trùng lặp)
                    if h != self.last_image_hash:
                        self.last_image_hash = h
                        # Kiểm tra xem ảnh này có phải là Screenshot vừa chụp không
                        screenshot_file = self.get_latest_screenshot()
                        if screenshot_file:
                            # Nếu là screenshot, xử lý riêng (copy file gốc để giữ chất lượng)
                            self.main_window.on_screenshot_copied(screenshot_file, h)
                        else:
                            # Nếu là ảnh copy bình thường
                            self.main_window.on_image_copied(image, h)
            
            # 2. Kiểm tra xem có TEXT trong clipboard không
            elif mime.hasText():
                text = clipboard.text()
                # Nếu có text và khác với text lần trước
                if text and text != self.last_text:
                    self.last_text = text
                    self.main_window.on_text_copied(text)
        except Exception as e:
            print(f"Lỗi khi kiểm tra clipboard: {e}")
    
    def get_latest_screenshot(self):
        """
        Tìm screenshot mới nhất trong thư mục Screenshots của Windows.
        Mục đích: Khi người dùng chụp màn hình (Win+Shift+S), ta muốn lưu file gốc đẹp hơn.
        """
        try:
            if not self.screenshots_folder.exists():
                return None
            
            # Lấy tất cả file ảnh trong thư mục Screenshots
            image_files = []
            for ext in ['*.png', '*.jpg', '*.jpeg']:
                image_files.extend(self.screenshots_folder.glob(ext))
            
            if not image_files:
                return None
            
            # Sắp xếp theo thời gian modified (mới nhất trước)
            image_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
            latest_file = image_files[0]
            
            # Kiểm tra xem file này có mới không (trong vòng 2 giây trở lại đây)
            file_time = latest_file.stat().st_mtime
            current_time = datetime.now().timestamp()
            
            if current_time - file_time < 2:  # File được tạo trong 2 giây gần đây
                if self.last_screenshot_time != file_time:
                    self.last_screenshot_time = file_time
                    return latest_file
            
            return None
        except Exception as e:
            print(f"Lỗi khi tìm screenshot: {e}")
            return None
    
    def stop(self):
        """Dừng theo dõi"""
        self.timer.stop()



class FloatingBubble(QWidget):
    """
    Widget bong bóng nổi (Floating Bubble) hiển thị trên màn hình.
    Cho phép truy cập nhanh ứng dụng hoặc kéo thả.
    """
    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window
        self.drag_pos = None
        
        # Cấu hình cửa sổ: Không viền, Luôn trên cùng, Dạng công cụ (Tool)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        # Nền trong suốt để vẽ hình tròn đẹp
        self.setAttribute(Qt.WA_TranslucentBackground)
        
        # Lấy kích thước bong bóng từ cài đặt (mặc định 60px)
        size = getattr(self.main_window, 'bubble_size', 60)
        self.setFixedSize(size, size)
        

        
        # Cấu hình Animation Frames (Ưu tiên cao nhất)
        if getattr(sys, 'frozen', False):
            # Khi chay tu .exe, uu tien thu muc canh exe, sau do fallback ve data nhung boi PyInstaller.
            base_path = os.path.dirname(sys.executable)
            bundled_base = getattr(sys, '_MEIPASS', base_path)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
            bundled_base = base_path

        self.frames_folder = os.path.join(base_path, "bubble_frames")
        self.bundled_frames_folder = os.path.join(bundled_base, "bubble_frames")
        self.frames = []
        self.current_frame_index = 0
        self.anim_timer = QTimer(self)
        self.anim_timer.timeout.connect(self.next_frame)
        self.anim_direction = 0 # 0: Stop, 1: Forward, -1: Backward
        
        # Load frames nếu có
        self.load_frames()
        

        
        # Vị trí mặc định: Bên phải màn hình, giữa chiều cao
        screen = QApplication.primaryScreen().geometry()
        self.move(screen.width() - size - 20, screen.height() // 2)

    def load_frames(self):
        """Tai frame mac dinh hoac custom folder cho bubble animation."""

        custom_path = getattr(self.main_window, 'custom_bubble_icon', None)

        # Convert relative path to absolute if necessary
        if custom_path and not os.path.isabs(custom_path):
            import sys
            if getattr(sys, 'frozen', False):
                base_path = os.path.dirname(sys.executable)
            else:
                base_path = os.path.dirname(os.path.abspath(__file__))
            custom_path = os.path.join(base_path, custom_path)

        if custom_path and os.path.isfile(custom_path):
            self.frames = []
            self.anim_timer.stop()
            return

        candidate_dirs = []
        if custom_path and os.path.isdir(custom_path):
            candidate_dirs.append(custom_path)
        else:
            candidate_dirs.extend([self.frames_folder, self.bundled_frames_folder])

        frames = []
        for source_dir in candidate_dirs:
            if not source_dir or not os.path.isdir(source_dir):
                continue

            try:
                image_files = [
                    f for f in os.listdir(source_dir)
                    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))
                ]
                image_files.sort()

                for f in image_files:
                    pix = QPixmap(os.path.join(source_dir, f))
                    if not pix.isNull():
                        frames.append(pix)
            except Exception as e:
                print(f"Error loading frames: {e}")

            if frames:
                break

        self.frames = frames
        self.current_frame_index = 0
        if not self.frames:
            self.anim_timer.stop()

    def next_frame(self):
        """Chuyển sang frame tiếp theo hoặc quay lại"""
        if not self.frames:
            self.anim_timer.stop()
            return

        self.current_frame_index += self.anim_direction
        
        # Kiểm tra biên
        if self.current_frame_index >= len(self.frames):
            self.current_frame_index = len(self.frames) - 1
            self.anim_timer.stop() # Dừng khi hết phim
        elif self.current_frame_index < 0:
            self.current_frame_index = 0
            self.anim_timer.stop() # Dừng khi về đầu
            
        self.update()

    def enterEvent(self, event):
        """Khi chuột vào"""
        self.is_hovered = True
        
        if self.frames:
            self.anim_direction = 1 # Chạy xuôi (A -> Z)
            self.anim_timer.start(50) # Tốc độ 20fps
        else:
            self.update()
            
        super().enterEvent(event)

    def leaveEvent(self, event):
        """Khi chuột ra"""
        self.is_hovered = False
        
        if self.frames:
            self.anim_direction = -1 # Chạy ngược (Z -> A)
            self.anim_timer.start(50)
        else:
            self.update()
            
        super().leaveEvent(event)
    
    def update_appearance(self):
        """Cập nhật giao diện (kích thước, icon) khi cài đặt thay đổi"""
        size = getattr(self.main_window, 'bubble_size', 60)
        self.setFixedSize(size, size)
        
        # Load lại frames nếu đường dẫn thay đổi (File <-> Folder <-> Default)
        self.load_frames()
        
        self.update() # Yêu cầu vẽ lại
        
    def paintEvent(self, event):
        """Hàm vẽ bong bóng tùy chỉnh"""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing) # Khử răng cưa cho nét vẽ mượt
        
        size = self.width()
        
        # Ưu tiên 1: Vẽ Animation Frames nếu có
        if self.frames:
            pixmap = self.frames[self.current_frame_index]
            target_size = size
            scaled = pixmap.scaled(target_size, target_size, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            x = (size - scaled.width()) // 2
            y = (size - scaled.height()) // 2
            painter.drawPixmap(x, y, scaled)
            return # Xong, không vẽ gì thêm
        
        # Ưu tiên 2: Custom Icon thường
        icon_path = None
        if hasattr(self.main_window, 'custom_bubble_icon') and self.main_window.custom_bubble_icon:
            icon_path = self.main_window.custom_bubble_icon



        has_custom = False
        if icon_path:
            try:
                pixmap = QPixmap(icon_path)
                if not pixmap.isNull():
                    has_custom = True
                    # Scale ảnh cho vừa kích thước bong bóng
                    target_size = size
                    scaled = pixmap.scaled(target_size, target_size, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                    
                    # Căn giữa ảnh
                    x = (size - scaled.width()) // 2
                    y = (size - scaled.height()) // 2
                    
                    # Vẽ ảnh lên widget
                    painter.drawPixmap(x, y, scaled)
            except:
                pass 
        
        if not has_custom:
            # Vẽ icon mặc định (Màu tím)
            
            # 1. Vẽ quầng sáng bên ngoài (Glow effect)
            painter.setBrush(QBrush(QColor(139, 92, 246, 40))) # Tím nhạt, trong suốt
            painter.setPen(Qt.NoPen)
            painter.drawEllipse(0, 0, size, size)
            
            # 2. Vẽ hình tròn chính bên trong
            inner_padding = 5
            painter.setBrush(QBrush(QColor("#8b5cf6"))) # Tím đậm
            painter.setPen(QPen(QColor("#a78bfa"), 3)) # Viền tím nhạt hơn
            painter.drawEllipse(inner_padding, inner_padding, size - inner_padding*2, size - inner_padding*2)
            
            # 3. Vẽ icon Clipboard ở giữa
            icon_size = int(size * 0.46) # Kích thước icon khoảng 46% kích thước bong bóng
            icon_x = (size - icon_size) // 2
            icon_y = (size - icon_size) // 2
            
            try:
                # Sử dụng qtawesome để lấy icon vector đẹp
                # icon = qta.icon('fa5s.clipboard-list', color='#f0f0ff')
                icon = create_icon('fa5s.clipboard-list', color='#f0f0ff')
                icon.paint(painter, icon_x, icon_y, icon_size, icon_size)
            except:
                pass 
                
    def update_icon(self, icon_path=None):
        """Cập nhật icon (hàm cũ, trỏ về update_appearance)"""
        self.update_appearance()
    
    def mousePressEvent(self, event):
        """Xử lý khi nhấn chuột (bắt đầu kéo hoặc hiện menu)"""
        if event.button() == Qt.LeftButton:
            # Lưu vị trí nhấn để tính toán kéo thả
            self.drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
        elif event.button() == Qt.RightButton:
            # Chuột phải: Hiện menu ngữ cảnh
            self.show_context_menu(event.globalPosition().toPoint())
    
    def mouseMoveEvent(self, event):
        """Xử lý khi di chuột (kéo bong bóng)"""
        if self.drag_pos and event.buttons() == Qt.LeftButton:
            self.move(event.globalPosition().toPoint() - self.drag_pos)
    
    def mouseReleaseEvent(self, event):
        """Xử lý khi thả chuột (kết thúc kéo hoặc click)"""
        if event.button() == Qt.LeftButton and self.drag_pos:
            # Tính khoảng cách di chuyển để phân biệt Click vs Drag
            moved = (event.globalPosition().toPoint() - self.frameGeometry().topLeft() - self.drag_pos).manhattanLength()
            if moved < 5:  # Nếu di chuyển ít hơn 5px -> Coi là Click
                self.toggle_main_window()
        self.drag_pos = None
    
    def toggle_main_window(self):
        """Ẩn/Hiện cửa sổ chính"""
        if getattr(self.main_window, 'always_on_top', False) or self.main_window.isActiveWindow():
            if not self.main_window.isMinimized():
                self.main_window._was_maximized = self.main_window.isMaximized()
                self.main_window.showMinimized()
            else:
                if hasattr(self.main_window, '_was_maximized') and self.main_window._was_maximized:
                    self.main_window.showMaximized()
                else:
                    self.main_window.showNormal()
                self.main_window.activateWindow()
                self.main_window.raise_()
        else:
            if hasattr(self.main_window, '_was_maximized') and self.main_window._was_maximized:
                self.main_window.showMaximized()
            else:
                self.main_window.showNormal()
            self.main_window.activateWindow() # Cấp focus
            self.main_window.raise_()         # Đưa lên trên cùng
    def show_context_menu(self, pos):
        """Hiện menu khi click chuột phải vào bong bóng"""
        menu = QMenu(self)
        
        # Lấy theme hiện tại để chỉnh màu
        is_light = True
        if hasattr(self.main_window, 'current_theme_mode'):
            is_light = self.main_window.current_theme_mode == "light"
            
        bg_color = "#ffffff" if is_light else "#1e1e2e"
        text_color = "#333333" if is_light else "#f0f0f0"
        border_color = "#e5e7eb" if is_light else "#454555"
        hover_color = "#f3f4f6" if is_light else "#313244"
        
        # Style cho menu nhỏ gọn, hiện đại
        menu.setStyleSheet(f"""
            QMenu {{
                background-color: {bg_color};
                border: 1px solid {border_color};
                border-radius: 12px;
                padding: 6px;
                color: {text_color};
                font-family: 'Segoe UI', sans-serif;
                font-size: 13px;
            }}
            QMenu::item {{
                padding: 8px 24px 8px 36px; /* Để chỗ cho icon */
                border-radius: 6px;
                margin: 2px 0;
            }}
            QMenu::item:selected {{
                background-color: {hover_color};
            }}
            QMenu::icon {{
                padding-left: 12px;
            }}
        """)
        
        # Action 1: Mở App
        open_action = menu.addAction(self.main_window.t("show_app"))
        try:
             open_action.setIcon(create_icon('fa5s.external-link-alt', color=text_color))
        except:
             pass
        open_action.triggered.connect(self.open_main_window)
        
        # Separator (nếu muốn)
        # menu.addSeparator()
        
        # Action 2: Thoát
        quit_action = menu.addAction(self.main_window.t("quit"))
        try:
             quit_action.setIcon(create_icon('fa5s.power-off', color='#ef4444'))
        except:
             pass
        quit_action.triggered.connect(QApplication.quit)
        
        menu.exec(pos)
        
    def open_main_window(self):
        """Mở cửa sổ chính từ menu"""
        if hasattr(self.main_window, '_was_maximized') and self.main_window._was_maximized:
            self.main_window.showMaximized()
        else:
            self.main_window.showNormal()
        self.main_window.activateWindow()


class NoteCard(QFrame):
    """
    Thẻ widget để hiển thị một ghi chú hoặc một mục clipboard - Speed First Redesign.
    """
    def __init__(self, parent, app, data, index, is_note=False, group_name=None):
        super().__init__(parent)
        self.app = app
        self.data = data
        self.index = index
        self.is_note = is_note
        self.group_name = group_name
        self.is_selected = False
        
        self.setStyleSheet(self.app.styles.get("CARD_LIST", ""))
        self.setCursor(QCursor(Qt.PointingHandCursor))
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)
        
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(12, 10, 12, 10)
        main_layout.setSpacing(10)
        
        left_layout = QVBoxLayout()
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(4)
        
        # Nội dung
        text = self.data["content"]
        is_image = self.data.get("type") == "image"
        
        self.content_label = QLabel()
        if is_image:
            self.load_image(text)
        else:
            text = text.replace('\n', ' ')
            text = text[:100] + "..." if len(text) > 100 else text
            self.content_label.setText(text)
            self.content_label.setStyleSheet(self.app.styles.get("CARD_TITLE", ""))
            
        left_layout.addWidget(self.content_label)
        
        # Meta info
        meta_text = ""
        if self.is_note:
            meta_text = f"Note • {self.group_name}"
        elif "timestamp" in data:
            meta_text = f"Clipboard • {data['timestamp']}"
            
        meta_layout = QHBoxLayout()
        meta_layout.setContentsMargins(0, 0, 0, 0)
        meta_layout.setSpacing(6)
        
        self.meta_label = QLabel(meta_text)
        self.meta_label.setStyleSheet(self.app.styles.get("CARD_SUBTITLE", ""))
        meta_layout.addWidget(self.meta_label)
        
        # Thêm indicators cho notes (Ghim & Yêu thích)
        if self.is_note:
            meta_layout.addSpacing(6)
            
            # Indicator Pin
            self.pin_indicator = QLabel()
            self.pin_indicator.setPixmap(create_icon('fa5s.thumbtack', color='#f59e0b').pixmap(QSize(12, 12)))
            self.pin_indicator.setToolTip(self.app.t("pin_note"))
            meta_layout.addWidget(self.pin_indicator)
            
            # Indicator Favorite
            self.fav_indicator = QLabel()
            self.fav_indicator.setPixmap(create_icon('fa5s.star-filled', color='#eab308').pixmap(QSize(12, 12)))
            self.fav_indicator.setToolTip(self.app.t("favorites"))
            meta_layout.addWidget(self.fav_indicator)
            
            # Ẩn/Hiện dựa trên data
            is_pinned = self.data.get("is_pinned", False)
            is_fav = self.data.get("is_favorite", False)
            self.pin_indicator.setVisible(is_pinned)
            self.fav_indicator.setVisible(is_fav)
            
        meta_layout.addStretch()
        left_layout.addLayout(meta_layout)
        
        main_layout.addLayout(left_layout, 1)
        
        # Nút copy nhanh hoặc menu
        self.menu_btn = QPushButton()
        self.menu_btn.setIcon(create_icon('fa5s.ellipsis-v', color='#6b7280'))
        self.menu_btn.setFixedSize(24, 24)
        self.menu_btn.setCursor(QCursor(Qt.PointingHandCursor))
        self.menu_btn.setStyleSheet(self.app.styles.get("CARD_ACTION_BTN", ""))
        self.menu_btn.clicked.connect(self.show_options_menu)
        main_layout.addWidget(self.menu_btn, 0, Qt.AlignVCenter)
        
    def set_selected(self, selected):
        self.is_selected = selected
        self.setProperty("selected", "true" if selected else "false")
        self.style().unpolish(self)
        self.style().polish(self)
        
    def load_image(self, filename):
        """Tải và hiển thị thumbnail cho ảnh"""
        path = os.path.join(self.app.images_folder, filename)
        if os.path.exists(path):
            pixmap = QPixmap(path)
            if not pixmap.isNull():
                # Scale ảnh nhỏ lại để vừa thẻ
                pixmap = pixmap.scaled(150, 80, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                self.content_label.setPixmap(pixmap)
                self.content_label.setStyleSheet("border: 1px solid #4b5563; border-radius: 4px; background: #1f2937;")
                return
                
        # Fallback if file doesn't exist or is invalid
        self.content_label.setText(f"🖼️ [Image] {filename}")
        self.content_label.setStyleSheet(self.app.styles.get("CARD_TITLE", ""))
            
    def show_options_menu(self):
        """Hiển thị menu ngữ cảnh (Sửa/Xóa/Ghim/Yêu thích/Khôi phục)"""
        menu = QMenu(self)
        
        # Cấu hình màu sắc menu theo theme
        is_light = self.app.current_theme_mode == "light"
        bg = "#ffffff" if is_light else "#1e293b"
        border = "#e2e8f0" if is_light else "#334155"
        sel_bg = "#f3f4f6" if is_light else "#334155"
        
        # Style menu đẹp, hiện đại (Premium look)
        menu.setStyleSheet(f"""
            QMenu {{
                background-color: {bg};
                border: 1px solid {border};
                border-radius: 12px;
                padding: 6px;
            }}
            QMenu::item {{
                padding: 8px 12px 8px 36px;
                border-radius: 8px;
                font-weight: 500;
                margin-bottom: 2px;
                color: {"#1f2937" if is_light else "#f1f5f9"};
            }}
            QMenu::item:selected {{
                background-color: {sel_bg};
            }}
            QMenu::icon {{
                padding-left: 12px;
            }}
        """)
        
        is_trashed = self.data.get("is_trashed", False)
        
        if self.is_note and is_trashed:
            # Menu cho note trong Thùng rác
            restore_color = "#10b981" if is_light else "#34d399"
            delete_perm_color = "#ef4444" if is_light else "#f87171"
            
            restore_action = menu.addAction(create_icon('fa5s.undo', color=restore_color), self.app.t("restore"))
            restore_action.triggered.connect(self.restore_item)
            
            delete_perm_action = menu.addAction(create_icon('fa5s.trash', color=delete_perm_color), self.app.t("delete_permanently"))
            delete_perm_action.triggered.connect(self.delete_permanently_item)
        else:
            # Menu bình thường
            if self.is_note:
                # 1. Ghim / Bỏ ghim
                is_pinned = self.data.get("is_pinned", False)
                pin_color = "#f59e0b" if is_light else "#fbbf24"
                pin_text = self.app.t("unpin_note") if is_pinned else self.app.t("pin_note")
                pin_action = menu.addAction(create_icon('fa5s.thumbtack', color=pin_color), pin_text)
                pin_action.triggered.connect(self.toggle_pin)
                
                # 2. Yêu thích / Bỏ yêu thích
                is_fav = self.data.get("is_favorite", False)
                fav_color = "#eab308" if is_light else "#facc15"
                fav_text = self.app.t("unfavorite_note") if is_fav else self.app.t("favorite_note")
                fav_icon_name = 'fa5s.star-filled' if is_fav else 'fa5s.star'
                fav_action = menu.addAction(create_icon(fav_icon_name, color=fav_color), fav_text)
                fav_action.triggered.connect(self.toggle_favorite)
                
                menu.addSeparator()
                
                # 3. Sửa ghi chú - Icon Tím
                edit_color = "#8b5cf6" if is_light else "#a78bfa"
                edit_action = menu.addAction(create_icon('fa5s.pen', color=edit_color), self.app.t("edit"))
                edit_action.triggered.connect(self.edit_item)
                
            # 4. Xóa (Di chuyển vào thùng rác đối với note) - Icon Đỏ
            delete_color = "#ef4444" if is_light else "#f87171"
            delete_text = self.app.t("delete")
            delete_action = menu.addAction(create_icon('fa5s.trash', color=delete_color), delete_text)
            delete_action.triggered.connect(self.delete_item)
            
        # Hiển thị menu ở ngay dưới nút 3 chấm
        menu.exec(self.menu_btn.mapToGlobal(QPoint(0, self.menu_btn.height() + 5)))

    def mousePressEvent(self, event):
        """Xử lý click vào thẻ để Copy nội dung"""
        if event.button() == Qt.LeftButton:
            # Nếu click vào nút menu thì không copy (để nút menu xử lý)
            if self.childAt(event.position().toPoint()) == self.menu_btn:
                super().mousePressEvent(event)
                return
                
            # Logic Copy
            self.copy_item()
        super().mousePressEvent(event)
    
    def copy_item(self):
        """Copy nội dung vào Clipboard"""
        clipboard = QApplication.clipboard()
        if self.is_note:
            clipboard.setText(self.data["content"])
            self.app.clipboard_watcher.last_text = self.data["content"] # Cập nhật để tránh loop
        elif self.data["type"] == "text":
            clipboard.setText(self.data["content"])
            self.app.clipboard_watcher.last_text = self.data["content"]
        else:
            # Copy ảnh
            path = os.path.join(self.app.images_folder, self.data["content"])
            if os.path.exists(path):
                image = QImage(path)
                clipboard.setImage(image)
                # Cập nhật hash ảnh
                self.app.clipboard_watcher.last_image_hash = self.app.clipboard_watcher.get_image_hash(image)
        
        # Hiện thông báo Toast
        self.app.show_toast("✅ Đã sao chép!")

    def edit_item(self):
        """Gọi hàm sửa ghi chú của App"""
        self.app.edit_note(self.index, self.data)
        
    def delete_item(self):
        """Gọi hàm xóa của App"""
        if self.is_note:
            self.app.delete_note(self.index)
        else:
            self.app.delete_clipboard_item(self.index)

    def toggle_pin(self):
        if self.is_note:
            self.app.toggle_pin_note(self.index)
            
    def toggle_favorite(self):
        if self.is_note:
            self.app.toggle_favorite_note(self.index)
            
    def restore_item(self):
        if self.is_note:
            self.app.restore_note(self.index)
            
    def delete_permanently_item(self):
        if self.is_note:
            self.app.permanent_delete_note(self.index)


class SwipeableGroupCard(QWidget):
    """
    Thẻ nhóm (Group Card) có thể vuốt sang trái (Swipe) để hiện menu Sửa/Xóa.
    Mô phỏng hiệu ứng swipe giống ứng dụng di động.
    """
    def __init__(self, parent, main_window, group_name, note_count, color):
        super().__init__(parent)
        self.main_window = main_window
        self.group_name = group_name
        self.note_count = note_count
        self.color = color
        
        # Biến quản lý trạng thái kéo thả (Drag)
        self.drag_start_pos = None  # Điểm bắt đầu kéo
        self.offset_x = 0           # Khoảng cách đã kéo
        self.is_swiped = False      # Trạng thái đang mở menu hay không
        
        # Cấu hình widget
        self.setFixedHeight(60)
        self.setCursor(QCursor(Qt.PointingHandCursor))
        self.setStyleSheet("background: transparent;")
        
        # 1. Widget chứa các nút hành động (Edit/Delete)
        # Nằm bên PHẢI, nhưng nằm DƯỚI nội dung chính.
        self.actions_widget = QWidget(self)
        self.actions_widget.setFixedSize(150, 60)
        self.setup_actions()
        
        # 2. Thẻ nội dung chính (Group Name, Count)
        # Nằm ĐÈ LÊN widget hành động. Ban đầu che kín widget hành động.
        self.content_card = QFrame(self)
        self.content_card.setFixedHeight(60)
        self.setup_content_card()
        self.content_card.move(0, 0)
        
        # Đưa content_card lên trên cùng
        self.content_card.raise_()
    
    def resizeEvent(self, event):
        """Cập nhật vị trí khi kích thước widget thay đổi"""
        super().resizeEvent(event)
        # Content card luôn rộng bằng widget cha
        self.content_card.setFixedWidth(self.width())
        # Actions widget luôn nằm sát mép phải
        self.actions_widget.move(self.width() - 150, 0)
    
    def setup_content_card(self):
        """Thiết lập giao diện cho thẻ nội dung (phần hiển thị tên nhóm)"""
        # Parse mã màu hex
        r, g, b = int(self.color[1:3], 16), int(self.color[3:5], 16), int(self.color[5:7], 16)
        is_light = self.main_window.current_theme_mode == "light"
        
        # Tính toán màu nền blend (pha trộn) để văn bản dễ đọc hơn
        if is_light:
            base_r, base_g, base_b = 241, 245, 249  # Màu nền sáng
            alpha = 0.05
            alpha_hover = 0.1
        else:
            base_r, base_g, base_b = 15, 23, 42  # Màu nền tối
            alpha = 0.15
            alpha_hover = 0.25
        
        # Công thức blend màu: result = base * (1 - alpha) + color * alpha
        blend_r = int(base_r * (1 - alpha) + r * alpha)
        blend_g = int(base_g * (1 - alpha) + g * alpha)
        blend_b = int(base_b * (1 - alpha) + b * alpha)
        
        hover_r = int(base_r * (1 - alpha_hover) + r * alpha_hover)
        hover_g = int(base_g * (1 - alpha_hover) + g * alpha_hover)
        hover_b = int(base_b * (1 - alpha_hover) + b * alpha_hover)
        
        border_alpha = "0.4" if is_light else "0.3"
        
        # Style cho thẻ nội dung
        self.content_card.setStyleSheet(f"""
            QFrame {{
                background-color: rgb({blend_r}, {blend_g}, {blend_b});
                border-radius: 12px;
                border: 1px solid rgba({r}, {g}, {b}, {border_alpha});
            }}
            QFrame:hover {{
                background-color: rgb({hover_r}, {hover_g}, {hover_b});
                border: 1px solid rgba({r}, {g}, {b}, 0.8);
            }}
        """)
        
        card_layout = QHBoxLayout(self.content_card)
        card_layout.setContentsMargins(20, 0, 20, 0)
        card_layout.setSpacing(15)
        
        # Chấm màu nhỏ (Color Indicator)
        indicator = QLabel()
        indicator.setFixedSize(12, 12)
        indicator.setStyleSheet(f"""
            background-color: rgb({r}, {g}, {b});
            border-radius: 6px;
        """)
        card_layout.addWidget(indicator)
        
        # Tên nhóm
        text_main = "#1f2937" if is_light else "#f1f5f9"
        text_sub = "#4b5563" if is_light else "#cbd5e1"
        
        name_label = QLabel(self.group_name)
        name_label.setStyleSheet(f"font-size: 16px; font-weight: 700; color: {text_main}; background: transparent; border: none;")
        card_layout.addWidget(name_label, 1)
        
        # Badge hiển thị số lượng ghi chú
        count_container = QFrame()
        count_container.setObjectName("CountBadge")
        count_container.setFixedHeight(26)
        count_container.setStyleSheet(f"""
            #CountBadge {{
                background: rgba({r}, {g}, {b}, 0.2);
                border-radius: 13px;
                border: 1px solid rgba({r}, {g}, {b}, 0.3);
            }}
        """)
        count_layout = QHBoxLayout(count_container)
        count_layout.setContentsMargins(10, 0, 10, 0)
        
        count_label = QLabel(self.main_window.t("notes_count", self.note_count))
        count_label.setStyleSheet(f"color: {text_sub}; font-weight: 600; font-size: 11px; background: transparent; border: none;")
        count_layout.addWidget(count_label)
        card_layout.addWidget(count_container)
        
        # Icon mũi tên >
        arrow = QLabel()
        arrow_color = f"#{r:02x}{g:02x}{b:02x}"
        arrow.setPixmap(create_icon('fa5s.chevron-right', color=arrow_color).pixmap(QSize(14, 14)))
        arrow.setStyleSheet("background: transparent; border: none;")
        card_layout.addWidget(arrow)
    
    def setup_actions(self):
        """Thiết lập các nút Sửa/Xóa ẩn phía sau"""
        is_light = self.main_window.current_theme_mode == "light"
        
        # Background gradient cho vùng actions
        if is_light:
            bg_gradient = "qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 rgba(241, 245, 249, 0.95), stop:1 rgba(226, 232, 240, 0.98))"
        else:
            bg_gradient = "qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 rgba(15, 23, 42, 0.95), stop:1 rgba(30, 41, 59, 0.98))"
        
        self.actions_widget.setStyleSheet(f"""
            QWidget {{
                background: {bg_gradient};
                border-radius: 12px;
            }}
        """)
        
        actions_layout = QHBoxLayout(self.actions_widget)
        actions_layout.setContentsMargins(10, 5, 10, 5)
        actions_layout.setSpacing(10)
        
        # Nút Sửa - Style màu tím
        edit_btn = QPushButton()
        edit_btn.setIcon(create_icon('fa5s.edit', color='white'))
        edit_btn.setIconSize(QSize(20, 20))
        edit_btn.setFixedSize(65, 50)
        edit_btn.setCursor(QCursor(Qt.PointingHandCursor))
        edit_btn.setToolTip("Sửa nhóm")
        edit_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1, 
                    stop:0 #a78bfa, 
                    stop:1 #8b5cf6);
                border-radius: 12px;
                border: none;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1, 
                    stop:0 #c4b5fd, 
                    stop:1 #a78bfa);
            }
            QPushButton:pressed {
                background: #7c3aed;
            }
        """)
        edit_btn.clicked.connect(self.on_edit_clicked)
        actions_layout.addWidget(edit_btn)
        
        # Nút Xóa - Style màu đỏ
        delete_btn = QPushButton()
        delete_btn.setIcon(create_icon('fa5s.trash-alt', color='white'))
        delete_btn.setIconSize(QSize(20, 20))
        delete_btn.setFixedSize(65, 50)
        delete_btn.setCursor(QCursor(Qt.PointingHandCursor))
        delete_btn.setToolTip("Xóa nhóm")
        delete_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1, 
                    stop:0 #f87171, 
                    stop:1 #ef4444);
                border-radius: 12px;
                border: none;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1, 
                    stop:0 #fca5a5, 
                    stop:1 #f87171);
            }
            QPushButton:pressed {
                background: #dc2626;
            }
        """)
        delete_btn.clicked.connect(self.on_delete_clicked)
        actions_layout.addWidget(delete_btn)
    
    def mousePressEvent(self, event):
        """Bắt đầu thao tác kéo"""
        if event.button() == Qt.LeftButton:
            self.drag_start_pos = event.position().toPoint()
            
            # Nếu thẻ đang mở và người dùng click vào nội dung (không phải nút) -> Đóng lại
            if self.is_swiped:
                # Kiểm tra click có nằm trong vùng content_card không
                if self.content_card.geometry().contains(event.position().toPoint()):
                    self.reset_swipe() # Reset về vị trí đầu
                    event.accept()
                    return
        super().mousePressEvent(event)
    
    def mouseMoveEvent(self, event):
        """Xử lý thao tác kéo (Swipe)"""
        if self.drag_start_pos is not None and event.buttons() == Qt.LeftButton:
            delta = event.position().toPoint() - self.drag_start_pos
            new_offset = delta.x()
            
            # Chỉ cho phép swipe sang trái (offset âm)
            if new_offset < 0:
                # Giới hạn swipe tối đa là 150px (đủ để hiện 2 nút)
                self.offset_x = max(new_offset, -150)
                # Di chuyển thẻ nội dung sang trái
                self.content_card.move(int(self.offset_x), 0)
        super().mouseMoveEvent(event)
    
    def mouseReleaseEvent(self, event):
        """Kết thúc thao tác kéo (thả chuột)"""
        if event.button() == Qt.LeftButton:
            if self.drag_start_pos is not None:
                moved_distance = abs(event.position().toPoint().x() - self.drag_start_pos.x())
                
                if moved_distance < 5:
                    # Nếu di chuyển ít -> Coi là Click để chọn nhóm
                    if not self.is_swiped:
                        self.main_window.select_working_group(self.group_name)
                else:
                    # Nếu di chuyển nhiều -> Xử lý Swipe
                    if self.offset_x < -50:  # Nếu kéo quá 50px
                        # Mở hẳn ra (-150px)
                        self.animate_to_position(-150)
                        self.is_swiped = True
                        # Đóng các thẻ khác để chỉ 1 thẻ mở tại một thời điểm
                        self.close_other_cards()
                    else:
                        # Đóng lại (Snap back)
                        self.animate_to_position(0)
                        self.is_swiped = False
            
            self.drag_start_pos = None
        super().mouseReleaseEvent(event)
    
    def close_other_cards(self):
        """Đóng tất cả các thẻ khác đang mở trong danh sách"""
        parent = self.parent()
        if parent:
            for child in parent.findChildren(SwipeableGroupCard):
                if child != self and child.is_swiped:
                    child.reset_swipe()
    
    def reset_swipe(self):
        """Reset thẻ về vị trí ban đầu (đóng menu hành động)"""
        self.animate_to_position(0)
        self.is_swiped = False
    
    def animate_to_position(self, target_x):
        """Tạo hiệu ứng di chuyển mượt mà đến vị trí đích"""
        from PySide6.QtCore import QPropertyAnimation, QEasingCurve
        
        self.animation = QPropertyAnimation(self.content_card, b"pos")
        self.animation.setDuration(200) # Thời gian 200ms
        self.animation.setStartValue(self.content_card.pos())
        self.animation.setEndValue(QPoint(target_x, 0))
        self.animation.setEasingCurve(QEasingCurve.OutCubic) # Hiệu ứng giảm tốc
        self.animation.finished.connect(lambda: setattr(self, 'offset_x', target_x))
        self.animation.start()
    
    def on_edit_clicked(self):
        """Xử lý nút Sửa"""
        self.main_window.rename_group_inline(self.group_name)
        self.reset_swipe()
    
    def on_delete_clicked(self):
        """Xử lý nút Xóa"""
        self.main_window.delete_group_inline(self.group_name)
        self.reset_swipe()


class MainWindow(QMainWindow):
    """
    Cửa sổ chính của ứng dụng.
    """
    def __init__(self):
        super().__init__()
        
        # Cấu hình cửa sổ cơ bản
        self.setWindowTitle("Clipboard & Notes Manager")
        
        # Đặt icon cho app (hiển thị trên taskbar và title bar)
        icon_path = os.path.join(os.path.dirname(__file__), "app_icon.ico")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        
        self.setMinimumSize(800, 500)
        self.resize(950, 650) # Kích thước mặc định
        
        # Khởi tạo các biến dữ liệu
        self.notes = []             # Danh sách ghi chú
        self.groups = []            # Danh sách nhóm
        self.group_colors = {}      # Lưu màu của từng nhóm {tên_nhóm: màu_hex}
        self.clipboard_history = [] # Lịch sử clipboard
    
        # --- CẤU HÌNH ĐƯỜNG DẪN LƯU DỮ LIỆU (QUAN TRỌNG CHO FILE EXE) ---
        # Lấy đường dẫn AppData của người dùng (nơi được phép ghi dữ liệu)
        app_data = os.getenv('APPDATA')
        if not app_data:
            app_data = os.path.expanduser('~') # Fallback nếu không có APPDATA
            
        self.app_data_dir = os.path.join(app_data, 'ClipboardNotesManager')
        
        # Tạo thư mục nếu chưa tồn tại
        if not os.path.exists(self.app_data_dir):
            try:
                os.makedirs(self.app_data_dir)
            except Exception as e:
                print(f"Error creating data dir: {e}")
                self.app_data_dir = os.getcwd() # Fallback về thư mục hiện tại
                
        # Định nghĩa đường dẫn file
        self.data_file = os.path.join(self.app_data_dir, "notes_data.json")
        self.settings_file = os.path.join(self.app_data_dir, "settings.json")
        
        # Sử dụng thư mục Screenshots mặc định của người dùng
        self.images_folder = os.path.join(os.path.expanduser('~'), 'Pictures', 'Screenshots')
        
        # Danh sách quản lý các thẻ widget (để dọn dẹp bộ nhớ)
        self.all_cards = []
        
        # Khóa luồng để tránh xung đột khi lưu file
        self.save_lock = Lock()
        
        # Trạng thái giao diện
        self.current_tab = "notes"  # Tab hiện tại ("notes" hoặc "clipboard")
        self.current_group = None   # Nhóm đang được chọn
        self.always_on_top = True   # Mặc định luôn hiện trên cùng
        
        # 1. Khởi tạo Ngôn ngữ
        self.current_language = self.load_language_setting()  # "en" hoặc "vi"
        
        # 2. Khởi tạo Cài đặt Bong bóng (Icon & Size)
        self.load_bubble_settings()
        
        # 3. Khởi tạo Giao diện (Theme) - Sáng/Tối
        self.current_theme_mode = self.load_theme_setting()
        self.styles = AppTheme.get_styles(self.current_theme_mode) # Load CSS
        
        # Cài đặt luôn hiển thị trên cùng (Always on top)
        self.setWindowFlags(self.windowFlags() | Qt.WindowStaysOnTopHint)
        
        # Tạo thư mục lưu ảnh clipboard nếu chưa có
        if not os.path.exists(self.images_folder):
            os.makedirs(self.images_folder)
        
        # Tải dữ liệu từ file
        self.load_data()
        
        # 4. Thiết lập Giao diện người dùng
        self.setup_ui()
        
        # 5. Bắt đầu theo dõi Clipboard
        self.setup_clipboard_monitor()
        
        # Tạo bong bóng nổi (Floating Bubble) sau 100ms (để UI load xong)
        QTimer.singleShot(100, self.create_bubble)
        
        # 6. Thiết lập biểu tượng khay hệ thống (System Tray)
        self.setup_system_tray()
    
    def t(self, key, *args):
        """Hàm dịch thuật đa ngôn ngữ"""
        # Lấy text theo ngôn ngữ hiện tại, fallback về tiếng Việt nếu không thấy
        text = TRANSLATIONS.get(self.current_language, TRANSLATIONS["vi"]).get(key, key)
        if args:
            return text.format(*args) # Format string nếu có tham số
        return text
    
    def setup_system_tray(self):
        """Thiết lập biểu tượng trên khay hệ thống (góc phải taskbar)"""
        # Tạo tray icon
        self.tray_icon = QSystemTrayIcon(self)
        
        # Tạo icon màu tím đặc trưng
        icon_path = os.path.join(os.path.dirname(__file__), "app_icon.ico")
        if os.path.exists(icon_path):
            icon = QIcon(icon_path)
        else:
            # Fallback: dùng FontAwesome nếu không tìm thấy file
            icon = create_icon('fa5s.clipboard-list', color='#8b5cf6')
        self.tray_icon.setIcon(icon)
        
        # Tạo menu chuột phải cho tray icon
        tray_menu = QMenu()
        
        # Mục: Hiện ứng dụng
        show_action = tray_menu.addAction(self.t("show_app"))
        show_action.triggered.connect(self.show_window)
        
        tray_menu.addSeparator() # Đường kẻ phân cách
        
        # Mục: Thoát
        quit_action = tray_menu.addAction(self.t("quit"))
        quit_action.triggered.connect(self.quit_app)
        
        self.tray_icon.setContextMenu(tray_menu)
        
        # Xử lý sự kiện click vào tray icon (Double click để hiện)
        self.tray_icon.activated.connect(self.tray_icon_activated)
        
        # Tooltip khi di chuột vào icon
        self.tray_icon.setToolTip(self.t("app_title"))
        
        # Hiển thị icon
        self.tray_icon.show()
    
    def tray_icon_activated(self, reason):
        """Xử lý khi người dùng tương tác với tray icon"""
        if reason == QSystemTrayIcon.DoubleClick:
            self.show_window()
    
    def show_window(self):
        """Hiển thị cửa sổ chính và đưa lên trên cùng"""
        self.show()
        self.activateWindow()
        self.raise_()
    
    def quit_app(self):
        """Thoát ứng dụng hoàn toàn"""
        self.tray_icon.hide() # Ẩn icon trước khi thoát
        QApplication.quit()
    
    def closeEvent(self, event):
        """Override sự kiện đóng cửa sổ (Dấu X): Chỉ ẩn xuống tray chứ không thoát"""
        event.ignore() # Bỏ qua lệnh đóng mặc định
        self.hide()    # Ẩn cửa sổ
        
        # Hiển thị thông báo nhỏ ở tray
        self.tray_icon.showMessage(
            self.t("app_title"),
            self.t("app_running_background"),
            QSystemTrayIcon.Information,
            2000 # Hiện trong 2 giây
        )
    
    def mousePressEvent(self, event):
        """Standard mouse press handling"""
        super().mousePressEvent(event)
    
    def setup_ui(self):
        """Thiết lập giao diện chính của ứng dụng - Speed First Redesign"""
        from PySide6.QtWidgets import QLineEdit, QStackedWidget
        from PySide6.QtGui import QShortcut, QKeySequence
        
        # Áp dụng màu nền chính
        self.setStyleSheet(self.styles["MAIN"])
        
        # Widget trung tâm
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QHBoxLayout(central) # Chuyển sang ngang
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        
        # 1. SIDEBAR (Thanh điều hướng bên trái)
        self.sidebar = QFrame()
        self.sidebar.setFixedWidth(64)
        self.sidebar.setObjectName("sidebar")
        self.sidebar.setStyleSheet(self.styles.get("SIDEBAR", ""))
        sidebar_layout = QVBoxLayout(self.sidebar)
        sidebar_layout.setContentsMargins(0, 20, 0, 20)
        sidebar_layout.setSpacing(12)
        sidebar_layout.setAlignment(Qt.AlignTop | Qt.AlignHCenter)
        
        # Hàm tạo nút sidebar
        def create_sidebar_btn(icon_name, tooltip, callback, is_checkable=True):
            btn = QPushButton()
            btn.setFixedSize(40, 40)
            btn.setIcon(create_icon(icon_name, color=self.styles.get('text_secondary', '#9ca3af')))
            btn.setIconSize(QSize(20, 20))
            btn.setToolTip(tooltip)
            btn.setCursor(QCursor(Qt.PointingHandCursor))
            btn.setStyleSheet(self.styles.get("SIDEBAR_BTN", ""))
            if is_checkable:
                btn.setCheckable(True)
            btn.clicked.connect(callback)
            return btn
            
        self.sidebar_btns = []
        
        self.btn_notes = create_sidebar_btn('fa5s.sticky-note', self.t("notes_tab"), lambda: self.switch_tab("notes"))
        self.btn_clipboard = create_sidebar_btn('fa5s.clipboard', self.t("clipboard_tab"), lambda: self.switch_tab("clipboard"))
        
        self.sidebar_btns.extend([self.btn_notes, self.btn_clipboard])
        
        sidebar_layout.addWidget(self.btn_notes)
        sidebar_layout.addWidget(self.btn_clipboard)
        
        sidebar_layout.addStretch()
        
        # Nút cài đặt & Pin ở dưới cùng Sidebar
        self.btn_pin = create_sidebar_btn('fa5s.thumbtack', "Always on top", self.toggle_always_on_top, True)
        self.btn_settings = create_sidebar_btn('fa5s.cog', self.t("settings"), self.show_settings_dialog, False)
        
        sidebar_layout.addWidget(self.btn_pin)
        sidebar_layout.addWidget(self.btn_settings)
        
        main_layout.addWidget(self.sidebar)
        
        # 2. MAIN CONTENT AREA (Vùng nội dung chính)
        self.main_content = QWidget()
        content_layout = QVBoxLayout(self.main_content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(0)
        
        # 2a. GLOBAL SEARCH CONTAINER
        self.search_container = QFrame()
        self.search_container.setObjectName("searchContainer")
        self.search_container.setStyleSheet(self.styles.get("GLOBAL_SEARCH_CONTAINER", ""))
        search_layout = QVBoxLayout(self.search_container)
        search_layout.setContentsMargins(20, 20, 20, 10)
        
        self.global_search = QLineEdit()
        self.global_search.setPlaceholderText("Search notes, clipboard... (Ctrl+K)")
        self.global_search.setStyleSheet(self.styles.get("SEARCH_INPUT", ""))
        search_action = self.global_search.addAction(create_icon('fa5s.search', color='#9ca3af'), QLineEdit.LeadingPosition)
        
        # Connect search text change
        self.global_search.textChanged.connect(self.on_global_search)
        search_layout.addWidget(self.global_search)
        
        content_layout.addWidget(self.search_container)
        
        self.notes_panel = self.create_notes_panel()
        self.clipboard_panel = self.create_clipboard_panel()
        
        content_layout.addWidget(self.notes_panel, 1)
        content_layout.addWidget(self.clipboard_panel, 1)
        
        main_layout.addWidget(self.main_content, 1)
        
        # Setup Global Shortcuts
        self.setup_shortcuts()
        
        # Đặt tab mặc định là Notes
        self.switch_tab("notes")
        
        # Focus search bar by default
        self.global_search.setFocus()
        


    def setup_shortcuts(self):
        from PySide6.QtGui import QShortcut, QKeySequence
        # Ctrl+K: Focus Search
        self.shortcut_search = QShortcut(QKeySequence("Ctrl+K"), self)
        self.shortcut_search.activated.connect(self.global_search.setFocus)
        
        # Ctrl+N: Focus/Open Note Input
        self.shortcut_new_note = QShortcut(QKeySequence("Ctrl+N"), self)
        self.shortcut_new_note.activated.connect(self.focus_note_input)
        
        # Navigation
        self.shortcut_up = QShortcut(QKeySequence("Up"), self)
        self.shortcut_up.activated.connect(self.navigate_up)
        
        self.shortcut_down = QShortcut(QKeySequence("Down"), self)
        self.shortcut_down.activated.connect(self.navigate_down)
        
        self.shortcut_enter = QShortcut(QKeySequence("Return"), self)
        self.shortcut_enter.activated.connect(self.copy_selected)
        self.shortcut_enter2 = QShortcut(QKeySequence("Enter"), self)
        self.shortcut_enter2.activated.connect(self.copy_selected)

        self.selected_card_index = -1

    def get_visible_cards(self):
        if not hasattr(self, 'all_cards'): return []
        is_notes = self.current_tab == "notes"
        visible_cards = []
        for card in self.all_cards:
            if card.isVisible() and card.is_note == is_notes:
                visible_cards.append(card)
        return visible_cards

    def update_selection(self):
        visible_cards = self.get_visible_cards()
        for i, card in enumerate(visible_cards):
            card.set_selected(i == self.selected_card_index)

    def navigate_up(self):
        visible_cards = self.get_visible_cards()
        if not visible_cards: return
        self.selected_card_index = max(0, self.selected_card_index - 1)
        self.update_selection()
        # Scroll to view logic could be added here

    def navigate_down(self):
        visible_cards = self.get_visible_cards()
        if not visible_cards: return
        self.selected_card_index = min(len(visible_cards) - 1, self.selected_card_index + 1)
        self.update_selection()

    def copy_selected(self):
        if hasattr(self, 'note_input') and self.note_input.hasFocus():
            # If typing a note, don't copy, let text edit handle return if possible (or add note)
            # Actually, return in text edit adds newline.
            return
            
        visible_cards = self.get_visible_cards()
        if 0 <= self.selected_card_index < len(visible_cards):
            visible_cards[self.selected_card_index].copy_item()

        
        # Navigation
        self.shortcut_up = QShortcut(QKeySequence("Up"), self)
        self.shortcut_up.activated.connect(self.navigate_up)
        
        self.shortcut_down = QShortcut(QKeySequence("Down"), self)
        self.shortcut_down.activated.connect(self.navigate_down)
        
        self.shortcut_enter = QShortcut(QKeySequence("Return"), self)
        self.shortcut_enter.activated.connect(self.copy_selected)
        self.shortcut_enter2 = QShortcut(QKeySequence("Enter"), self)
        self.shortcut_enter2.activated.connect(self.copy_selected)

        self.selected_card_index = -1

    def get_visible_cards(self):
        if not hasattr(self, 'all_cards'): return []
        is_notes = self.current_tab == "notes"
        visible_cards = []
        for card in self.all_cards:
            if card.isVisible() and card.is_note == is_notes:
                visible_cards.append(card)
        return visible_cards

    def update_selection(self):
        visible_cards = self.get_visible_cards()
        for i, card in enumerate(visible_cards):
            card.set_selected(i == self.selected_card_index)

    def navigate_up(self):
        visible_cards = self.get_visible_cards()
        if not visible_cards: return
        self.selected_card_index = max(0, self.selected_card_index - 1)
        self.update_selection()
        # Scroll to view logic could be added here

    def navigate_down(self):
        visible_cards = self.get_visible_cards()
        if not visible_cards: return
        self.selected_card_index = min(len(visible_cards) - 1, self.selected_card_index + 1)
        self.update_selection()

    def copy_selected(self):
        if hasattr(self, 'note_input') and self.note_input.hasFocus():
            # If typing a note, don't copy, let text edit handle return if possible (or add note)
            # Actually, return in text edit adds newline.
            return
            
        visible_cards = self.get_visible_cards()
        if 0 <= self.selected_card_index < len(visible_cards):
            visible_cards[self.selected_card_index].copy_item()

        from PySide6.QtGui import QShortcut, QKeySequence
        # Ctrl+K: Focus Search
        self.shortcut_search = QShortcut(QKeySequence("Ctrl+K"), self)
        self.shortcut_search.activated.connect(self.global_search.setFocus)
        
        # Ctrl+N: Focus/Open Note Input
        self.shortcut_new_note = QShortcut(QKeySequence("Ctrl+N"), self)
        self.shortcut_new_note.activated.connect(self.focus_note_input)
        
    def focus_note_input(self):
        self.switch_tab("notes")
        if hasattr(self, 'note_input'):
            self.note_input.setFocus()
            
    def on_global_search(self, text):
        text = text.lower()
        if hasattr(self, 'all_cards'):
            for card in self.all_cards:
                # If in notes tab, search notes; if in clipboard tab, search clipboard
                is_active_tab = (self.current_tab == "notes" and card.is_note) or (self.current_tab == "clipboard" and not card.is_note)
                if not is_active_tab:
                    continue
                    
                match = text in card.data.get("content", "").lower()
                card.setVisible(match)

        
    def create_notes_panel(self):
        """
        Tạo panel chứa giao diện ghi chú - Speed First Redesign.
        Hiển thị nhóm dưới dạng pill ngang và danh sách note dọc.
        """
        panel = QFrame()
        panel.setStyleSheet(self.styles.get("PANEL", ""))
        panel.setObjectName("notesPanel")
        
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)
        
        # 1. GROUPS PILL SCROLL AREA (Ngang)
        self.groups_scroll = QScrollArea()
        self.groups_scroll.setWidgetResizable(True)
        self.groups_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.groups_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.groups_scroll.setFixedHeight(40)
        self.groups_scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")
        
        self.groups_list_container = QWidget()
        self.groups_list_container.setStyleSheet("background: transparent;")
        self.groups_list_layout = QHBoxLayout(self.groups_list_container)
        self.groups_list_layout.setContentsMargins(0, 0, 0, 0)
        self.groups_list_layout.setSpacing(8)
        self.groups_list_layout.addStretch()
        
        self.groups_scroll.setWidget(self.groups_list_container)
        layout.addWidget(self.groups_scroll)
        
        # 2. INPUT AREA (Vùng nhập liệu nhanh)
        self.input_widget = QWidget()
        input_layout = QHBoxLayout(self.input_widget)
        input_layout.setContentsMargins(0, 0, 0, 0)
        input_layout.setSpacing(8)
        
        self.note_input = QTextEdit()
        self.note_input.setFixedHeight(40)
        self.note_input.setPlaceholderText("Ctrl+N to create a note...")
        self.note_input.setStyleSheet(self.styles.get("INPUT", ""))
        self.note_input.textChanged.connect(self.adjust_input_height)
        input_layout.addWidget(self.note_input, 1)
        
        add_btn = QPushButton()
        add_btn.setIcon(create_icon('fa5s.arrow-up', color='white'))
        add_btn.setIconSize(QSize(16, 16))
        add_btn.setFixedSize(40, 40)
        add_btn.setCursor(QCursor(Qt.PointingHandCursor))
        add_btn.setStyleSheet(self.styles.get("ADD_BTN", ""))
        add_btn.clicked.connect(self.add_note)
        input_layout.addWidget(add_btn)
        
        layout.addWidget(self.input_widget)
        
        # 2b. TRASH BANNER AREA (Hiển thị khi ở tab Thùng rác)
        self.trash_banner_widget = QWidget()
        trash_layout = QHBoxLayout(self.trash_banner_widget)
        trash_layout.setContentsMargins(0, 0, 0, 0)
        trash_layout.setSpacing(8)
        
        trash_info = QLabel("🗑️ " + self.t("trash") + ":")
        trash_info.setStyleSheet("color: #9ca3af; font-size: 13px; font-weight: 500;")
        trash_layout.addWidget(trash_info)
        
        trash_layout.addStretch()
        
        self.empty_trash_btn = QPushButton("🧹 " + self.t("empty_trash"))
        self.empty_trash_btn.setCursor(QCursor(Qt.PointingHandCursor))
        self.empty_trash_btn.setStyleSheet(self.styles.get("BTN_DELETE", ""))
        self.empty_trash_btn.setFixedHeight(36)
        self.empty_trash_btn.clicked.connect(self.empty_trash)
        trash_layout.addWidget(self.empty_trash_btn)
        
        self.trash_banner_widget.hide() # Ẩn mặc định
        layout.addWidget(self.trash_banner_widget)
        
        # 3. NOTES LIST (Danh sách ghi chú dọc)
        self.notes_scroll = QScrollArea()
        self.notes_scroll.setWidgetResizable(True)
        self.notes_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.notes_scroll.setStyleSheet(self.styles.get("SCROLL", ""))
        
        self.notes_container = QWidget()
        self.notes_container.setStyleSheet("background: transparent;")
        self.notes_layout = QVBoxLayout(self.notes_container)
        self.notes_layout.setContentsMargins(0, 0, 4, 0)
        self.notes_layout.setSpacing(6)
        self.notes_layout.addStretch()
        
        self.notes_scroll.setWidget(self.notes_container)
        layout.addWidget(self.notes_scroll, 1)
        
        # Tải danh sách nhóm (sẽ tự động load groups pills)
        self.refresh_groups_list()
        
        return panel

    def refresh_groups_list(self):
        """Refresh danh sách nhóm thành dạng Pill"""
        # Clear existing
        while self.groups_list_layout.count() > 1:
            item = self.groups_list_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        # Add 'All' group or select first group if current_group is None
        if not self.current_group:
            self.current_group = "ALL"
            
        # Add ALL button
        btn_all = QPushButton("ALL")
        from PySide6.QtGui import QCursor
        from PySide6.QtCore import Qt
        btn_all.setCursor(QCursor(Qt.PointingHandCursor))
        btn_all.setCheckable(True)
        btn_all.setStyleSheet(self.styles.get("PILL_GROUP", ""))
        if self.current_group == "ALL":
            btn_all.setChecked(True)
        btn_all.clicked.connect(lambda checked: self.select_group("ALL"))
        self.groups_list_layout.insertWidget(0, btn_all)

        # Thêm nút ảo FAVORITES
        btn_fav = QPushButton("⭐ " + self.t("favorites"))
        btn_fav.setCursor(QCursor(Qt.PointingHandCursor))
        btn_fav.setCheckable(True)
        btn_fav.setStyleSheet(self.styles.get("PILL_GROUP", ""))
        if self.current_group == "FAVORITES":
            btn_fav.setChecked(True)
        btn_fav.clicked.connect(lambda checked: self.select_group("FAVORITES"))
        self.groups_list_layout.insertWidget(1, btn_fav)
        
        # Thêm nút ảo TRASH
        btn_trash = QPushButton("🗑️ " + self.t("trash"))
        btn_trash.setCursor(QCursor(Qt.PointingHandCursor))
        btn_trash.setCheckable(True)
        btn_trash.setStyleSheet(self.styles.get("PILL_GROUP", ""))
        if self.current_group == "TRASH":
            btn_trash.setChecked(True)
        btn_trash.clicked.connect(lambda checked: self.select_group("TRASH"))
        self.groups_list_layout.insertWidget(2, btn_trash)
        
        virtual_count = 3

        if self.groups:
            sorted_groups = sorted(self.groups)
            for idx, group in enumerate(sorted_groups):
                btn = QPushButton(group)
                btn.setCursor(QCursor(Qt.PointingHandCursor))
                btn.setCheckable(True)
                btn.setStyleSheet(self.styles.get("PILL_GROUP", ""))
                if group == self.current_group:
                    btn.setChecked(True)
                
                # Use lambda default argument to capture current group variable
                btn.clicked.connect(lambda checked, g=group: self.select_group(g))
                
                # Setup context menu
                btn.setContextMenuPolicy(Qt.CustomContextMenu)
                btn.customContextMenuRequested.connect(lambda pos, g=group: self.show_group_context_menu(g))
                
                self.groups_list_layout.insertWidget(idx + virtual_count, btn)
        
        # Nút Thêm Nhóm
        add_group_btn = QPushButton("+ New")
        add_group_btn.setCursor(QCursor(Qt.PointingHandCursor))
        add_group_btn.setStyleSheet(self.styles.get("PILL_GROUP", ""))
        add_group_btn.clicked.connect(self.quick_add_group)
        self.groups_list_layout.insertWidget(len(self.groups) + virtual_count, add_group_btn)
        
        self.refresh_notes_list()

    def select_group(self, group_name):
        self.current_group = group_name
        
        # Ẩn/Hiện input và trash banner dựa trên nhóm được chọn
        if hasattr(self, 'input_widget') and hasattr(self, 'trash_banner_widget'):
            if group_name == "TRASH":
                self.input_widget.hide()
                self.trash_banner_widget.show()
            elif group_name == "FAVORITES":
                self.input_widget.hide()
                self.trash_banner_widget.hide()
            else:
                self.input_widget.show()
                self.trash_banner_widget.hide()
                
        self.refresh_groups_list() # To update check state
        
    def create_clipboard_panel(self):
        """Tạo panel hiển thị lịch sử Clipboard"""
        panel = QFrame()
        panel.setStyleSheet(self.styles["PANEL"])
        panel.setObjectName("clipboardPanel")
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(20, 20, 20, 15)
        layout.setSpacing(15)
        
        # 1. HEADER (Tiêu đề + Nút Xóa)
        header = QWidget()
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(0, 0, 0, 0)
        
        # Tiêu đề "Lịch sử bộ nhớ tạm"
        title = QLabel(self.t("clipboard_history"))
        title_color = "#1f2937" if self.current_theme_mode == "light" else "#e8e8f8"
        title.setStyleSheet(f"color: {title_color}; font-size: 18px; font-weight: 600; background: transparent;")
        header_layout.addWidget(title)
        
        header_layout.addStretch()
        
        # Nút Xóa tất cả (Clear All)
        clear_btn = QPushButton(self.t("clear_all"))
        clear_btn.setCursor(QCursor(Qt.PointingHandCursor))
        
        # Style cho nút Xóa (Màu đỏ danger)
        colors = ThemeColors.LIGHT if self.current_theme_mode == "light" else ThemeColors.DARK
        clear_btn.setIcon(create_icon('fa5s.trash', color=colors['danger']))
        clear_btn.setIconSize(QSize(14, 14))
        
        clear_btn.setStyleSheet(self.styles["BTN_DELETE"]) # Dùng style định sẵn
        clear_btn.clicked.connect(self.clear_clipboard_history)
        header_layout.addWidget(clear_btn)
        
        layout.addWidget(header)
        
        # 2. CLIPBOARD LIST (Danh sách lịch sử)
        self.clipboard_scroll = QScrollArea()
        self.clipboard_scroll.setWidgetResizable(True)
        self.clipboard_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.clipboard_scroll.setStyleSheet(self.styles["SCROLL"])
        self.clipboard_scroll.setMinimumHeight(200)
        
        self.clipboard_container = QWidget()
        self.clipboard_container.setStyleSheet("background: transparent;")
        self.clipboard_layout = QVBoxLayout(self.clipboard_container)
        self.clipboard_layout.setContentsMargins(0, 0, 8, 0)
        self.clipboard_layout.setSpacing(10)
        self.clipboard_layout.addStretch() # Đẩy nội dung lên trên
        
        self.clipboard_scroll.setWidget(self.clipboard_container)
        layout.addWidget(self.clipboard_scroll, 1)
        
        # Tải danh sách clipboard
        self.refresh_clipboard_list()
        
        return panel

    
    def toggle_always_on_top(self):
        """Toggle always on top"""
        self.always_on_top = not self.always_on_top
        
        if self.always_on_top:
            self.setWindowFlags(self.windowFlags() | Qt.WindowStaysOnTopHint)
        else:
            self.setWindowFlags(self.windowFlags() & ~Qt.WindowStaysOnTopHint)
        
        self.show()
        self.update_header_icons()
    
    def update_pin_button(self):
        # Deprecated: Logic moved to update_header_icons
        pass


    def adjust_input_height(self):
        """Tự động điều chỉnh chiều cao input theo nội dung"""
        doc_height = self.note_input.document().size().height()
        new_height = min(max(45, int(doc_height) + 20), 200)
        self.note_input.setFixedHeight(new_height)
    
    def switch_tab(self, tab_name):
        """Chuyển giữa Notes và Clipboard tab"""
        self.current_tab = tab_name
        
        if tab_name == "notes":
            self.notes_panel.show()
            self.clipboard_panel.hide()
            self.update_tab_buttons(True, False)
        else:
            self.notes_panel.hide()
            self.clipboard_panel.show()
            self.update_tab_buttons(False, True)
    
    def update_tab_buttons(self, notes_active=None, clipboard_active=None):
        """Update tab button styles and icons"""
        is_notes = self.current_tab == "notes"
        
        # Determine colors
        colors = ThemeColors.LIGHT if self.current_theme_mode == "light" else ThemeColors.DARK
        active_color = colors['accent']
        inactive_color = colors['text_secondary']
        
        # Custom Purple Style for Active Tab (Hardcoded to ensure override)
        active_style = """
            QPushButton {
                background-color: #8b5cf6;
                color: white;
                border: 1px solid #8b5cf6;
                border-radius: 8px;
                font-weight: 700;
                padding: 8px 16px;
            }
        """
        
        # Notes Tab
        if hasattr(self, 'notes_tab_btn'):
            if is_notes:
                self.notes_tab_btn.setStyleSheet(active_style)
                self.notes_tab_btn.setIcon(create_icon('fa5s.sticky-note', color='white'))
            else:
                self.notes_tab_btn.setStyleSheet(self.styles["TAB_INACTIVE"])
                self.notes_tab_btn.setIcon(create_icon('fa5s.sticky-note', color=inactive_color))
        
        # Clipboard Tab
        if hasattr(self, 'clipboard_tab_btn'):
            if not is_notes:
                self.clipboard_tab_btn.setStyleSheet(active_style)
                self.clipboard_tab_btn.setIcon(create_icon('fa5s.clipboard', color='white'))
            else:
                self.clipboard_tab_btn.setStyleSheet(self.styles["TAB_INACTIVE"])
                self.clipboard_tab_btn.setIcon(create_icon('fa5s.clipboard', color=inactive_color))
    
    def create_bubble(self):
        self.bubble = FloatingBubble(self)
        self.bubble.show()
    
    def setup_clipboard_monitor(self):
        self.clipboard_watcher = ClipboardWatcher(self)
    
    def on_text_copied(self, text):
        # Kiểm tra trùng lặp
        if not any(i["type"] == "text" and i["content"] == text for i in self.clipboard_history[:5]):
            self.clipboard_history.insert(0, {
                "type": "text",
                "content": text,
                "timestamp": datetime.now().strftime("%H:%M")
            })
            self.trim_history()
            self.save_data()
            self.refresh_clipboard_list()
            self.show_toast("📋 Đã lưu text mới")
    
    def on_image_copied(self, image, hash_val):
        filename = f"clip_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hash_val[:8]}.png"
        path = os.path.join(self.images_folder, filename)
        image.save(path, "PNG")
        
        self.clipboard_history.insert(0, {
            "type": "image",
            "content": filename,
            "width": image.width(),
            "height": image.height(),
            "timestamp": datetime.now().strftime("%H:%M")
        })
        self.trim_history()
        self.save_data()
        self.refresh_clipboard_list()
        self.show_toast("🖼️ Đã lưu ảnh mới")
    
    def on_screenshot_copied(self, screenshot_path, hash_val):
        """Xử lý screenshot từ thư mục Screenshots"""
        try:
            # Không copy file nữa, dùng trực tiếp file gốc
            # filename = screenshot_path.name (để hiển thị)
            filename = screenshot_path.name
            
            # Lấy kích thước ảnh từ file gốc
            image = QImage(str(screenshot_path))
            
            self.clipboard_history.insert(0, {
                "type": "image",
                "content": filename,
                "width": image.width(),
                "height": image.height(),
                "timestamp": datetime.now().strftime("%H:%M"),
                "source": "screenshot"
            })
            self.trim_history()
            self.save_data()
            self.refresh_clipboard_list()
            self.show_toast("📸 Đã lưu Screenshot")
        except Exception as e:
            print(f"Error copying screenshot: {e}")
            # Fallback to normal image handling
            image = QImage(str(screenshot_path))
            if not image.isNull():
                self.on_image_copied(image, hash_val)
    
    def trim_history(self):
        while len(self.clipboard_history) > 50:
            old = self.clipboard_history.pop()
            if old["type"] == "image":
                try:
                    os.remove(os.path.join(self.images_folder, old["content"]))
                except:
                    pass
    
    # hide_all_actions removed as no longer needed with new card design
    
    def add_note(self):
        text = self.note_input.toPlainText().strip()
        if not text:
            return
        
        # Kiểm tra xem nhóm hiện tại có hợp lệ để thêm note trực tiếp hay không
        if not self.current_group or self.current_group in ["ALL", "FAVORITES", "TRASH"]:
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.warning(self, self.t("error"), self.t("cannot_add_to_virtual_group") if hasattr(self, 't') else "Cannot add notes here!")
            return
        
        note = {
            "content": text,
            "group": self.current_group,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M")
        }
        self.notes.insert(0, note)
        self.note_input.clear()
        
        self.save_data()
        self.refresh_notes_list()
    
    def edit_note(self, index, note_data):
        dialog = QDialog(self)
        dialog.setWindowTitle(f"{self.t('edit_note')}")
        dialog.setFixedSize(500, 320)  # Kích thước lớn hơn một chút
        dialog.setStyleSheet(self.styles["DIALOG"])
        
        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(24, 24, 24, 24)  # Padding rộng rãi hơn
        layout.setSpacing(18)
        
        # Title with icon from qtawesome
        title_container = QHBoxLayout()
        title_icon = QLabel()
        colors = ThemeColors.LIGHT if self.current_theme_mode == "light" else ThemeColors.DARK
        title_icon.setPixmap(create_icon('fa5s.edit', color=colors['accent']).pixmap(QSize(20, 20)))
        title_container.addWidget(title_icon)
        
        title = QLabel(f"{self.t('edit_note')} - {self.t('group')}: {note_data.get('group', 'N/A')}")
        title.setStyleSheet("font-size: 18px; font-weight: 700; margin-left: 8px;")
        title_container.addWidget(title, 1)
        
        layout.addLayout(title_container)
        
        textbox = QTextEdit()
        textbox.setPlainText(note_data["content"])
        textbox.setStyleSheet(self.styles["INPUT"])
        textbox.setMinimumHeight(120)  # Chiều cao tối thiểu
        layout.addWidget(textbox, 1)
        
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(12)  # Khoảng cách giữa buttons
        btn_layout.addStretch()
        
        cancel_btn = QPushButton()
        cancel_btn.setText(self.t("cancel"))
        cancel_icon_color = colors['text_secondary']
        cancel_btn.setIcon(create_icon('fa5s.times', color=cancel_icon_color))
        cancel_btn.setFixedHeight(38)
        cancel_btn.setMinimumWidth(100)
        cancel_btn.setCursor(QCursor(Qt.PointingHandCursor))
        cancel_btn.setStyleSheet(self.styles["BTN_EDIT"])
        cancel_btn.clicked.connect(dialog.reject)
        btn_layout.addWidget(cancel_btn)
        
        save_btn = QPushButton()
        save_btn.setText(self.t("save"))
        save_btn.setIcon(create_icon('fa5s.save', color='white'))
        save_btn.setFixedHeight(38)
        save_btn.setMinimumWidth(100)
        save_btn.setCursor(QCursor(Qt.PointingHandCursor))
        save_btn.setStyleSheet(self.styles["ADD_BTN"])
        save_btn.clicked.connect(lambda: self.save_edited_note(
            dialog, index, textbox.toPlainText()
        ))
        btn_layout.addWidget(save_btn)
        
        layout.addLayout(btn_layout)
        dialog.exec()
    
    def save_edited_note(self, dialog, index, new_text):
        new_text = new_text.strip()
        if not new_text:
            return
        
        self.notes[index]["content"] = new_text
        # Giữ nguyên nhóm
        self.save_data()
        self.refresh_notes_list()
        dialog.accept()
    
    def delete_note(self, index):
        """Xóa mềm: Chuyển ghi chú vào thùng rác"""
        if 0 <= index < len(self.notes):
            self.notes[index]["is_trashed"] = True
            self.notes[index]["deleted_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            # Bỏ ghim khi chuyển vào thùng rác
            self.notes[index]["is_pinned"] = False
            self.save_data()
            self.refresh_notes_list()
            self.show_toast("🗑️ " + self.t("trash"))

    def toggle_pin_note(self, index):
        """Ghim hoặc bỏ ghim ghi chú"""
        if 0 <= index < len(self.notes):
            # Nếu đang ghim thì bỏ ghim, ngược lại thì ghim
            is_pinned = not self.notes[index].get("is_pinned", False)
            self.notes[index]["is_pinned"] = is_pinned
            self.save_data()
            self.refresh_notes_list()
            self.show_toast("📌 " + (self.t("pin_note") if is_pinned else self.t("unpin_note")))

    def toggle_favorite_note(self, index):
        """Thêm vào hoặc bỏ khỏi danh sách yêu thích"""
        if 0 <= index < len(self.notes):
            is_fav = not self.notes[index].get("is_favorite", False)
            self.notes[index]["is_favorite"] = is_fav
            self.save_data()
            self.refresh_notes_list()
            self.show_toast("⭐ " + (self.t("favorite_note") if is_fav else self.t("unfavorite_note")))

    def restore_note(self, index):
        """Khôi phục ghi chú từ thùng rác"""
        if 0 <= index < len(self.notes):
            self.notes[index]["is_trashed"] = False
            if "deleted_at" in self.notes[index]:
                del self.notes[index]["deleted_at"]
            self.save_data()
            self.refresh_notes_list()
            self.show_toast("↩️ " + self.t("restore"))

    def permanent_delete_note(self, index):
        """Xóa vĩnh viễn ghi chú khỏi bộ nhớ"""
        if 0 <= index < len(self.notes):
            msg_box = QMessageBox(self)
            msg_box.setWindowTitle(self.t("confirm"))
            msg_box.setText(self.t("confirm_delete_permanently"))
            msg_box.setIcon(QMessageBox.Warning)
            msg_box.setStyleSheet(self.styles["DIALOG"])
            
            yes_btn = msg_box.addButton(self.t("yes"), QMessageBox.YesRole)
            no_btn = msg_box.addButton(self.t("no"), QMessageBox.NoRole)
            msg_box.exec()
            
            if msg_box.clickedButton() == yes_btn:
                del self.notes[index]
                self.save_data()
                self.refresh_notes_list()
                self.show_toast("🗑️ " + self.t("delete"))

    def empty_trash(self):
        """Dọn sạch mọi ghi chú bị xóa mềm"""
        trashed_count = sum(1 for n in self.notes if n.get("is_trashed", False))
        if trashed_count == 0:
            return
            
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle(self.t("confirm"))
        msg_box.setText(self.t("confirm_empty_trash"))
        msg_box.setIcon(QMessageBox.Warning)
        msg_box.setStyleSheet(self.styles["DIALOG"])
        
        yes_btn = msg_box.addButton(self.t("yes"), QMessageBox.YesRole)
        no_btn = msg_box.addButton(self.t("no"), QMessageBox.NoRole)
        msg_box.exec()
        
        if msg_box.clickedButton() == yes_btn:
            # Lọc chỉ giữ lại note không bị trashed
            self.notes = [n for n in self.notes if not n.get("is_trashed", False)]
            self.save_data()
            self.refresh_notes_list()
            self.show_toast("🗑️ " + self.t("empty_trash"))
    
    def delete_clipboard_item(self, index):
        if 0 <= index < len(self.clipboard_history):
            item = self.clipboard_history[index]
            if item["type"] == "image":
                try:
                    os.remove(os.path.join(self.images_folder, item["content"]))
                except:
                    pass
            del self.clipboard_history[index]
            self.save_data()
            self.refresh_clipboard_list()
    
    def clear_clipboard_history(self):
        if self.clipboard_history:
            msg_box = QMessageBox(self)
            msg_box.setWindowTitle(self.t("confirm"))
            msg_box.setText(self.t("clear_history_confirm"))
            msg_box.setIcon(QMessageBox.Question)
            
            # Custom buttons for translation
            yes_btn = msg_box.addButton(self.t("yes"), QMessageBox.YesRole)
            no_btn = msg_box.addButton(self.t("no"), QMessageBox.NoRole)
            
            # Apply styling
            msg_box.setStyleSheet(self.styles["DIALOG"])
            
            msg_box.exec()
            
            if msg_box.clickedButton() == yes_btn:
                for item in self.clipboard_history:
                    if item["type"] == "image":
                        try:
                            os.remove(os.path.join(self.images_folder, item["content"]))
                        except:
                            pass
                self.clipboard_history = []
                self.save_data()
                self.refresh_clipboard_list()
    
    def refresh_notes_list(self):
        # Clear existing
        while self.notes_layout.count() > 1:
            item = self.notes_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        self.all_cards = [c for c in self.all_cards if not c.is_note]
        
        # Chỉ hiển thị notes của nhóm hiện tại
        if not self.current_group:
            return
        
        # Lọc notes theo nhóm hiện tại
        filtered_notes = []
        for i, note in enumerate(self.notes):
            is_trashed = note.get("is_trashed", False)
            is_fav = note.get("is_favorite", False)
            note_group = note.get("group")
            
            if self.current_group == "TRASH":
                if is_trashed:
                    filtered_notes.append((i, note))
            elif self.current_group == "FAVORITES":
                if is_fav and not is_trashed:
                    filtered_notes.append((i, note))
            else:
                # Các nhóm thông thường hoặc ALL
                if not is_trashed:
                    if self.current_group == "ALL" or note_group == self.current_group:
                        filtered_notes.append((i, note))
                        
        # Sắp xếp: đưa note ghim lên đầu (trừ nhóm TRASH)
        if self.current_group != "TRASH":
            filtered_notes.sort(key=lambda x: x[1].get("is_pinned", False), reverse=True)
        
        if not filtered_notes:
            empty_text = f"{self.t('no_notes')}\n\n{self.t('add_first_note')}"
            if self.current_group == "TRASH":
                empty_text = "🗑️ " + (self.t("trash") + " trống" if self.current_theme_mode == "vi" else "Trash is empty")
            elif self.current_group == "FAVORITES":
                empty_text = "⭐ " + (self.t("favorites") + " trống" if self.current_theme_mode == "vi" else "Favorites are empty")
            empty = QLabel(empty_text)
            empty.setStyleSheet("color: #6b7280; padding: 60px; font-size: 14px; letter-spacing: 0.3px;")
            empty.setAlignment(Qt.AlignCenter)
            self.notes_layout.insertWidget(0, empty)
        else:
            for idx, (original_idx, note) in enumerate(filtered_notes):
                card = NoteCard(
                    self.notes_container, self, note, original_idx, 
                    is_note=True, group_name=note.get("group")
                )
                self.notes_layout.insertWidget(idx, card)
                self.all_cards.append(card)
    
    def refresh_clipboard_list(self):
        # Clear existing
        while self.clipboard_layout.count() > 1:
            item = self.clipboard_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        self.all_cards = [c for c in self.all_cards if c.is_note]
        
        if not self.clipboard_history:
            empty = QLabel(self.t("no_clipboard"))
            empty.setStyleSheet("color: #6b7280; padding: 40px; letter-spacing: 0.3px;")
            empty.setAlignment(Qt.AlignCenter)
            self.clipboard_layout.insertWidget(0, empty)
        else:
            for i, item in enumerate(self.clipboard_history):
                card = NoteCard(self.clipboard_container, self, item, i, is_note=False)
                self.clipboard_layout.insertWidget(i, card)
                self.all_cards.append(card)
    
    def show_toast(self, msg):
        self.toast = QLabel(msg, self)
        self.toast.setStyleSheet(TOAST_STYLE)
        self.toast.adjustSize()
        self.toast.move(
            (self.width() - self.toast.width()) // 2,
            self.height() - 100
        )
        self.toast.show()
        QTimer.singleShot(1000, self.toast.deleteLater)
    
    def get_group_color(self, group_name):
        """Lấy màu cho nhóm (tạo màu mới nếu chưa có)"""
        if group_name not in self.group_colors:
            # Danh sách màu đẹp cho nhóm - Jewel tones & Pastels
            colors = [
                "#3b82f6",  # Blue
                "#8b5cf6",  # Purple
                "#ec4899",  # Pink
                "#06b6d4",  # Cyan
                "#6366f1",  # Indigo
                "#ef4444",  # Red
                "#14b8a6",  # Teal
                "#a855f7",  # Violet
                "#f43f5e",  # Rose
                "#0ea5e9",  # Sky Blue
                "#8b5cf6",  # Purple (duplicate for variety)
                "#6366f1",  # Indigo (duplicate)
            ]
            # Chọn màu dựa trên hash của tên nhóm
            color_index = hash(group_name) % len(colors)
            self.group_colors[group_name] = colors[color_index]
        return self.group_colors[group_name]
    

    
    def show_add_group_dialog(self, parent_dialog, refresh_callback):
        """Hiển thị dialog thêm nhóm với chọn màu - Modern UI"""
        dialog = QDialog(parent_dialog)
        dialog.setWindowTitle(self.t("create_group"))
        dialog.setFixedSize(450, 400)
        
        # Modern dialog style
        is_light = self.current_theme_mode == "light"
        bg = "#ffffff" if is_light else "#0f172a"
        text_primary = "#1f2937" if is_light else "#f1f5f9"
        text_secondary = "#6b7280" if is_light else "#94a3b8"
        
        dialog.setStyleSheet(f"""
            QDialog {{
                background: {bg};
                border-radius: 16px;
            }}
        """)
        
        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(20)
        
        # Title with icon
        title = QLabel(f"🏷️  {self.t('create_group')}")
        title.setStyleSheet(f"""
            font-size: 22px; 
            font-weight: 700; 
            color: {text_primary};
            margin-bottom: 5px;
        """)
        layout.addWidget(title)
        
        # Group name input
        name_label = QLabel(f"{self.t('group_name')}:")
        name_label.setStyleSheet(f"color: {text_secondary}; font-size: 13px; font-weight: 600;")
        layout.addWidget(name_label)
        
        name_input = QTextEdit()
        name_input.setFixedHeight(50)
        name_input.setPlaceholderText(self.t("enter_group_name"))
        input_border = "#e5e7eb" if is_light else "#334155"
        input_focus = "#8b5cf6"
        name_input.setStyleSheet(f"""
            QTextEdit {{
                background: {bg};
                border: 2px solid {input_border};
                border-radius: 12px;
                padding: 12px 16px;
                font-size: 15px;
                color: {text_primary};
            }}
            QTextEdit:focus {{
                border: 2px solid {input_focus};
            }}
        """)
        layout.addWidget(name_input)
        
        # Color picker section
        color_label = QLabel(f"{self.t('choose_color')}:")
        color_label.setStyleSheet(f"color: {text_secondary}; font-size: 13px; font-weight: 600; margin-top: 5px;")
        layout.addWidget(color_label)
        
        # Color grid - vibrant colors
        colors = [
            "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#0ea5e9",
            "#06b6d4", "#6366f1", "#a855f7", "#2563eb", "#f43f5e", "#1d4ed8",
        ]
        
        selected_color = [colors[0]]
        color_buttons = []
        
        # Grid container
        grid_container = QWidget()
        grid_layout = QHBoxLayout(grid_container)
        grid_layout.setSpacing(16)  # Tăng từ 12 lên 16
        grid_layout.setContentsMargins(0, 0, 0, 0)
        
        def make_select_handler(color, btn, all_buttons):
            def handler():
                selected_color[0] = color
                for b, c in all_buttons:
                    if c == color:
                        # Selected style with checkmark
                        b.setIcon(create_icon('fa5s.check', color='white'))
                        b.setIconSize(QSize(18, 18))
                        b.setStyleSheet(f"""
                            QPushButton {{
                                background: {c};
                                border-radius: 12px;
                                border: 3px solid {c};
                            }}
                        """)
                    else:
                        # Unselected style - no icon
                        b.setIcon(QIcon())  # Empty icon
                        b.setStyleSheet(f"""
                            QPushButton {{
                                background: {c};
                                border-radius: 12px;
                                border: 2px solid transparent;
                            }}
                            QPushButton:hover {{
                                border: 2px solid white;
                                transform: scale(1.05);
                            }}
                        """)
            return handler
        
        # Create 2 rows of 6 colors each
        row1 = QHBoxLayout()
        row1.setSpacing(16)  # Tăng từ 12 lên 16
        row2 = QHBoxLayout()
        row2.setSpacing(16)  # Tăng từ 12 lên 16
        
        for i, color in enumerate(colors):
            btn = QPushButton()
            btn.setFixedSize(50, 50)
            btn.setCursor(QCursor(Qt.PointingHandCursor))
            color_buttons.append((btn, color))
            
            if i < 6:
                row1.addWidget(btn)
            else:
                row2.addWidget(btn)
        
        # Connect click handlers
        for btn, color in color_buttons:
            btn.clicked.connect(make_select_handler(color, btn, color_buttons))
        
        # Set initial selection (first color)
        for btn, color in color_buttons:
            if color == colors[0]:
                btn.setIcon(create_icon('fa5s.check', color='white'))
                btn.setIconSize(QSize(18, 18))
                btn.setStyleSheet(f"""
                    QPushButton {{
                        background: {color};
                        border-radius: 12px;
                        border: 3px solid {color};
                    }}
                """)
            else:
                btn.setIcon(QIcon())  # Empty icon
                btn.setStyleSheet(f"""
                    QPushButton {{
                        background: {color};
                        border-radius: 12px;
                        border: 2px solid transparent;
                    }}
                    QPushButton:hover {{
                        border: 2px solid white;
                    }}
                """)
        
        layout.addLayout(row1)
        layout.addLayout(row2)
        layout.addStretch()
        
        # Action buttons
        buttons_layout = QHBoxLayout()
        buttons_layout.setSpacing(16)  # Tăng từ 12 lên 16
        
        # Cancel button - neutral gray
        cancel_btn = QPushButton(self.t("cancel"))
        cancel_btn.setFixedHeight(44)
        cancel_btn.setCursor(QCursor(Qt.PointingHandCursor))
        
        if is_light:
            cancel_btn.setStyleSheet("""
                QPushButton {
                    background: #f3f4f6;
                    color: #6b7280;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 14px;
                    border: none;
                }
                QPushButton:hover {
                    background: #e5e7eb;
                    color: #4b5563;
                }
            """)
        else:
            cancel_btn.setStyleSheet("""
                QPushButton {
                    background: #1e293b;
                    color: #94a3b8;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 14px;
                    border: none;
                }
                QPushButton:hover {
                    background: #334155;
                    color: #cbd5e1;
                }
            """)
        
        cancel_btn.clicked.connect(dialog.reject)
        buttons_layout.addWidget(cancel_btn)
        
        # Create button - vibrant gradient purple
        create_btn = QPushButton(self.t("create"))
        create_btn.setFixedHeight(44)
        create_btn.setCursor(QCursor(Qt.PointingHandCursor))
        create_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #a78bfa,
                    stop:1 #8b5cf6);
                color: white;
                border-radius: 10px;
                font-weight: 700;
                font-size: 14px;
                border: none;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #c4b5fd,
                    stop:1 #a78bfa);
            }
            QPushButton:pressed {
                background: #7c3aed;
            }
        """)
        
        def create_group():
            group_name = name_input.toPlainText().strip()
            if group_name and group_name not in self.groups:
                self.groups.append(group_name)
                self.group_colors[group_name] = selected_color[0]
                self.save_data()
                refresh_callback()
                dialog.accept()
            elif not group_name:
                QMessageBox.warning(dialog, self.t("error"), self.t("enter_name"))
            else:
                QMessageBox.warning(dialog, self.t("error"), self.t("group_exists"))
        
        create_btn.clicked.connect(create_group)
        buttons_layout.addWidget(create_btn)
        
        layout.addLayout(buttons_layout)
        
        dialog.exec()
    
    def quick_add_group(self):
        """Quick add group dialog - Modern UI"""
        self.show_add_group_dialog(self, self.refresh_groups_list)
    

    def select_working_group(self, group):
        """Chọn nhóm để làm việc - chuyển sang màn hình notes"""
        self.current_group = group
        
        # Update label
        count = sum(1 for n in self.notes if n.get("group") == group)
        color = self.get_group_color(group)
        self.current_group_label.setText(f"🏷️ {group} ({count})")
        self.current_group_label.setStyleSheet(f"""
            color: white;
            font-size: 16px;
            font-weight: bold;
            background-color: {color};
            padding: 8px 16px;
            border-radius: 10px;
        """)
        
        # Refresh notes and switch screen
        self.refresh_notes_list()
        self.notes_stack.setCurrentIndex(1)  # Switch to notes management screen
    
    def go_back_to_group_selection(self):
        """Quay lại màn hình chọn nhóm"""
        self.current_group = None
        self.notes_stack.setCurrentIndex(0)  # Switch to group selection screen
        self.refresh_groups_list()
    
    def show_group_selector_menu(self):
        """Menu để chọn nhóm cho note mới"""
        menu = QMenu(self)
        menu.setStyleSheet(CONTEXT_MENU_STYLE)
        
        if self.groups:
            # Sort groups alphabetically
            sorted_groups = sorted(self.groups)
            for group in sorted_groups:
                action = menu.addAction(f"🏷️ {group}")
                action.triggered.connect(lambda checked=False, g=group: self.select_group_for_new_note(g))
        else:
            # Nếu chưa có nhóm, hiển thị thông báo
            no_group = menu.addAction("⚠️ Chưa có nhóm nào")
            no_group.setEnabled(False)
        
        menu.exec(QCursor.pos())
    
    def select_group_for_new_note(self, group):
        """Chọn nhóm cho note mới"""
        self._selected_group_for_new_note = group
        color = self.get_group_color(group)
        self.note_group_selector.setText(f"🏷️ {group}")
        self.note_group_selector.setStyleSheet(f"""
            QPushButton {{
                background-color: {color};
                color: white;
                padding: 5px 12px;
                border-radius: 8px;
                font-size: 11px;
                border: none;
                text-align: left;
                font-weight: bold;
            }}
            QPushButton:hover {{
                opacity: 0.8;
            }}
        """)
    
    def show_group_filter_menu(self):
        """Menu để lọc notes theo nhóm"""
        menu = QMenu(self)
        menu.setStyleSheet(CONTEXT_MENU_STYLE)
        
        # Count total notes
        total_notes = len(self.notes)
        all_action = menu.addAction(f"📁 Tất cả ({total_notes})")
        all_action.triggered.connect(lambda checked=False: self.filter_by_group(None))
        
        if self.groups:
            menu.addSeparator()
            # Sort groups alphabetically
            sorted_groups = sorted(self.groups)
            for group in sorted_groups:
                # Count notes in this group
                count = sum(1 for n in self.notes if n.get("group") == group)
                color = self.get_group_color(group)
                action = menu.addAction(f"🏷️ {group} ({count})")
                action.triggered.connect(lambda checked=False, g=group: self.filter_by_group(g))
        
        menu.exec(QCursor.pos())
    
    def filter_by_group(self, group):
        """Lọc notes theo nhóm"""
        if group is None:
            self.current_group = None
            self.group_filter.setText("� Tất cả")
        else:
            self.current_group = group
            self.group_filter.setText(f"🏷️ {group}")
        
        self.refresh_notes_list()
    
    def manage_groups(self):
        """Dialog quản lý nhóm"""
        dialog = QDialog(self)
        dialog.setWindowTitle("⚙️ Quản lý nhóm")
        dialog.setFixedSize(520, 480)
        dialog.setStyleSheet(self.styles["DIALOG"])
        
        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(18)
        
        # Title with FA icon
        title_container = QHBoxLayout()
        title_icon = QLabel()
        colors = ThemeColors.LIGHT if self.current_theme_mode == "light" else ThemeColors.DARK
        title_icon.setPixmap(qta.icon('fa5s.folder-open', color=colors['accent']).pixmap(QSize(22, 22)))
        title_container.addWidget(title_icon)
        
        title = QLabel("Quản lý nhóm ghi chú")
        title.setStyleSheet("font-size: 18px; font-weight: 700; margin-left: 8px;")
        title_container.addWidget(title, 1)
        
        layout.addLayout(title_container)
        
        # Groups list (define early so refresh_list is available)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet(self.styles["SCROLL"])
        
        groups_container = QWidget()
        groups_container.setStyleSheet("background: transparent;")  # Transparent background
        groups_layout = QVBoxLayout(groups_container)
        groups_layout.setContentsMargins(0, 0, 0, 0)
        groups_layout.setSpacing(8)
        
        def refresh_list():
            # Define colors for theme-aware styling
            colors = ThemeColors.LIGHT if self.current_theme_mode == "light" else ThemeColors.DARK
            
            # Clear
            while groups_layout.count():
                item = groups_layout.takeAt(0)
                if item.widget():
                    item.widget().deleteLater()
            
            # Add groups
            if not self.groups:
                empty = QLabel("Chưa có nhóm nào")
                empty.setStyleSheet("color: #6b7280; padding: 20px; letter-spacing: 0.3px;")
                empty.setAlignment(Qt.AlignCenter)
                empty.setAlignment(Qt.AlignCenter)
                groups_layout.addWidget(empty)
            else:
                # Sort groups alphabetically
                sorted_groups = sorted(self.groups)
                for group in sorted_groups:
                    color = self.get_group_color(group)
                    # Parse color
                    r, g, b = int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)
                    
                    group_card = QFrame()
                    # Cleaner style: subtle tinted background, no gradient
                    is_light = self.current_theme_mode == "light"
                    bg_alpha = "0.08" if is_light else "0.12"
                    border_alpha = "0.3" if is_light else "0.25"
                    
                    group_card.setStyleSheet(f"""
                        QFrame {{
                            background: rgba({r}, {g}, {b}, {bg_alpha});
                            border-radius: 12px;
                            border: 1px solid rgba({r}, {g}, {b}, {border_alpha});
                            padding: 10px 14px;
                        }}
                        QFrame:hover {{
                            background: rgba({r}, {g}, {b}, 0.15);
                            border: 1px solid rgba({r}, {g}, {b}, 0.4);
                        }}
                    """)
                    
                    card_layout = QHBoxLayout(group_card)
                    card_layout.setContentsMargins(8, 8, 8, 8)
                    card_layout.setSpacing(10)
                    
                    # Group icon + label
                    label_layout = QHBoxLayout()
                    label_layout.setSpacing(8)
                    
                    icon_label = QLabel()
                    icon_color = f"#{r:02x}{g:02x}{b:02x}"
                    icon_label.setPixmap(qta.icon('fa5s.folder', color=icon_color).pixmap(QSize(16, 16)))
                    label_layout.addWidget(icon_label)
                    
                    label = QLabel(group)
                    text_color = colors['text_primary']
                    label.setStyleSheet(f"color: {text_color}; font-size: 14px; font-weight: 600; background: transparent;")
                    label_layout.addWidget(label)
                    
                    card_layout.addLayout(label_layout, 1)
                    
                    # Count notes in group
                    count = sum(1 for n in self.notes if n.get("group") == group)
                    count_label = QLabel(f"{count}")
                    count_label.setStyleSheet("color: rgba(200, 200, 230, 0.85); font-size: 12px; font-weight: 500; background: transparent;")
                    card_layout.addWidget(count_label)
                    
                    # Rename button
                    rename_btn = QPushButton()
                    rename_btn.setIcon(qta.icon('fa5s.edit', color='#a78bfa'))
                    rename_btn.setIconSize(QSize(14, 14))
                    rename_btn.setFixedSize(34, 34)
                    rename_btn.setCursor(QCursor(Qt.PointingHandCursor))
                    rename_btn.setToolTip("Đổi tên nhóm")
                    rename_btn.setStyleSheet("""
                        QPushButton {
                            background: rgba(139, 92, 246, 0.15);
                            border-radius: 8px;
                            border: 1px solid rgba(139, 92, 246, 0.3);
                        }
                        QPushButton:hover {
                            background: rgba(139, 92, 246, 0.3);
                            border: 1px solid rgba(139, 92, 246, 0.5);
                        }
                    """)
                    
                    def make_rename_handler(group_name):
                        def rename_group():
                            from PySide6.QtWidgets import QInputDialog, QLineEdit
                            
                            # Custom Input Dialog for translation & style
                            input_dialog = QInputDialog(dialog)
                            input_dialog.setWindowTitle(self.t("rename_group"))
                            input_dialog.setLabelText(self.t("new_name_for_group", group_name))
                            input_dialog.setTextValue(group_name)
                            input_dialog.setOkButtonText(self.t("save"))
                            input_dialog.setCancelButtonText(self.t("cancel"))
                            input_dialog.setStyleSheet(self.styles["DIALOG"])
                            
                            ok = input_dialog.exec()
                            new_name = input_dialog.textValue()
                            if ok and new_name.strip() and new_name != group_name:
                                new_name = new_name.strip()
                                if new_name not in self.groups:
                                    # Update group name
                                    idx = self.groups.index(group_name)
                                    self.groups[idx] = new_name
                                    # Update notes
                                    for note in self.notes:
                                        if note.get("group") == group_name:
                                            note["group"] = new_name
                                    # Update color mapping
                                    if group_name in self.group_colors:
                                        self.group_colors[new_name] = self.group_colors[group_name]
                                        del self.group_colors[group_name]
                                    self.save_data()
                                    self.refresh_notes_list()
                                    refresh_list()
                                else:
                                    QMessageBox.warning(dialog, "Lỗi", "Tên nhóm đã tồn tại!")
                        return rename_group
                    
                    rename_btn.clicked.connect(make_rename_handler(group))
                    card_layout.addWidget(rename_btn)
                    
                    delete_btn = QPushButton()
                    colors = ThemeColors.LIGHT if self.current_theme_mode == "light" else ThemeColors.DARK
                    delete_btn.setIcon(qta.icon('fa5s.trash-alt', color=colors['danger']))
                    delete_btn.setIconSize(QSize(14, 14))
                    delete_btn.setFixedSize(34, 34)
                    delete_btn.setCursor(QCursor(Qt.PointingHandCursor))
                    delete_btn.setToolTip("Xóa nhóm")
                    delete_btn.setStyleSheet("""
                        QPushButton {
                            background: rgba(239, 68, 108, 0.15);
                            border-radius: 8px;
                            border: 1px solid rgba(239, 68, 108, 0.3);
                        }
                        QPushButton:hover {
                            background: rgba(239, 68, 108, 0.3);
                            border: 1px solid rgba(239, 68, 108, 0.5);
                        }
                    """)
                    
                    def make_delete_handler(group_name):
                        def delete_group():
                            msg_box = QMessageBox(dialog)
                            msg_box.setWindowTitle(self.t("confirm"))
                            msg_box.setText(self.t("delete_group_confirm", group_name))
                            msg_box.setIcon(QMessageBox.Question)
                            
                            yes_btn = msg_box.addButton(self.t("yes"), QMessageBox.YesRole)
                            no_btn = msg_box.addButton(self.t("no"), QMessageBox.NoRole)
                            
                            msg_box.setStyleSheet(self.styles["DIALOG"])
                            msg_box.exec()
                            
                            if msg_box.clickedButton() == yes_btn:
                                self.groups.remove(group_name)
                                # Remove group from notes
                                for note in self.notes:
                                    if note.get("group") == group_name:
                                        note["group"] = None
                                self.save_data()
                                self.refresh_notes_list()
                                self.refresh_groups_list()
                                refresh_list()
                        return delete_group
                    
                    delete_btn.clicked.connect(make_delete_handler(group))
                    card_layout.addWidget(delete_btn)
                    
                    groups_layout.addWidget(group_card)
            
            groups_layout.addStretch()
        
        # Add new group button (cleaner style)
        add_group_btn = QPushButton()
        add_group_btn.setText("Tạo nhóm mới")
        add_group_btn.setIcon(qta.icon('fa5s.plus-circle', color='white'))
        add_group_btn.setIconSize(QSize(16, 16))
        add_group_btn.setFixedHeight(42)
        add_group_btn.setCursor(QCursor(Qt.PointingHandCursor))
        add_group_btn.setStyleSheet(self.styles["ADD_BTN"])
        add_group_btn.clicked.connect(lambda: self.show_add_group_dialog(dialog, refresh_list))
        
        layout.addWidget(add_group_btn)
        
        refresh_list()
        scroll.setWidget(groups_container)
        layout.addWidget(scroll, 1)
        
        # Close button (clean neutral style)
        close_btn = QPushButton()
        close_btn.setText("Đóng")
        close_btn.setIcon(qta.icon('fa5s.times', color=colors['text_secondary']))
        close_btn.setIconSize(QSize(14, 14))
        close_btn.setFixedHeight(40)
        close_btn.setCursor(QCursor(Qt.PointingHandCursor))
        # Inline neutral style
        bg_color = "#f8fafc" if self.current_theme_mode == "light" else "rgba(148, 163, 184, 0.1)"
        text_color_btn = colors['text_primary']
        border_color = colors['border']
        hover_bg = "#e2e8f0" if self.current_theme_mode == "light" else "rgba(148, 163, 184, 0.2)"
        close_btn.setStyleSheet(f"""
            QPushButton {{
                background: {bg_color};
                color: {text_color_btn};
                border: 1px solid {border_color};
                border-radius: 8px;
                font-weight: 600;
                padding: 8px 16px;
            }}
            QPushButton:hover {{
                background: {hover_bg};
            }}
        """)
        close_btn.clicked.connect(dialog.accept)
        layout.addWidget(close_btn)
        
        dialog.exec()
    
    def rename_group_inline(self, group_name):
        # Rename group from swipe action
        from PySide6.QtWidgets import QInputDialog, QLineEdit
        
        input_dialog = QInputDialog(self)
        input_dialog.setWindowTitle(self.t("rename_group"))
        input_dialog.setLabelText(self.t("new_name_for_group", group_name))
        input_dialog.setTextValue(group_name)
        input_dialog.setOkButtonText(self.t("save"))
        input_dialog.setCancelButtonText(self.t("cancel"))
        input_dialog.setStyleSheet(self.styles["DIALOG"])
        
        ok = input_dialog.exec()
        new_name = input_dialog.textValue()
        if ok and new_name.strip() and new_name != group_name:
            new_name = new_name.strip()
            if new_name not in self.groups:
                idx = self.groups.index(group_name)
                self.groups[idx] = new_name
                for note in self.notes:
                    if note.get("group") == group_name:
                        note["group"] = new_name
                if group_name in self.group_colors:
                    self.group_colors[new_name] = self.group_colors[group_name]
                    del self.group_colors[group_name]
                self.save_data()
                self.refresh_notes_list()
                self.refresh_groups_list()
            else:
                QMessageBox.warning(self, self.t("error"), self.t("group_exists"))
    
    def show_group_context_menu(self, group_name):
        menu = QMenu(self)
        menu.setStyleSheet(self.styles.get("MENU", ""))
        
        rename_action = menu.addAction(create_icon('fa5s.edit', color='#3b82f6'), self.t("rename_group"))
        del_action = menu.addAction(create_icon('fa5s.trash-alt', color='#ef4444'), self.t("delete_group"))
        
        action = menu.exec(QCursor.pos())
        if action == rename_action:
            self.rename_group_inline(group_name)
        elif action == del_action:
            self.delete_group_inline(group_name)
            
    def delete_group_inline(self, group_name):
        # Delete group from swipe action
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle(self.t("confirm"))
        msg_box.setText(self.t("delete_group_confirm", group_name))
        msg_box.setIcon(QMessageBox.Question)
        
        yes_btn = msg_box.addButton(self.t("yes"), QMessageBox.YesRole)
        no_btn = msg_box.addButton(self.t("no"), QMessageBox.NoRole)
        
        msg_box.setStyleSheet(self.styles["DIALOG"])
        msg_box.exec()
        
        if msg_box.clickedButton() == yes_btn:

            self.groups.remove(group_name)
            for note in self.notes:
                if note.get("group") == group_name:
                    note["group"] = None
            self.save_data()
            self.refresh_notes_list()
            self.refresh_groups_list()
    
    def save_data(self):
        with self.save_lock:
            try:
                data = {
                    "notes": self.notes,
                    "groups": self.groups,
                    "group_colors": self.group_colors,
                    "clipboard_history": self.clipboard_history
                }
                with open(self.data_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            except:
                pass
    
    def load_data(self):
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    
                    # Load notes - convert old format to new format
                    notes = data.get("notes", [])
                    self.notes = []
                    for note in notes:
                        if isinstance(note, str):
                            # Old format - convert to new
                            self.notes.append({
                                "content": note,
                                "group": None,
                                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M")
                            })
                        else:
                            # New format
                            self.notes.append(note)
                    
                    self.groups = data.get("groups", [])
                    self.group_colors = data.get("group_colors", {})
                    self.clipboard_history = data.get("clipboard_history", [])
            except:
                pass
    
    def closeEvent(self, event):
        # Lưu trạng thái maximize trước khi ẩn
        self._was_maximized = self.isMaximized()
        event.ignore()
        self.hide()
    
    def changeEvent(self, event):
        # Khi minimize, lưu trạng thái maximize
        if event.type() == event.Type.WindowStateChange:
            if self.isMinimized():
                self._was_maximized = self.windowState() & Qt.WindowMaximized
        super().changeEvent(event)


    def load_theme_setting(self):
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r") as f:
                    settings = json.load(f)
                    return settings.get("theme", "light")
        except:
            pass
        return "light"

    def save_theme_setting(self):
        try:
            settings = {}
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r") as f:
                    settings = json.load(f)
            
            settings["theme"] = self.current_theme_mode
            with open(self.settings_file, "w") as f:
                json.dump(settings, f)
        except:
            pass
    
    def load_language_setting(self):
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r") as f:
                    settings = json.load(f)
                    return settings.get("language", "vi")  # Default Vietnamese
        except:
            pass
        return "vi"
    
    def save_language_setting(self):
        try:
            settings = {}
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r") as f:
                    settings = json.load(f)
            
            settings["language"] = self.current_language
            with open(self.settings_file, "w") as f:
                json.dump(settings, f)
        except:
            pass
    
    def load_bubble_settings(self):
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r") as f:
                    settings = json.load(f)
                    self.custom_bubble_icon = settings.get("bubble_icon", None)
                    self.bubble_size = settings.get("bubble_size", 60)
            else:
                self.custom_bubble_icon = None
                self.bubble_size = 60
        except:
            self.custom_bubble_icon = None
            self.bubble_size = 60
    
    def save_bubble_settings(self):
        try:
            settings = {}
            if os.path.exists(self.settings_file):
                with open(self.settings_file, "r") as f:
                    settings = json.load(f)
            
            settings["bubble_icon"] = self.custom_bubble_icon
            settings["bubble_size"] = getattr(self, 'bubble_size', 60)
            
            with open(self.settings_file, "w") as f:
                json.dump(settings, f)
        except:
            pass
    
    def toggle_language(self):
        """Toggle between English and Vietnamese"""
        self.current_language = "en" if self.current_language == "vi" else "vi"
        self.save_language_setting()
        # Refresh UI to apply translations
        self.apply_translations()
    
    def apply_translations(self):
        """Apply translations to UI elements"""
        # Update window title
        self.setWindowTitle(f"{self.t('app_title')}")
        
        # Update header title and subtitle
        if hasattr(self, 'title_label'):
            self.title_label.setText(self.t('app_title').replace(" & ", " \u0026 "))
        if hasattr(self, 'subtitle'):
            self.subtitle.setText(self.t('app_subtitle'))
        
        # Update tab buttons
        if hasattr(self, 'notes_tab_btn'):
            self.notes_tab_btn.setText(self.t('notes_tab'))
        if hasattr(self, 'clipboard_tab_btn'):
            self.clipboard_tab_btn.setText(self.t('clipboard_tab'))
        
        # Update tooltips
        if hasattr(self, 'settings_btn'):
            self.settings_btn.setToolTip(self.t('settings'))
        if hasattr(self, 'pin_btn'):
            self.pin_btn.setToolTip(self.t('always_on_top'))
        
        # Update tray icon
        if hasattr(self, 'tray_icon'):
            self.tray_icon.setToolTip(self.t('app_title'))
            # Update tray menu
            if hasattr(self, 'tray_icon'):
                menu = self.tray_icon.contextMenu()
                if menu:
                    actions = menu.actions()
                    if len(actions) >= 2:
                        actions[0].setText(self.t('show_app'))
                        actions[2].setText(self.t('quit'))  # After separator
        
        # Refresh lists to update any text
        self.refresh_notes_list()
        self.refresh_groups_list()
        self.refresh_clipboard_list()

    def toggle_theme(self):
        self.current_theme_mode = "dark" if self.current_theme_mode == "light" else "light"
        self.styles = AppTheme.get_styles(self.current_theme_mode)
        self.save_theme_setting()
        self.apply_theme()
        self.update_header_icons()

    def show_settings_dialog(self):
        """Modern Settings Dialog"""
        dialog = QDialog(self)
        dialog.setWindowTitle(self.t("settings"))
        dialog.setFixedSize(450, 600)  # Tăng height để hiển thị đầy đủ custom bubble settings và presets
        
        is_light = self.current_theme_mode == "light"
        bg = "#ffffff" if is_light else "#0a0a0a"
        text_primary = "#1f2937" if is_light else "#f5f5f5"
        text_secondary = "#6b7280" if is_light else "#a0a0a0"
        
        dialog.setStyleSheet(f"""
            QDialog {{
                background: {bg};
                border-radius: 16px;
            }}
        """)
        
        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(20)
        
        # Title
        title = QLabel(f"⚙️  {self.t('settings')}")
        title.setStyleSheet(f"""
            font-size: 24px;
            font-weight: 700;
            color: {text_primary};
            margin-bottom: 10px;
        """)
        layout.addWidget(title)
        
        # Theme Setting
        theme_container = QFrame()
        theme_layout = QHBoxLayout(theme_container)
        theme_layout.setContentsMargins(0, 0, 0, 0)
        
        theme_label = QLabel(f"{self.t('theme')}:")
        theme_label.setStyleSheet(f"color: {text_primary}; font-size: 15px; font-weight: 600;")
        theme_layout.addWidget(theme_label)
        
        theme_layout.addStretch()
        
        # Toggle switch style button
        theme_toggle_btn = QPushButton(self.t('dark') if is_light else self.t('light'))
        theme_toggle_btn.setFixedSize(130, 44)
        theme_toggle_btn.setCursor(QCursor(Qt.PointingHandCursor))
        theme_toggle_btn.setStyleSheet(f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #a78bfa,
                    stop:1 #8b5cf6);
                color: white;
                border-radius: 10px;
                font-weight: 700;
                font-size: 14px;
                border: none;
            }}
            QPushButton:hover {{
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #c4b5fd,
                    stop:1 #a78bfa);
            }}
            QPushButton:pressed {{
                background: #7c3aed;
            }}
        """)
        
        def toggle_and_update():
            self.toggle_theme()
            dialog.close()
            QTimer.singleShot(100, self.show_settings_dialog)
        
        theme_toggle_btn.clicked.connect(toggle_and_update)
        theme_layout.addWidget(theme_toggle_btn)
        
        layout.addWidget(theme_container)
        
        # Language Setting
        lang_container = QFrame()
        lang_layout = QHBoxLayout(lang_container)
        lang_layout.setContentsMargins(0, 0, 0, 0)
        
        lang_label = QLabel(f"{self.t('language')}:")
        lang_label.setStyleSheet(f"color: {text_primary}; font-size: 15px; font-weight: 600;")
        lang_layout.addWidget(lang_label)
        
        lang_layout.addStretch()
        
        # Language toggle button
        lang_toggle_btn = QPushButton(self.t('english') if self.current_language == "vi" else self.t('vietnamese'))
        lang_toggle_btn.setFixedSize(150, 44)
        lang_toggle_btn.setCursor(QCursor(Qt.PointingHandCursor))
        lang_toggle_btn.setStyleSheet(f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #3b82f6,
                    stop:1 #2563eb);
                color: white;
                border-radius: 10px;
                font-weight: 700;
                font-size: 14px;
                border: none;
            }}
            QPushButton:hover {{
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #60a5fa,
                    stop:1 #3b82f6);
            }}
            QPushButton:pressed {{
                background: #047857;
            }}
        """)
        
        def toggle_lang_and_update():
            self.toggle_language()
            dialog.accept()  # Chỉ đóng dialog, không reopen
        
        lang_toggle_btn.clicked.connect(toggle_lang_and_update)
        lang_layout.addWidget(lang_toggle_btn)
        
        layout.addWidget(lang_container)
        
        # Define colors for bubble group frame
        bubble_bg = "#f8fafc" if is_light else "#1e1e1e"
        bubble_border = "#e2e8f0" if is_light else "rgba(128, 128, 128, 0.2)"
        
        # Custom Bubble Settings Container
        bubble_group = QFrame()
        bubble_group.setStyleSheet(f"""
            QFrame {{
                background: {bubble_bg};
                border-radius: 12px;
                border: none;
            }}
        """)
        bubble_group_layout = QVBoxLayout(bubble_group)
        bubble_group_layout.setContentsMargins(15, 15, 15, 15)
        bubble_group_layout.setSpacing(15)
        
        # 0. Preset Selection Row
        preset_row = QHBoxLayout()
        
        # Preset label with FontAwesome icon
        preset_label_widget = QWidget()
        preset_label_layout = QHBoxLayout(preset_label_widget)
        preset_label_layout.setContentsMargins(0, 0, 0, 0)
        preset_label_layout.setSpacing(8)
        
        preset_icon = QLabel()
        preset_icon.setPixmap(create_icon('fa5s.palette', color='#8b5cf6').pixmap(QSize(18, 18)))
        preset_label_layout.addWidget(preset_icon)
        
        preset_text = QLabel(f"{self.t('bubble_character')}:")
        preset_text.setStyleSheet(f"color: {text_primary}; font-size: 15px; font-weight: 600;")
        preset_label_layout.addWidget(preset_text)
        
        preset_row.addWidget(preset_label_widget)
        preset_row.addStretch()
        
        # Preset ComboBox
        from PySide6.QtWidgets import QComboBox
        preset_combo = QComboBox()
        preset_combo.setFixedSize(200, 32)
        
        # Define colors to avoid f-string syntax issues with hash characters inside curly braces
        combo_bg = "#ffffff" if is_light else "#2d2d2d"
        combo_border = "#cbd5e1" if is_light else "#4b5563"
        combo_view_border = "#e2e8f0" if is_light else "#404040"
        
        preset_combo.setStyleSheet(f"""
            QComboBox {{
                background: {combo_bg};
                color: {text_primary};
                border: 1px solid {combo_border};
                border-radius: 6px;
                padding-left: 8px;
                font-weight: 500;
                font-size: 12px;
            }}
            QComboBox::drop-down {{
                border: none;
                width: 25px;
            }}
            QComboBox::down-arrow {{
                image: none;
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-top: 4px solid {text_secondary};
                margin-top: 2px;
            }}
            QComboBox QAbstractItemView {{
                background: {combo_bg};
                color: {text_primary};
                border: 1px solid {combo_view_border};
                border-radius: 6px;
                selection-background-color: #8b5cf6;
                selection-color: white;
                outline: none;
            }}
        """)
        
        preset_combo.addItem(self.t('preset_default'), None)
        preset_combo.addItem(self.t('preset_cat'), "bubble_frames/cat")
        preset_combo.addItem(self.t('preset_shiba'), "bubble_frames/shiba")
        preset_combo.addItem(self.t('preset_ghost'), "bubble_frames/ghost")
        preset_combo.addItem(self.t('preset_penguin'), "bubble_frames/penguin")
        
        # Check current icon path to select corresponding item
        current_icon = self.custom_bubble_icon
        presets_map = {
            None: 0,
            "bubble_frames/cat": 1,
            "bubble_frames/shiba": 2,
            "bubble_frames/ghost": 3,
            "bubble_frames/penguin": 4
        }
        
        normalized_icon = current_icon
        if current_icon:
            # Check ends with for relative/absolute equivalence
            for key in presets_map.keys():
                if key and (current_icon == key or current_icon.replace("\\", "/").replace("\\", "/").endswith(key)):
                    normalized_icon = key
                    break
                    
        if normalized_icon in presets_map:
            preset_combo.setCurrentIndex(presets_map[normalized_icon])
        else:
            # User has set a custom file/folder path manually
            preset_combo.addItem(self.t('preset_custom'), current_icon)
            preset_combo.setCurrentIndex(5)
            
        def on_preset_changed(index):
            if index < 0 or index >= preset_combo.count():
                return
            selected_data = preset_combo.itemData(index)
            self.custom_bubble_icon = selected_data
            self.save_bubble_settings()
            if hasattr(self, 'bubble'):
                self.bubble.update_appearance()
            
            # If changed back to built-in presets, remove the temporary custom item
            if preset_combo.count() > 5 and index < 5:
                preset_combo.removeItem(5)
                
        preset_combo.currentIndexChanged.connect(on_preset_changed)
        preset_row.addWidget(preset_combo)
        bubble_group_layout.addLayout(preset_row)
        
        # 1. Custom Icon Row
        icon_row = QHBoxLayout()
        
        # Icon label with FontAwesome icon
        icon_label_widget = QWidget()
        icon_label_layout = QHBoxLayout(icon_label_widget)
        icon_label_layout.setContentsMargins(0, 0, 0, 0)
        icon_label_layout.setSpacing(8)
        
        icon_icon = QLabel()
        icon_icon.setPixmap(create_icon('fa5s.sticky-note', color='#8b5cf6').pixmap(QSize(18, 18)))
        icon_label_layout.addWidget(icon_icon)
        
        icon_text = QLabel(f"{{self.t('custom_upload')}}:")
        icon_text.setStyleSheet(f"color: {{text_primary}}; font-size: 15px; font-weight: 600;")
        icon_row.addWidget(icon_label_widget)
        icon_row.addStretch()
        
        # Upload & Reset Buttons
        upload_btn = QPushButton(self.t('upload'))
        upload_btn.setFixedSize(80, 32)
        upload_btn.setCursor(QCursor(Qt.PointingHandCursor))
        upload_btn.setStyleSheet(f"""
            QPushButton {{
                background: #3b82f6;
                color: white;
                border-radius: 6px;
                font-weight: 600;
                font-size: 12px;
                border: none;
            }}
            QPushButton:hover {{
                background: #2563eb;
            }}
        """)
        
        reset_btn = QPushButton(self.t('reset'))
        reset_btn.setFixedSize(80, 32)
        reset_btn.setCursor(QCursor(Qt.PointingHandCursor))
        reset_btn_bg = "#f3f4f6" if is_light else "#252525"
        reset_btn_fg = "#6b7280" if is_light else "#a0a0a0"
        reset_btn.setStyleSheet(f"""
            QPushButton {{
                background: {reset_btn_bg};
                color: {reset_btn_fg};
                border-radius: 6px;
                font-weight: 600;
                font-size: 12px;
                border: none;
            }}
            QPushButton:hover {{
                background: #e5e7eb;
                color: #4b5563;
            }}
        """)
        
        def upload_custom_icon():
            from PySide6.QtWidgets import QFileDialog
            file_path, _ = QFileDialog.getOpenFileName(dialog, "Chọn ảnh tĩnh", "", "Images (*.png *.jpg *.jpeg *.bmp)")
            if file_path:
                self.custom_bubble_icon = file_path
                self.save_bubble_settings()
                if hasattr(self, 'bubble'): self.bubble.update_appearance()
                
                # Sync combobox
                preset_combo.blockSignals(True)
                if preset_combo.count() > 5:
                    preset_combo.removeItem(5)
                preset_combo.addItem(self.t('preset_custom'), file_path)
                preset_combo.setCurrentIndex(5)
                preset_combo.blockSignals(False)
                
        def upload_custom_folder():
            from PySide6.QtWidgets import QFileDialog
            folder_path = QFileDialog.getExistingDirectory(dialog, "Chọn thư mục hoạt ảnh")
            if folder_path:
                self.custom_bubble_icon = folder_path
                self.save_bubble_settings()
                if hasattr(self, 'bubble'): self.bubble.update_appearance()
                
                # Sync combobox
                preset_combo.blockSignals(True)
                if preset_combo.count() > 5:
                    preset_combo.removeItem(5)
                preset_combo.addItem(self.t('preset_custom'), folder_path)
                preset_combo.setCurrentIndex(5)
                preset_combo.blockSignals(False)
                
        def reset_icon():
            self.custom_bubble_icon = None
            self.save_bubble_settings()
            if hasattr(self, 'bubble'): self.bubble.update_appearance()
            
            # Sync combobox
            preset_combo.blockSignals(True)
            if preset_combo.count() > 5:
                preset_combo.removeItem(5)
            preset_combo.setCurrentIndex(0)
            preset_combo.blockSignals(False)
 
        # Update Layout to include new button
        upload_btn.setText("Chọn Ảnh")
        upload_btn.setToolTip("Chọn 1 ảnh tĩnh")
        upload_btn.clicked.connect(upload_custom_icon)
        
        folder_btn = QPushButton("Chọn Folder")
        folder_btn.setFixedSize(90, 32)
        folder_btn.setCursor(QCursor(Qt.PointingHandCursor))
        folder_btn.setStyleSheet(upload_btn.styleSheet()) # Copy style from upload button
        folder_btn.setToolTip("Chọn thư mục chứa nhiều ảnh để tạo hình động")
        folder_btn.clicked.connect(upload_custom_folder)
        
        reset_btn.clicked.connect(reset_icon)
        
        icon_row.addWidget(upload_btn)
        icon_row.addWidget(folder_btn)
        icon_row.addWidget(reset_btn)
        bubble_group_layout.addLayout(icon_row)
        
        # 2. Bubble Size Row
        size_row = QHBoxLayout()
        
        # Size label with FontAwesome icon
        size_label_widget = QWidget()
        size_label_layout = QHBoxLayout(size_label_widget)
        size_label_layout.setContentsMargins(0, 0, 0, 0)
        size_label_layout.setSpacing(8)
        
        size_icon = QLabel()
        size_icon.setPixmap(create_icon('fa5s.expand-arrows-alt', color='#8b5cf6').pixmap(QSize(16, 16)))
        size_label_layout.addWidget(size_icon)
        
        size_text = QLabel(f"{self.t('size')}:")
        size_text.setStyleSheet(f"color: {text_primary}; font-size: 15px; font-weight: 600;")
        size_label_layout.addWidget(size_text)
        
        size_row.addWidget(size_label_widget)
        
        size_row.addStretch()
        
        # Slider
        from PySide6.QtWidgets import QSlider
        current_size = getattr(self, 'bubble_size', 60)
        
        size_slider = QSlider(Qt.Horizontal)
        size_slider.setRange(30, 120)
        size_slider.setValue(current_size)
        size_slider.setFixedWidth(120)
        
        size_value_label = QLabel(f"{current_size}px")
        size_value_label.setStyleSheet(f"color: {text_primary}; font-weight: 600; min-width: 40px; text-align: right;")
        
        def update_size(value):
            size_value_label.setText(f"{value}px")
            self.bubble_size = value
            self.save_bubble_settings()
            if hasattr(self, 'bubble'):
                self.bubble.update_appearance()
        
        size_slider.valueChanged.connect(update_size)
        
        size_row.addWidget(size_slider)
        size_row.addWidget(size_value_label)
        bubble_group_layout.addLayout(size_row)
        
        layout.addWidget(bubble_group)
        
        
        # Separator
        separator = QFrame()
        separator.setFrameShape(QFrame.HLine)
        sep_color = "#e5e7eb" if is_light else "rgba(128, 128, 128, 0.15)"
        separator.setStyleSheet(f"background: {sep_color}; border: none; max-height: 1px;")
        layout.addWidget(separator)
        
        # App Info
        info_label = QLabel(f"{self.t('app_title')}\n{self.t('version')} 1.0")
        info_label.setAlignment(Qt.AlignCenter)
        info_label.setStyleSheet(f"color: {text_secondary}; font-size: 13px; line-height: 1.6;")
        layout.addWidget(info_label)
        
        layout.addStretch()
        
        # Close button
        close_btn = QPushButton(self.t("close"))
        close_btn.setFixedHeight(44)
        close_btn.setCursor(QCursor(Qt.PointingHandCursor))
        
        if is_light:
            close_btn.setStyleSheet("""
                QPushButton {
                    background: #f3f4f6;
                    color: #6b7280;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 14px;
                    border: none;
                }
                QPushButton:hover {
                    background: #e5e7eb;
                    color: #4b5563;
                }
            """)
        else:
            close_btn.setStyleSheet("""
                QPushButton {
                    background: #252525;
                    color: #a0a0a0;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 14px;
                    border: none;
                }
                QPushButton:hover {
                    background: #353535;
                    color: #d0d0d0;
                }
            """)
        
        close_btn.clicked.connect(dialog.accept)
        layout.addWidget(close_btn)
        
        dialog.exec()
    
    def toggle_always_on_top(self):
        """Toggle always on top state"""
        self.always_on_top = not self.always_on_top
        
        if self.always_on_top:
            self.setWindowFlags(self.windowFlags() | Qt.WindowStaysOnTopHint)
        else:
            self.setWindowFlags(self.windowFlags() & ~Qt.WindowStaysOnTopHint)
        
        self.show()  # Re-show to apply flag changes
        self.update_header_icons()

    def update_header_icons(self):
        # Determine base colors
        if self.current_theme_mode == "light":
            base_color = "#1f2937"  # Dark gray
            pin_active_color = ThemeColors.LIGHT['danger']
            pin_inactive_color = ThemeColors.LIGHT['text_secondary']
        else:
            base_color = "#f0f0ff"  # Light white
            pin_active_color = "#ef4444"  # Red
            pin_inactive_color = "#cbd5e1"  # Sáng hơn (Slate-300)
        
        # Pin Icon
        pin_color = pin_active_color if self.always_on_top else pin_inactive_color
        if hasattr(self, 'btn_pin'): self.btn_pin.setIcon(create_icon('fa5s.thumbtack', color=pin_color))

    # Old update_pin_button removed (moved to end of file)
    def copy_to_clipboard(self, content):
        clipboard = QApplication.clipboard()
        clipboard.setText(content)
        self.show_toast("✅ Đã sao chép")

    def show_toast(self, message):
        """Hiển thị thông báo nhỏ tự biến mất (Toast)"""
        # Xóa toast cũ nếu còn
        if hasattr(self, '_current_toast') and self._current_toast:
            self._current_toast.close()
        
        # Tạo label toast
        toast = QLabel(message, self)
        toast.setAlignment(Qt.AlignCenter)
        
        # Style trực tiếp hoặc lấy từ Theme (Theme có "TOAST" style)
        # Đảm bảo style đẹp, nổi bật trên nền
        toast.setStyleSheet(self.styles["TOAST"] if "TOAST" in self.styles else """
            QLabel {
                background-color: #333; color: white; 
                padding: 10px 20px; border-radius: 20px; font-weight: bold;
            }
        """)
        toast.adjustSize()
        
        # Vị trí: Giữa, phía dưới
        x = (self.width() - toast.width()) // 2
        y = self.height() - 80 
        toast.move(x, y)
        
        # Animation: Fade in/Slide (Optionally) or just show
        toast.show()
        toast.raise_()
        
        # Tự động tắt sau 2s
        self._current_toast = toast
        QTimer.singleShot(2000, lambda: toast.close() if toast == self._current_toast else None)

    def apply_theme(self):
        self.setStyleSheet(self.styles["MAIN"])
        
        # Header Styling
        if hasattr(self, 'header_frame'):
            self.header_frame.setStyleSheet(self.styles["HEADER"])
        
        # Update Main Panels style
        if hasattr(self, 'notes_panel'):
            self.notes_panel.setStyleSheet(self.styles["PANEL"])
        if hasattr(self, 'clipboard_panel'):
            self.clipboard_panel.setStyleSheet(self.styles["PANEL"])
            
        # Update Scrollbars
        if hasattr(self, 'notes_scroll'):
            self.notes_scroll.setStyleSheet(self.styles["SCROLL"])
        if hasattr(self, 'clipboard_scroll'):
            self.clipboard_scroll.setStyleSheet(self.styles["SCROLL"])
            
        if hasattr(self, 'tab_container'):
            bg = "#f3f4f6" if self.current_theme_mode == "light" else "rgba(20, 20, 35, 0.6)"
            border = "#e5e7eb" if self.current_theme_mode == "light" else "rgba(255, 255, 255, 0.05)"
            self.tab_container.setStyleSheet(f"""
                background-color: {bg};
                border-radius: 12px;
                border: 1px solid {border};
            """)

        # Buttons
        self.update_tab_buttons()
        
        # Labels
        title_color = "#1f2937" if self.current_theme_mode == "light" else "#f0f0ff"
        if hasattr(self, 'title_label'):
            self.title_label.setStyleSheet(f"color: {title_color}; font-size: 22px; font-weight: 700; background: transparent;")

        # Input & Add Button check
        if hasattr(self, 'note_input'):
             self.note_input.setStyleSheet(self.styles["INPUT"])
        
        if hasattr(self, 'input_widget'):
            for btn in self.input_widget.findChildren(QPushButton):
                btn.setStyleSheet(self.styles["ADD_BTN"])

        # Refresh lists to apply Card styles
        self.refresh_notes_list()
        self.refresh_groups_list()
        self.refresh_clipboard_list()  # Luôn refresh để đồng bộ theme


if __name__ == "__main__":
    # -------------------------------------------------------------------------
    # CHECK SINGLE INSTANCE: Ngăn chặn chạy nhiều instance
    # -------------------------------------------------------------------------
    mutex_name = "Global\\ClipboardNotesManager_Unique_Mutex_v1"
    # Create named mutex
    # Nếu mutex đã tồn tại -> GetLastError sẽ trả về ERROR_ALREADY_EXISTS (183)
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
    last_error = ctypes.windll.kernel32.GetLastError()
    
    if last_error == 183: # ERROR_ALREADY_EXISTS
        # Silent exit if app is already running
        sys.exit(0)
    # -------------------------------------------------------------------------

    # -------------------------------------------------------------------------
    def create_start_menu_shortcut():
        """Tạo shortcut trong Start Menu nếu chưa có (chỉ khi chạy file .exe)"""
        if not getattr(sys, 'frozen', False):
            return

        try:
            exe_path = sys.executable
            app_name = "Clipboard & Notes Manager"
            shortcut_name = f"{app_name}.lnk"
            
            # Đường dẫn đến thư mục Start Menu Programs của user
            start_menu_dir = os.path.join(os.environ["APPDATA"], "Microsoft", "Windows", "Start Menu", "Programs")
            shortcut_path = os.path.join(start_menu_dir, shortcut_name)
            
            # Nếu shortcut chưa tồn tại hoặc EXE đã di chuyển -> Tạo lại
            if not os.path.exists(shortcut_path):
                # Dùng PowerShell để tạo shortcut (không cần thư viện ngoài)
                cmd = f'$s=(New-Object -COM WScript.Shell).CreateShortcut("{shortcut_path}");$s.TargetPath="{exe_path}";$s.Save()'
                subprocess.run(["powershell", "-Command", cmd], check=False, creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception as e:
            print(f"Không thể tạo shortcut: {e}")

    create_start_menu_shortcut()
    # -------------------------------------------------------------------------

    # Set AppUserModelID cho Windows để icon hiển thị đúng trên taskbar
    if sys.platform == 'win32':
        # Đặt AppUserModelID để Windows nhận diện ứng dụng
        myappid = 'bao.clipboardnotes.app.1.0'  # ID duy nhất cho app
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
    
    app = QApplication(sys.argv)
    
    # Thiết lập font chữ hiện đại toàn cục
    font = QFont("Segoe UI", 10)
    app.setFont(font)
    
    app.setQuitOnLastWindowClosed(False)
    
    # Set icon cho app (Windows taskbar sẽ dùng icon này)
    icon_path = os.path.join(os.path.dirname(__file__), "app_icon.png")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))
    
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())
