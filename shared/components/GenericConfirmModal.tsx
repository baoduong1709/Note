import { AlertTriangle, Info, AlertCircle } from "lucide-react";

interface GenericConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function GenericConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy bỏ",
  type = "info",
  onConfirm,
  onCancel
}: GenericConfirmModalProps) {
  if (!isOpen) return null;

  // Determine colors and icons based on modal type
  let icon = <Info className="w-5 h-5 text-purple-500" />;
  let headerColor = "text-purple-600 dark:text-purple-400";
  let borderTheme = "border-purple-500/20";
  let confirmBtnClass = "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/10";

  if (type === "danger") {
    icon = <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />;
    headerColor = "text-red-600 dark:text-red-400";
    borderTheme = "border-red-500/20";
    confirmBtnClass = "bg-red-600 hover:bg-red-500 text-white shadow-red-500/10";
  } else if (type === "warning") {
    icon = <AlertTriangle className="w-5 h-5 text-amber-500" />;
    headerColor = "text-amber-600 dark:text-amber-400";
    borderTheme = "border-amber-500/20";
    confirmBtnClass = "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/10";
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`glass-panel w-full max-w-[420px] border ${borderTheme} rounded-xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200`}>
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-zinc-200 dark:border-white/5 pb-3 shrink-0">
          {icon}
          <h4 className={`font-bold text-sm uppercase tracking-wide ${headerColor}`}>{title}</h4>
        </div>

        {/* Message */}
        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed break-words whitespace-pre-line">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2.5 pt-2 shrink-0">
          <button 
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-md text-xs bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold transition-all hover:scale-[1.01] active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button 
            type="button"
            onClick={onConfirm}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
