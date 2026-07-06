import React, { useState, useEffect, useRef } from "react";
import { 
  Share2, 
  Copy, 
  Download, 
  Image as ImageIcon, 
  Send, 
  Trash2, 
  AlertCircle, 
  RefreshCw,
  CloudLightning
} from "lucide-react";
import { 
  getStoredUser, 
  storeUser, 
  clearStoredUser, 
  generateSyncIdFromEmail, 
  sendShareData, 
  receiveShareHistory,
  ShareData
} from "../services/shareService";
import { apiRequest, setAuthToken } from '../services/apiClient';
import { useLanguage } from "../contexts/LanguageContext";


interface ShareViewProps {
  triggerToast: (message: string) => void;
}

export default function ShareView({ triggerToast }: ShareViewProps) {
  const { t, language } = useLanguage();
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [syncId, setSyncId] = useState<string>("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [joinSessionCode, setJoinSessionCode] = useState("");
  
  // Login flow simulation states
  const [loginStep, setLoginStep] = useState<'email' | 'accounts' | 'loading'>('accounts');

  // Input states (Send side)
  const [sendText, setSendText] = useState("");
  const [sendImage, setSendImage] = useState<string | null>(null); // base64
  const [isSending, setIsSending] = useState(false);

  // Output states (Receive side)
  const [shareHistory, setShareHistory] = useState<ShareData[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [imgTransform, setImgTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Drag and drop / Paste states
  const [isDragging, setIsDragging] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"send" | "receive">("send");
  const [showSessionSetup, setShowSessionSetup] = useState(false);
  const [activeShareMode, setActiveShareMode] = useState<"cloud" | "code">(
    sessionStorage.getItem("anonymous_share_code") !== null ? "code" : "cloud"
  );

  // Listen to the global WebSocket share events dispatched from App.tsx level
  useEffect(() => {
    const handleWsNewShare = (e: Event) => {
      const customEvent = e as CustomEvent<ShareData>;
      if (customEvent.detail) {
        const share = customEvent.detail;
        setShareHistory(prev => [share, ...prev]);
        triggerToast(`Đã nhận dữ liệu mới từ ${share.userName || 'thiết bị khác'}!`);
      }
    };
    window.addEventListener('ws-new-share', handleWsNewShare);
    return () => {
      window.removeEventListener('ws-new-share', handleWsNewShare);
    };
  }, []);

  // Initialize and load user from storage and listen to global changes
  useEffect(() => {
    const anonCode = sessionStorage.getItem("anonymous_share_code");
    const stored = getStoredUser();

    if (stored) {
      setUser(stored);
      if (anonCode) {
        setSyncId(anonCode);
        fetchData(anonCode);
        setActiveShareMode("code");
      } else {
        handleUserInit(stored);
        setActiveShareMode("cloud");
      }
    } else if (anonCode) {
      setUser({
        email: "anonymous@notebook.io",
        name: language === "vi" ? "Thiết bị ẩn danh" : "Anonymous Device"
      });
      setSyncId(anonCode);
      fetchData(anonCode);
      setActiveShareMode("code");
    } else {
      setUser(null);
      setSyncId("");
      setActiveShareMode("cloud");
    }

    const handleAuthChange = () => {
      const anonCodeUpdate = sessionStorage.getItem("anonymous_share_code");
      const updatedUser = getStoredUser();
      
      if (updatedUser) {
        setUser(updatedUser);
        if (anonCodeUpdate) {
          setSyncId(anonCodeUpdate);
          fetchData(anonCodeUpdate);
          setActiveShareMode("code");
        } else {
          handleUserInit(updatedUser);
          setActiveShareMode("cloud");
        }
      } else if (anonCodeUpdate) {
        setUser({
          email: "anonymous@notebook.io",
          name: language === "vi" ? "Thiết bị ẩn danh" : "Anonymous Device"
        });
        setSyncId(anonCodeUpdate);
        fetchData(anonCodeUpdate);
        setActiveShareMode("code");
      } else {
        setUser(null);
        setSyncId("");
        setShareHistory([]);
        setActiveShareMode("cloud");
      }
    };

    const handleTriggerLogin = () => {
      setLoginStep('accounts');
      setShowLoginModal(true);
    };

    window.addEventListener("auth-state-changed", handleAuthChange);
    window.addEventListener("trigger-google-login", handleTriggerLogin);

    return () => {
      window.removeEventListener("auth-state-changed", handleAuthChange);
      window.removeEventListener("trigger-google-login", handleTriggerLogin);
    };
  }, [language]);



  const handleUserInit = async (userData: { email: string; name: string }) => {
    setUser(userData);
    try {
      const id = await generateSyncIdFromEmail(userData.email);
      setSyncId(id);
      // Fetch initial data immediately (history loaded on login)
      fetchData(id);
    } catch (err) {
      console.error(err);
      triggerToast("Lỗi khởi tạo Sync ID!");
    }
  };

  const handleStartGoogleOAuthRelay = async () => {
    setLoginStep('loading');
    const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

    try {
      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/core");
        const { listen } = await import("@tauri-apps/api/event");
        const opener = await import("@tauri-apps/plugin-opener");

        // 1. Khởi động Local Auth Server ở phía Rust
        await invoke("start_auth_server");

        // 2. Lắng nghe event trả về từ Rust
        const unlisten = await listen("oauth-response", async (event) => {
          const payload = event.payload as string;
          const params = new URLSearchParams(payload);
          const email = params.get("email");
          const name = params.get("name");
          const accessToken = params.get("access_token");
          
          if (email && name) {
            const decodedEmail = decodeURIComponent(email);
            const decodedName = decodeURIComponent(name);
            
            // Register/login with our server using Google access_token
            if (accessToken) {
              try {
                const authResult = await apiRequest<{ success: boolean; token: string; user: any }>('/api/auth/google', {
                  method: 'POST',
                  body: JSON.stringify({ 
                    credential: accessToken,
                    email: decodedEmail,
                    name: decodedName,
                  }),
                });
                if (authResult.success && authResult.token) {
                  setAuthToken(authResult.token);
                }
              } catch (err) {
                console.error('Failed to authenticate with server:', err);
              }
            }
            
            storeUser(decodedEmail, decodedName);
            handleUserInit({ email: decodedEmail, name: decodedName });
            setShowLoginModal(false);
            setLoginStep('accounts');
            
            window.dispatchEvent(new CustomEvent("auth-state-changed"));
            triggerToast(`Đăng nhập thành công: ${decodedName}`);
          }
          unlisten();
        });

        // 3. Mở trình duyệt Chrome trỏ đến local auth server của chúng ta
        await opener.openUrl("http://localhost:3000/login");
        triggerToast("Đang mở trình duyệt Chrome để đăng nhập...");

      } else {
        // Web browser: Use OAuth 2.0 Implicit Flow with popup
        const CLIENT_ID = "113610150516-jo77q0pv19qso8qg84a2h30hug4jga5s.apps.googleusercontent.com";
        const REDIRECT_URI = window.location.origin + "/oauth-callback.html";
        const SCOPE = "email profile";

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(CLIENT_ID)}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&response_type=token` +
          `&scope=${encodeURIComponent(SCOPE)}` +
          `&prompt=select_account`;

        // Open popup
        const width = 500, height = 600;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(authUrl, "google-login", `width=${width},height=${height},left=${left},top=${top}`);

        if (!popup) {
          triggerToast("Trình duyệt đã chặn popup. Vui lòng cho phép popup!");
          setLoginStep('accounts');
          return;
        }

        // Listen for message from callback page
        const handleMessage = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === "google-oauth-success") {
            const { email, name, picture, accessToken } = event.data;
            
            // Register/login with our server using Google access_token
            if (accessToken) {
              try {
                const authResult = await apiRequest<{ success: boolean; token: string; user: any }>('/api/auth/google', {
                  method: 'POST',
                  body: JSON.stringify({ 
                    credential: accessToken,
                    email,
                    name,
                    picture,
                  }),
                });
                if (authResult.success && authResult.token) {
                  setAuthToken(authResult.token);
                }
              } catch (err) {
                console.error('Failed to authenticate with server:', err);
              }
            }
            
            storeUser(email, name);
            handleUserInit({ email, name });
            setShowLoginModal(false);
            setLoginStep('accounts');
            window.dispatchEvent(new CustomEvent("auth-state-changed"));
            triggerToast(`Đăng nhập thành công: ${name}`);
            window.removeEventListener("message", handleMessage);
          }
        };
        window.addEventListener("message", handleMessage);

        // Check if popup was closed without completing login
        const checkPopup = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkPopup);
            setLoginStep('accounts');
            window.removeEventListener("message", handleMessage);
          }
        }, 1000);
      }
    } catch (err) {
      console.error("Lỗi khởi tạo OAuth:", err);
      setLoginStep('accounts');
      triggerToast("Lỗi kết nối dịch vụ đăng nhập!");
    }
  };



  // Fetch share data from cloud
  const fetchData = async (id: string, showLoading = true) => {
    if (showLoading) setIsSyncing(true);
    setNetworkError(false);
    try {
      const history = await receiveShareHistory(id);
      if (history.length > 0) {
        setShareHistory(prev => {
          // Notify if there's new data
          if (prev.length > 0 && history.length > prev.length) {
            const newest = history[0];
            triggerToast(`Đã nhận dữ liệu mới từ ${newest.userName || 'thiết bị khác'}!`);
          }
          return history;
        });
      }
      setLastSyncTime(new Date());
    } catch (err) {
      console.error(err);
      setNetworkError(true);
    } finally {
      if (showLoading) setIsSyncing(false);
    }
  };

  // Compress image helper
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // If the file is already small (under 300KB), bypass compression to save CPU/memory
      if (file.size < 300 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onerror = (err) => {
        console.error("FileReader error:", err);
        reject(err);
      };
      reader.onload = (e) => {
        const resultStr = e.target?.result as string;
        const img = new Image();

        // 1. Define onload handler with async decoding to guarantee image is ready to draw
        img.onload = () => {
          const drawAndResolve = () => {
            try {
              const canvas = document.createElement("canvas");
              const MAX_WIDTH = 1200; // Optimize for mobile transfer & memory
              const MAX_HEIGHT = 1200;
              let width = img.naturalWidth || img.width;
              let height = img.naturalHeight || img.height;

              if (!width || !height) {
                resolve(resultStr);
                return;
              }

              if (width > height) {
                if (width > MAX_WIDTH) {
                  height *= MAX_WIDTH / width;
                  width = MAX_WIDTH;
                }
              } else {
                if (height > MAX_HEIGHT) {
                  width *= MAX_HEIGHT / height;
                  height = MAX_HEIGHT;
                }
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                resolve(resultStr);
                return;
              }

              // Fill canvas with solid white background (prevents black background transparency bugs)
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, width, height);

              ctx.drawImage(img, 0, 0, width, height);
              
              // Standard JPEG is highly optimized and works stably on all mobile WebViews
              const jpegBase64 = canvas.toDataURL("image/jpeg", 0.75);
              resolve(jpegBase64);
            } catch (canvasErr) {
              console.error("Canvas scaling failed, using raw base64 data:", canvasErr);
              resolve(resultStr);
            }
          };

          // Use HTMLImageElement.decode() if supported to prevent blank/white drawImage issues
          if (typeof img.decode === "function") {
            img.decode()
              .then(drawAndResolve)
              .catch((err) => {
                console.warn("Image decode failed, falling back to delayed draw:", err);
                setTimeout(drawAndResolve, 100);
              });
          } else {
            setTimeout(drawAndResolve, 100);
          }
        };

        // 2. Define onerror handler
        img.onerror = (err) => {
          console.warn("Image load failed, falling back to raw FileReader result:", err);
          resolve(resultStr);
        };

        // 3. Assign src after handlers to prevent race conditions
        img.src = resultStr;
      };
      reader.onerror = (err) => reject(err);
    });
  };





  const handleLogout = () => {
    const isAnon = sessionStorage.getItem("anonymous_share_code") !== null;
    const isUserLoggedIn = getStoredUser() !== null;

    if (isUserLoggedIn && isAnon) {
      sessionStorage.removeItem("anonymous_share_code");
      window.dispatchEvent(new CustomEvent("auth-state-changed"));
      triggerToast(language === "vi" ? "Đã thoát phiên chia sẻ, quay lại đồng bộ tài khoản." : "Exited session sharing, returned to account sync.");
      return;
    }

    if (isAnon) {
      sessionStorage.removeItem("anonymous_share_code");
    } else {
      clearStoredUser();
    }
    setUser(null);
    setSyncId("");
    setShareHistory([]);
    setSendText("");
    setSendImage(null);
    
    // Dispatch global Auth State Change
    window.dispatchEvent(new CustomEvent("auth-state-changed"));
    
    triggerToast(isAnon
      ? (language === "vi" ? "Đã thoát phiên chia sẻ ẩn danh." : "Exited anonymous session.")
      : (language === "vi" ? "Đã đăng xuất khỏi tài khoản." : "Logged out of account.")
    );
  };

  const handleStartAnonymousSession = () => {
    // Generate a random 6-digit number code
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    sessionStorage.setItem("anonymous_share_code", randomCode);
    
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    } else {
      setUser({
        email: "anonymous@notebook.io",
        name: language === "vi" ? "Thiết bị ẩn danh" : "Anonymous Device"
      });
    }
    setSyncId(randomCode);
    
    // Dispatch auth state change so App.tsx websocket connects to the anonymous code
    window.dispatchEvent(new CustomEvent("auth-state-changed"));
    
    triggerToast(language === "vi" ? `Đã tạo phiên chia sẻ: ${randomCode}` : `Created share session: ${randomCode}`);
    
    // Fetch initial data for this code (usually empty)
    fetchData(randomCode);
  };

  const handleJoinAnonymousSession = () => {
    if (!joinSessionCode || !joinSessionCode.match(/^\d{6}$/)) {
      triggerToast(language === "vi" ? "Vui lòng nhập mã phiên gồm đúng 6 chữ số!" : "Please enter a valid 6-digit session code!");
      return;
    }
    sessionStorage.setItem("anonymous_share_code", joinSessionCode);
    
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    } else {
      setUser({
        email: "anonymous@notebook.io",
        name: language === "vi" ? "Thiết bị ẩn danh" : "Anonymous Device"
      });
    }
    setSyncId(joinSessionCode);
    setJoinSessionCode("");
    
    // Dispatch auth state change so App.tsx websocket connects to the anonymous code
    window.dispatchEvent(new CustomEvent("auth-state-changed"));
    
    triggerToast(language === "vi" ? `Đã kết nối mã phiên: ${joinSessionCode}` : `Connected to session code: ${joinSessionCode}`);
    
    // Fetch initial data for this code
    fetchData(joinSessionCode);
  };

  // Handle image selection
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        triggerToast("Vui lòng chỉ chọn tệp hình ảnh!");
        return;
      }
      try {
        triggerToast("Đang nén ảnh...");
        const base64 = await compressImage(file);
        setSendImage(base64);
        triggerToast("Đã chuẩn bị ảnh!");
      } catch (err) {
        console.error(err);
        triggerToast("Lỗi xử lý ảnh!");
      }
    }
  };

  // Handle Drag & Drop Image
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        triggerToast("Vui lòng chỉ thả tệp hình ảnh!");
        return;
      }
      try {
        triggerToast("Đang nén ảnh...");
        const base64 = await compressImage(file);
        setSendImage(base64);
        triggerToast("Đã nhận ảnh kéo thả!");
      } catch (err) {
        console.error(err);
        triggerToast("Lỗi xử lý ảnh!");
      }
    }
  };

  // Clipboard Paste listener on entire view (when focused on input or body)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            triggerToast("Đang nén ảnh...");
            const base64 = await compressImage(file);
            setSendImage(base64);
            triggerToast("Đã dán ảnh thành công!");
          } catch (err) {
            console.error(err);
            triggerToast("Lỗi xử lý ảnh đã dán!");
          }
        }
        break;
      }
    }
  };

  // Send share data to cloud
  const handleSend = async () => {
    if (!user || !syncId) return;
    if (!sendText.trim() && !sendImage) {
      triggerToast("Vui lòng nhập văn bản hoặc chọn ảnh để gửi!");
      return;
    }

    setIsSending(true);
    try {
      const type = sendImage ? 'image' : 'text';
      const content = sendImage ? sendImage : sendText;

      await sendShareData(syncId, type, content, user.email, user.name);
      
      triggerToast("Đã gửi chia sẻ thành công!");
      // Clear inputs
      setSendText("");
      setSendImage(null);
    } catch (err) {
      console.error(err);
      triggerToast("Lỗi khi gửi dữ liệu chia sẻ!");
    } finally {
      setIsSending(false);
    }
  };

  // Copy Received text to clipboard
  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      triggerToast("Đã sao chép văn bản vào Clipboard!");
    } catch (err) {
      console.error(err);
      triggerToast("Lỗi sao chép!");
    }
  };

  // Download Received Image
  const handleDownloadImage = (base64: string) => {
    try {
      const link = document.createElement("a");
      link.href = base64;
      link.download = `shared_image_${new Date().getTime()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast("Đã bắt đầu tải ảnh về!");
    } catch (err) {
      console.error(err);
      triggerToast("Lỗi tải ảnh!");
    }
  };

  // Copy Received Image to Clipboard
  const handleCopyImage = async (base64: string) => {
    try {
      const response = await fetch(base64);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      triggerToast("Đã sao chép ảnh vào Clipboard!");
    } catch (err) {
      console.error("Failed to copy image:", err);
      triggerToast("Không hỗ trợ sao chép định dạng này!");
    }
  };

  return (
    <div onPaste={handlePaste} className="flex-1 flex flex-col h-full overflow-hidden space-y-5 view-enter-animate">
      
      {/* Header View */}
      <div className="flex justify-between items-center shrink-0 border-b border-zinc-200 dark:border-white/5 pb-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-purple-500 animate-pulse" />
            {t("share.title")}
          </h3>
          <p className="text-xs text-zinc-555 dark:text-zinc-400">
            {language === "vi" 
              ? "Đồng bộ nhanh văn bản và hình ảnh thời gian thực giữa các thiết bị." 
              : "Real-time sync of text and images between your devices."}
          </p>
        </div>
      </div>

      {/* Main Container */}
      {!user ? (
        // NOT LOGGED IN STATE
        <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full text-center space-y-6 animate-fade-in overflow-y-auto pb-28 xl:pb-0">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/10 text-purple-400 flex items-center justify-center relative shadow-inner animate-pulse">
            <CloudLightning className="w-8 h-8" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-teal-400"></span>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
              {language === "vi" ? "KÊNH CHIA SẺ & ĐỒNG BỘ" : "SHARE & SYNC CHANNELS"}
            </h4>
            <p className="text-xs text-zinc-555 dark:text-zinc-400 leading-relaxed max-w-xs">
              {language === "vi"
                ? "Hãy chọn phương thức kết nối để chia sẻ văn bản và hình ảnh nhanh giữa các thiết bị."
                : "Please choose a connection method to quickly share text and images between devices."}
            </p>
          </div>

          <div className="w-full max-w-xs space-y-3">
            {/* Google Sign In Button */}
            <button
              onClick={() => {
                setLoginStep('accounts');
                setShowLoginModal(true);
              }}
              className="w-full bg-purple-600 hover:bg-purple-550 text-white font-semibold text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4 mr-1 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.67-.35-1.37-.35-2.09z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              {t("sidebar.signinGoogle")}
            </button>

            {/* Divider */}
            <div className="flex items-center justify-between gap-3 text-zinc-400 dark:text-zinc-650 text-[11px] uppercase font-bold select-none py-1">
              <div className="h-[1px] flex-1 bg-zinc-300 dark:bg-white/5"></div>
              <span>{language === "vi" ? "Hoặc" : "Or"}</span>
              <div className="h-[1px] flex-1 bg-zinc-300 dark:bg-white/5"></div>
            </div>

            {/* Anonymous Session Card with Create/Join options */}
            <div className="w-full glass-panel rounded-2xl p-4 border border-zinc-200/50 dark:border-white/5 space-y-4 text-left animate-fade-in">
              <div className="flex items-center gap-2">
                <Share2 className="w-4.5 h-4.5 text-purple-500 shrink-0" />
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  {language === "vi" ? "Chia sẻ ẩn danh qua mã số" : "Anonymous Session Sync"}
                </span>
              </div>
              
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-normal">
                {t("share.anonDesc")}
              </p>

              <div className="flex gap-2.5 items-center">
                {/* Create Session Button */}
                <button
                  type="button"
                  onClick={handleStartAnonymousSession}
                  className="flex-1 bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer text-center shadow-sm"
                  title={language === "vi" ? "Tự động sinh mã phiên 6 số ngẫu nhiên" : "Generate a random 6-digit session code"}
                >
                  {language === "vi" ? "Tạo mã mới" : "New Code"}
                </button>

                {/* Input & Join Section */}
                <div className="flex-1 flex gap-1.5">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={joinSessionCode}
                    onChange={(e) => setJoinSessionCode(e.target.value.replace(/\D/g, ""))}
                    className="w-16 p-2 rounded-xl bg-black/10 dark:bg-black/30 border border-zinc-300 dark:border-white/10 text-center text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                    title={language === "vi" ? "Nhập mã phiên 6 chữ số có sẵn" : "Enter a 6-digit session code to join"}
                  />
                  <button
                    type="button"
                    onClick={handleJoinAnonymousSession}
                    className="flex-1 bg-purple-650 hover:bg-purple-600 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer text-center shadow-md shadow-purple-500/10"
                    title={language === "vi" ? "Kết nối vào phiên chia sẻ" : "Connect to session"}
                  >
                    {language === "vi" ? "Kết nối" : "Join"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // LOGGED IN STATE
        <div className="flex-1 flex flex-col xl:flex-row gap-5 min-h-0 overflow-y-auto xl:overflow-hidden select-text pb-28 xl:pb-0">
          
          {/* Mobile Tab Switcher */}
          <div className="xl:hidden flex p-1.5 bg-black/15 dark:bg-white/5 backdrop-blur rounded-xl border border-zinc-200/50 dark:border-white/5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveMobileTab("send")}
              className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
                activeMobileTab === "send"
                  ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-450 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              Gửi chia sẻ
            </button>
            <button
              type="button"
              onClick={() => setActiveMobileTab("receive")}
              className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
                activeMobileTab === "receive"
                  ? "bg-purple-650 dark:bg-purple-600 text-white shadow-sm shadow-purple-500/25"
                  : "text-zinc-500 dark:text-zinc-450 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              Nhận được ({shareHistory.length})
            </button>
          </div>

          {/* COLUMN 1: SEND CONTAINER */}
          <div className={`flex-none xl:flex-1 flex flex-col space-y-4 min-h-0 ${activeMobileTab === "send" ? "flex" : "hidden xl:flex"}`}>
            <div className="glass-panel rounded-xl p-4 sm:p-5 flex-none xl:flex-1 flex flex-col space-y-4 min-h-[350px] xl:min-h-0">
              
              {/* Sync Mode Selector / Status Bar */}
              <div className="p-2.5 bg-zinc-200/30 dark:bg-zinc-950/40 rounded-xl border border-zinc-200 dark:border-white/5 space-y-2 text-xs shrink-0 text-left">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between font-semibold text-xs">
                  <span className="text-zinc-555 dark:text-zinc-400">{language === "vi" ? "Liên kết đồng bộ:" : "Sync link:"}</span>
                  {sessionStorage.getItem("anonymous_share_code") ? (
                    <span className="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1 bg-purple-500/10 px-2 py-0.5 rounded-full text-xs">
                      <Share2 className="w-3 h-3 animate-pulse" /> {language === "vi" ? `Mã phiên: ${sessionStorage.getItem("anonymous_share_code")}` : `Session Code: ${sessionStorage.getItem("anonymous_share_code")}`}
                    </span>
                  ) : (
                    <span className="text-teal-650 dark:text-teal-400 font-bold flex items-center gap-1 bg-teal-500/10 px-2 py-0.5 rounded-full text-xs">
                      <CloudLightning className="w-3 h-3" /> {language === "vi" ? "Kênh đám mây tài khoản" : "Cloud Account Channel"}
                    </span>
                  )}
                </div>

                {sessionStorage.getItem("anonymous_share_code") ? (
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between text-xs text-zinc-500 leading-normal pt-1.5 border-t border-zinc-200 dark:border-white/5">
                    <span>{language === "vi" ? "Đang đồng bộ qua phiên tạm thời." : "Syncing via temporary session code."}</span>
                    <button
                      onClick={handleLogout}
                      className="text-red-500 hover:text-red-400 font-bold cursor-pointer hover:underline transition-all text-left"
                    >
                      {language === "vi" 
                        ? (user.email !== "anonymous@notebook.io" ? "Trở lại tài khoản" : "Thoát phiên") 
                        : (user.email !== "anonymous@notebook.io" ? "Back to Account" : "Exit Session")
                      }
                    </button>
                  </div>
                ) : (
                  user.email !== "anonymous@notebook.io" && (
                    <>
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:justify-between sm:items-center text-xs text-zinc-500 leading-normal pt-1.5 border-t border-zinc-200 dark:border-white/5">
                        <span>{language === "vi" ? "Dữ liệu tự động đồng bộ theo tài khoản." : "Data automatically syncs to your account."}</span>
                        <button
                          onClick={() => setShowSessionSetup(!showSessionSetup)}
                          className="text-purple-650 dark:text-purple-400 font-bold cursor-pointer hover:underline transition-all flex items-center gap-1"
                        >
                          {showSessionSetup 
                            ? (language === "vi" ? "Đóng" : "Close") 
                            : (language === "vi" ? "Đồng bộ qua mã 6 số" : "Sync via 6-digit code")
                          }
                        </button>
                      </div>
                      
                      {showSessionSetup && (
                        <div className="space-y-2 text-xs border-t border-zinc-200 dark:border-white/5 pt-2 animate-fade-in">
                          <p className="text-zinc-555 leading-relaxed">{language === "vi" ? "Tạo mã mới hoặc nhập mã phiên từ thiết bị khác:" : "Create a new session or join a session from another device:"}</p>
                          <div className="flex gap-2 items-center">
                            <button
                              type="button"
                              onClick={() => {
                                handleStartAnonymousSession();
                                setShowSessionSetup(false);
                              }}
                              className="flex-1 bg-white hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-bold py-1.5 rounded-lg transition-all cursor-pointer text-center text-xs shadow-sm"
                            >
                              {language === "vi" ? "Tạo mã mới" : "Create Code"}
                            </button>
                            <div className="flex-1 flex gap-1">
                              <input
                                type="text"
                                maxLength={6}
                                placeholder="123456"
                                value={joinSessionCode}
                                onChange={(e) => setJoinSessionCode(e.target.value.replace(/\D/g, ""))}
                                className="w-14 p-1 rounded-lg bg-black/10 dark:bg-black/30 border border-zinc-300 dark:border-white/10 text-center text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  handleJoinAnonymousSession();
                                  setShowSessionSetup(false);
                                }}
                                className="bg-purple-650 hover:bg-purple-600 text-white font-bold px-2 py-1.5 rounded-lg transition-all cursor-pointer text-xs"
                              >
                                {language === "vi" ? "Kết nối" : "Join"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )
                )}
              </div>

              {/* Input Workspace */}
              <div className="flex-1 flex flex-col space-y-3 min-h-0">
                <div className="flex items-center justify-between shrink-0">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">SOẠN THẢO NỘI DUNG</label>
                  <span className="text-xs text-zinc-500 font-medium">Mẹo: Dán hoặc kéo thả ảnh trực tiếp vào đây</span>
                </div>

                {/* Textarea */}
                {!sendImage ? (
                  <textarea
                    value={sendText}
                    onChange={(e) => setSendText(e.target.value)}
                    placeholder="Nhập nội dung văn bản muốn gửi... (Khi nhập xong nhấn Gửi để đồng bộ tức thì sang thiết bị khác)"
                    className="flex-1 min-h-[140px] xl:min-h-0 w-full bg-transparent border-none outline-none focus:ring-0 p-0 text-sm text-zinc-800 dark:text-zinc-300 resize-none placeholder-zinc-500"
                  />
                ) : (
                  // Image Preview inside workspace
                  <div className="flex-1 flex flex-col items-center justify-center relative bg-black/10 dark:bg-black/30 rounded-xl p-3 border border-dashed border-zinc-700/30">
                    <img 
                      src={sendImage} 
                      alt="To Send" 
                      className="max-h-56 max-w-full rounded shadow-md object-contain" 
                    />
                    <button
                      onClick={() => setSendImage(null)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-650/80 hover:bg-red-500 text-white transition-all shadow"
                      title="Xóa ảnh này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-zinc-500 mt-2 font-medium">Ảnh đã nén đã sẵn sàng gửi đi</span>
                  </div>
                )}

                {/* Drag and Drop Zone (Only when no image is loaded) */}
                {!sendImage && (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`h-20 border-2 border-dashed rounded-xl flex items-center justify-center transition-all ${
                      isDragging 
                        ? "border-purple-500 bg-purple-500/10 text-purple-400 scale-[0.98]" 
                        : "border-zinc-300 dark:border-white/5 hover:border-purple-500/40 text-zinc-500 dark:text-zinc-650"
                    }`}
                  >
                    <label className="flex flex-col items-center gap-1 cursor-pointer w-full h-full justify-center select-none">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageChange} 
                        className="hidden" 
                      />
                      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                        <ImageIcon className="w-4 h-4" /> Kéo thả hoặc click chọn hình ảnh
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex justify-between items-center shrink-0 border-t border-zinc-200 dark:border-white/5">
                <span className="text-xs text-zinc-550 dark:text-zinc-500 font-mono">
                  Mã Sync ID: <span className="font-semibold text-purple-650 dark:text-purple-400 select-all cursor-pointer" title="Click để bôi đen">{syncId}</span>
                </span>
                
                <button
                  onClick={handleSend}
                  disabled={isSending || (!sendText.trim() && !sendImage)}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-purple-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Gửi chia sẻ
                </button>
              </div>

            </div>
          </div>

          {/* COLUMN 2: RECEIVE CONTAINER */}
          <div className={`flex-none xl:flex-1 flex flex-col space-y-4 min-h-0 ${activeMobileTab === "receive" ? "flex" : "hidden xl:flex"}`}>
            <div className="glass-panel rounded-xl p-4 sm:p-5 flex-none xl:flex-1 flex flex-col space-y-4 min-h-[350px] xl:min-h-0">
              
              {/* Header section with loading info */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-white/5 shrink-0">
                <span className="text-xs font-bold text-zinc-555 dark:text-zinc-400 uppercase tracking-wider">NHẬN ĐƯỢC (RECEIVED)</span>
                
                <div className="flex items-center gap-2">
                  {lastSyncTime && (
                    <span className="text-[10px] text-zinc-655 dark:text-zinc-500 font-mono">
                      Cập nhật: {lastSyncTime.toLocaleTimeString()}
                    </span>
                  )}
                  {shareHistory.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!syncId) return;
                        try {
                          await apiRequest(`/api/share/${syncId}`, { method: 'DELETE' });
                          setShareHistory([]);
                          triggerToast("Đã xóa toàn bộ lịch sử chia sẻ!");
                        } catch {
                          triggerToast("Lỗi khi xóa lịch sử!");
                        }
                      }}
                      className="p-1 rounded hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-all"
                      title="Xóa toàn bộ lịch sử"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => fetchData(syncId, true)}
                    disabled={isSyncing}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-zinc-555 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white transition-all disabled:opacity-50"
                    title="Đồng bộ thủ công ngay"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Data Received */}
              <div className="flex-none xl:flex-1 flex flex-col min-h-[250px] xl:min-h-0 xl:overflow-y-auto bg-black/5 dark:bg-black/25 rounded-xl p-4 border border-zinc-300 dark:border-white/5 select-text relative">
                {networkError && (
                  <div className="absolute top-2 left-2 right-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs rounded-lg p-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Lỗi kết nối máy chủ. Đang tự động thử lại...</span>
                  </div>
                )}

                {shareHistory.length > 0 ? (
                  <div className="flex-1 flex flex-col min-h-0 select-text overflow-y-auto space-y-3">
                    {shareHistory.map((item, idx) => (
                      <div key={idx} className="border border-zinc-200 dark:border-white/10 rounded-lg p-3 bg-white/5">
                        {/* Meta info */}
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 flex items-center justify-between border-b border-zinc-300 dark:border-white/5 pb-2 font-mono">
                          <span>Người gửi: <strong>{item.userName}</strong></span>
                          <span>{new Date(item.timestamp).toLocaleString()}</span>
                        </div>

                        {/* Content */}
                        {item.type === 'text' ? (
                          <div className="select-text">
                            <pre className="whitespace-pre-wrap font-sans text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed select-text mb-2">
                              {item.content}
                            </pre>
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleCopyText(item.content)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all cursor-pointer shadow-sm"
                              >
                                <Copy className="w-3 h-3" />
                                Sao chép
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <img 
                              src={item.content} 
                              alt="Shared" 
                              title="Kích đúp để phóng to"
                              onDoubleClick={() => {
                                setZoomedImage(item.content);
                                setImgTransform({ scale: 1, x: 0, y: 0 });
                              }}
                              className="max-h-40 max-w-full rounded shadow-lg object-contain border border-zinc-200 dark:border-white/5 mb-2 cursor-zoom-in hover:opacity-90 transition-all" 
                            />
                            <div className="flex justify-end w-full gap-2">
                              <button
                                onClick={() => handleCopyImage(item.content)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all cursor-pointer shadow-sm"
                              >
                                <Copy className="w-3 h-3" />
                                Sao chép
                              </button>
                              <button
                                onClick={() => handleDownloadImage(item.content)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-650 hover:bg-teal-500 text-white font-semibold text-xs transition-all cursor-pointer shadow-sm"
                              >
                                <Download className="w-3 h-3" />
                                Tải về
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  // EMPTY STATE
                  <div className="flex-1 flex flex-col items-center justify-center text-zinc-650 dark:text-zinc-500 text-center space-y-2 select-none">
                    <CloudLightning className="w-8 h-8 opacity-40 text-purple-400 animate-bounce" />
                    <div>
                      <p className="text-sm font-semibold">Chưa có dữ liệu nào được chia sẻ.</p>
                      <p className="text-xs max-w-xs mt-0.5 leading-relaxed">Khi thiết bị khác đăng nhập tài khoản này và gửi chia sẻ, dữ liệu sẽ tự động hiển thị tại đây.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* GOOGLE SIGN-IN SIMULATED POPUP MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl w-full max-w-sm p-6 sm:p-8 space-y-6 shadow-2xl relative animate-fade-in-up">
            
            {/* Modal close button */}
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 text-zinc-550 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
            >
              ✕
            </button>

            {/* Google Brand Header */}
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
              </div>
              <h3 className="font-bold text-sm text-zinc-950 dark:text-white tracking-tight flex items-center gap-1.5">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.67-.35-1.37-.35-2.09z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Sign in with Google
              </h3>
              <p className="text-xs text-zinc-550 dark:text-zinc-500">để đồng bộ hóa toàn bộ ghi chú & công việc</p>
            </div>

            {/* Content states */}
            {loginStep === 'loading' ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
                <span className="text-[10px] font-semibold text-zinc-555">Đang thiết lập kết nối an toàn...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Google Real OAuth Button Container */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-zinc-555 dark:text-zinc-400 uppercase tracking-wider block text-center">Đăng nhập tài khoản Google thật</span>
                  <button
                    onClick={handleStartGoogleOAuthRelay}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 font-semibold text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <svg className="w-4 h-4 mr-1 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.67-.35-1.37-.35-2.09z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    Đăng nhập qua Google
                  </button>
                  {/* Fallback container for Google Identity Services button on web */}
                  <div id="google-signin-btn-web" className="flex justify-center mt-2"></div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Lightbox / Zoom Image Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out select-none overflow-hidden"
          onClick={() => setZoomedImage(null)}
          onWheel={(e) => {
            // Extract event properties immediately (before async state updates) to prevent React event pooling bugs
            const rect = e.currentTarget.getBoundingClientRect();
            const clientX = e.clientX;
            const clientY = e.clientY;
            const deltaY = e.deltaY;
            
            const mouseX = clientX - (rect.left + rect.width / 2);
            const mouseY = clientY - (rect.top + rect.height / 2);
            const delta = deltaY < 0 ? 1 : -1;
            const zoomSpeed = 0.15;

            setImgTransform(prev => {
              const nextScale = Math.min(Math.max(prev.scale + delta * zoomSpeed, 0.4), 8);
              const factor = nextScale / prev.scale;
              return {
                scale: nextScale,
                x: mouseX - (mouseX - prev.x) * factor,
                y: mouseY - (mouseY - prev.y) * factor,
              };
            });
          }}
          onMouseMove={(e) => {
            if (!isDraggingImage) return;
            // Extract client coordinates immediately
            const clientX = e.clientX;
            const clientY = e.clientY;
            setImgTransform(prev => ({
              ...prev,
              x: clientX - dragStart.current.x,
              y: clientY - dragStart.current.y
            }));
          }}
          onMouseUp={() => setIsDraggingImage(false)}
          onMouseLeave={() => setIsDraggingImage(false)}
        >
          <div className="relative max-w-full max-h-full flex flex-col items-center p-2">
            <img 
              src={zoomedImage} 
              alt="Zoomed Shared" 
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                if (imgTransform.scale <= 1) return;
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingImage(true);
                dragStart.current = { x: e.clientX - imgTransform.x, y: e.clientY - imgTransform.y };
              }}
              style={{ 
                transform: `translate(${imgTransform.x}px, ${imgTransform.y}px) scale(${imgTransform.scale})`, 
                transition: isDraggingImage ? 'none' : 'transform 0.08s ease-out',
                transformOrigin: 'center center',
                cursor: imgTransform.scale > 1 ? (isDraggingImage ? 'grabbing' : 'grab') : 'zoom-out'
              }}
              className="max-w-[95vw] max-h-[80vh] rounded-lg shadow-2xl object-contain border border-white/10"
            />
            
            <div className="mt-6 flex gap-3 z-10" onClick={(e) => e.stopPropagation()}>
              <span className="absolute top-2 right-2 bg-black/60 text-white font-mono text-[11px] px-2 py-0.5 rounded border border-white/10">
                Tỉ lệ: {Math.round(imgTransform.scale * 100)}%
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyImage(zoomedImage);
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg"
              >
                <Copy className="w-3.5 h-3.5" />
                Sao chép ảnh
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadImage(zoomedImage);
                }}
                className="px-3 py-1.5 rounded-xl bg-teal-650 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg"
              >
                <Download className="w-3.5 h-3.5" />
                Tải ảnh về
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
