
import os
import sys
import subprocess
import build_app

def create_iss_file():
    """Tạo file cấu hình cho Inno Setup (.iss)"""
    
    # Đường dẫn tuyệt đối đến file EXE và Icon
    # Inno Setup cần đường dẫn tuyệt đối hoặc tương đối chuẩn
    base_dir = os.getcwd()
    exe_source = os.path.join("dist", "ClipboardNotesManager.exe")
    icon_path = "app_icon.ico"
    output_dir = "installers"
    
    # Đảm bảo thư mục output tồn tại
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Nội dung file script Inno Setup
    iss_content = f'''
[Setup]
; Tên ứng dụng
AppName=Clipboard & Notes Manager
AppVersion=1.0
AppPublisher=My Company
AppPublisherURL=https://example.com

; Thư mục cài đặt mặc định (Program Files)
DefaultDirName={{autopf}}\\ClipboardNotesManager
DefaultGroupName=Clipboard & Notes Manager

; Icon hiển thị trong Control Panel > Uninstall
UninstallDisplayIcon={{app}}\\ClipboardNotesManager.exe

; Nén dữ liệu tốt nhất
Compression=lzma2
SolidCompression=yes

; Thư mục xuất file Setup.exe
OutputDir={output_dir}
OutputBaseFilename=ClipboardNotesSetup_v1.0

; Icon của file Setup (nếu có)
SetupIconFile={icon_path}

; Cho phép người dùng chọn tạo icon desktop
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop icon"; GroupDescription: "Additional icons:"

[Files]
; Copy file EXE chính vào thư mục cài đặt
Source: "{exe_source}"; DestDir: "{{app}}"; Flags: ignoreversion

; Copy thư mục bong bóng (quan trọng cho chức năng Bubble)
Source: "bubble_frames\\*"; DestDir: "{{app}}\\bubble_frames"; Flags: ignoreversion recursesubdirs createallsubdirs


[Icons]
; Tạo shortcut trong Start Menu
Name: "{{group}}\\Clipboard & Notes Manager"; Filename: "{{app}}\\ClipboardNotesManager.exe"
; Tạo shortcut Desktop (nếu user chọn)
Name: "{{autodesktop}}\\Clipboard & Notes Manager"; Filename: "{{app}}\\ClipboardNotesManager.exe"; Tasks: desktopicon

[Run]
; Chạy ứng dụng sau khi cài xong
Filename: "{{app}}\\ClipboardNotesManager.exe"; Description: "Launch application"; Flags: nowait postinstall skipifsilent
'''
    
    with open("setup.iss", "w", encoding="utf-8") as f:
        f.write(iss_content)
    
    print(f"✓ Đã tạo file cấu hình: {os.path.abspath('setup.iss')}")
    return "setup.iss"

def compile_installer(iss_file):
    """Chạy Inno Setup Compiler (ISCC) để tạo file Setup.exe"""
    
    # Đường dẫn thường gặp của Inno Setup
    iscc_path = r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    
    if not os.path.exists(iscc_path):
        print(f"❌ Không tìm thấy Inno Setup tại: {iscc_path}")
        print("Vui lòng cài đặt Inno Setup: https://jrsoftware.org/isdl.php")
        return False
        
    print(f"Đang chạy ISCC để tạo Installer... (Vui lòng đợi)")
    
    try:
        # Chạy lệnh biên dịch
        subprocess.run([iscc_path, iss_file], check=True)
        print("\n" + "="*60)
        print("✓ TẠO INSTALLER THÀNH CÔNG!")
        print("="*60)
        
        installer_path = os.path.join("installers", "ClipboardNotesSetup_v1.0.exe")
        if os.path.exists(installer_path):
             print(f"📦 File cài đặt: {os.path.abspath(installer_path)}")
             print("👉 Bạn có thể gửi file này cho bạn bè.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Lỗi khi biên dịch Installer: {e}")
        return False

def main():
    print(" BẮT ĐẦU QUÁ TRÌNH TẠO BỘ CÀI ĐẶT (INSTALLER) ".center(60, "="))
    
    # Bước 1: Build file EXE từ Python (nếu chưa có hoặc muốn build lại)
    # Chúng ta gọi lại script build_app.py để đảm bảo EXE mới nhất
    print("\n[Bước 1/2] Build file EXE từ Python Code...")
    if not build_app.main():
        print("❌ Lỗi khi build EXE. Dừng lại.")
        return
        
    # Bước 2: Tạo Installer bằng Inno Setup
    print("\n[Bước 2/2] Đóng gói thành Installer (Setup.exe)...")
    iss_file = create_iss_file()
    compile_installer(iss_file)

if __name__ == "__main__":
    main()
