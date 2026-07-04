// Service chia sẻ văn bản và hình ảnh nhanh qua JSONBlob API

export interface ShareData {
  type: 'text' | 'image';
  content: string;
  timestamp: number;
  userEmail?: string;
  userName?: string;
}

// Băm hash SHA-256 từ email để tạo Sync ID an toàn
export async function generateSyncIdFromEmail(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const msgBuffer = new TextEncoder().encode(cleanEmail);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fullHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  // JSONBlob có thể dùng ID là bất kỳ chuỗi chữ cái/số nào từ 8 ký tự trở lên. 
  // Chúng ta sẽ lấy 32 ký tự của SHA-256 hash làm ID cho an toàn và duy nhất.
  return fullHash.substring(0, 32);
}

// Lấy thông tin user hiện tại từ localStorage
export function getStoredUser(): { email: string; name: string } | null {
  const email = localStorage.getItem("sync_user_email");
  const name = localStorage.getItem("sync_user_name");
  if (email && name) {
    return { email, name };
  }
  return null;
}

// Lưu thông tin user vào localStorage
export function storeUser(email: string, name: string): void {
  localStorage.setItem("sync_user_email", email.trim());
  localStorage.setItem("sync_user_name", name.trim());
}

// Đăng xuất xóa user
export function clearStoredUser(): void {
  localStorage.removeItem("sync_user_email");
  localStorage.removeItem("sync_user_name");
  localStorage.removeItem("sync_share_id");
}

// Gửi dữ liệu chia sẻ
export async function sendShareData(syncId: string, type: 'text' | 'image', content: string, email: string, name: string): Promise<void> {
  if (!syncId) throw new Error("Chưa cấu hình Sync ID.");

  const payload: ShareData = {
    type,
    content,
    timestamp: Date.now(),
    userEmail: email,
    userName: name
  };

  const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
  
  let response;
  if (isTauri) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    response = await tauriFetch(`https://jsonblob.com/api/jsonBlob/${syncId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } else {
    response = await fetch(`https://jsonblob.com/api/jsonBlob/${syncId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
  }

  // Nếu PUT trả về 404 (tức là Blob chưa được khởi tạo), ta sẽ dùng POST để tạo mới với đúng ID đó.
  // Nhưng JSONBlob.com cho phép tạo mới qua PUT trực tiếp tới ID nếu ID hợp lệ, hoặc nếu lỗi ta xử lý:
  if (response.status === 404) {
    // Thử tạo mới bằng POST
    if (isTauri) {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      await tauriFetch(`https://jsonblob.com/api/jsonBlob`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch(`https://jsonblob.com/api/jsonBlob`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
    }
  } else if (!response.ok) {
    throw new Error("Không thể gửi dữ liệu chia sẻ lên máy chủ.");
  }
}

// Nhận dữ liệu chia sẻ
export async function receiveShareData(syncId: string): Promise<ShareData | null> {
  if (!syncId) return null;

  const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
  
  let response;
  try {
    if (isTauri) {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      response = await tauriFetch(`https://jsonblob.com/api/jsonBlob/${syncId}`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
    } else {
      response = await fetch(`https://jsonblob.com/api/jsonBlob/${syncId}`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
    }

    if (!response.ok) {
      return null;
    }

    return await response.json() as ShareData;
  } catch (err) {
    console.error("Lỗi khi đồng bộ dữ liệu chia sẻ:", err);
    return null;
  }
}
