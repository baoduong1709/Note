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
  CloudLightning,
  Search
} from "lucide-react";
import { 
  getStoredUser, 
  storeUser, 
  clearStoredUser, 
  generateSyncIdFromEmail, 
  sendShareData, 
  receiveShareHistory,
  deleteShareChannel,
  ShareData
} from "../../../shared/services/shareService";
import { apiRequest, setAuthToken } from '../../../shared/services/apiClient';
import { useLanguage } from "../../../shared/contexts/LanguageContext";


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
  const [showSessionSetup, setShowSessionSetup] = useState(false);


  // Listen to the global WebSocket share events dispatched from App.tsx level
  useEffect(() => {
    const handleWsNewShare = (e: Event) => {
      const customEvent = e as CustomEvent<ShareData>;
      if (customEvent.detail) {
        const share = customEvent.detail;
        setShareHistory(prev => {
          // Prevent duplicates from sender's own optimistic update or ws echo
          const isDuplicate = prev.some(p => 
            p.content === share.content && 
            Math.abs(p.timestamp - share.timestamp) < 15000
          );
          if (isDuplicate) return prev;
          
          triggerToast(`Đã nhận dữ liệu mới từ ${share.userName || 'thiết bị khác'}!`);
          return [share, ...prev];
        });
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
        
      } else {
        handleUserInit(stored);
        
      }
    } else if (anonCode) {
      setUser({
        email: "anonymous@notebook.io",
        name: language === "vi" ? "Thiết bị ẩn danh" : "Anonymous Device"
      });
      setSyncId(anonCode);
      fetchData(anonCode);
      
    } else {
      setUser(null);
      setSyncId("");
      
    }

    const handleAuthChange = () => {
      const anonCodeUpdate = sessionStorage.getItem("anonymous_share_code");
      const updatedUser = getStoredUser();
      
      if (updatedUser) {
        setUser(updatedUser);
        if (anonCodeUpdate) {
          setSyncId(anonCodeUpdate);
          fetchData(anonCodeUpdate);
          
        } else {
          handleUserInit(updatedUser);
          
        }
      } else if (anonCodeUpdate) {
        setUser({
          email: "anonymous@notebook.io",
          name: language === "vi" ? "Thiết bị ẩn danh" : "Anonymous Device"
        });
        setSyncId(anonCodeUpdate);
        fetchData(anonCodeUpdate);
        
      } else {
        setUser(null);
        setSyncId("");
        setShareHistory([]);
        
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
      // If the file is already small (under 300KB) and is a PNG, bypass compression to save CPU/memory
      if (file.size < 300 * 1024 && file.type === "image/png") {
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

              // Draw image (keep transparency for PNG format)
              ctx.drawImage(img, 0, 0, width, height);
              
              // Export as PNG so ClipboardItem and clipboard operations work out-of-the-box
              const pngBase64 = canvas.toDataURL("image/png");
              resolve(pngBase64);
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





  const handleLogout = async () => {
    const isAnon = sessionStorage.getItem("anonymous_share_code") !== null;
    const isUserLoggedIn = getStoredUser() !== null;

    if (isUserLoggedIn && isAnon) {
      sessionStorage.removeItem("anonymous_share_code");
      window.dispatchEvent(new CustomEvent("auth-state-changed"));
      triggerToast(language === "vi" ? "Đã thoát phiên chia sẻ, quay lại đồng bộ tài khoản." : "Exited session sharing, returned to account sync.");
      return;
    }

    if (syncId) {
      await deleteShareChannel(syncId);
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

    const type = sendImage ? 'image' : 'text';
    const content = sendImage ? sendImage : sendText;

    const optimisticShare: ShareData = {
      type,
      content,
      timestamp: Date.now(),
      userEmail: user.email,
      userName: user.name,
    };

    // Optimistic UI Update
    setShareHistory(prev => [optimisticShare, ...prev]);
    setSendText("");
    setSendImage(null);
    setIsSending(true);

    try {
      await sendShareData(syncId, type, content, user.email, user.name);
      triggerToast("Đã gửi chia sẻ thành công!");
    } catch (err) {
      console.error(err);
      triggerToast("Lỗi khi gửi dữ liệu chia sẻ!");
      // Revert optimistic update
      setShareHistory(prev => prev.filter(s => s !== optimisticShare));
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
      let blob = await response.blob();

      // Convert non-PNG images to PNG since ClipboardItem only supports image/png on most platforms
      if (blob.type !== "image/png") {
        blob = await new Promise<Blob>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Could not get 2d context from canvas"));
              return;
            }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => {
              if (b) {
                resolve(b);
              } else {
                reject(new Error("Canvas toBlob returned null"));
              }
            }, "image/png");
          };
          img.onerror = () => {
            reject(new Error("Failed to load image for clipboard conversion"));
          };
          img.src = base64;
        });
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob
        })
      ]);
      triggerToast(language === "vi" ? "Đã sao chép ảnh vào Clipboard!" : "Copied image to clipboard!");
    } catch (err) {
      console.error("Failed to copy image:", err);
      triggerToast(language === "vi" ? "Không hỗ trợ sao chép định dạng này!" : "This format does not support copying!");
    }
  };

  return (
    <div onPaste={handlePaste} className="flex-1 flex flex-col h-full overflow-hidden space-y-2 sm:space-y-4 view-enter-animate">
      
      {/* Header View */}
      <div className="flex justify-between items-center shrink-0 border-b border-zinc-200 dark:border-white/5 pb-3">
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
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl mx-auto animate-fade-in overflow-y-auto pb-28 xl:pb-0 px-4">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/10 text-purple-400 flex items-center justify-center relative shadow-inner animate-pulse mb-6 mx-auto">
            <CloudLightning className="w-8 h-8" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-teal-400"></span>
          </div>

          <div className="text-center space-y-2 mb-8">
            <h4 className="text-lg font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
              {language === "vi" ? "Kênh Chia Sẻ & Đồng Bộ" : "Share & Sync Channels"}
            </h4>
            <p className="text-sm text-zinc-555 dark:text-zinc-400 leading-relaxed max-w-md mx-auto">
              {language === "vi"
                ? "Lựa chọn phương thức kết nối để chia sẻ văn bản và hình ảnh nhanh giữa các thiết bị."
                : "Choose a connection method to quickly share text and images between devices."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {/* Google Sign In Card */}
            <div className="glass-panel rounded-2xl p-6 border border-zinc-200/50 dark:border-white/5 space-y-4 text-center premium-hover-glow transition-all shadow-sm">
              <div className="w-14 h-14 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-sm mx-auto">
                <svg className="w-7 h-7" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.67-.35-1.37-.35-2.09z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              </div>
              <div>
                <h5 className="font-bold text-zinc-800 dark:text-zinc-200">{language === "vi" ? "Tài khoản Google" : "Google Account"}</h5>
                <p className="text-xs text-zinc-500 mt-1">{t("sidebar.signinGoogle")} {language === "vi" ? "để đồng bộ tự động." : "to sync automatically."}</p>
              </div>
              <button
                onClick={() => {
                  setLoginStep('accounts');
                  setShowLoginModal(true);
                }}
                className="w-full mt-2 bg-purple-600 hover:bg-purple-550 text-white font-semibold text-sm py-3 rounded-xl transition-all shadow-md"
              >
                {t("sidebar.signinGoogle")}
              </button>
            </div>

            {/* Anonymous Session Card */}
            <div className="glass-panel rounded-2xl p-6 border border-zinc-200/50 dark:border-white/5 space-y-4 text-center premium-hover-glow transition-all shadow-sm">
              <div className="w-14 h-14 bg-purple-50 dark:bg-purple-500/10 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 mx-auto">
                <Share2 className="w-7 h-7" />
              </div>
              <div>
                <h5 className="font-bold text-zinc-800 dark:text-zinc-200">{language === "vi" ? "Phiên Ẩn Danh" : "Anonymous Session"}</h5>
                <p className="text-xs text-zinc-500 mt-1">{t("share.anonDesc")}</p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleStartAnonymousSession}
                  className="w-full bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-bold text-sm py-2.5 rounded-xl transition-all shadow-sm"
                >
                  {language === "vi" ? "Tạo mã mới" : "Create Code"}
                </button>
                <div className="flex gap-2 w-full mt-1">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder={language === "vi" ? "Mã 6 số" : "6 digits"}
                    value={joinSessionCode}
                    onChange={(e) => setJoinSessionCode(e.target.value.replace(/\D/g, ""))}
                    className="w-1/2 p-2.5 rounded-xl bg-black/5 dark:bg-black/30 border border-zinc-300 dark:border-white/10 text-center text-sm font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                  />
                  <button
                    type="button"
                    onClick={handleJoinAnonymousSession}
                    className="w-1/2 bg-purple-650 hover:bg-purple-600 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-md"
                  >
                    {language === "vi" ? "Tham gia" : "Join"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // LOGGED IN STATE
        <div className="flex-1 flex overflow-hidden pb-4 w-full h-full max-w-[1400px] mx-auto">
          <div className="w-full h-full lg:grid lg:grid-cols-12 lg:gap-6 flex flex-col overflow-y-auto lg:overflow-hidden">
            
            {/* LEFT COLUMN: COMPOSE & CONNECTION INFO */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col h-full gap-4 mt-2 overflow-y-auto lg:overflow-hidden pr-1">
              
              {/* Connection Info Card */}
              <div className="glass-panel bg-zinc-50/80 dark:bg-[#1a1b26]/80 rounded-2xl p-4 sm:p-5 border border-zinc-200/50 dark:border-white/5 shadow-sm flex-shrink-0">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                      {language === "vi" ? "Kết nối:" : "Connection:"}
                    </span>
                    {sessionStorage.getItem("anonymous_share_code") ? (
                      <span className="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1.5 bg-purple-500/10 px-3 py-1.5 rounded-full text-xs">
                        <Share2 className="w-3.5 h-3.5 animate-pulse" /> {language === "vi" ? `Mã: ${sessionStorage.getItem("anonymous_share_code")}` : `Code: ${sessionStorage.getItem("anonymous_share_code")}`}
                      </span>
                    ) : (
                      <span className="text-teal-650 dark:text-teal-400 font-bold flex items-center gap-1.5 bg-teal-500/10 px-3 py-1.5 rounded-full text-xs">
                        <CloudLightning className="w-3.5 h-3.5" /> {language === "vi" ? "Đám mây tài khoản" : "Cloud Account"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                    <span className="flex-1 truncate pr-2">
                      {sessionStorage.getItem("anonymous_share_code") 
                        ? (language === "vi" ? "Chia sẻ tạm thời." : "Temporary session.")
                        : (language === "vi" ? "Tự động đồng bộ với tài khoản." : "Auto sync to account.")}
                    </span>
                    
                    {sessionStorage.getItem("anonymous_share_code") ? (
                      <button
                        onClick={handleLogout}
                        className="text-red-500 hover:text-red-400 font-bold cursor-pointer transition-all hover:underline whitespace-nowrap bg-red-500/10 px-2 py-1 rounded-md"
                      >
                        {language === "vi" 
                          ? (user.email !== "anonymous@notebook.io" ? "Hủy kết nối" : "Thoát phiên") 
                          : (user.email !== "anonymous@notebook.io" ? "Disconnect" : "Exit Session")
                        }
                      </button>
                    ) : (
                      user.email !== "anonymous@notebook.io" && (
                        <button
                          onClick={() => setShowSessionSetup(!showSessionSetup)}
                          className="text-purple-650 dark:text-purple-400 font-bold cursor-pointer transition-all hover:bg-purple-500/10 px-2 py-1 rounded-md whitespace-nowrap"
                        >
                          {showSessionSetup 
                            ? (language === "vi" ? "Đóng" : "Close") 
                            : (language === "vi" ? "Kết nối ẩn danh" : "Anonymous link")
                          }
                        </button>
                      )
                    )}
                  </div>
                  
                  {/* Session setup collapse block */}
                  {showSessionSetup && user.email !== "anonymous@notebook.io" && !sessionStorage.getItem("anonymous_share_code") && (
                    <div className="mt-2 p-3 rounded-xl bg-black/5 dark:bg-black/20 border border-zinc-200 dark:border-white/5 animate-fade-in space-y-3">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleStartAnonymousSession();
                            setShowSessionSetup(false);
                          }}
                          className="flex-1 bg-white hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-bold py-2 rounded-xl transition-all cursor-pointer shadow-sm text-xs"
                        >
                          {language === "vi" ? "Tạo mã mới" : "Create Code"}
                        </button>
                        <div className="flex gap-2 flex-1">
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="123456"
                            value={joinSessionCode}
                            onChange={(e) => setJoinSessionCode(e.target.value.replace(/\D/g, ""))}
                            className="w-full p-2 rounded-xl bg-white dark:bg-black/30 border border-zinc-300 dark:border-white/10 text-center text-xs font-mono focus:outline-none focus:border-purple-500/50"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              handleJoinAnonymousSession();
                              setShowSessionSetup(false);
                            }}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl transition-all cursor-pointer text-xs shadow-md"
                          >
                            {language === "vi" ? "Vào" : "Join"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Compose Card */}
              <div 
                className="glass-panel bg-zinc-50/80 dark:bg-[#1a1b26]/80 rounded-2xl p-4 sm:p-5 border border-zinc-200/50 dark:border-white/5 shadow-md flex-1 flex flex-col min-h-[350px] lg:min-h-0 relative"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Drag overlay */}
                {isDragging && (
                  <div className="absolute inset-0 z-10 bg-purple-500/10 backdrop-blur-sm rounded-2xl border-2 border-dashed border-purple-500 flex items-center justify-center">
                    <span className="flex flex-col items-center text-purple-600 dark:text-purple-400 font-bold text-base pointer-events-none drop-shadow-md">
                      <ImageIcon className="w-10 h-10 mb-2 animate-bounce" />
                      {language === "vi" ? "Thả ảnh vào đây" : "Drop image here"}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                    {language === "vi" ? "Soạn thảo" : "Compose"}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-500 font-semibold cursor-pointer px-3 py-1.5 rounded-lg bg-purple-500/5 hover:bg-purple-500/10 transition-colors">
                    <ImageIcon className="w-4 h-4" />
                    {language === "vi" ? "Chọn ảnh" : "Select Image"}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageChange} 
                      className="hidden" 
                    />
                  </label>
                </div>

                <div className="flex-1 flex flex-col bg-white dark:bg-black/20 rounded-xl border border-zinc-200 dark:border-white/10 overflow-hidden relative group">
                  {!sendImage ? (
                    <textarea
                      value={sendText}
                      onChange={(e) => setSendText(e.target.value)}
                      placeholder={language === "vi" ? "Nhập nội dung, hoặc dán/thả ảnh vào đây..." : "Enter text, or paste/drop image here..."}
                      className="w-full h-full bg-transparent border-none outline-none focus:ring-0 p-4 text-sm text-zinc-800 dark:text-zinc-300 resize-none placeholder-zinc-400"
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-3 relative overflow-hidden bg-black/5 dark:bg-black/30">
                      <img 
                        src={sendImage} 
                        alt="To Send" 
                        className="max-h-full max-w-full rounded-lg shadow-sm object-contain" 
                      />
                      <button
                        onClick={() => setSendImage(null)}
                        className="absolute top-2 right-2 p-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all shadow-md"
                        title={language === "vi" ? "Xóa ảnh" : "Remove image"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 hidden lg:block">
                    {language === "vi" ? "Hỗ trợ Ctrl+V và Kéo thả" : "Supports Ctrl+V and Drag&Drop"}
                  </span>
                  <button
                    onClick={handleSend}
                    disabled={isSending || (!sendText.trim() && !sendImage)}
                    className="w-full lg:w-auto bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm px-8 py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 ml-auto"
                  >
                    {isSending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {language === "vi" ? "Gửi" : "Send"}
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: HISTORY */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full mt-4 lg:mt-0 pb-2 lg:overflow-hidden">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  {language === "vi" ? "Lịch sử nhận" : "Received History"}
                  <span className="bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 py-0.5 px-2 rounded-full text-[10px]">
                    {shareHistory.length}
                  </span>
                </span>
                
                <div className="flex items-center gap-2">
                  {lastSyncTime && (
                    <span className="hidden sm:inline text-xs text-zinc-400 font-mono mr-1">
                      {lastSyncTime.toLocaleTimeString()}
                    </span>
                  )}
                  {shareHistory.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!syncId) return;
                        try {
                          await apiRequest(`/api/share/${syncId}`, { method: 'DELETE' });
                          setShareHistory([]);
                          triggerToast(language === "vi" ? "Đã xóa toàn bộ lịch sử chia sẻ!" : "Cleared all sharing history!");
                        } catch {
                          triggerToast(language === "vi" ? "Lỗi khi xóa lịch sử!" : "Error clearing history!");
                        }
                      }}
                      className="p-1.5 sm:p-2 rounded-xl bg-zinc-100 dark:bg-white/5 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 transition-all shadow-sm"
                      title={language === "vi" ? "Xóa toàn bộ lịch sử" : "Clear all history"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => fetchData(syncId, true)}
                    disabled={isSyncing}
                    className="p-1.5 sm:p-2 rounded-xl bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-700 dark:text-zinc-300 transition-all shadow-sm disabled:opacity-50"
                    title={language === "vi" ? "Làm mới dữ liệu" : "Refresh data"}
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {networkError && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-500 text-xs rounded-xl p-3 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{language === "vi" ? "Lỗi kết nối máy chủ. Đang thử lại..." : "Server connection error. Retrying..."}</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 space-y-3 pb-6 custom-scrollbar">
                {shareHistory.length > 0 ? (
                  shareHistory.map((item, idx) => (
                    <div key={idx} className="glass-panel bg-white/80 dark:bg-zinc-800/80 border border-zinc-200 dark:border-white/5 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                      {/* Meta info */}
                      <div className="flex items-center justify-between mb-2 text-xs border-b border-zinc-100 dark:border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-[10px]">
                            {item.userName?.[0]?.toUpperCase() || "?"}
                          </div>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{item.userName}</span>
                        </div>
                        <span className="text-zinc-400 font-mono text-[10px]">{new Date(item.timestamp).toLocaleString()}</span>
                      </div>

                      {/* Content */}
                      {item.type === 'text' ? (
                        <div className="space-y-2 mt-2">
                          <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed bg-black/5 dark:bg-black/20 p-3.5 rounded-xl">
                            {item.content}
                          </pre>
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleCopyText(item.content)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-transparent dark:border-white/5 text-zinc-600 dark:text-zinc-300 font-medium text-xs transition-all"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {language === "vi" ? "Sao chép" : "Copy"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 mt-2">
                          <div className="bg-black/5 dark:bg-black/20 p-2 rounded-xl flex items-center justify-center relative group">
                            <img 
                              src={item.content} 
                              alt="Shared" 
                              title={language === "vi" ? "Kích đúp để phóng to" : "Double click to zoom"}
                              onDoubleClick={() => {
                                setZoomedImage(item.content);
                                setImgTransform({ scale: 1, x: 0, y: 0 });
                              }}
                              className="max-h-[250px] rounded-lg object-contain cursor-zoom-in transition-transform" 
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center pointer-events-none">
                              <span className="text-white text-xs font-semibold px-3 py-1.5 bg-black/60 rounded-full flex items-center gap-1">
                                <Search className="w-3.5 h-3.5" /> {language === "vi" ? "Phóng to" : "Zoom"}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleCopyImage(item.content)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300 font-medium text-xs transition-all"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {language === "vi" ? "Sao chép ảnh" : "Copy Image"}
                            </button>
                            <button
                              onClick={() => handleDownloadImage(item.content)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-all shadow-sm"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {language === "vi" ? "Tải về" : "Download"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center text-zinc-400 py-12 space-y-3 bg-black/5 dark:bg-black/20 rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 h-48 lg:h-auto lg:min-h-[200px]">
                    <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                      <CloudLightning className="w-6 h-6 opacity-50 text-purple-400" />
                    </div>
                    <div className="text-center px-4">
                      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{language === "vi" ? "Chưa có dữ liệu nào." : "No data yet."}</p>
                      <p className="text-xs max-w-xs mt-1 leading-relaxed opacity-80">
                        {language === "vi" 
                          ? "Dữ liệu được chia sẻ từ thiết bị khác sẽ xuất hiện ở đây." 
                          : "Data shared from other devices will appear here."}
                      </p>
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
              <p className="text-xs text-zinc-550 dark:text-zinc-500">{language === "vi" ? "để đồng bộ hóa toàn bộ ghi chú & công việc" : "to synchronize all notes & tasks"}</p>
            </div>

            {/* Content states */}
            {loginStep === 'loading' ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
                <span className="text-[10px] font-semibold text-zinc-555">{language === "vi" ? "Đang thiết lập kết nối an toàn..." : "Establishing secure connection..."}</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Google Real OAuth Button Container */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-zinc-555 dark:text-zinc-400 uppercase tracking-wider block text-center">{language === "vi" ? "Đăng nhập tài khoản Google thật" : "Sign in with real Google account"}</span>
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
                    {language === "vi" ? "Đăng nhập qua Google" : "Sign in with Google"}
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
                {language === "vi" ? "Tỉ lệ:" : "Zoom:"} {Math.round(imgTransform.scale * 100)}%
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyImage(zoomedImage);
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg"
              >
                <Copy className="w-3.5 h-3.5" />
                {language === "vi" ? "Sao chép ảnh" : "Copy Image"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadImage(zoomedImage);
                }}
                className="px-3 py-1.5 rounded-xl bg-teal-650 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg"
              >
                <Download className="w-3.5 h-3.5" />
                {language === "vi" ? "Tải ảnh về" : "Download Image"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
