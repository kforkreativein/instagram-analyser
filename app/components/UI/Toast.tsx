"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Check, X, Info, AlertTriangle } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
}

interface ToastContextType {
    toast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within ToastProvider");
    return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((type: ToastType, title: string, message?: string) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = { id, type, title, message };
        setToasts((prev) => [...prev, newToast]);

        // Auto remove after 3.5s
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed top-[20px] right-[24px] z-[9999] flex flex-col gap-[8px] pointer-events-none">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onClose={() => setToasts((prev) => prev.filter((curr) => curr.id !== t.id))} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

const ToastItem: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
    const getColors = () => {
        switch (toast.type) {
            case "success": return { border: "#3BFFC8", icon: <Check size={16} />, iconColor: "#3BFFC8" };
            case "error": return { border: "#FF3B57", icon: <X size={16} />, iconColor: "#FF3B57" };
            case "warning": return { border: "#FF8C42", icon: <AlertTriangle size={16} />, iconColor: "#FF8C42" };
            default: return { border: "#A78BFA", icon: <Info size={16} />, iconColor: "#A78BFA" };
        }
    };

    const { border, icon, iconColor } = getColors();

    return (
        <div
            className="bg-[#0D1017] border border-[rgba(255,255,255,0.06)] rounded-[10px] p-[12px_16px] min-w-[280px] max-w-[360px] flex items-start gap-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] animate-[slideIn_0.3s_ease_forwards] pointer-events-auto cursor-pointer"
            style={{ borderLeft: `3px solid ${border}` }}
            onClick={onClose}
        >
            <div className="mt-[2px]" style={{ color: iconColor }}>{icon}</div>
            <div className="flex flex-col gap-[2px] flex-1">
                <span className="font-['DM_Sans'] text-[13px] font-[600] text-[#F0F2F7] leading-tight">{toast.title}</span>
                {toast.message && (
                    <span className="font-['DM_Sans'] text-[11px] text-[#5A6478] leading-tight">{toast.message}</span>
                )}
            </div>
            <button onClick={onClose} className="text-[#5A6478] hover:text-[#F0F2F7] transition-colors mt-[2px]">
                <X size={14} />
            </button>
        </div>
    );
};
