import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';

export default function BashBlockComponent({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const codeText = node.attrs.code || '';

  const handleCopy = async () => {
    if (!codeText.trim()) return;

    // Check danger keywords
    const dangerousKeywords = ["rm -rf", "drop table", "drop database", "truncate", "kubectl delete", "sudo rm"];
    const isDangerous = dangerousKeywords.some(kw => codeText.toLowerCase().includes(kw));

    if (isDangerous) {
      const event = new CustomEvent('copy-dangerous-code', { detail: { code: codeText } });
      window.dispatchEvent(event);
      return;
    }

    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      const event = new CustomEvent('copy-success');
      window.dispatchEvent(event);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateAttributes({ code: val });
  };

  // Auto-resize
  useEffect(() => {
    const resize = () => {
      if (textareaRef.current) {
        // Use a tiny timeout to let the browser paint the default layout first
        // which prevents scrollHeight from calculating an artificially clipped height
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.max(32, textareaRef.current.scrollHeight)}px`;
      }
    };
    resize();
    setTimeout(resize, 100);
  }, [codeText]);

  return (
    <NodeViewWrapper className="copy-block-embed border border-zinc-200 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1.5 my-2 relative flex flex-col group">
      <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 dark:text-zinc-400 px-1.5 pb-1 pt-0.5" contentEditable={false}>
        <span className="flex items-center gap-1.5 tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>BASH
        </span>
        <button 
          type="button"
          onClick={handleCopy}
          className={`copy-btn font-bold px-2 py-0.5 rounded text-[9px] transition-all cursor-pointer ${
            copied 
              ? "bg-emerald-600 text-white" 
              : "bg-purple-600/10 hover:bg-purple-500/30 text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100"
          }`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="bg-black/5 dark:bg-black/30 rounded border border-black/5 dark:border-white/5 font-mono text-[11px] flex">
        <textarea 
          ref={textareaRef}
          value={codeText}
          onChange={handleChange}
          onKeyDown={(e) => {
            // Prevent Tiptap from hijacking Enter inside textarea
            e.stopPropagation();
          }}
          rows={1}
          style={{ minHeight: "32px", overflowY: "hidden" }}
          className="code-input w-full bg-transparent border-none outline-none font-mono text-[11px] text-zinc-800 dark:text-purple-300 focus:ring-0 px-2 py-2 resize-none leading-normal block" 
          placeholder="Nhập lệnh..." 
        />
      </div>
    </NodeViewWrapper>
  );
}
