export const getDifficultyColor = (difficulty: string = 'Medium') => {
  switch (difficulty) {
    case 'Easy': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
    case 'Medium': return 'bg-amber-50 text-amber-700 border border-amber-100';
    case 'Hard': return 'bg-rose-50 text-rose-700 border border-rose-100';
    default: return 'bg-slate-50 text-slate-600 border-slate-100';
  }
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-blue-50 text-blue-700 border border-blue-100';
    case 'in_progress': return 'bg-violet-50 text-violet-700 border border-violet-100';
    case 'completed': return 'bg-teal-50 text-teal-700 border border-teal-100';
    default: return 'bg-slate-50 text-slate-600 border border-slate-100';
  }
};
