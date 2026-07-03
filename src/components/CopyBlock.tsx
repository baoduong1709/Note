import { useState, useRef, useEffect } from "react";
import { Terminal, Copy, Check, SlidersHorizontal, AlertTriangle } from "lucide-react";

interface CopyBlockProps {
  code: string;
  language?: string;
  noteId?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  triggerToast: (message: string) => void;
}

export default function CopyBlock({ code, language = "bash", editable = false, onChange, triggerToast }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [showVarModal, setShowVarModal] = useState(false);
  const [showDangerModal, setShowDangerModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto resize height based on content length
  useEffect(() => {
    if (editable && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [code, editable]);

  // Extract variables in format {{variable_name}}
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    return matches;
  };

  const vars = extractVariables(code);

  // Generate final command after replacing variables
  const getFinalCommand = (): string => {
    let final = code;
    Object.entries(variables).forEach(([key, val]) => {
      final = final.split(`{{${key}}}`).join(val || `{{${key}}}`);
    });
    return final;
  };

  // Check if command is dangerous
  const isDangerous = (text: string): boolean => {
    const dangerousKeywords = [
      "rm -rf", 
      "drop database", 
      "drop table", 
      "truncate", 
      "kubectl delete", 
      "terraform destroy",
      "git reset --hard",
      "sudo rm"
    ];
    return dangerousKeywords.some(keyword => text.toLowerCase().includes(keyword));
  };

  // Perform actual clipboard write
  const performCopy = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      triggerToast("Đã copy lệnh vào Clipboard!");
      setTimeout(() => setCopied(false), 2000);
      
      // Log copy activity to SQLite logs (optional, handled by parent/service)
    } catch (err) {
      console.error("Failed to copy:", err);
      triggerToast("Lỗi sao chép!");
    }
  };

  const handleCopyClick = () => {
    const finalCmd = getFinalCommand();
    
    // If has unresolved variables, force variable modal first
    const missingVars = vars.filter(v => !variables[v]);
    if (vars.length > 0 && missingVars.length > 0) {
      setShowVarModal(true);
      return;
    }

    // Check danger
    if (isDangerous(finalCmd)) {
      setShowDangerModal(true);
    } else {
      performCopy(finalCmd);
    }
  };

  const handleVariableChange = (key: string, value: string) => {
    setVariables(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 space-y-2 my-1 relative group">
      {/* Block Header */}
      <div className="flex justify-between items-center shrink-0">
        <span className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-purple-650 dark:text-purple-400" />
          {language} Block
        </span>
        
        {/* Compact Action Buttons in Header right! */}
        <div className="flex items-center gap-2">
          {vars.length > 0 && (
            <button 
              type="button"
              onClick={() => setShowVarModal(true)}
              className="text-[9px] text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 flex items-center gap-0.5 font-medium transition-all"
            >
              <SlidersHorizontal className="w-3 h-3" /> Config
            </button>
          )}
          <button 
            type="button"
            onClick={handleCopyClick}
            className={`text-[9px] flex items-center gap-1 px-2.5 py-0.5 rounded font-semibold transition-all ${
              copied 
                ? "bg-emerald-600 text-white" 
                : "bg-purple-600 hover:bg-purple-500 text-white"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-2.5 h-2.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" /> Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code display */}
      {editable ? (
        <div className="bg-black/5 dark:bg-black/30 p-1 rounded font-mono text-xs text-purple-750 dark:text-purple-300 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => {
              if (onChange) onChange(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            placeholder="Nhập câu lệnh..."
            className="w-full bg-transparent border-none outline-none font-mono text-xs text-zinc-700 dark:text-purple-300 focus:ring-0 p-1.5 resize-none min-h-[28px] overflow-hidden leading-normal"
            rows={1}
          />
        </div>
      ) : (
        <div className="bg-black/5 dark:bg-black/30 p-2.5 rounded font-mono text-xs text-purple-750 dark:text-purple-300 break-all overflow-x-auto">
          <code>{code}</code>
        </div>
      )}

      {/* Variable replacement inputs inline if modal not open */}
      {vars.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-200 dark:border-white/5">
          {vars.map(v => (
            <div key={v} className="flex items-center gap-1 bg-black/5 dark:bg-white/5 px-2 py-1 rounded text-[10px]">
              <span className="text-zinc-505 dark:text-zinc-400 font-medium">{v}:</span>
              <input 
                type="text" 
                placeholder="giá trị"
                value={variables[v] || ""}
                onChange={(e) => handleVariableChange(v, e.target.value)}
                className="bg-transparent border-none outline-none text-zinc-705 dark:text-purple-300 w-16 text-[10px] focus:ring-0 p-0"
              />
            </div>
          ))}
        </div>
      )}

      {/* MODAL 1: VARIABLE CONFIGURATION */}
      {showVarModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-[460px] rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-purple-650 dark:text-purple-400 border-b border-zinc-200 dark:border-white/5 pb-2 shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
              <h4 className="font-bold text-sm">Cấu hình biến cho Command</h4>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[9px] text-zinc-500 dark:text-zinc-400 font-bold uppercase mb-1">Cấu trúc gốc</label>
                <code className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-200/50 dark:bg-zinc-950/60 p-2 rounded block break-all">{code}</code>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {vars.map(v => (
                  <div key={v}>
                    <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">{v}</label>
                    <input 
                      type="text" 
                      value={variables[v] || ""} 
                      onChange={(e) => handleVariableChange(v, e.target.value)}
                      className="w-full p-2 rounded glass-input text-zinc-800 dark:text-zinc-300 text-xs"
                      placeholder={`Nhập ${v}...`}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[9px] text-zinc-500 dark:text-zinc-400 font-bold uppercase mb-1">Preview lệnh copy cuối cùng</label>
                <code className="text-[11px] font-mono text-teal-650 dark:text-teal-300 bg-black/5 dark:bg-black/40 p-2.5 rounded block break-all">
                  {getFinalCommand()}
                </code>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 shrink-0 pt-2">
              <button 
                type="button"
                onClick={() => setShowVarModal(false)}
                className="px-3.5 py-1.5 rounded-md text-xs bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold transition-all"
              >
                Đóng
              </button>
              <button 
                type="button"
                onClick={() => {
                  const finalCmd = getFinalCommand();
                  setShowVarModal(false);
                  if (isDangerous(finalCmd)) {
                    setShowDangerModal(true);
                  } else {
                    performCopy(finalCmd);
                  }
                }}
                className="px-3.5 py-1.5 rounded-md text-xs bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all"
              >
                Copy Lệnh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DANGER ALERT CONFIRMATION */}
      {showDangerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-[420px] border border-red-500/20 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-650 dark:text-red-400 mb-2 shrink-0">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
              <h4 className="font-bold text-sm">CẢNH BÁO LỆNH NGUY HIỂM!</h4>
            </div>
            
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Dòng lệnh bạn đang chuẩn bị copy chứa từ khóa nguy hiểm, có thể làm hỏng hoặc xóa dữ liệu trên hệ thống staging/production.
            </p>
            
            <div className="bg-black/5 dark:bg-black/60 p-2.5 rounded-lg font-mono text-[11px] text-red-650 dark:text-red-300 break-all">
              <code>{getFinalCommand()}</code>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 shrink-0">
              <button 
                type="button"
                onClick={() => setShowDangerModal(false)}
                className="px-3.5 py-1.5 rounded-md text-xs bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold transition-all"
              >
                Hủy bỏ
              </button>
              <button 
                type="button"
                onClick={() => {
                  setShowDangerModal(false);
                  performCopy(getFinalCommand());
                }}
                className="px-3.5 py-1.5 rounded-md text-xs bg-red-600 hover:bg-red-500 text-white font-semibold transition-all"
              >
                Vẫn Copy (Copy Anyway)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
