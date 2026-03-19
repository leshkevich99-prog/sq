import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, User, Settings } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { db, collection, query, where, onSnapshot } from '../firebase';

export default function Header() {
  const { user } = useFirebase();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', user.uid),
      where('read', '==', false)
    );
    return onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    });
  }, [user]);

  return (
    <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-900 px-4 py-3 flex justify-between items-center">
      <Link to="/profile" className="flex items-center gap-2">
        <div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 overflow-hidden">
          <User size={16} className="text-zinc-500" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest">{user?.firstName}</span>
      </Link>
      
      <div className="flex items-center gap-3">
        <Link to="/notifications" className="relative p-2 text-zinc-400 hover:text-white transition-colors">
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-black">
              {unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
