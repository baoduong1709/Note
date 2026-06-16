# =================================================================================
# CẤU HÌNH GIAO DIỆN (THEME CONFIGURATION)
# =================================================================================

class ThemeColors:
    """
    Speed-First Theme: Tối ưu cho tốc độ và ít mỏi mắt.
    Bảng màu Dark Navy + Vibrant Purple.
    """
    
    # Bảng màu duy nhất (Speed-First Dark)
    DARK = {
        "bg_main": "#0b0f19",       # Deep Navy (Rất tối, gần đen) cho background chính
        "bg_sidebar": "#111827",    # Navy nhạt hơn chút cho sidebar
        "bg_panel": "rgba(17, 24, 39, 0.9)", # Hơi trong suốt cho phần content chính
        "bg_card": "#1f2937",       # Màu card cơ bản
        "bg_card_hover": "#374151", # Hover cho card
        "bg_input": "#111827",      # Màu nền input tìm kiếm
        "text_primary": "#f3f4f6",  # Trắng xám
        "text_secondary": "#9ca3af", # Xám nhạt
        "border": "rgba(255, 255, 255, 0.05)", # Viền cực mỏng
        "accent": "#8b5cf6",        # Tím hiện đại
        "accent_hover": "#a855f7",  # Tím sáng
        "accent_transparent": "rgba(139, 92, 246, 0.15)",
        "success": "#10b981",       
        "danger": "#ef4444",        
    }

    # Giữ Light mode tạm thời để không lỗi code cũ, nhưng màu sắc cũng tối ưu hóa
    LIGHT = {
        "bg_main": "#f8fafc",
        "bg_sidebar": "#f1f5f9",
        "bg_panel": "#ffffff",
        "bg_card": "#ffffff",
        "bg_card_hover": "#f1f5f9",
        "bg_input": "#ffffff",
        "text_primary": "#0f172a",
        "text_secondary": "#64748b",
        "border": "rgba(0, 0, 0, 0.05)",
        "accent": "#8b5cf6",
        "accent_hover": "#7c3aed",
        "accent_transparent": "rgba(139, 92, 246, 0.1)",
        "success": "#059669",
        "danger": "#dc2626",
    }

# =================================================================================
# BỘ TẠO STYLESHEET (STYLESHEET GENERATOR)
# =================================================================================

class AppTheme:
    """Tạo CSS (Qt Style Sheets) cho ứng dụng Speed-First."""
    
    @staticmethod
    def get_styles(mode="dark"):
        colors = ThemeColors.LIGHT if mode == "light" else ThemeColors.DARK
        
        # Font family (tùy chọn modern monospace / sans)
        font_family = "'Inter', 'Segoe UI', sans-serif"
        
        return {
            "MAIN": f"""
                QMainWindow {{ background: {colors['bg_main']}; }}
                * {{ font-family: {font_family}; outline: none; }}
            """,
            
            "SCROLL": f"""
                QScrollArea {{ border: none; background: transparent; }}
                QScrollBar:vertical {{ border: none; background: transparent; width: 4px; margin: 0; }}
                QScrollBar::handle:vertical {{ background: {colors['text_secondary']}40; border-radius: 2px; min-height: 20px; }}
                QScrollBar::handle:vertical:hover {{ background: {colors['accent']}; }}
                QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0px; }}
                QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {{ background: none; }}
            """,
            
            "SIDEBAR": f"""
                QFrame#sidebar {{
                    background: {colors['bg_sidebar']};
                    border-right: 1px solid {colors['border']};
                }}
            """,
            
            "SIDEBAR_BTN": f"""
                QPushButton {{
                    background: transparent;
                    color: {colors['text_secondary']};
                    border: none;
                    border-radius: 8px;
                    padding: 8px;
                }}
                QPushButton:hover {{
                    background: {colors['border']};
                    color: {colors['text_primary']};
                }}
                QPushButton:checked {{
                    background: {colors['accent_transparent']};
                    color: {colors['accent']};
                }}
            """,

            "SEARCH_INPUT": f"""
                QLineEdit {{
                    background: {colors['bg_input']};
                    color: {colors['text_primary']};
                    border: 1px solid {colors['border']};
                    border-radius: 12px;
                    padding: 10px 14px 10px 36px; /* Space for search icon */
                    font-size: 16px;
                    font-weight: 500;
                }}
                QLineEdit:focus {{
                    border: 1px solid {colors['accent']};
                    background: {colors['bg_card']};
                }}
            """,

            "GLOBAL_SEARCH_CONTAINER": f"""
                QFrame#searchContainer {{
                    background: transparent;
                    border-bottom: 1px solid {colors['border']};
                }}
            """,
            
            "PILL_GROUP": f"""
                QPushButton {{
                    background: {colors['bg_card']};
                    color: {colors['text_secondary']};
                    border: 1px solid {colors['border']};
                    border-radius: 12px;
                    padding: 4px 12px;
                    font-size: 12px;
                    font-weight: 600;
                }}
                QPushButton:hover {{
                    background: {colors['bg_card_hover']};
                    color: {colors['text_primary']};
                }}
                QPushButton:checked {{
                    background: {colors['accent_transparent']};
                    color: {colors['accent']};
                    border: 1px solid {colors['accent']};
                }}
            """,
            
            "CARD_LIST": f"""
                QFrame {{
                    background: transparent;
                    border-radius: 6px;
                    border: 1px solid transparent;
                    padding: 2px;
                }}
                QFrame:hover {{
                    background: {colors['bg_card_hover']};
                    border: 1px solid {colors['border']};
                }}
                QFrame[selected="true"] {{
                    background: {colors['accent_transparent']};
                    border: 1px solid {colors['accent']};
                }}
            """,
            
            "CARD_TITLE": f"""
                color: {colors['text_primary']}; 
                font-size: 13px; 
            """,
            
            "CARD_SUBTITLE": f"""
                color: {colors['text_secondary']}; 
                font-size: 11px; 
                font-weight: 500;
            """,

            "CARD_ACTION_BTN": f"""
                QPushButton {{
                    background: transparent;
                    border: none;
                    border-radius: 4px;
                    padding: 4px;
                }}
                QPushButton:hover {{
                    background: {colors['border']};
                }}
            """,
            
            "PANEL": f"""
                QFrame#notesPanel, QFrame#clipboardPanel {{
                    background: transparent;
                    border: none;
                }}
            """,

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
                    border: 1px solid {colors['accent']};
                }}
            """,
            
            "ADD_BTN": f"""
                QPushButton {{
                    background: {colors['accent']};
                    color: white;
                    border-radius: 12px;
                    border: none;
                    font-size: 14px;
                    font-weight: 600;
                    padding: 8px;
                }}
                QPushButton:hover {{ background: {colors['accent_hover']}; }}
            """,

            "DIALOG": f"""
                QDialog {{ 
                    background: {colors['bg_main']}; 
                    border-radius: 12px;
                    border: 1px solid {colors['border']};
                }}
                QLabel {{ color: {colors['text_primary']}; }}
            """,
            
            "TOAST": f"""
                QLabel {{
                    background-color: {colors['accent']};
                    color: #ffffff;
                    padding: 8px 16px;
                    border-radius: 16px;
                    font-weight: 600;
                    font-size: 13px;
                }}
            """,
            "BTN_EDIT": f"""
                QPushButton {{
                    background: transparent;
                    color: {colors['text_secondary']};
                    border: 1px solid {colors['border']}; 
                    border-radius: 8px; 
                    font-weight: 600;
                    padding: 6px 12px;
                    font-size: 13px;
                }}
                QPushButton:hover {{ 
                    background: {colors['bg_input']}; 
                    color: {colors['text_primary']};
                }}
            """,
            "BTN_DELETE": f"""
                QPushButton {{
                    background: rgba(239, 68, 68, 0.1);
                    color: {colors['danger']};
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 8px; 
                    font-weight: 600;
                    padding: 6px 12px;
                    font-size: 13px;
                }}
                QPushButton:hover {{ 
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid rgba(239, 68, 68, 0.6);
                }}
            """
        }
