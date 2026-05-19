
[Setup]
; Tên ứng dụng
AppName=Clipboard & Notes Manager
AppVersion=1.0
AppPublisher=My Company
AppPublisherURL=https://example.com

; Thư mục cài đặt mặc định (Program Files)
DefaultDirName={autopf}\ClipboardNotesManager
DefaultGroupName=Clipboard & Notes Manager

; Icon hiển thị trong Control Panel > Uninstall
UninstallDisplayIcon={app}\ClipboardNotesManager.exe

; Nén dữ liệu tốt nhất
Compression=lzma2
SolidCompression=yes

; Thư mục xuất file Setup.exe
OutputDir=installers
OutputBaseFilename=ClipboardNotesSetup_v1.0

; Icon của file Setup (nếu có)
SetupIconFile=app_icon.ico

; Cho phép người dùng chọn tạo icon desktop
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop icon"; GroupDescription: "Additional icons:"

[Files]
; Copy file EXE chính vào thư mục cài đặt
Source: "dist\ClipboardNotesManager.exe"; DestDir: "{app}"; Flags: ignoreversion

; Copy thư mục bong bóng (quan trọng cho chức năng Bubble)
Source: "bubble_frames\*"; DestDir: "{app}\bubble_frames"; Flags: ignoreversion recursesubdirs createallsubdirs


[Icons]
; Tạo shortcut trong Start Menu
Name: "{group}\Clipboard & Notes Manager"; Filename: "{app}\ClipboardNotesManager.exe"
; Tạo shortcut Desktop (nếu user chọn)
Name: "{autodesktop}\Clipboard & Notes Manager"; Filename: "{app}\ClipboardNotesManager.exe"; Tasks: desktopicon

[Run]
; Chạy ứng dụng sau khi cài xong
Filename: "{app}\ClipboardNotesManager.exe"; Description: "Launch application"; Flags: nowait postinstall skipifsilent
