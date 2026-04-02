import React, { useEffect, useRef } from 'react';
import { db, collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc } from '../firebase';
import { useFirebase } from './FirebaseProvider';
import toast from 'react-hot-toast';
import { Bell, Info, AlertTriangle, CheckCircle, XCircle, Clock, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';

export default function NotificationManager() {
  const { user } = useFirebase();
  const navigate = useNavigate();
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!user) return;

    // Listen only for the most recent notification
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      // Skip initial historical data to only show "live" ones
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          // Only toast if it's unread
          if (data.read === false) {
             showPremiumToast({ id: change.doc.id, ...data });
             // Vibrate phone via Haptic Feedback for premium feel
             try {
               WebApp.HapticFeedback.notificationOccurred('warning');
             } catch (e) {}
          }
        }
      });
    });

    return () => unsub();
  }, [user?.uid]);

  const showPremiumToast = (notif: any) => {
    const Icon = notif.type === 'success' ? CheckCircle : 
                 notif.type === 'warning' ? AlertTriangle :
                 notif.type === 'error' ? XCircle : Info;
    
    const colorClass = notif.type === 'success' ? 'text-emerald-500' : 
                       notif.type === 'warning' ? 'text-amber-500' :
                       notif.type === 'error' ? 'text-red-500' : 'text-amber-500';

    toast.custom((t) => (
      <div
        className={`${
          t.visible ? 'animate-in fade-in slide-in-from-top-4 duration-300' : 'animate-out fade-out slide-out-to-top-4 duration-300'
        } max-w-md w-[95vw] sm:w-full bg-zinc-950/80 backdrop-blur-xl border border-zinc-900 shadow-2xl rounded-2xl pointer-events-auto flex overflow-hidden ring-1 ring-white/10 mx-auto mt-2`}
        onClick={() => {
            // Mark as read on click
            updateDoc(doc(db, 'notifications', notif.id), { read: true });
            if (notif.link) navigate(notif.link);
            toast.dismiss(t.id);
        }}
      >
        <div className="flex-1 p-4">
          <div className="flex items-start">
            <div className={`shrink-0 p-2 rounded-xl bg-zinc-900/50 border border-zinc-800 ${colorClass}`}>
              <Icon size={18} />
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none">
                  Уведомление
                </p>
                <span className="text-[9px] text-zinc-600 flex items-center gap-1 leading-none">
                    <Clock size={8} /> Только что
                </span>
              </div>
              <h4 className="mt-1 text-sm font-bold text-white truncate">
                {notif.title}
              </h4>
              <p className="mt-0.5 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                {notif.message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col border-l border-zinc-900">
          <button
            onClick={(e) => {
                e.stopPropagation();
                toast.dismiss(t.id);
            }}
            className="flex-1 w-12 flex items-center justify-center text-zinc-600 hover:text-white transition-colors border-b border-zinc-900"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    ), { 
        duration: 6000,
        position: 'top-center'
    });
  };

  return null;
}
