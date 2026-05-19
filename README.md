# Clipboard & Notes Manager

Ung dung ghi chu va quan ly clipboard cho Windows.

## Tai ban cai dat

Tai file sau ve may Windows va chay:

- `installers/ClipboardNotesSetup_v1.0.exe`

Ban cai dat da dong goi san animation gau truc trong `bubble_frames`. Sau khi cai dat, bubble mac dinh se dung animation nay; nguoi dung van co the chon anh tinh hoac folder animation khac trong phan cai dat.

## Build lai tu source

```powershell
.venv\Scripts\python.exe create_installer.py
```

Ket qua build:

- `dist/ClipboardNotesManager.exe`
- `installers/ClipboardNotesSetup_v1.0.exe`
