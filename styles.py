
# =================================================================================
# CẤU HÌNH GIAO DIỆN (THEME CONFIGURATION)
# =================================================================================

class ThemeColors:
    """
    Định nghĩa bảng màu cho giao diện Sáng (Light) và Tối (Dark).
    Tất cả các mã màu (Hex) được quản lý tập trung tại đây.
    """
    
    # Bảng màu cho Chế độ Tối (Dark Mode)
    DARK = {
        "bg_main": "#0a0a0a",       # Màu nền chính của ứng dụng (Đen thuần túy)
        "bg_gradient": "qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0a0a0a, stop:1 #1a1a1a)", # Hiệu ứng chuyển màu nền đen sang xám đen
        "bg_panel": "rgba(30, 30, 30, 0.5)", # Nền các khung chứa (Panel), xám đen bán trong suốt
        "bg_card": "rgba(37, 37, 37, 0.6)",  # Nền của thẻ ghi chú, xám than
        "bg_input": "rgba(20, 20, 20, 0.6)", # Nền của ô nhập liệu, đen xám
        "text_primary": "#f5f5f5",  # Màu chữ chính (Trắng xám sáng)
        "text_secondary": "#a0a0a0", # Màu chữ phụ (Xám trung bình)
        "border": "rgba(160, 160, 160, 0.1)", # Màu viền mờ, xám thuần
        "accent": "#8b5cf6",        # Màu nhấn chủ đạo (Tím - Violet 500)
        "accent_hover": "#7c3aed",  # Màu nhấn khi di chuột vào (Tím đậm hơn)
        "success": "#10b981",       # Màu thông báo thành công (Xanh lá - Emerald 500)
        "danger": "#ef4444",        # Màu cảnh báo/xóa (Đỏ - Red 500)
        "badge_bg": "rgba(139, 92, 246, 0.2)", # Nền của các nhãn (Badge)
    }

    # Bảng màu cho Chế độ Sáng (Light Mode)
    LIGHT = {
        "bg_main": "#f1f5f9",       # Màu nền chính (Xám rất nhạt - Slate 100)
        "bg_gradient": "#f1f5f9",   # Màu nền (đồng nhất, không gradient)
        "bg_panel": "#ffffff",      # Nền panel (Trắng tinh)
        "bg_card": "#ffffff",       # Nền thẻ ghi chú
        "bg_input": "#f8fafc",      # Nền ô nhập liệu
        "text_primary": "#0f172a",  # Màu chữ chính (Đen xanh - Slate 900)
        "text_secondary": "#475569", # Màu chữ phụ (Xám đậm - Slate 600)
        "border": "#cbd5e1",        # Màu viền (Xám - Slate 300)
        "accent": "#7c3aed",        # Màu nhấn chủ đạo (Tím - Violet 600)
        "accent_hover": "#6d28d9",  # Màu nhấn khi hover
        "success": "#2563eb",       # Màu thành công (Xanh dương đậm - Blue 600)
        "danger": "#dc2626",        # Màu cảnh báo (Đỏ đậm)
        "badge_bg": "rgba(124, 58, 237, 0.1)", # Nền badge nhạt
    }

# =================================================================================
# BỘ TẠO STYLESHEET (STYLESHEET GENERATOR)
# =================================================================================

class AppTheme:
    """
    Lớp này chịu trách nhiệm tạo ra các đoạn mã CSS (Qt Style Sheets)
    dựa trên chế độ màu (Sáng/Tối) được chọn.
    """
    
    @staticmethod
    def get_styles(mode="light"):
        """
        Trả về một từ điển chứa các đoạn CSS cho từng thành phần giao diện.
        Tham số:
            mode (str): "light" hoặc "dark"
        """
        # Chọn bảng màu tương ứng
        colors = ThemeColors.LIGHT if mode == "light" else ThemeColors.DARK
        
        return {
            # 1. Style cho Cửa sổ chính
            "MAIN": f"""
                QMainWindow {{ background: {colors['bg_gradient']}; }}
            """,
            
            # 2. Style cho Thanh cuộn (Custom Scrollbar) - Tạo cảm giác hiện đại, mỏng nhẹ
            "SCROLL": f"""
                QScrollArea {{ border: none; background: transparent; }}
                QScrollBar:vertical {{
                    border: none; background: transparent; width: 6px; margin: 0;
                }}
                QScrollBar::handle:vertical {{
                    background: rgba(128, 128, 128, 0.2); border-radius: 3px; min-height: 40px;
                }}
                QScrollBar::handle:vertical:hover {{ background: rgba(128, 128, 128, 0.4); }}
                QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0px; }}
                QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {{ background: none; }}
            """,
            
            # 3. Style cho Header (Phần đầu ứng dụng)
            "HEADER": f"""
                QFrame {{
                    background: {colors['bg_panel']};
                    border-bottom: 1px solid {colors['border']};
                }}
            """,
            
            # 4. Style cho các Panel chính (Notes, Clipboard)
            "PANEL": f"""
                QFrame#notesPanel, QFrame#clipboardPanel {{
                    background: {colors['bg_panel']};
                    border-radius: 16px; /* Bo tròn góc mạnh */
                    border: 1px solid {colors['border']};
                    border-bottom: 3px solid {colors['border']}; /* Tạo hiệu ứng đổ bóng/nổi 3D nhẹ */
                }}
            """,
            
            # 5. Style cho Ô nhập liệu (Input Area)
            "INPUT": f"""
                QTextEdit {{
                    background: {colors['bg_input']};
                    color: {colors['text_primary']};
                    border: 1px solid {colors['border']};
                    border-radius: 12px;
                    padding: 12px;
                    font-size: 14px;
                }}
                QTextEdit:focus {{
                    border: 1px solid {colors['accent']}; /* Viền đổi màu Tím khi focus */
                    background: {colors['bg_panel']};
                }}
            """,
            
            # 6. Style cho Nút Thêm mới (Add Button)
            "ADD_BTN": f"""
                QPushButton {{
                    background: {colors['accent']};
                    color: white;
                    border-radius: 12px;
                    border: none;
                    font-size: 18px;
                    font-weight: bold;
                }}
                QPushButton:hover {{ background: {colors['accent_hover']}; }}
            """,
            
            # 7. Style cho Thẻ ghi chú (Note Card)
            "CARD": f"""
                NoteCard {{
                    background: {colors['bg_card']};
                    border-radius: 12px;
                    border: 1px solid {colors['border']};
                }}
                NoteCard:hover {{
                    border: 1px solid {colors['accent']}80; /* Viền sáng lên khi di chuột */
                }}
            """,
            
            # Text style cho thẻ
            "CARD_LABEL": f"color: {colors['text_primary']}; font-size: 13px;",
            "CARD_TIME": f"color: {colors['text_secondary']}; font-size: 11px;",
            
            # 8. Style cho Nút Sửa (Edit Button) - Nhẹ nhàng, tinh tế
            # 8. Style cho Nút Sửa/Hủy (Edit/Cancel Button) - Dạng Outline sạch sẽ
            "BTN_EDIT": f"""
                QPushButton {{
                    background: transparent;
                    color: {colors['text_secondary']};
                    border: 1px solid {colors['border']}; 
                    border-radius: 8px; 
                    font-weight: 600;
                    padding: 8px 16px;
                    font-size: 14px;
                }}
                QPushButton:hover {{ 
                    background: {('#e2e8f0' if mode == 'light' else '#262626')}; 
                    color: {colors['text_primary']};
                    border: 1px solid {colors['text_secondary']};
                }}
                QPushButton:pressed {{
                    background: {colors['text_primary']}20;
                }}
            """,
            
            # 9. Style cho Nút Xóa (Delete Button) - Màu đỏ cảnh báo
            "BTN_DELETE": f"""
                QPushButton {{
                    background: rgba(239, 68, 68, 0.08);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.25);
                    border-radius: 8px; 
                    font-weight: 600;
                    padding: 8px 16px;
                    font-size: 13px;
                }}
                QPushButton:hover {{ 
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.5);
                }}
                QPushButton:pressed {{
                    background: rgba(239, 68, 68, 0.25);
                    border: 1px solid #ef4444;
                }}
            """,
            
            # 10. Style cho Tab ĐANG CHỌN (Active) - Nổi bật với màu Tím
            "TAB_ACTIVE": f"""
                QPushButton {{
                    background: {colors['accent']};
                    color: white;
                    border: 1px solid {colors['accent']};
                    border-radius: 8px;
                    font-weight: 700;
                    padding: 8px 16px;
                }}
            """,
            
            # 11. Style cho Tab KHÔNG CHỌN (Inactive) - Chìm xuống nền
            "TAB_INACTIVE": f"""
                QPushButton {{
                    background: transparent;
                    color: {colors['text_secondary']};
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    padding: 8px 16px;
                }}
                QPushButton:hover {{ color: {colors['text_primary']}; background: rgba(128, 128, 128, 0.08); }}
            """,
            
            # 12. Style chung cho các hộp thoại (Dialog)
            "DIALOG": f"""
                QDialog {{ 
                    background: {colors['bg_main']}; 
                    border-radius: 16px;
                    border: 1px solid {colors['border']};
                }}
                QLabel {{ color: {colors['text_primary']}; }}
            """,
            
             # 13. Style cho thông báo nhanh (Toast Notification)
             "TOAST": f"""
                QLabel {{
                    background-color: {colors['text_primary']};
                    color: {colors['bg_main']};
                    padding: 10px 20px;
                    border-radius: 20px;
                    font-weight: 600;
                }}
            """
        }
