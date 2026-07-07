import React, { useState, useEffect, useRef } from "react";
import CopyBlock from "./CopyBlock";
import { PlusCircle, CheckSquare, AlertTriangle } from "lucide-react";
import { createTask, Task } from "../database/queries/tasks";

interface MarkdownEditorProps {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => Promise<void>;
  triggerToast: (message: string) => void;
}

export default function MarkdownEditor({ 
  noteId, 
  initialTitle, 
  initialContent, 
  onSave, 
  triggerToast 
}: MarkdownEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [isEditMode, setIsEditMode] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state when props change
  useEffect(() => {
    setTitle(initialTitle);
    setContent(initialContent);
    setIsEditMode(true); 
  }, [noteId, initialTitle, initialContent]);

  // Debounced auto-save logic
  const triggerAutoSave = (newTitle: string, newContent: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await onSave(newTitle, newContent);
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
    triggerAutoSave(val, content);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    triggerAutoSave(title, val);
  };

  // Convert checklist item into a standalone local Task
  const handleConvertToTask = async (lineIndex: number, text: string) => {
    const taskId = Math.random().toString(36).substring(2, 11);
    
    // Create new Task record in SQLite database
    const newTask: Task = {
      id: taskId,
      note_id: noteId,
      title: text,
      status: "todo",
      priority: "medium",
      due_date: null,
      workspace_id: "personal",
      project_id: null,
      source: "local",
      external_id: null,
      external_url: null,
      is_pending_sync: 1
    };

    try {
      await createTask(newTask);
      
      // Update original content in Note editor to reference linked task
      const lines = content.split("\n");
      const targetLine = lines[lineIndex];
      lines[lineIndex] = targetLine.replace(text, `[linked-task:${taskId}] ${text}`);
      
      const newContent = lines.join("\n");
      setContent(newContent);
      
      setSaving(true);
      await onSave(title, newContent);
      triggerToast("Đã chuyển đổi checklist thành standalone Task!");
    } catch (err) {
      console.error("Failed to convert task:", err);
      triggerToast("Lỗi chuyển đổi Task!");
    } finally {
      setSaving(false);
    }
  };

  // Checklist toggling logic in Preview Mode
  const toggleChecklistItem = async (lineIndex: number, currentStatus: boolean) => {
    const lines = content.split("\n");
    const targetLine = lines[lineIndex];
    
    if (currentStatus) {
      lines[lineIndex] = targetLine.replace("- [x]", "- [ ]");
    } else {
      lines[lineIndex] = targetLine.replace("- [ ]", "- [x]");
    }

    const newContent = lines.join("\n");
    setContent(newContent);
    
    setSaving(true);
    try {
      await onSave(title, newContent);
    } catch (err) {
      console.error("Checklist save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // Markdown custom parser function for Preview Mode
  const renderPreview = () => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    
    let isInsideCodeBlock = false;
    let codeLanguage = "bash";
    let codeLinesAccumulator: string[] = [];
    let codeBlockStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle Code Block delimiters
      if (line.trim().startsWith("```")) {
        if (!isInsideCodeBlock) {
          isInsideCodeBlock = true;
          codeLanguage = line.trim().substring(3) || "bash";
          codeLinesAccumulator = [];
          codeBlockStartIndex = i;
        } else {
          isInsideCodeBlock = false;
          const fullCode = codeLinesAccumulator.join("\n");
          elements.push(
            <CopyBlock 
              key={`code-${codeBlockStartIndex}`}
              code={fullCode}
              language={codeLanguage}
              noteId={noteId}
              triggerToast={triggerToast}
            />
          );
        }
        continue;
      }

      if (isInsideCodeBlock) {
        codeLinesAccumulator.push(line);
        continue;
      }

      // Headers
      if (line.startsWith("# ")) {
        elements.push(
          <h1 key={`h1-${i}`} className="text-lg font-bold text-zinc-900 dark:text-white mt-4 mb-2">
            {line.substring(2)}
          </h1>
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h2 key={`h2-${i}`} className="text-sm font-bold text-teal-600 dark:text-teal-400 mt-3 mb-1.5 border-b border-zinc-200 dark:border-white/5 pb-1">
            {line.substring(3)}
          </h2>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h3 key={`h3-${i}`} className="text-xs font-bold text-purple-650 dark:text-purple-400 mt-2.5 mb-1">
            {line.substring(4)}
          </h3>
        );
      } 
      // Checklist Items
      else if (line.trim().startsWith("- [ ]") || line.trim().startsWith("- [x]")) {
        const isChecked = line.trim().startsWith("- [x]");
        const textStartIdx = line.indexOf("]") + 1;
        let text = line.substring(textStartIdx).trim();
        const lineIdx = i;

        // Check if checklist item is already converted to task
        const linkedTaskMatch = text.match(/^\[linked-task:([^\]]+)\](.*)/);
        let isLinked = false;

        if (linkedTaskMatch) {
          text = linkedTaskMatch[2].trim();
          isLinked = true;
        }

        elements.push(
          <div 
            key={`check-${i}`} 
            className="flex items-center justify-between py-1 group checkbox-container hover:bg-black/5 dark:hover:bg-white/5 px-2 rounded-lg transition-all"
          >
            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleChecklistItem(lineIdx, isChecked)}
                className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-purple-600 focus:ring-purple-600 cursor-pointer"
              />
              <span className={`text-xs ${isChecked ? "line-through text-zinc-500" : "text-zinc-700 dark:text-zinc-300"}`}>
                {text}
              </span>
              {isLinked && (
                <span className="text-[8px] bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded font-bold ml-2 flex items-center gap-0.5">
                  <CheckSquare className="w-2.5 h-2.5" /> Linked Task
                </span>
              )}
            </div>
            {!isLinked && (
              <button 
                type="button"
                onClick={() => handleConvertToTask(lineIdx, text)}
                className="opacity-0 group-hover:opacity-100 text-[9px] text-purple-650 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 flex items-center gap-0.5 font-semibold transition-all"
                title="Convert to standalone Task"
              >
                <PlusCircle className="w-3 h-3" /> Convert
              </button>
            )}
          </div>
        );
      } 
      // Normal paragraph
      else if (line.trim() !== "") {
        elements.push(
          <p key={`p-${i}`} className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed my-1">
            {line}
          </p>
        );
      } else {
        elements.push(<div key={`br-${i}`} className="h-2" />);
      }
    }

    if (isInsideCodeBlock) {
      elements.push(
        <CopyBlock 
          key={`code-unclosed-${codeBlockStartIndex}`}
          code={codeLinesAccumulator.join("\n")}
          language={codeLanguage}
          noteId={noteId}
          triggerToast={triggerToast}
        />
      );
    }

    return <div className="space-y-1.5">{elements}</div>;
  };

  const detectSecrets = (text: string): boolean => {
    const apiRegex = /(api[-_]?key|secret|token|password|passwd|auth)[-_]?\w*\s*[:=]\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/i;
    const privateKeyRegex = /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/i;
    const awsRegex = /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA)[A-Z0-9]{16}/;
    return apiRegex.test(text) || privateKeyRegex.test(text) || awsRegex.test(text);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Editor Sub-Header Toolbar */}
      <div className="pb-3 border-b border-zinc-200 dark:border-white/5 flex justify-between items-center mb-4 shrink-0">
        <input 
          type="text" 
          value={title}
          onChange={handleTitleChange}
          placeholder="Tiêu đề ghi chú..."
          className="bg-transparent border-none outline-none font-bold text-zinc-900 dark:text-white text-sm sm:text-base focus:ring-0 p-0 w-2/3"
        />
        
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-zinc-500">
            {saving ? "Saving..." : "Auto-saved"}
          </span>

          <div className="flex bg-zinc-200/50 dark:bg-zinc-900 border border-zinc-250 dark:border-white/5 rounded-lg p-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
            <button 
              type="button"
              onClick={() => setIsEditMode(true)}
              className={`px-2.5 py-0.5 rounded flex items-center gap-1 transition-all ${
                isEditMode ? "bg-zinc-350 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold" : ""
              }`}
            >
              Edit
            </button>
            <button 
              type="button"
              onClick={() => setIsEditMode(false)}
              className={`px-2.5 py-0.5 rounded flex items-center gap-1 transition-all ${
                !isEditMode ? "bg-zinc-350 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold" : ""
              }`}
            >
              Preview
            </button>
          </div>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto min-h-0 relative">
        {detectSecrets(content) && (
          <div className="mb-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] sm:text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-500" />
            <span><strong>Cảnh báo bảo mật:</strong> Phát hiện thông tin nhạy cảm (API Key, Token hoặc Password) trong nội dung ghi chú này.</span>
          </div>
        )}
        {isEditMode ? (
          <textarea 
            value={content}
            onChange={handleContentChange}
            placeholder="Nhập nội dung ghi chú ở định dạng Markdown... Ví dụ:
# Tiêu đề lớn
- [ ] Task cần làm
```bash
Lệnh copy nhanh ở đây
```"
            className="w-full h-full p-2.5 rounded-lg bg-transparent text-xs text-zinc-700 dark:text-zinc-300 font-mono resize-none focus:outline-none focus:ring-0 border-none leading-relaxed"
          />
        ) : (
          <div className="p-2.5 font-sans leading-relaxed select-text">
            {renderPreview()}
          </div>
        )}
      </div>
    </div>
  );
}
