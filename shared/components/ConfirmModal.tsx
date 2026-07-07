import { AlertTriangle, ShieldCheck } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  provider: string;
  target: string;
  actionDetails: {
    label: string;
    oldVal?: string;
    newVal: string;
  }[];
  warningMessage?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  provider,
  target,
  actionDetails,
  warningMessage = "Hành động này sẽ được ghi trực tiếp ra hệ thống bên ngoài.",
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-[460px] border border-blue-500/20 rounded-xl p-5 shadow-2xl space-y-4">
        {/* Modal Header */}
        <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 border-b border-zinc-200 dark:border-white/5 pb-3 shrink-0">
          <ShieldCheck className="w-5 h-5" />
          <h4 className="font-bold text-sm uppercase tracking-wide">{title}</h4>
        </div>

        {/* Action Details Summary */}
        <div className="space-y-3 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="flex justify-between border-b border-zinc-200 dark:border-white/5 pb-1">
            <span className="text-zinc-500 dark:text-zinc-400">Provider</span>
            <span className="font-semibold text-zinc-800 dark:text-white">{provider}</span>
          </div>
          <div className="flex justify-between border-b border-zinc-200 dark:border-white/5 pb-1">
            <span className="text-zinc-500 dark:text-zinc-400">Target</span>
            <span className="font-semibold text-zinc-800 dark:text-white">{target}</span>
          </div>

          <div className="space-y-1.5 bg-zinc-200/50 dark:bg-zinc-950/60 p-3 rounded border border-zinc-200 dark:border-white/5 font-mono text-[10px] leading-relaxed">
            <p className="text-purple-650 dark:text-purple-400 font-bold mb-1">Actions to Execute:</p>
            {actionDetails.map((act, index) => (
              <p key={index} className="text-zinc-600 dark:text-zinc-300">
                {act.label}: {act.oldVal ? `${act.oldVal} → ` : ""}<span className="text-teal-600 dark:text-teal-400 font-semibold">{act.newVal}</span>
              </p>
            ))}
          </div>

          {/* Warning Banner */}
          <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/15 border border-blue-200 dark:border-blue-900/20 p-2.5 rounded text-[10px] text-blue-600 dark:text-blue-400 leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>⚠️ {warningMessage}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2.5 pt-2 shrink-0">
          <button 
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-md text-xs bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold transition-all"
          >
            Hủy bỏ (Cancel)
          </button>
          <button 
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded-md text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-md shadow-blue-500/10"
          >
            Xác nhận & Ghi (Confirm)
          </button>
        </div>
      </div>
    </div>
  );
}
