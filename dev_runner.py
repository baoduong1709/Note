"""
Development runner with hot reload
Chạy file này để dev, mỗi khi save file sẽ tự động restart app
"""
import sys
import subprocess
import time
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class AppRestarter(FileSystemEventHandler):
    def __init__(self):
        self.process = None
        self.last_restart = 0
        self.restart_app()
    
    def on_modified(self, event):
        # Bỏ qua thư mục và chỉ xử lý file .py
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        if file_path.suffix == '.py' and file_path.name != '__pycache__':
            # Debounce: chỉ restart nếu đã qua 1 giây từ lần restart trước
            current_time = time.time()
            if current_time - self.last_restart > 1:
                print(f"\n🔄 Detected change in {file_path.name}")
                print("⏳ Restarting app...")
                self.restart_app()
                self.last_restart = current_time
    
    def restart_app(self):
        if self.process:
            self.process.terminate()
            self.process.wait()
        
        print("\n🚀 Starting app...")
        self.process = subprocess.Popen([sys.executable, "clipboard_notes_pyside.py"])
    
    def stop(self):
        if self.process:
            self.process.terminate()

if __name__ == "__main__":
    print("=" * 50)
    print("🔥 DEV MODE - Hot Reload Enabled")
    print("=" * 50)
    print("📝 Watching for changes in .py files")
    print("💡 Press Ctrl+C to stop\n")
    
    event_handler = AppRestarter()
    observer = Observer()
    observer.schedule(event_handler, ".", recursive=False)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n🛑 Stopping...")
        event_handler.stop()
        observer.stop()
    
    observer.join()
    print("✅ Stopped")
