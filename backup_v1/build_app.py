"""
Build script ĐƠN GIẢN cho Clipboard & Notes App
Sử dụng PyInstaller với cấu hình tối ưu
"""

import os
import sys
import subprocess

def main():
    print("="*60)
    print("BUILDING CLIPBOARD & NOTES MANAGER...")
    print("="*60 + "\n")
    
    # Đảm bảo PyInstaller đã cài
    try:
        subprocess.run([sys.executable, '-m', 'PyInstaller', '--version'], 
                      capture_output=True, check=True)
        print("✓ PyInstaller đã sẵn sàng\n")
    except:
        print("Đang cài đặt PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    # Build arguments - TỐI ƯU NHƯNG ĐƠN GIẢN
    build_args = [
        sys.executable,
        '-m', 'PyInstaller',
        
        # Tên và chế độ
        '--name=ClipboardNotesManager',
        '--onefile',                    # 1 file duy nhất
        '--windowed',                   # Không hiện console
        
        # Icon cho exe file
        '--icon=app_icon.ico',
        
        # Data files
        '--add-data=styles.py;.',
        '--add-data=app_icon.ico;.',
        '--add-data=bubble_frames;bubble_frames',
        
        # Clean và không confirm
        '--clean',
        '--noconfirm',
        
        # Thêm các module ẩn của PySide6
        '--hidden-import=PySide6',
        '--hidden-import=PySide6.QtCore',
        '--hidden-import=PySide6.QtGui',
        '--hidden-import=PySide6.QtWidgets',
        '--hidden-import=PySide6.QtSvg',
        '--hidden-import=shiboken6',
        
        
        # Tối ưu kích thước - CHỈ EXCLUDE CÁC MODULE RÕ RÀNG KHÔNG DÙNG
        '--exclude-module=tkinter',
        '--exclude-module=matplotlib',
        '--exclude-module=numpy',
        '--exclude-module=pandas',
        '--exclude-module=test',
        '--exclude-module=unittest',
        
        # File chính
        'clipboard_notes_pyside.py'
    ]
    
    print("Đang build... (có thể mất 2-5 phút)")
    print("Command:", ' '.join(build_args[:5]), "... [+more args]\n")
    
    try:
        result = subprocess.run(build_args, capture_output=False, text=True)
        
        if result.returncode == 0:
            print("\n" + "="*60)
            print("✓ BUILD THÀNH CÔNG!")
            print("="*60)
            
            # Kiểm tra file
            exe_path = os.path.join('dist', 'ClipboardNotesManager.exe')
            if os.path.exists(exe_path):
                size_mb = os.path.getsize(exe_path) / (1024 * 1024)
                print(f"\n📦 Kích thước: {size_mb:.2f} MB")
                print(f"📁 Vị trí: {os.path.abspath(exe_path)}")
                
                print("\n" + "="*60)
                print("HƯỚNG DẪN:")
                print("="*60)
                print("1. File .exe nằm trong thư mục 'dist'")
                print("2. Copy file ra ngoài và chạy thử")
                print("3. Không cần cài Python!")
                
                if size_mb > 100:
                    print("\n💡 ĐỂ GIẢM KÍCH THƯỚC THÊM:")
                    print("- Tải UPX: https://github.com/upx/upx/releases")
                    print("- Chạy: upx --best --lzma dist\\ClipboardNotesManager.exe")
                    print("- Có thể giảm thêm 30-50%")
        else:
            print("\n✗ Build thất bại! Kiểm tra lỗi ở trên.")
            
    except Exception as e:
        print(f"\n✗ Lỗi: {e}")
        return False
    
    if sys.stdin.isatty():
        try:
            input("\nNhấn Enter để thoát...")
        except EOFError:
            pass
    return True

if __name__ == "__main__":
    main()
