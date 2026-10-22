import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, defaults to 4500
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
  toast: {
    success: (title: string, message?: string, options?: Partial<Omit<ToastItem, 'id' | 'type' | 'title' | 'message'>>) => string;
    error: (title: string, message?: string, options?: Partial<Omit<ToastItem, 'id' | 'type' | 'title' | 'message'>>) => string;
    warning: (title: string, message?: string, options?: Partial<Omit<ToastItem, 'id' | 'type' | 'title' | 'message'>>) => string;
    info: (title: string, message?: string, options?: Partial<Omit<ToastItem, 'id' | 'type' | 'title' | 'message'>>) => string;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Individual Toast Card with progress bar and pause-on-hover
const ToastCard: React.FC<{
  item: ToastItem;
  onDismiss: (id: string) => void;
}> = ({ item, onDismiss }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [remaining, setRemaining] = useState(item.duration ?? 4500);
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isHovered) return;

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss(item.id);
    }, remaining);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isHovered, remaining, item.id, onDismiss]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const elapsed = Date.now() - startTimeRef.current;
    setRemaining((prev) => Math.max(prev - elapsed, 500));
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const config = {
    success: {
      borderColor: 'border-emerald-300',
      bgColor: 'bg-white',
      accentBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      progressBar: 'bg-emerald-500',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
      tag: 'SUCCESS',
      tagColor: 'text-emerald-700 bg-emerald-100/70',
    },
    error: {
      borderColor: 'border-rose-300',
      bgColor: 'bg-white',
      accentBg: 'bg-rose-50 text-rose-700 border-rose-200',
      progressBar: 'bg-rose-500',
      icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
      tag: 'ERROR',
      tagColor: 'text-rose-700 bg-rose-100/70',
    },
    warning: {
      borderColor: 'border-amber-300',
      bgColor: 'bg-white',
      accentBg: 'bg-amber-50 text-amber-700 border-amber-200',
      progressBar: 'bg-amber-500',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
      tag: 'ATTENTION',
      tagColor: 'text-amber-700 bg-amber-100/70',
    },
    info: {
      borderColor: 'border-blue-300',
      bgColor: 'bg-white',
      accentBg: 'bg-blue-50 text-blue-700 border-blue-200',
      progressBar: 'bg-blue-500',
      icon: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
      tag: 'NOTICE',
      tagColor: 'text-blue-700 bg-blue-100/70',
    },
  }[item.type];

  const totalDuration = item.duration ?? 4500;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      className={`relative overflow-hidden w-full max-w-sm rounded-xl border shadow-xl transition-all duration-300 ease-out transform translate-x-0 ${config.bgColor} ${config.borderColor} pointer-events-auto`}
      style={{
        animation: 'toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      <div className="p-3.5 flex items-start gap-3">
        {/* Type Icon */}
        <div className="mt-0.5">{config.icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${config.tagColor}`}>
              {config.tag}
            </span>
            <h4 className="text-xs font-bold text-gray-900 truncate font-sans">
              {item.title}
            </h4>
          </div>

          {item.message && (
            <p className="text-xs text-gray-600 leading-relaxed font-sans break-words mt-1">
              {item.message}
            </p>
          )}

          {item.action && (
            <div className="mt-2.5">
              <button
                onClick={() => {
                  item.action?.onClick();
                  onDismiss(item.id);
                }}
                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-gray-900 hover:bg-black text-white transition shadow-xs"
              >
                {item.action.label}
              </button>
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={() => onDismiss(item.id)}
          aria-label="Dismiss notification"
          className="text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100 transition shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress timer bar */}
      <div className="h-1 w-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full ${config.progressBar} transition-all`}
          style={{
            animation: !isHovered ? `toastProgress ${totalDuration}ms linear forwards` : 'none',
            width: isHovered ? `${(remaining / totalDuration) * 100}%` : undefined,
          }}
        />
      </div>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastItem = { ...item, id };
    setToasts((prev) => {
      // Keep up to 5 concurrent toasts to avoid viewport overflow
      const next = [newToast, ...prev];
      return next.slice(0, 5);
    });
    return id;
  }, []);

  const toast = {
    success: useCallback(
      (title: string, message?: string, options?: Partial<Omit<ToastItem, 'id' | 'type' | 'title' | 'message'>>) =>
        showToast({ type: 'success', title, message, ...options }),
      [showToast]
    ),
    error: useCallback(
      (title: string, message?: string, options?: Partial<Omit<ToastItem, 'id' | 'type' | 'title' | 'message'>>) =>
        showToast({ type: 'error', title, message, ...options }),
      [showToast]
    ),
    warning: useCallback(
      (title: string, message?: string, options?: Partial<Omit<ToastItem, 'id' | 'type' | 'title' | 'message'>>) =>
        showToast({ type: 'warning', title, message, ...options }),
      [showToast]
    ),
    info: useCallback(
      (title: string, message?: string, options?: Partial<Omit<ToastItem, 'id' | 'type' | 'title' | 'message'>>) =>
        showToast({ type: 'info', title, message, ...options }),
      [showToast]
    ),
  };

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, toast }}>
      {children}

      {/* Floating Toast Notification Container */}
      <div
        aria-live="polite"
        className="fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 pointer-events-none max-w-sm w-full select-none"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
