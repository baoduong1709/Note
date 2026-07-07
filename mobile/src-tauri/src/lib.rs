use std::io::{Read, Write};
use tauri::Emitter;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn start_auth_server(window: tauri::Window) -> Result<String, String> {
    let client_id = "113610150516-jo77q0pv19qso8qg84a2h30hug4jga5s.apps.googleusercontent.com".to_string();
    
    std::thread::spawn(move || {
        let listener = std::net::TcpListener::bind("127.0.0.1:3000");
        match listener {
            Ok(listener) => {
                for stream in listener.incoming() {
                    if let Ok(mut stream) = stream {
                        let mut buffer = [0; 2048];
                        if let Ok(_) = stream.read(&mut buffer) {
                            let request = String::from_utf8_lossy(&buffer[..]);
                            
                            if request.contains("GET /login") {
                                let html_content = format!(r#"<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Sign-In</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <style>
    body {{
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0b0b0d; color: #e4e4e7;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }}
    .card {{
      background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px;
      padding: 40px; width: 100%; max-width: 380px; text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }}
    h2 {{ margin-top: 15px; font-size: 20px; font-weight: 700; }}
    p {{ font-size: 13px; color: #a1a1aa; line-height: 1.5; }}
    .btn-container {{ display: flex; justify-content: center; margin: 25px 0; }}
    .logo-container {{ display: flex; justify-content: center; gap: 5px; margin-bottom: 20px; }}
    .dot {{ width: 8px; height: 8px; border-radius: 50%; }}
    .status {{ margin: 20px 0; padding: 10px; border-radius: 8px; font-size: 12px; display: none; }}
    .status-error {{ background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-container">
      <span class="dot" style="background-color: #EA4335;"></span>
      <span class="dot" style="background-color: #4285F4;"></span>
      <span class="dot" style="background-color: #34A853;"></span>
      <span class="dot" style="background-color: #FBBC05;"></span>
    </div>
    <h2>Google Sign-In</h2>
    <p id="desc">Xác thực tài khoản Google của bạn để đồng bộ với ứng dụng AI Notebook.</p>
    <div class="btn-container" id="btn-container">
      <div id="g_id_signin"></div>
    </div>
    <div id="status-box" class="status"></div>
  </div>
  <script>
    const parseJwt = (token) => {{
      try {{
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          window.atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        );
        return JSON.parse(jsonPayload);
      }} catch (e) {{ return null; }}
    }};

    window.onload = function () {{
      google.accounts.id.initialize({{
        client_id: "{client_id}",
        callback: handleCredentialResponse
      }});
      google.accounts.id.renderButton(
        document.getElementById("btn-container"),
        {{ theme: "outline", size: "large", width: 280 }}
      );
    }};

    function handleCredentialResponse(response) {{
      document.getElementById("btn-container").style.display = 'none';
      document.getElementById("desc").innerText = "Đang xử lý kết nối an toàn...";
      const payload = parseJwt(response.credential);
      if (payload && payload.email) {{
        const email = encodeURIComponent(payload.email);
        const name = encodeURIComponent(payload.name || payload.email.split('@')[0]);
        window.location.href = `/callback?email=${{email}}&name=${{name}}`;
      }} else {{
        const box = document.getElementById('status-box');
        box.style.display = 'block';
        box.className = "status status-error";
        box.innerText = "Không lấy được thông tin email từ Google.";
        document.getElementById("btn-container").style.display = 'flex';
      }}
    }}
  </script>
</body>
</html>"#);
                                
                                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: keep-alive\r\n\r\n{}", html_content.len(), html_content);
                                let _ = stream.write_all(response.as_bytes());
                                let _ = stream.flush();
                            } 
                            else if request.contains("GET /callback?") {
                                if let Some(query_start) = request.find("GET /callback?") {
                                    let query_end = request[query_start..].find(" HTTP/1.1").unwrap_or(0);
                                    let query_string = &request[query_start + 14..query_start + query_end];
                                    let _ = window.emit("oauth-response", query_string.to_string());
                                }

                                let success_html = r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Đăng nhập thành công</title>
</head>
<body style="background:#0b0b0d;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;padding:40px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);max-width:320px;">
    <h2 style="color:#10b981;margin-top:0;">Đăng nhập thành công!</h2>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.5;">Tài khoản Google đã kết nối thành công. Bạn có thể đóng trình duyệt này và quay lại ứng dụng.</p>
    <script>setTimeout(function(){ window.close(); }, 1000);</script>
  </div>
</body>
</html>"#;
                                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", success_html.len(), success_html);
                                let _ = stream.write_all(response.as_bytes());
                                let _ = stream.flush();
                                break;
                            }
                            else {
                                let response = "HTTP/1.1 404 NOT FOUND\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                                let _ = stream.write_all(response.as_bytes());
                                let _ = stream.flush();
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to bind: {}", e);
            }
        }
    });
    Ok("Server started".to_string())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![greet, start_auth_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
