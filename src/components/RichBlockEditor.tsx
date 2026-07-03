import React, { useState, useEffect, useRef } from "react";
import { 
  PlusCircle, 
  Trash2, 
  Type, 
  Heading, 
  CheckSquare, 
  Terminal, 
  AlertTriangle,
  MoveUp,
  MoveDown
} from "lucide-react";
import CopyBlock from "./CopyBlock";

export interface EditorBlock {
  id: string;
  type: "text" | "header" | "todo" | "copy_block";
  content: string;
  checked?: boolean; // specific for todo
}

interface RichBlockEditorProps {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => Promise<void>;
  triggerToast: (message: string) => void;
}

export default function RichBlockEditor({
  noteId,
  initialTitle,
  initialContent,
  onSave,
  triggerToast
}: RichBlockEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Parse initialContent (supports both block JSON and backward-compatible raw text)
  useEffect(() => {
    setTitle(initialTitle);
    
    if (!initialContent.trim()) {
      // Default empty block
      setBlocks([{ id: "b-first", type: "text", content: "" }]);
      return;
    }

    try {
      // Check if it's JSON array of blocks
      const parsed = JSON.parse(initialContent);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
        setBlocks(parsed);
      } else {
        throw new Error("Not a blocks array");
      }
    } catch (err) {
      // Fallback: parse raw text/markdown to blocks
      console.log("[RichEditor] Content is raw text. Converting to blocks...");
      const convertedBlocks: EditorBlock[] = [];
      const lines = initialContent.split("\n");
      
      let isInsideCode = false;
      let codeLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim().startsWith("```")) {
          if (!isInsideCode) {
            isInsideCode = true;
            codeLines = [];
          } else {
            isInsideCode = false;
            convertedBlocks.push({
              id: `b-import-code-${i}`,
              type: "copy_block",
              content: codeLines.join("\n")
            });
          }
          continue;
        }

        if (isInsideCode) {
          codeLines.push(line);
          continue;
        }

        if (line.startsWith("# ") || line.startsWith("## ") || line.startsWith("### ")) {
          const headerText = line.replace(/^#+\s+/, "");
          convertedBlocks.push({
            id: `b-import-h-${i}`,
            type: "header",
            content: headerText
          });
        } 
        else if (line.trim().startsWith("- [ ]") || line.trim().startsWith("- [x]")) {
          const isChecked = line.trim().startsWith("- [x]");
          const cleanText = line.replace(/^-\s*\[[ x]\]\s*/, "");
          convertedBlocks.push({
            id: `b-import-todo-${i}`,
            type: "todo",
            content: cleanText,
            checked: isChecked
          });
        } 
        else if (line.trim() !== "") {
          convertedBlocks.push({
            id: `b-import-txt-${i}`,
            type: "text",
            content: line
          });
        }
      }

      // Handle unclosed code block
      if (isInsideCode && codeLines.length > 0) {
        convertedBlocks.push({
          id: "b-import-code-unclosed",
          type: "copy_block",
          content: codeLines.join("\n")
        });
      }

      if (convertedBlocks.length === 0) {
        convertedBlocks.push({ id: "b-empty", type: "text", content: "" });
      }

      setBlocks(convertedBlocks);
    }
  }, [noteId, initialTitle, initialContent]);

  // Debounced auto-save blocks to SQLite
  const triggerAutoSave = (newTitle: string, updatedBlocks: EditorBlock[]) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const jsonStr = JSON.stringify(updatedBlocks);
        await onSave(newTitle, jsonStr);
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
    triggerAutoSave(val, blocks);
  };

  // Block modification handler
  const handleBlockChange = (id: string, newContent: string) => {
    const updated = blocks.map(b => b.id === id ? { ...b, content: newContent } : b);
    setBlocks(updated);
    triggerAutoSave(title, updated);
  };

  const handleToggleTodo = (id: string, currentVal: boolean) => {
    const updated = blocks.map(b => b.id === id ? { ...b, checked: !currentVal } : b);
    setBlocks(updated);
    triggerAutoSave(title, updated);
  };

  // Block control actions
  const addBlock = (type: EditorBlock['type']) => {
    const newBlock: EditorBlock = {
      id: `b-${Math.random().toString(36).substring(2, 11)}`,
      type,
      content: "",
      checked: type === "todo" ? false : undefined
    };
    
    const updated = [...blocks, newBlock];
    setBlocks(updated);
    triggerAutoSave(title, updated);
    triggerToast(`Đã thêm block ${type === "copy_block" ? "lệnh" : type}`);
  };

  const deleteBlock = (id: string) => {
    if (blocks.length <= 1) {
      triggerToast("Không thể xóa block duy nhất!");
      return;
    }
    const updated = blocks.filter(b => b.id !== id);
    setBlocks(updated);
    triggerAutoSave(title, updated);
  };

  const moveBlock = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === blocks.length - 1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const updated = [...blocks];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    setBlocks(updated);
    triggerAutoSave(title, updated);
  };

  // Detect secrets in the entire content
  const detectSecrets = (): boolean => {
    const combinedText = blocks.map(b => b.content).join("\n");
    const apiRegex = /(api[-_]?key|secret|token|password|passwd|auth)[-_]?\w*\s*[:=]\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/i;
    const privateKeyRegex = /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/i;
    const awsRegex = /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA)[A-Z0-9]{16}/;
    return apiRegex.test(combinedText) || privateKeyRegex.test(combinedText) || awsRegex.test(combinedText);
  };

  // Render individual block types
  const renderBlockElement = (block: EditorBlock, index: number) => {
    switch (block.type) {
      case "header":
        return (
          <input
            type="text"
            value={block.content}
            onChange={(e) => handleBlockChange(block.id, e.target.value)}
            placeholder="Tiêu đề khối..."
            className="w-full bg-transparent border-none outline-none font-bold text-white text-sm sm:text-base focus:ring-0 p-0 placeholder-zinc-600"
          />
        );
      case "todo":
        return (
          <div className="flex items-center gap-2.5 w-full">
            <input
              type="checkbox"
              checked={!!block.checked}
              onChange={() => handleToggleTodo(block.id, !!block.checked)}
              className="rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-purple-600 cursor-pointer w-4 h-4 shrink-0"
            />
            <input
              type="text"
              value={block.content}
              onChange={(e) => handleBlockChange(block.id, e.target.value)}
              placeholder="Việc cần làm..."
              className={`w-full bg-transparent border-none outline-none text-xs focus:ring-0 p-0 placeholder-zinc-600 ${
                block.checked ? "line-through text-zinc-500" : "text-zinc-300"
              }`}
            />
          </div>
        );
      case "copy_block":
        return (
          <div className="w-full">
            <CopyBlock 
              code={block.content}
              language="bash"
              noteId={noteId}
              editable={true}
              onChange={(newVal) => handleBlockChange(block.id, newVal)}
              triggerToast={triggerToast}
            />
          </div>
        );
      case "text":
      default:
        return (
          <textarea
            value={block.content}
            onChange={(e) => handleBlockChange(block.id, e.target.value)}
            placeholder="Gõ văn bản ghi chú..."
            rows={1}
            className="w-full bg-transparent border-none outline-none text-xs text-zinc-300 focus:ring-0 p-0 placeholder-zinc-600 resize-none min-h-[22px] leading-relaxed"
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-text">
      {/* 1. EDITOR TOOLBAR & TITLE */}
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

          {/* Quick Toolbar Chèn Block */}
          <div className="flex bg-zinc-900 border border-white/5 rounded-lg p-0.5 text-[9px] text-zinc-400 font-semibold gap-0.5">
            <button 
              onClick={() => addBlock("text")}
              className="px-2 py-0.5 rounded hover:bg-zinc-800 hover:text-white flex items-center gap-1 transition-all"
              title="Thêm văn bản"
            >
              <Type className="w-3 h-3 text-zinc-400" /> Text
            </button>
            <button 
              onClick={() => addBlock("header")}
              className="px-2 py-0.5 rounded hover:bg-zinc-800 hover:text-white flex items-center gap-1 transition-all"
              title="Thêm tiêu đề"
            >
              <Heading className="w-3 h-3 text-teal-400" /> Header
            </button>
            <button 
              onClick={() => addBlock("todo")}
              className="px-2 py-0.5 rounded hover:bg-zinc-800 hover:text-white flex items-center gap-1 transition-all"
              title="Thêm checklist"
            >
              <CheckSquare className="w-3 h-3 text-purple-400" /> Todo
            </button>
            <button 
              onClick={() => addBlock("copy_block")}
              className="px-2 py-0.5 rounded hover:bg-zinc-800 hover:text-white flex items-center gap-1 transition-all"
              title="Thêm khối copy"
            >
              <Terminal className="w-3 h-3 text-yellow-400" /> CopyBlock
            </button>
          </div>
        </div>
      </div>

      {/* 2. SECURITY SECRET WARNING */}
      {detectSecrets() && (
        <div className="mb-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] sm:text-xs flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-500" />
          <span><strong>Cảnh báo bảo mật:</strong> Phát hiện thông tin nhạy cảm (API Key, Token hoặc Password) trong nội dung ghi chú này.</span>
        </div>
      )}

      {/* 3. EDITOR BLOCKS CONTAINER */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 pb-10">
        {blocks.map((block, idx) => (
          <div 
            key={block.id} 
            className="flex items-start gap-2.5 group relative pl-6 hover:bg-white/[0.01] py-1 rounded-lg transition-all"
          >
            {/* Block Hover Drag/Move/Delete Handles */}
            <div className="absolute left-0 top-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all shrink-0">
              <button 
                onClick={() => moveBlock(idx, "up")}
                disabled={idx === 0}
                className="p-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                title="Di chuyển lên"
              >
                <MoveUp className="w-3 h-3" />
              </button>
              <button 
                onClick={() => moveBlock(idx, "down")}
                disabled={idx === blocks.length - 1}
                className="p-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                title="Di chuyển xuống"
              >
                <MoveDown className="w-3 h-3" />
              </button>
              <button 
                onClick={() => deleteBlock(block.id)}
                className="p-0.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 ml-1"
                title="Xóa block này"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Block Content Render */}
            <div className="flex-1 min-w-0">
              {renderBlockElement(block, idx)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
