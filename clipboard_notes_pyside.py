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
    QDialog, QSystemTrayIcon, QMenu, QStackedWidget
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
            # Nếu chạy từ file .exe, thư mục nằm cạnh file .exe
            base_path = os.path.dirname(sys.executable)
        else:
            # Nếu chạy script python
            base_path = os.path.dirname(os.path.abspath(__file__))
            
        self.frames_folder = os.path.join(base_path, "bubble_frames")
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
        """Tải các frame ảnh từ thư mục bubble_frames"""
        if not os.path.exists(self.frames_folder):
            os.makedirs(self.frames_folder)
            return

        files = os.listdir(self.frames_folder)
        image_files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
        image_files.sort() # Sắp xếp Alpha-Beta (A-Z)
        
        self.frames = []
        for f in image_files:
            pix = QPixmap(os.path.join(self.frames_folder, f))
            if not pix.isNull():
                self.frames.append(pix)
        
        if self.frames:
            self.current_frame_index = 0
            print(f"Loaded {len(self.frames)} frames for animation.")

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
        if self.main_window.isVisible() and not self.main_window.isMinimized():
            # Nếu đang hiện -> Ẩn đi (Minimize để giữ icon taskbar)
            self.main_window._was_maximized = self.main_window.isMaximized()
            self.main_window.showMinimized()
        else:
            # Nếu đang ẩn -> Hiện lên
            if hasattr(self.main_window, '_was_maximized') and self.main_window._was_maximized:
                self.main_window.showMaximized()
            else:
                self.main_window.showNormal()
            self.main_window.activateWindow() # Đưa lên trên cùng
            self.main_window.raise_()
    
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
    Thẻ widget để hiển thị một ghi chú hoặc một mục clipboard.
    Cung cấp giao diện sạch sẽ với nút menu 3 chấm để Sửa/Xóa.
    """
    def __init__(self, parent, app, data, index, is_note=False, group_name=None):
        super().__init__(parent)
        self.app = app
        self.data = data # Dữ liệu (content, timestamp, type...)
        self.index = index
        self.is_note = is_note
        self.group_name = group_name
        
        # Áp dụng style cho thẻ (background, border)
        self.setStyleSheet(self.app.styles["CARD"])
        self.setCursor(QCursor(Qt.PointingHandCursor)) # Con trỏ tay khi di chuột vào
        
        # LAYOUT CHÍNH: Ngang (Trái: Nội dung, Phải: Nút Menu)
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(15, 10, 5, 10) # Căn lề
        main_layout.setSpacing(5)
        
        # 1. Phần bên trái (Nội dung + Thời gian)
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(4)
        
        # Hiển thị thời gian (chỉ cho clipboard item)
        if not is_note and "timestamp" in data:
            time_label = QLabel(data['timestamp'])
            time_label.setStyleSheet(self.app.styles["CARD_TIME"]) # Style chữ nhỏ màu xám
            left_layout.addWidget(time_label)
            
        # Hiển thị Nội dung
        if is_note:
            # Nếu là note: Cắt ngắn nếu quá dài
            text = self.data["content"][:200] + "..." if len(self.data["content"]) > 200 else self.data["content"]
            self.content_label = QLabel(text)
            self.content_label.setStyleSheet(self.app.styles["CARD_LABEL"]) # Style nội dung
        else:
            # Nếu là clipboard (text hoặc image)
            if self.data["type"] == "text":
                text = self.data["content"][:150] + "..." if len(self.data["content"]) > 150 else self.data["content"]
                self.content_label = QLabel(text)
                self.content_label.setStyleSheet(self.app.styles["CARD_LABEL"])
            else:
                # Nếu là ảnh: Load ảnh thumbnail
                self.content_label = QLabel()
                self.load_image(self.data["content"])
        
        self.content_label.setWordWrap(True) # Tự động xuống dòng
        self.content_label.setAlignment(Qt.AlignTop | Qt.AlignLeft) 
        left_layout.addWidget(self.content_label)
        
        # Thêm phần bên trái vào layout chính (chiếm hết không gian còn lại - stretch=1)
        main_layout.addWidget(left_widget, 1)
        
        # 2. Nút Menu (Bên phải, căn trên cùng)
        self.menu_btn = QPushButton()
        is_light = self.app.current_theme_mode == "light"
        icon_color = "#9ca3af" if is_light else "#64748b" # Màu xám cho icon
        
        self.menu_btn.setIcon(create_icon('fa5s.ellipsis-v', color=icon_color)) # Icon 3 chấm dọc
        self.menu_btn.setFixedSize(20, 24)
        self.menu_btn.setCursor(QCursor(Qt.PointingHandCursor))
        
        # Style cho nút menu trong suốt
        self.menu_btn.setStyleSheet("""
            QPushButton {
                background: transparent;
                border-radius: 4px;
                border: none;
            }
            QPushButton:hover {
                background: rgba(0, 0, 0, 0.05); /* Hover nhẹ nhàng */
            }
        """)
        self.menu_btn.clicked.connect(self.show_options_menu)
        
        # Thêm nút vào layout chính, căn trên cùng (AlignTop) để thẳng hàng với dòng đầu
        main_layout.addWidget(self.menu_btn, 0, Qt.AlignTop)
    
    def load_image(self, filename):
        """Tải và hiển thị thumbnail cho ảnh"""
        path = os.path.join(self.app.images_folder, filename)
        if os.path.exists(path):
            pixmap = QPixmap(path)
            # Scale ảnh nhỏ lại để vừa thẻ
            pixmap = pixmap.scaled(150, 80, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            self.content_label.setPixmap(pixmap)
            
    def show_options_menu(self):
        """Hiển thị menu ngữ cảnh (Sửa/Xóa)"""
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
        
        # Thêm tùy chọn Sửa (chỉ cho Note) - Icon Tím
        if self.is_note:
            edit_color = "#8b5cf6" if is_light else "#a78bfa"
            edit_action = menu.addAction(create_icon('fa5s.pen', color=edit_color), self.app.t("edit") if hasattr(self.app, 't') else "Edit")
            edit_action.triggered.connect(self.edit_item)
            
        # Thêm tùy chọn Xóa - Icon Đỏ
        delete_color = "#ef4444" if is_light else "#f87171"
        delete_action = menu.addAction(create_icon('fa5s.trash', color=delete_color), self.app.t("delete") if hasattr(self.app, 't') else "Delete")
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
        
        # Đường dẫn file dữ liệu
        self.data_file = "notes_data.json"
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
        """Thiết lập giao diện chính của ứng dụng"""
        # Áp dụng màu nền chính
        self.setStyleSheet(self.styles["MAIN"])
        
        # Widget trung tâm
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0) # Không căn lề
        main_layout.setSpacing(0)
        
        # 1. HEADER (Phần đầu trang)
        self.header_frame = QFrame()
        self.header_frame.setFixedHeight(70)
        self.header_frame.setStyleSheet(self.styles["HEADER"])
        header_layout = QHBoxLayout(self.header_frame)
        header_layout.setContentsMargins(25, 0, 25, 0)
        
        # Tiêu đề ứng dụng
        title_text = QWidget()
        title_text_layout = QVBoxLayout(title_text)
        title_text_layout.setContentsMargins(0, 0, 0, 0)
        title_text_layout.setSpacing(2)
        
        self.title_label = QLabel(self.t("app_title").replace(" & ", " \u0026 "))
        # Màu chữ tiêu đề theo theme
        title_color = "#1f2937" if self.current_theme_mode == "light" else "#f0f0ff"
        self.title_label.setStyleSheet(f"color: {title_color}; font-size: 22px; font-weight: 700; background: transparent;")
        title_text_layout.addWidget(self.title_label)
        
        # Phụ đề
        self.subtitle = QLabel(self.t("app_subtitle"))
        self.subtitle.setStyleSheet("color: #8b5cf6; font-size: 10px; font-weight: 800; letter-spacing: 2px; background: transparent;")
        title_text_layout.addWidget(self.subtitle)
        
        header_layout.addWidget(title_text)
        
        header_layout.addStretch()
        
        # 2. TAB BUTTONS (Nút chuyển tab Notes/Clipboard)
        self.tab_container = QFrame()
        self.tab_container.setStyleSheet("background: transparent; border: none;")
        tab_layout = QHBoxLayout(self.tab_container)
        tab_layout.setContentsMargins(4, 4, 4, 4)
        tab_layout.setSpacing(0)
        
        self.notes_tab_btn = QPushButton(self.t("notes_tab"))
        self.notes_tab_btn.setCursor(QCursor(Qt.PointingHandCursor))
        self.notes_tab_btn.setIconSize(QSize(16, 16))
        self.notes_tab_btn.clicked.connect(lambda: self.switch_tab("notes"))
        tab_layout.addWidget(self.notes_tab_btn)
        
        self.clipboard_tab_btn = QPushButton(self.t("clipboard_tab"))
        self.clipboard_tab_btn.setCursor(QCursor(Qt.PointingHandCursor))
        self.clipboard_tab_btn.setIconSize(QSize(16, 16))
        self.clipboard_tab_btn.clicked.connect(lambda: self.switch_tab("clipboard"))
        tab_layout.addWidget(self.clipboard_tab_btn)
        
        header_layout.addWidget(self.tab_container)
        
        # 3. SETTINGS BUTTON (Nút Cài đặt)
        self.settings_btn = QPushButton()
        self.settings_btn.setFixedSize(35, 35)
        self.settings_btn.setIcon(create_icon('fa5s.cog', color='#8b5cf6'))
        self.settings_btn.setIconSize(QSize(20, 20))
        self.settings_btn.setCursor(QCursor(Qt.PointingHandCursor))
        self.settings_btn.setToolTip("Cài đặt")
        self.settings_btn.clicked.connect(self.show_settings_dialog)
        self.settings_btn.setStyleSheet("""
            QPushButton { background: transparent; border-radius: 8px; border: none; }
            QPushButton:hover { background: rgba(139, 92, 246, 0.15); }
        """)
        header_layout.addWidget(self.settings_btn)

        # 4. PIN BUTTON (Nút Ghim cửa sổ)
        self.pin_btn = QPushButton()
        self.pin_btn.setFixedSize(35, 35)
        self.pin_btn.setIconSize(QSize(18, 18))
        self.pin_btn.setCursor(QCursor(Qt.PointingHandCursor))
        self.pin_btn.setToolTip("Luôn hiển thị trên cùng")
        self.pin_btn.clicked.connect(self.toggle_always_on_top)
        
        self.pin_btn.setStyleSheet("""
            QPushButton { background: transparent; border-radius: 8px; border: none; }
            QPushButton:hover { background: rgba(239, 68, 108, 0.1); }
        """)
        
        self.update_header_icons()
        
        header_layout.addWidget(self.pin_btn)
        
        # Thêm header vào layout chính
        main_layout.addWidget(self.header_frame)
        
        # 5. CONTENT AREA (Vùng nội dung chính)
        content = QWidget()
        # content.setStyleSheet("background-color: #0a0a12;") # Removed to inherit transparent/light bg
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(20, 20, 20, 20)
        content_layout.setSpacing(20)
        
        # Panel Ghi chú
        self.notes_panel = self.create_notes_panel()
        self.notes_panel.setMinimumHeight(400)
        content_layout.addWidget(self.notes_panel)
        
        # Panel Clipboard
        self.clipboard_panel = self.create_clipboard_panel()
        self.clipboard_panel.setMinimumHeight(400)
        content_layout.addWidget(self.clipboard_panel)
        
        main_layout.addWidget(content, 1) # content chiếm hết không gian còn lại
        
        # Đặt tab mặc định là Notes
        self.switch_tab("notes")
    
    def create_notes_panel(self):
        """
        Tạo panel chứa giao diện ghi chú.
        Sử dụng QStackedWidget để chuyển đổi giữa màn hình chọn nhóm và màn hình danh sách note.
        """
        panel = QFrame()
        panel.setStyleSheet(self.styles["PANEL"])
        panel.setObjectName("notesPanel")
        
        # Stacked Widget để chuyển cảnh
        self.notes_stack = QStackedWidget()
        
        # Screen 1: Chọn nhóm (Group Selection)
        self.group_selection_screen = self.create_group_selection_screen()
        self.notes_stack.addWidget(self.group_selection_screen)
        
        # Screen 2: Quản lý ghi chú trong nhóm (Notes Management)
        self.notes_management_screen = self.create_notes_management_screen()
        self.notes_stack.addWidget(self.notes_management_screen)
        
        # Mặc định hiện màn hình chọn nhóm
        self.notes_stack.setCurrentIndex(0)
        
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.notes_stack)
        
        return panel
    
    def create_group_selection_screen(self):
        """Màn hình chọn nhóm ghi chú"""
        screen = QWidget()
        layout = QVBoxLayout(screen)
        layout.setContentsMargins(24, 24, 24, 20)
        layout.setSpacing(20)
        
        # Header - removed title (no longer needed)
        # header = QHBoxLayout()
        # title = QLabel("Nhóm ghi chú")
        # title_color = "#1f2937" if self.current_theme_mode == "light" else "#e8e8f8"
        # title.setStyleSheet(f"color: {title_color}; font-size: 18px; font-weight: 600;")
        # header.addWidget(title)
        # header.addStretch()
        
        # layout.addLayout(header)
        
        # Danh sách nhóm (Grid/List)
        self.groups_scroll = QScrollArea()
        self.groups_scroll.setWidgetResizable(True)
        self.groups_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.groups_scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")
        
        self.groups_list_container = QWidget()
        self.groups_list_container.setStyleSheet("background: transparent;")
        self.groups_list_layout = QVBoxLayout(self.groups_list_container)
        self.groups_list_layout.setContentsMargins(0, 0, 4, 0)
        self.groups_list_layout.setSpacing(8)
        self.groups_list_layout.addStretch()
        
        self.groups_scroll.setWidget(self.groups_list_container)
        layout.addWidget(self.groups_scroll, 1)
        
        # Tải danh sách nhóm
        self.refresh_groups_list()
        
        return screen
    
    def create_notes_management_screen(self):
        """Màn hình quản lý ghi chú (hiển thị khi vào 1 nhóm)"""
        screen = QWidget()
        layout = QVBoxLayout(screen)
        layout.setContentsMargins(20, 20, 20, 15)
        layout.setSpacing(15)
        
        # 1. HEADER (Nút Back + Tên nhóm)
        header = QHBoxLayout()
        
        # Nút Quay lại (Back)
        back_btn = QPushButton("Quay lại")
        back_btn.setCursor(QCursor(Qt.PointingHandCursor))
        text_color = "#6b7280" if self.current_theme_mode == "light" else "#94a3b8"
        back_btn.setIcon(create_icon('fa5s.arrow-left', color=text_color))
        back_btn.setIconSize(QSize(14, 14))
        back_btn.setStyleSheet(f"background: transparent; color: {text_color}; font-size: 14px; font-weight: 600; border: none; padding: 4px 8px;")
        back_btn.clicked.connect(self.go_back_to_group_selection)
        header.addWidget(back_btn)
        
        header.addStretch()
        
        # Nhãn hiển thị Tên nhóm hiện tại
        self.current_group_label = QLabel("🏷️ Nhóm")
        group_label_color = "#1f2937" if self.current_theme_mode == "light" else "#f0f0ff"
        self.current_group_label.setStyleSheet(f"color: {group_label_color}; font-size: 18px; font-weight: 700; letter-spacing: 0.3px;")
        header.addWidget(self.current_group_label)
        
        layout.addLayout(header)
        
        # 2. INPUT AREA (Vùng nhập liệu) - Chỉ hiện khi đã chọn nhóm
        self.input_widget = QWidget()
        input_layout = QHBoxLayout(self.input_widget)
        
        # Input area
        self.input_widget = QWidget()
        input_layout = QHBoxLayout(self.input_widget)
        input_layout.setContentsMargins(0, 0, 0, 0)
        input_layout.setSpacing(10)
        
        # Ô nhập nội dung note
        self.note_input = QTextEdit()
        self.note_input.setFixedHeight(45)  # Set chiều cao ban đầu
        self.note_input.setPlaceholderText("Viết ghi chú mới...")
        self.note_input.setStyleSheet(self.styles["INPUT"])
        self.note_input.textChanged.connect(self.adjust_input_height) # Tự động giãn chiều cao
        input_layout.addWidget(self.note_input, 1)
        
        # Nút Thêm (Add) - Style mũi tên lên hiện đại
        add_btn = QPushButton()
        add_btn.setIcon(create_icon('fa5s.arrow-up', color='white'))
        add_btn.setIconSize(QSize(20, 20))
        add_btn.setFixedSize(45, 45)
        add_btn.setCursor(QCursor(Qt.PointingHandCursor))
        add_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #a78bfa, stop:1 #8b5cf6);
                border-radius: 12px;
                border: none;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #c4b5fd, stop:1 #a78bfa);
            }
            QPushButton:pressed {
                background: #7c3aed;
            }
        """)
        add_btn.clicked.connect(self.add_note)
        input_layout.addWidget(add_btn)
        
        layout.addWidget(self.input_widget)
        
        # 3. NOTES LIST (Danh sách ghi chú)
        self.notes_scroll = QScrollArea()
        self.notes_scroll.setWidgetResizable(True)
        self.notes_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.notes_scroll.setStyleSheet(self.styles["SCROLL"])
        self.notes_scroll.setMinimumHeight(200)
        
        self.notes_container = QWidget()
        self.notes_container.setStyleSheet("background: transparent;")
        self.notes_layout = QVBoxLayout(self.notes_container)
        self.notes_layout.setContentsMargins(0, 0, 8, 0)
        self.notes_layout.setSpacing(10)
        self.notes_layout.addStretch() # Đẩy nội dung lên trên
        
        self.notes_scroll.setWidget(self.notes_container)
        layout.addWidget(self.notes_scroll, 1)
        
        return screen
    
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
        if is_notes:
            self.notes_tab_btn.setStyleSheet(active_style)
            self.notes_tab_btn.setIcon(create_icon('fa5s.sticky-note', color='white'))
        else:
            self.notes_tab_btn.setStyleSheet(self.styles["TAB_INACTIVE"])
            self.notes_tab_btn.setIcon(create_icon('fa5s.sticky-note', color=inactive_color))
        
        # Clipboard Tab
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
        
        # Kiểm tra xem đã chọn nhóm chưa
        if not self.current_group:
            QMessageBox.warning(self, "Chưa chọn nhóm", "Vui lòng chọn nhóm trước!")
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
        if 0 <= index < len(self.notes):
            del self.notes[index]
            self.save_data()
            self.refresh_notes_list()
    
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
            if note.get("group") == self.current_group:
                filtered_notes.append((i, note))
        
        if not filtered_notes:
            empty_text = f"{self.t('no_notes')}\n\n{self.t('add_first_note')}"
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
    
    def refresh_groups_list(self):
        """Refresh danh sách nhóm"""
        # Clear existing
        while self.groups_list_layout.count() > 1:
            item = self.groups_list_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        
        # Add existing groups using swipeable cards
        if self.groups:
            # Sort groups alphabetically
            sorted_groups = sorted(self.groups)
            for idx, group in enumerate(sorted_groups):
                color = self.get_group_color(group)
                count = sum(1 for n in self.notes if n.get("group") == group)
                
                # Sử dụng SwipeableGroupCard
                group_card = SwipeableGroupCard(
                    self.groups_list_container,
                    self,
                    group,
                    count,
                    color
                )
                
                self.groups_list_layout.insertWidget(idx, group_card)
        
        # Thêm nút "Thêm nhóm mới" vào cuối danh sách
        add_group_card = QFrame()
        add_group_card.setObjectName("AddGroupCard")
        add_group_card.setFixedHeight(60)
        add_group_card.setCursor(QCursor(Qt.PointingHandCursor))
        
        # Dynamic styles based on theme
        is_light = self.current_theme_mode == "light"
        colors = ThemeColors.LIGHT if is_light else ThemeColors.DARK
        
        # Dashed border style cho nút thêm
        border_color = colors['accent']
        bg_color = f"rgba(139, 92, 246, {'0.03' if is_light else '0.08'})"
        bg_hover_color = f"rgba(139, 92, 246, {'0.08' if is_light else '0.15'})"
        
        add_group_card.setStyleSheet(f"""
            #AddGroupCard {{
                background: {bg_color};
                border-radius: 12px;
                border: 2px dashed rgba(139, 92, 246, 0.4);
            }}
            #AddGroupCard:hover {{
                background: {bg_hover_color};
                border: 2px dashed rgba(139, 92, 246, 0.8);
            }}
        """)
        
        card_layout = QHBoxLayout(add_group_card)
        card_layout.setContentsMargins(20, 0, 20, 0)
        card_layout.setSpacing(15)
        
        # Icon dấu cộng
        plus_icon = QLabel()
        plus_icon.setPixmap(create_icon('fa5s.plus-circle', color='#a78bfa').pixmap(QSize(24, 24)))
        plus_icon.setStyleSheet("background: transparent; border: none;")
        card_layout.addWidget(plus_icon)
        
        # Text
        text_color = "#7c3aed" if is_light else "#a78bfa"
        add_label = QLabel(self.t("create_group"))
        add_label.setStyleSheet(f"font-size: 16px; font-weight: 700; color: {text_color}; background: transparent; border: none;")
        card_layout.addWidget(add_label, 1)
        
        # Make clickable
        add_group_card.mousePressEvent = lambda event: self.quick_add_group()
        
        # Insert at the end, before the stretch
        insert_index = len(self.groups) if self.groups else 0
        self.groups_list_layout.insertWidget(insert_index, add_group_card)
    
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
            if os.path.exists("settings.json"):
                with open("settings.json", "r") as f:
                    settings = json.load(f)
                    return settings.get("theme", "light")
        except:
            pass
        return "light"

    def save_theme_setting(self):
        try:
            settings = {}
            if os.path.exists("settings.json"):
                with open("settings.json", "r") as f:
                    settings = json.load(f)
            
            settings["theme"] = self.current_theme_mode
            with open("settings.json", "w") as f:
                json.dump(settings, f)
        except:
            pass
    
    def load_language_setting(self):
        try:
            if os.path.exists("settings.json"):
                with open("settings.json", "r") as f:
                    settings = json.load(f)
                    return settings.get("language", "vi")  # Default Vietnamese
        except:
            pass
        return "vi"
    
    def save_language_setting(self):
        try:
            settings = {}
            if os.path.exists("settings.json"):
                with open("settings.json", "r") as f:
                    settings = json.load(f)
            
            settings["language"] = self.current_language
            with open("settings.json", "w") as f:
                json.dump(settings, f)
        except:
            pass
    
    def load_bubble_settings(self):
        try:
            if os.path.exists("settings.json"):
                with open("settings.json", "r") as f:
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
            if os.path.exists("settings.json"):
                with open("settings.json", "r") as f:
                    settings = json.load(f)
            
            settings["bubble_icon"] = self.custom_bubble_icon
            settings["bubble_size"] = getattr(self, 'bubble_size', 60)
            
            with open("settings.json", "w") as f:
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
        dialog.setFixedSize(450, 550)  # Tăng height để hiển thị đầy đủ custom bubble settings
        
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
        
        # 1. Custom Icon Row
        icon_row = QHBoxLayout()
        
        # Icon label with FontAwesome icon
        icon_label_widget = QWidget()
        icon_label_layout = QHBoxLayout(icon_label_widget)
        icon_label_layout.setContentsMargins(0, 0, 0, 0)
        icon_label_layout.setSpacing(8)
        
        icon_icon = QLabel()
        icon_icon.setPixmap(create_icon('fa5s.palette', color='#8b5cf6').pixmap(QSize(18, 18)))
        icon_label_layout.addWidget(icon_icon)
        
        icon_text = QLabel(f"{self.t('icon')}:")
        icon_text.setStyleSheet(f"color: {text_primary}; font-size: 15px; font-weight: 600;")
        icon_label_layout.addWidget(icon_text)
        
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
            file_path, _ = QFileDialog.getOpenFileName(dialog, "Select Icon", "", "PNG Images (*.png)")
            if file_path:
                self.custom_bubble_icon = file_path
                self.save_bubble_settings()
                if hasattr(self, 'bubble'): self.bubble.update_appearance()
                if hasattr(self, 'bubble'): self.bubble.update_appearance()
                # dialog.accept() # Đã bỏ để không đóng dialog
                
        def reset_icon():
            self.custom_bubble_icon = None
            self.save_bubble_settings()
            if hasattr(self, 'bubble'): self.bubble.update_appearance()
            if hasattr(self, 'bubble'): self.bubble.update_appearance()
            # dialog.accept() # Đã bỏ để không đóng dialog

        upload_btn.clicked.connect(upload_custom_icon)
        reset_btn.clicked.connect(reset_icon)
        
        icon_row.addWidget(upload_btn)
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
        self.pin_btn.setIcon(create_icon('fa5s.thumbtack', color=pin_color))

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
    app.setQuitOnLastWindowClosed(False)
    
    # Set icon cho app (Windows taskbar sẽ dùng icon này)
    icon_path = os.path.join(os.path.dirname(__file__), "app_icon.png")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))
    
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())
