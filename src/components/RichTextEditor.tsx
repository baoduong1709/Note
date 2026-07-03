import React, { useState, useEffect, useRef } from "react";
import { 
  Type, 
  Heading, 
  CheckSquare, 
  Terminal, 
  AlertTriangle,
  Bold,
  Italic,
  List
} from "lucide-react";

interface RichTextEditorProps {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => Promise<void>;
  triggerToast: (message: string) => void;
}

export default function RichTextEditor({
  noteId,
  initialTitle,
  initialContent,
  onSave,
  triggerToast
}: RichTextEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const editorRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state and editor content when note changes
  useEffect(() => {
    setTitle(initialTitle);
    if (editorRef.current) {
      // Check if content looks like HTML, otherwise wrap raw lines in paragraphs
      if (initialContent.trim().startsWith("<") && initialContent.trim().endsWith(">")) {
        editorRef.current.innerHTML = initialContent;
      } else {
        // Convert raw text/markdown to clean HTML paragraphs
        const paragraphs = initialContent
          .split("\n")
          .map(line => {
            if (line.trim() === "") return "<p><br></p>";
            // Basic title parser
            if (line.startsWith("# ")) return `<h2 class="text-sm font-bold text-teal-400 mt-3 mb-1.5 border-b border-white/5 pb-1">${line.substring(2)}</h2>`;
            // Basic checkbox parser
            if (line.startsWith("- [ ]") || line.startsWith("- [x]")) {
              const checked = line.startsWith("- [x]");
              const text = line.substring(5).trim();
              return `<div class="flex items-center gap-2 py-0.5"><input type="checkbox" ${checked ? "checked" : ""} class="todo-chk rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-purple-600 cursor-pointer w-4 h-4 shrink-0" /> <span class="text-xs ${checked ? "line-through text-zinc-500" : "text-zinc-300"}">${text}</span></div>`;
            }
            return `<p class="text-xs text-zinc-300 leading-relaxed my-1">${line}</p>`;
          })
          .join("");
        editorRef.current.innerHTML = paragraphs || "<p><br></p>";
      }
    }
  }, [noteId, initialTitle, initialContent]);

  // Debounced auto-save
  const triggerAutoSave = (newTitle: string, htmlContent: string) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await onSave(newTitle, htmlContent);
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setSaving(false);
      }
    }, 800);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (editorRef.current) {
      triggerAutoSave(val, editorRef.current.innerHTML);
    }
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      triggerAutoSave(title, editorRef.current.innerHTML);
    }
  };

  // Exec command helper for rich formatting
  const executeCommand = (command: string, value: string = "") => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      triggerAutoSave(title, editorRef.current.innerHTML);
    }
  };

  // Insert Custom Copy Block widget inside contentEditable cursor
  const insertCopyBlock = () => {
    // Unique ID for warning handling
    const blockId = `cb-${Math.random().toString(36).substring(2, 9)}`;
    const html = 
      `<div class="copy-block-embed border border-white/5 bg-zinc-900 rounded-lg p-3 my-2 space-y-2 relative" contenteditable="false" id="${blockId}">` +
        `<div class="flex justify-between items-center text-[9px] font-mono text-zinc-500">` +
          `<span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span>BASH Block</span>` +
          `<button class="copy-btn bg-purple-600 hover:bg-purple-500 text-white font-bold px-2 py-0.5 rounded text-[9px] transition-all cursor-pointer">Copy</button>` +
        `</div>` +
        `<div class="bg-black/30 p-1 rounded font-mono text-xs text-purple-300 overflow-hidden">` +
          `<textarea class="code-input w-full bg-transparent border-none outline-none font-mono text-xs text-purple-300 focus:ring-0 p-1.5 resize-none h-12 leading-normal" placeholder="Nhập câu lệnh..."></textarea>` +
        `</div>` +
      `</div><p><br></p>`;

    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    if (editorRef.current) {
      triggerAutoSave(title, editorRef.current.innerHTML);
    }
    triggerToast("Đã chèn ô Copy Block vào tài liệu!");
  };

  // Insert Checklist item
  const insertChecklist = () => {
    const html = `<div class="flex items-center gap-2 py-0.5"><input type="checkbox" class="todo-chk rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-purple-600 cursor-pointer w-4 h-4 shrink-0" /> <span class="text-xs text-zinc-300">Việc cần làm...</span></div>`;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    if (editorRef.current) {
      triggerAutoSave(title, editorRef.current.innerHTML);
    }
  };

  // Event delegation on Editor container
  const handleEditorClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // 1. Handle Copy Button click inside CopyBlock embed
    if (target.classList.contains("copy-btn")) {
      e.preventDefault();
      e.stopPropagation();

      const embedContainer = target.closest(".copy-block-embed");
      const textarea = embedContainer?.querySelector(".code-input") as HTMLTextAreaElement | null;
      const codeText = textarea?.value || "";

      if (!codeText.trim()) {
        triggerToast("Câu lệnh trống!");
        return;
      }

      // Check danger keywords
      const dangerousKeywords = ["rm -rf", "drop table", "drop database", "truncate", "kubectl delete", "sudo rm"];
      const isDangerous = dangerousKeywords.some(kw => codeText.toLowerCase().includes(kw));

      if (isDangerous) {
        if (!window.confirm(`⚠️ CẢNH BÁO NGUY HIỂM:\nCâu lệnh này chứa từ khóa xóa phá hoại:\n"${codeText}"\n\nBạn có thực sự muốn Copy?`)) {
          return;
        }
      }

      try {
        await navigator.clipboard.writeText(codeText);
        
        // Show success animation on the button
        const originalText = target.innerText;
        target.innerText = "Copied!";
        target.classList.remove("bg-purple-600");
        target.classList.add("bg-emerald-600");
        
        triggerToast("Đã sao chép lệnh!");

        setTimeout(() => {
          target.innerText = originalText;
          target.classList.remove("bg-emerald-600");
          target.classList.add("bg-purple-600");
        }, 2000);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    }

    // 2. Handle Checklist Checkbox toggling
    if (target.classList.contains("todo-chk")) {
      const checkbox = target as HTMLInputElement;
      const label = checkbox.nextElementSibling as HTMLElement | null;
      
      if (label) {
        if (checkbox.checked) {
          label.classList.add("line-through", "text-zinc-500");
          label.classList.remove("text-zinc-300");
          // Add attribute checked to HTML to persist state in innerHTML save
          checkbox.setAttribute("checked", "checked");
        } else {
          label.classList.remove("line-through", "text-zinc-500");
          label.classList.add("text-zinc-300");
          checkbox.removeAttribute("checked");
        }
      }
      // Instant save
      if (editorRef.current) {
        await onSave(title, editorRef.current.innerHTML);
      }
    }
  };

  // Detect API Keys / Passwords inside the HTML content
  const detectSecrets = (): boolean => {
    if (!editorRef.current) return false;
    const text = editorRef.current.innerText || "";
    const apiRegex = /(api[-_]?key|secret|token|password|passwd|auth)[-_]?\w*\s*[:=]\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/i;
    const privateKeyRegex = /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/i;
    const awsRegex = /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA)[A-Z0-9]{16}/;
    return apiRegex.test(text) || privateKeyRegex.test(text) || awsRegex.test(text);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-text">
      {/* 1. TITLE & TOOLBAR */}
      <div className="pb-3 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 shrink-0">
        <input 
          type="text" 
          value={title}
          onChange={handleTitleChange}
          placeholder="Tiêu đề ghi chú..."
          className="bg-transparent border-none outline-none font-bold text-white text-sm sm:text-base focus:ring-0 p-0 w-full sm:w-2/3"
        />

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          <span className="text-[9px] text-zinc-500">
            {saving ? "Saving..." : "Auto-saved"}
          </span>

          {/* Standard Word-style Formatting Toolbar */}
          <div className="flex bg-zinc-900 border border-white/5 rounded-lg p-0.5 text-[10px] text-zinc-400 font-semibold gap-1 items-center px-2">
            <button 
              onClick={() => executeCommand("bold")}
              className="p-1 rounded hover:bg-zinc-800 hover:text-white"
              title="Chữ đậm"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => executeCommand("italic")}
              className="p-1 rounded hover:bg-zinc-800 hover:text-white"
              title="Chữ nghiêng"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => executeCommand("formatBlock", "<h2>")}
              className="p-1 rounded hover:bg-zinc-800 hover:text-white flex items-center"
              title="Tiêu đề (Header)"
            >
              <Heading className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-3 bg-white/10 mx-0.5"></div>
            <button 
              onClick={insertChecklist}
              className="p-1 rounded hover:bg-zinc-800 hover:text-white flex items-center"
              title="Chèn checklist"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={insertCopyBlock}
              className="px-2 py-0.5 rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-all"
              title="Chèn khối copy nhanh"
            >
              <Terminal className="w-3.5 h-3.5" /> + Copy Block
            </button>
          </div>
        </div>
      </div>

      {/* 2. SECURITY WARNING BANNER */}
      {detectSecrets() && (
        <div className="mb-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] sm:text-xs flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-500" />
          <span><strong>Cảnh báo bảo mật:</strong> Phát hiện thông tin nhạy cảm (API Key hoặc Password) trong ghi chú này.</span>
        </div>
      )}

      {/* 3. WYSIWYG CONTENTEDITABLE BODY */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 pb-10">
        <div
          ref={editorRef}
          contentEditable={true}
          onInput={handleEditorInput}
          onClick={handleEditorClick}
          className="w-full h-full min-h-[300px] text-xs text-zinc-300 leading-relaxed outline-none select-text pb-20 focus:ring-0 border-none prose prose-invert max-w-none"
          placeholder="Bắt đầu soạn thảo ghi chú... Hãy bấm các nút trên Toolbar để chèn nội dung đặc biệt hoặc bôi đậm chữ."
          style={{ wordBreak: "break-word" }}
        />
      </div>
    </div>
  );
}
