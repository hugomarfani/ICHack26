import { supabase } from '@/lib/supabase';
import { getDifficultyColor } from '@/lib/utils';
import { ArrowUpDown, Clock, Filter, Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface DiscoverPageProps {
  onViewTask: (taskId: string) => void;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  difficulty?: string;
  time_estimate?: string;
  tech_stack?: string[];
  image_url?: string;
  // Joins
  charity?: { full_name: string; avatar_url: string };
  // Computed for display filter, though we'll use DB columns mostly
}

export function DiscoverPage({ onViewTask }: DiscoverPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedTech, setSelectedTech] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'difficulty'>('recent');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tasks')
        .select('*, charity:created_by(full_name, avatar_url)')
        .eq('status', 'open') // Only show open tasks
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  // Get all unique tech stacks from real data
  const allTechStacks = Array.from(
    new Set(tasks.flatMap(task => task.tech_stack || []))
  ).sort();

  // Filter and sort tasks
  const filteredTasks = tasks
    .filter(task => {
      const charName = task.charity?.full_name || '';
      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          charName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const taskDiff = task.difficulty || 'Medium'; // Default fallback
      const matchesDifficulty = selectedDifficulty === 'all' || taskDiff === selectedDifficulty;
      
      const taskStack = task.tech_stack || [];
      const matchesTech = selectedTech === 'all' || taskStack.includes(selectedTech);
      
      return matchesSearch && matchesDifficulty && matchesTech;
    })
    .sort((a, b) => {
      if (sortBy === 'difficulty') {
        const difficultyOrder = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
        const d1 = (a.difficulty || 'Medium') as keyof typeof difficultyOrder;
        const d2 = (b.difficulty || 'Medium') as keyof typeof difficultyOrder;
        return difficultyOrder[d1] - difficultyOrder[d2];
      }
      return 0; // Already sorted by recent from DB
    });

  if (loading) {
    return (
       <div className="flex h-full items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
       </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Discover Tasks</h1>
        <p className="text-slate-500 text-lg">
          Find meaningful projects that match your skills and interests
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-indigo-50 p-1.5 rounded-lg">
             <Search className="w-4 h-4 text-indigo-600" />
          </div>
          <input
            type="text"
            placeholder="Search by task, charity, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-14 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 text-slate-800 shadow-sm transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 mr-2">
            <div className="p-1.5 bg-slate-100 rounded-lg">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <span className="text-sm font-medium text-slate-600">Filters:</span>
          </div>

          {/* Difficulty Filter */}
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 hover:border-indigo-200 transition-colors shadow-sm cursor-pointer"
          >
            <option value="all">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>

          {/* Tech Stack Filter */}
          <select
            value={selectedTech}
            onChange={(e) => setSelectedTech(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 hover:border-indigo-200 transition-colors shadow-sm cursor-pointer"
          >
            <option value="all">All Technologies</option>
            {allTechStacks.map(tech => (
              <option key={tech} value={tech}>{tech}</option>
            ))}
          </select>

          {/* Sort */}
          <button
            onClick={() => setSortBy(sortBy === 'recent' ? 'difficulty' : 'recent')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-indigo-200 transition-all shadow-sm ml-auto"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            Sort: {sortBy === 'recent' ? 'Most Recent' : 'Difficulty'}
          </button>

          {/* Clear Filters */}
          {(selectedDifficulty !== 'all' || selectedTech !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedDifficulty('all');
                setSelectedTech('all');
                setSearchQuery('');
              }}
              className="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-6 flex justify-between items-end border-b border-slate-100 pb-2">
        <p className="text-sm font-medium text-slate-500">
          Showing <span className="text-slate-900 font-bold">{filteredTasks.length}</span> {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </p>
      </div>

      {/* Task Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredTasks.map((task) => (
          <div
            key={task.id}
            onClick={() => onViewTask(task.id)}
            className="bg-white border border-slate-100 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-0.5 hover:border-indigo-100 transition-all cursor-pointer group"
          >
            {/* Header */}
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden border border-slate-100 shadow-sm relative group-hover:shadow-md transition-shadow">
                {task.image_url ? (
                    <img src={task.image_url} className="w-full h-full object-cover" />
                ) : task.charity?.avatar_url ? (
                    <img src={task.charity.avatar_url} className="w-full h-full object-cover" />
                ) : '🌍'}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="font-bold text-lg text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors line-clamp-1">
                  {task.title}
                </h3>
                <p className="text-sm font-medium text-slate-500">{task.charity?.full_name}</p>
              </div>
              <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border flex-shrink-0 ${getDifficultyColor(task.difficulty)}`}>
                {task.difficulty || 'Medium'}
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-500 mb-5 line-clamp-2 leading-relaxed h-[2.5rem]">
              {task.description}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
              <div className="flex flex-wrap gap-1.5">
                {task.tech_stack?.slice(0, 3).map((tech) => (
                  <span
                    key={tech}
                    className="px-2 py-1 bg-slate-50 text-slate-600 text-[11px] font-medium rounded-lg border border-slate-100"
                  >
                    {tech}
                  </span>
                ))}
                {task.tech_stack && task.tech_stack.length > 3 && (
                  <span className="px-2 py-1 bg-slate-50 text-slate-400 text-[11px] font-medium rounded-lg border border-slate-100">
                    +{task.tech_stack.length - 3}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                  <Clock className="w-3 h-3" />
                  {task.time_estimate || 'Flexible'}
                </span>
                <span>{new Date(task.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredTasks.length === 0 && (
        <div className="text-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 mt-8">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
            <Search className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">No tasks found</h3>
          <p className="text-slate-500 mb-6 max-w-sm mx-auto">
             {tasks.length === 0 ? "No tasks have been posted yet." : "Try adjusting your filters or search query to find what you're looking for."}
          </p>
          {(selectedDifficulty !== 'all' || selectedTech !== 'all' || searchQuery) && (
             <button
                onClick={() => {
                  setSelectedDifficulty('all');
                  setSelectedTech('all');
                  setSearchQuery('');
                }}
                className="px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5"
             >
                Clear all filters
             </button>
          )}
        </div>
      )}
    </div>
  );
}
