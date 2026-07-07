import React, { useState, useEffect, useRef } from "react";
import { 
  Heading as HeadingIcon, 
  CheckSquare, 
  Terminal, 
  AlertTriangle,
  Bold as BoldIcon,
  Italic as ItalicIcon
} from "lucide-react";
import GenericConfirmModal from "./GenericConfirmModal";
import { useLanguage } from "../contexts/LanguageContext";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { BashBlockExtension } from './editor/BashBlockExtension';

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
  const { t } = useLanguage();
  const [showWarningConfirm, setShowWarningConfirm] = useState(false);
  const [codeToCopy, setCodeToCopy] = useState("");
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previousNoteId = useRef<string | null>(null);

  // Parse legacy markdown check list if any
  const parseInitialContent = (content: string) => {
    if (!content) return "<p></p>";
    if (content.trim().startsWith("<") && content.trim().endsWith(">")) {
      return content;
    }
    
    // Convert raw text/markdown to clean HTML paragraphs
    const paragraphs = content
      .split("\n")
      .map(line => {
        if (line.trim() === "") return "<p></p>";
        if (line.startsWith("# ")) return `<h2>${line.substring(2)}</h2>`;
        if (line.startsWith("- [ ]") || line.startsWith("- [x]")) {
          const checked = line.startsWith("- [x]");
          const text = line.substring(5).trim();
          return `<ul data-type="taskList"><li data-type="taskItem" data-checked="${checked}"><p>${text}</p></li></ul>`;
        }
        return `<p>${line}</p>`;
      })
      .join("");
    return paragraphs || "<p></p>";
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: t("editor.placeholder"),
        emptyEditorClass: 'is-editor-empty',
      }),
      BashBlockExtension,
    ],
    content: parseInitialContent(initialContent),
    editorProps: {
      attributes: {
        class: 'w-full h-full min-h-[300px] text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed outline-none select-text pb-20 focus:ring-0 border-none prose prose-invert max-w-none relative editor-content',
        style: 'word-break: break-word;',
      },
    },
    onUpdate: ({ editor }) => {
      triggerAutoSave(title, editor.getHTML());
    },
  });

  // Handle cross-component copy event
  useEffect(() => {
    const handleDangerousCopy = (e: Event) => {
      const customEvent = e as CustomEvent;
      setCodeToCopy(customEvent.detail.code);
      setShowWarningConfirm(true);
    };
    const handleCopySuccess = () => {
      triggerToast("Đã sao chép lệnh!");
    };
    
    window.addEventListener('copy-dangerous-code', handleDangerousCopy);
    window.addEventListener('copy-success', handleCopySuccess);
    return () => {
      window.removeEventListener('copy-dangerous-code', handleDangerousCopy);
      window.removeEventListener('copy-success', handleCopySuccess);
    };
  }, [triggerToast]);

  // Sync state and editor content when note changes
  useEffect(() => {
    const isNewNote = previousNoteId.current !== noteId;
    previousNoteId.current = noteId;

    if (isNewNote) {
      setTitle(initialTitle);
      if (editor) {
        editor.commands.setContent(parseInitialContent(initialContent));
      }
    } else {
      // Background sync sync if not focused
      if (editor && !editor.isFocused && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        const currentHtml = editor.getHTML();
        if (currentHtml !== initialContent) {
           setTitle(initialTitle);
           // We don't overwrite editor content if the user might be actively typing,
           // but since it's not focused, it's safe.
           editor.commands.setContent(parseInitialContent(initialContent));
        }
      }
    }
  }, [noteId, initialTitle, initialContent, editor]);

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
    if (editor) {
      triggerAutoSave(val, editor.getHTML());
    }
  };

  // Detect API Keys / Passwords inside the HTML content
  const detectSecrets = (): boolean => {
    if (!editor) return false;
    const text = editor.getText() || "";
    const apiRegex = /(api[-_]?key|secret|token|password|passwd|auth)[-_]?\w*\s*[:=]\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/i;
    const privateKeyRegex = /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/i;
    const awsRegex = /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA)[A-Z0-9]{16}/;
    return apiRegex.test(text) || privateKeyRegex.test(text) || awsRegex.test(text);
  };

  const handleConfirmCopyDangerous = async () => {
    if (!codeToCopy) return;
    try {
      await navigator.clipboard.writeText(codeToCopy);
      triggerToast("Đã sao chép lệnh!");
      const event = new CustomEvent('copy-success');
      window.dispatchEvent(event);
    } catch (err) {
      console.error("Copy failed:", err);
    } finally {
      setShowWarningConfirm(false);
      setCodeToCopy("");
    }
  };

  if (!editor) return null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-text">
      {/* 1. TITLE & TOOLBAR */}
      <div className="pb-3 border-b border-zinc-200 dark:border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 shrink-0">
        <input 
          type="text" 
          value={title}
          onChange={handleTitleChange}
          placeholder={t("notes.titlePlaceholder")}
          className="bg-transparent border-none outline-none font-bold text-zinc-900 dark:text-white text-sm sm:text-base focus:ring-0 p-0 w-full sm:w-2/3"
        />

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          <span className="text-[9px] text-zinc-500">
            {saving ? t("editor.saving") : t("editor.saved")}
          </span>

          {/* Standard Word-style Formatting Toolbar */}
          <div className="flex bg-zinc-200/50 dark:bg-zinc-900 border border-zinc-250 dark:border-white/5 rounded-lg p-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold gap-1 items-center px-2">
            <button 
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-1 rounded hover:bg-zinc-350 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white ${editor.isActive('bold') ? 'bg-zinc-300 dark:bg-zinc-800 text-zinc-900 dark:text-white' : ''}`}
              title={t("editor.bold")}
            >
              <BoldIcon className="w-3.5 h-3.5" />
            </button>
            <button 
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`p-1 rounded hover:bg-zinc-350 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white ${editor.isActive('italic') ? 'bg-zinc-300 dark:bg-zinc-800 text-zinc-900 dark:text-white' : ''}`}
              title={t("editor.italic")}
            >
              <ItalicIcon className="w-3.5 h-3.5" />
            </button>
            <button 
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`p-1 rounded hover:bg-zinc-350 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-300 dark:bg-zinc-800 text-zinc-900 dark:text-white' : ''}`}
              title={t("editor.header")}
            >
              <HeadingIcon className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-3 bg-zinc-300 dark:bg-white/10 mx-0.5"></div>
            <button 
              type="button"
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              className={`p-1 rounded hover:bg-zinc-350 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center ${editor.isActive('taskList') ? 'bg-zinc-300 dark:bg-zinc-800 text-zinc-900 dark:text-white' : ''}`}
              title={t("editor.checklist")}
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
            <button 
              type="button"
              onClick={() => editor.chain().focus().insertContent('<bash-block></bash-block>').run()}
              className="px-2 py-0.5 rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-600 dark:text-purple-400 hover:text-purple-750 dark:hover:text-purple-300 flex items-center gap-1 transition-all"
              title={t("editor.codeBlock")}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline"> + {t("editor.khoiLenh")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. SECURITY WARNING BANNER */}
      {detectSecrets() && (
        <div className="mb-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] sm:text-xs flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-500" />
          <span>{t("editor.securityWarning")}</span>
        </div>
      )}

      {/* 3. TIPTAP EDITOR BODY */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 pb-10">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* CUSTOM WARNING CONFIRM MODAL FOR DANGEROUS COMMAND COPY */}
      <GenericConfirmModal 
        isOpen={showWarningConfirm}
        title={t("editor.dangerousCommandTitle")}
        message={t("editor.dangerousCommandMessage", { code: codeToCopy })}
        confirmLabel={t("editor.dangerousCommandConfirm")}
        cancelLabel={t("common.cancel")}
        type="warning"
        onConfirm={handleConfirmCopyDangerous}
        onCancel={() => {
          setShowWarningConfirm(false);
          setCodeToCopy("");
        }}
      />
    </div>
  );
}
