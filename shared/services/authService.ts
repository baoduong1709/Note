import { apiRequest, setAuthToken } from './apiClient';
import { storeUser } from './shareService';

export interface GoogleLoginPayload {
  email: string;
  name: string;
  picture?: string;
  credential?: string;
  accessToken?: string;
}

const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

const isAndroidRuntime = () => {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
};

const hasNativeGoogleSignIn = () => {
  return typeof window !== "undefined"
    && typeof (window as any).AndroidGoogleSignIn?.signIn === "function";
};

const waitForNativeGoogleSignIn = async (timeoutMs = 1500) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (hasNativeGoogleSignIn()) return true;
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  return hasNativeGoogleSignIn();
};

const startNativeGoogleSignIn = () => {
  return new Promise<GoogleLoginPayload>((resolve, reject) => {
    const bridge = (window as any).AndroidGoogleSignIn;
    if (typeof bridge?.signIn !== "function") {
      reject(new Error("Native Google Sign-In is not available."));
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("native-google-sign-in-success", handleSuccess as EventListener);
      window.removeEventListener("native-google-sign-in-error", handleError as EventListener);
      clearTimeout(timeoutId);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleSuccess = (event: Event) => {
      const detail = (event as CustomEvent<GoogleLoginPayload>).detail;
      if (detail?.email) {
        finish(() => resolve(detail));
      } else {
        finish(() => reject(new Error("Native Google Sign-In did not return an email.")));
      }
    };
    const handleError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      finish(() => reject(new Error(detail?.message || "Native Google Sign-In failed.")));
    };
    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error("Native Google Sign-In timed out.")));
    }, 15000);

    window.addEventListener("native-google-sign-in-success", handleSuccess as EventListener);
    window.addEventListener("native-google-sign-in-error", handleError as EventListener);

    try {
      bridge.signIn();
    } catch (e) {
      finish(() => reject(e));
    }
  });
};

export async function completeGoogleLogin(loginData: GoogleLoginPayload): Promise<{ email: string; name: string }> {
  const email = loginData.email.trim();
  const name = (loginData.name || email.split("@")[0]).trim();
  const credential = loginData.credential || loginData.accessToken;

  // Call server API if we have a credential (or just email for native sign-in)
  try {
    const authResult = await apiRequest<{ success: boolean; token: string; user: any }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        credential,
        email,
        name,
        picture: loginData.picture,
      }),
    });
    if (authResult.success && authResult.token) {
      setAuthToken(authResult.token);
      await applyServerConfigsToLocal(authResult.user);
    }
  } catch (err) {
    console.error('Failed to authenticate with server:', err);
  }

  storeUser(email, name);
  window.dispatchEvent(new CustomEvent("auth-state-changed"));
  return { email, name };
}

export async function startGoogleOAuth(
  onProgress?: (step: 'loading' | 'accounts') => void,
  triggerToast?: (msg: string) => void
): Promise<{ email: string; name: string } | null> {
  if (onProgress) onProgress('loading');

  try {
    const nativeReady = hasNativeGoogleSignIn() || (isAndroidRuntime() && await waitForNativeGoogleSignIn());
    if (nativeReady) {
      const nativeAccount = await startNativeGoogleSignIn();
      return await completeGoogleLogin(nativeAccount);
    }

    if (isAndroidRuntime()) {
      if (onProgress) onProgress('accounts');
      if (triggerToast) triggerToast("Đăng nhập trên điện thoại chưa sẵn sàng. Hãy dừng và chạy lại npm run tauri android dev để rebuild.");
      return null;
    }

    if (isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      const opener = await import("@tauri-apps/plugin-opener");

      await invoke("start_auth_server");

      return new Promise((resolve, reject) => {
        listen("oauth-response", async (event) => {
          const payload = event.payload as string;
          const params = new URLSearchParams(payload);
          const email = params.get("email");
          const name = params.get("name");
          const accessToken = params.get("access_token");

          if (email && name) {
            const decodedEmail = decodeURIComponent(email);
            const decodedName = decodeURIComponent(name);

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
                  await applyServerConfigsToLocal(authResult.user);
                }
              } catch (err) {
                console.error('Failed to authenticate with server:', err);
              }
            }

            storeUser(decodedEmail, decodedName);
            window.dispatchEvent(new CustomEvent("auth-state-changed"));
            if (triggerToast) triggerToast(`Đăng nhập thành công: ${decodedName}`);
            resolve({ email: decodedEmail, name: decodedName });
          } else {
            reject(new Error("Login payload invalid"));
          }
        }).then(() => {
          opener.openUrl("http://localhost:3000/login");
          if (triggerToast) triggerToast("Đang mở trình duyệt Chrome để đăng nhập...");
        }).catch(reject);
      });

    } else {
      // Web browser
      const CLIENT_ID = "113610150516-jo77q0pv19qso8qg84a2h30hug4jga5s.apps.googleusercontent.com";
      const REDIRECT_URI = window.location.origin + "/oauth-callback.html";
      const SCOPE = "email profile";

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(SCOPE)}` +
        `&prompt=select_account`;

      const width = 500, height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(authUrl, "google-login", `width=${width},height=${height},left=${left},top=${top}`);

      if (!popup) {
        if (triggerToast) triggerToast("Trình duyệt đã chặn popup. Vui lòng cho phép popup!");
        if (onProgress) onProgress('accounts');
        return null;
      }

      return new Promise((resolve) => {
        const handleMessage = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === "google-oauth-success") {
            const { email, name, picture, accessToken } = event.data;
            window.removeEventListener("message", handleMessage);

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
                  await applyServerConfigsToLocal(authResult.user);
                }
              } catch (err) {
                console.error('Failed to authenticate with server:', err);
              }
            }

            storeUser(email, name);
            window.dispatchEvent(new CustomEvent("auth-state-changed"));
            if (triggerToast) triggerToast(`Đăng nhập thành công: ${name}`);
            resolve({ email, name });
          }
        };
        window.addEventListener("message", handleMessage);
      });
    }
  } catch (err: any) {
    console.error("Google Auth error:", err);
    if (triggerToast) triggerToast("Đăng nhập thất bại: " + err.message);
    if (onProgress) onProgress('accounts');
    return null;
  }
}

export async function applyServerConfigsToLocal(user: any): Promise<void> {
  if (user) {
    let needsPush = false;

    const localAi = localStorage.getItem('ai_config');
    if (user.ai_config) {
      localStorage.setItem('ai_config', user.ai_config);
    } else if (localAi) {
      needsPush = true;
    }

    const localSearch = localStorage.getItem('search_config');
    if (user.search_config) {
      localStorage.setItem('search_config', user.search_config);
    } else if (localSearch) {
      needsPush = true;
    }

    const localTg = localStorage.getItem('telegram_config');
    if (user.telegram_config) {
      localStorage.setItem('telegram_config', user.telegram_config);
    } else if (localTg) {
      needsPush = true;
    }

    const localE2ee = localStorage.getItem('e2ee_enabled');
    if (user.e2ee_enabled !== undefined && user.e2ee_enabled !== null) {
      localStorage.setItem('e2ee_enabled', user.e2ee_enabled ? 'true' : 'false');
    } else if (localE2ee) {
      needsPush = true;
    }

    if (needsPush) {
      try {
        const aiData = localStorage.getItem('ai_config');
        const searchData = localStorage.getItem('search_config');
        const tgData = localStorage.getItem('telegram_config');
        const e2eeData = localStorage.getItem('e2ee_enabled');
        await saveUserSettingsToServer(
          aiData ? JSON.parse(aiData) : null,
          searchData ? JSON.parse(searchData) : null,
          tgData ? JSON.parse(tgData) : null,
          e2eeData === 'true'
        );
      } catch (err) {
        console.error("Failed to push local configs to server:", err);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent("settings-sync-completed"));
    }
  }
}

export async function saveUserSettingsToServer(aiConfig: any, searchConfig: any, telegramConfig: any, e2eeEnabled?: boolean): Promise<void> {
  try {
    const payload: any = { aiConfig, searchConfig, telegramConfig };
    if (e2eeEnabled !== undefined) {
      payload.e2eeEnabled = e2eeEnabled;
    }
    
    await apiRequest('/api/auth/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Failed to save settings to server:', err);
    throw err;
  }
}

export async function syncUserSettingsFromServer(): Promise<void> {
  try {
    const res = await apiRequest<{ success: boolean; data: any }>('/api/auth/me');
    if (res.success && res.data) {
      await applyServerConfigsToLocal(res.data);
    }
  } catch (err) {
    console.error('Failed to sync settings from server:', err);
  }
}
