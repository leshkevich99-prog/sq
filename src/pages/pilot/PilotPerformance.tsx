import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Star, 
  TrendingUp, 
  Award, 
  Clock, 
  CheckCircle2, 
  MessageSquare,
  User,
  ChevronRight
} from 'lucide-react';
import { useFirebase } from '../../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, orderBy, onSnapshot, limit, getDocs } from 'firebase/firestore';

interface Review {
  id: string;
  clientId: string;
  rating: number;
  comment: string;
  createdAt: string;
  clientName?: string;
}

interface PerformanceStats {
  totalTasks: number;
  avgRating: number;
  completionRate: number;
  onTimeRate: number;
}

export default function PilotPerformance() {
  const navigate = useNavigate();
  const { user } = useFirebase();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<PerformanceStats>({
    totalTasks: 0,
    avgRating: 0,
    completionRate: 0,
    onTimeRate: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Fetch Reviews
    const qReviews = query(
      collection(db, 'reviews'),
      where('pilotId', '==', user.uid),
      limit(50)
    );

    const unsubReviews = onSnapshot(qReviews, async (snapshot) => {
      const revs: Review[] = [];
      const clientIds = new Set<string>();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        revs.push({ id: doc.id, ...data } as Review);
        clientIds.add(data.clientId);
      });

      // Sort in memory to avoid 412 error (missing composite index)
      revs.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      // Fetch client names
      const clientNames: Record<string, string> = {};
      for (const clientId of clientIds) {
        try {
          const userDoc = await getDocs(query(collection(db, 'users'), where('id', '==', clientId)));
          if (!userDoc.empty) {
            clientNames[clientId] = userDoc.docs[0].data().firstName;
          }
        } catch (e) {
          console.error('Error fetching client name:', e);
        }
      }

      setReviews(revs.map(r => ({ ...r, clientName: clientNames[r.clientId] || 'Клиент' })));
      
      // Calculate average rating
      if (revs.length > 0) {
        const sum = revs.reduce((acc, r) => acc + r.rating, 0);
        setStats(prev => ({ ...prev, avgRating: sum / revs.length }));
      }
      
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'reviews'));

    // Fetch Total Tasks
    const qTasks = query(
      collection(db, 'requests'),
      where('pilotId', '==', user.uid),
      where('status', '==', 'completed')
    );

    getDocs(qTasks).then(snapshot => {
      setStats(prev => ({ 
        ...prev, 
        totalTasks: snapshot.size,
        completionRate: 98, // Mocked for now
        onTimeRate: 95 // Mocked for now
      }));
    });

    return () => unsubReviews();
  }, [user]);

  if (loading) return <div className="p-6 text-center text-zinc-500">Загрузка показателей...</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold uppercase tracking-wider">Показатели</h1>
      </div>

      {/* Rating Card */}
      <div className="bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-3xl p-8 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full -mr-16 -mt-16" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="flex items-center gap-1 text-amber-500 mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star 
                key={i} 
                size={24} 
                fill={i < Math.round(stats.avgRating) ? "currentColor" : "none"} 
                className={i < Math.round(stats.avgRating) ? "" : "text-zinc-800"}
              />
            ))}
          </div>
          <div className="text-5xl font-bold mb-1">{stats.avgRating.toFixed(1)}</div>
          <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500">Средний рейтинг</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span className="text-[10px] uppercase font-bold tracking-widest">Выполнено</span>
          </div>
          <div className="text-2xl font-bold">{stats.totalTasks}</div>
          <div className="text-[10px] text-zinc-600 mt-1">поручений всего</div>
        </div>
        
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <TrendingUp size={14} className="text-blue-500" />
            <span className="text-[10px] uppercase font-bold tracking-widest">Успешность</span>
          </div>
          <div className="text-2xl font-bold">{stats.completionRate}%</div>
          <div className="text-[10px] text-zinc-600 mt-1">без отмен</div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Последние отзывы</h2>
          <span className="text-[10px] text-zinc-600">{reviews.length} отзывов</span>
        </div>
        
        {reviews.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/30 border border-zinc-800 rounded-3xl">
            <MessageSquare size={32} className="mx-auto text-zinc-800 mb-3" />
            <p className="text-zinc-600 text-xs uppercase tracking-widest">Отзывов пока нет</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(review => (
              <div key={review.id} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                      <User size={16} className="text-zinc-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{review.clientName}</div>
                      <div className="text-[10px] text-zinc-500">
                        {new Date(review.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star size={12} fill="currentColor" />
                    <span className="text-xs font-bold">{review.rating}</span>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed italic">
                  "{review.comment}"
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
