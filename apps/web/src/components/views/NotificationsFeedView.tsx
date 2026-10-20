import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  FileX2,
  ShieldAlert,
  Clock,
  ArrowRight,
  Check,
} from 'lucide-react';

interface NotificationItem {
  id: string;
  type: 'CRITICAL_ALERT' | 'ASSIGNMENT' | 'DUE_SOON' | 'DOC_FAILED' | 'SECURITY';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  targetModule: string;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    type: 'CRITICAL_ALERT',
    title: 'High Thermal Trip: HP-204 (87.4°C)',
    message: 'Oil bath temperature sensor TT-204 crossed 85°C trip threshold. Immediate cooling loop inspection required.',
    timestamp: '12m ago',
    read: false,
    targetModule: 'copilot',
  },
  {
    id: 'notif-2',
    type: 'ASSIGNMENT',
    title: 'Work Order Dispatched: WO-8812',
    message: 'Shift Supervisor assigned you to leading overhaul on Schuler 400T Hydraulic Press.',
    timestamp: '35m ago',
    read: false,
    targetModule: 'maintenance',
  },
  {
    id: 'notif-3',
    type: 'SECURITY',
    title: 'Unauthorized Document Retrieval Blocked (403)',
    message: 'Technician account attempted to download Restricted OEM Mechanical Seal Blueprint #DWG-8801. Blocked and logged.',
    timestamp: '2h ago',
    read: false,
    targetModule: 'audit',
  },
  {
    id: 'notif-4',
    type: 'DUE_SOON',
    title: 'PM Calibration Due in 4 Hours: PUMP-204-B',
    message: 'Mechanical seal barrier fluid pressure transmitter PT-204 calibration window closes at 18:00.',
    timestamp: '3h ago',
    read: true,
    targetModule: 'maintenance',
  },
  {
    id: 'notif-5',
    type: 'DOC_FAILED',
    title: 'Document OCR Ingestion Warning: SCAN-MECH-09.pdf',
    message: 'Faded dot-matrix table on page 14 failed automated OCR confidence threshold (64%). Manual review task created.',
    timestamp: '5h ago',
    read: true,
    targetModule: 'knowledge-hub',
  },
];

export const NotificationsFeedView: React.FC<{
  onNavigate?: (module: string) => void;
}> = ({ onNavigate }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [filterTab, setFilterTab] = useState<'ALL' | 'UNREAD'>('ALL');

  const filtered = notifications.filter((n) => (filterTab === 'ALL' ? true : !n.read));

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markSingleRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'CRITICAL_ALERT':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'SECURITY':
        return <ShieldAlert className="w-4 h-4 text-purple-600" />;
      case 'ASSIGNMENT':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'DOC_FAILED':
        return <FileX2 className="w-4 h-4 text-amber-600" />;
      case 'DUE_SOON':
        return <Clock className="w-4 h-4 text-orange-600" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#F5F6F7] text-[#1A202C] font-sans antialiased p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0] bg-white p-5 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#151C24] text-white flex items-center justify-center shadow-sm">
            <Bell className="w-5 h-5 text-[#60A5FA]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A202C]">
              Operational Notifications & Security Alerts
            </h1>
            <p className="text-xs text-[#64748B]">
              Real-time plant alarms, work order dispatches, and compliance security events
            </p>
          </div>
        </div>

        {/* Tab & Mark Read Buttons */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#F1F5F9] p-0.5 rounded border border-[#E2E8F0] text-xs font-semibold">
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1.5 rounded transition ${
                filterTab === 'ALL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilterTab('UNREAD')}
              className={`px-3 py-1.5 rounded transition ${
                filterTab === 'UNREAD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Unread ({notifications.filter((n) => !n.read).length})
            </button>
          </div>

          <button
            onClick={markAllRead}
            className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded transition flex items-center gap-1 shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            Mark all read
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3 max-w-4xl">
        {filtered.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-gray-900">All caught up</h3>
            <p className="text-xs text-gray-500">No unread notifications at this time.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition shadow-sm flex items-start justify-between gap-4 ${
                item.read
                  ? 'bg-white border-[#E2E8F0] text-gray-600'
                  : 'bg-blue-50/30 border-blue-200 text-gray-900 ring-1 ring-blue-500/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-gray-100 shrink-0 mt-0.5">
                  {getIcon(item.type)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-gray-900">{item.title}</span>
                    {!item.read && (
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <p className="text-xs text-gray-600 leading-normal">{item.message}</p>
                  <div className="text-[10px] font-mono text-gray-400">{item.timestamp}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!item.read && (
                  <button
                    onClick={() => markSingleRead(item.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition"
                    title="Mark as read"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => onNavigate?.(item.targetModule)}
                  className="px-2.5 py-1.5 rounded bg-[#151C24] hover:bg-black text-white text-xs font-semibold flex items-center gap-1 transition shadow-sm"
                >
                  <span>Open</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
