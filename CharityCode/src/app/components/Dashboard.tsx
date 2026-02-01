import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getDifficultyColor, getStatusColor } from '@/lib/utils';
import { CheckCircle, Clock, ExternalLink, Loader2, Plus, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface DashboardProps {
  userType: 'student' | 'charity';
  onViewTask: (taskId: string) => void;
  onNavigate?: (page: string) => void;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'completed';
  created_by: string;
  assigned_to: string | null;
  created_at: string;
  // Join fields
  charity?: { full_name: string; avatar_url: string };
  assigned_student?: { full_name: string; avatar_url: string };
  // Computed for UI (we might not have these in DB yet, so optional/mocked fallback)
  difficulty?: 'Easy' | 'Medium' | 'Hard'; 
  tech_stack?: string[];
  techStack?: string[]; // Legacy/Frontend only
  reward_amount?: number;
  stats?: {
      started: number;
      submitted: number;
      approved: number;
  };
}

export function Dashboard({ userType, onViewTask, onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Stats state (could be fetched or computed)
  const [stats, setStats] = useState({
    completed: 0,
    active: 0,
    total: 0
  });

  const [studentSubmissions, setStudentSubmissions] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchTasks();
  }, [user, userType]);

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch Tasks
      let query = supabase.from('tasks').select(`
        *,
        charity:created_by(full_name, avatar_url),
        assigned_student:assigned_to(full_name, avatar_url)
      `);

      if (userType === 'charity') {
        query = query.eq('created_by', user.id);
      }

      const { data: tasksData, error: tasksError } = await query;
      if (tasksError) throw tasksError;

      let fetchedTasks = tasksData as Task[];

      // 2. If Charity, Fetch Submission Stats for these tasks
      if (userType === 'charity' && fetchedTasks.length > 0) {
          const taskIds = fetchedTasks.map(t => t.id);
          const { data: subsData, error: subsError } = await supabase
              .from('task_submissions')
              .select('task_id, status')
              .in('task_id', taskIds);
          
          if (!subsError && subsData) {
              // Aggregate stats
              const statsMap: Record<string, { started: number; submitted: number; approved: number }> = {};
              
              subsData.forEach((sub: any) => {
                  if (!statsMap[sub.task_id]) {
                      statsMap[sub.task_id] = { started: 0, submitted: 0, approved: 0 };
                  }
                  if (sub.status === 'started') statsMap[sub.task_id].started++;
                  if (sub.status === 'submitted') statsMap[sub.task_id].submitted++;
                  if (sub.status === 'approved') statsMap[sub.task_id].approved++;
              });

              fetchedTasks = fetchedTasks.map(t => ({
                  ...t,
                  stats: statsMap[t.id] || { started: 0, submitted: 0, approved: 0 }
              }));
          }
      }

      // 3. If Student, Fetch My Submissions
      let mySubmissions: any[] = [];
      if (userType === 'student') {
          const { data: subs, error: subsError } = await supabase
              .from('task_submissions')
              .select('*')
              .eq('student_id', user.id);
          
          if (subsError) console.error('Error fetching my submissions:', subsError);
          mySubmissions = subs || [];
          setStudentSubmissions(mySubmissions);
      }

      setTasks(fetchedTasks); 

      // Update mock stats
      setStats({
        completed: tasksData?.filter((t: any) => t.status === 'completed').length || 0,
        active: tasksData?.filter((t: any) => t.status === 'in_progress').length || 0,
        total: tasksData?.length || 0
      });

    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  // Logic for "My Active Tasks"
  const myActiveTasks = tasks.filter(t => {
    if (userType === 'student') {
        // Active if I have a submission that is started/submitted OR if I am the assigned winner
        const submission = studentSubmissions.find(s => s.task_id === t.id);
        const isWorkingOn = submission && (submission.status === 'started' || submission.status === 'submitted');
        
        // Filter: Show in "Active Projects" if I am working on it (regardless of global status)
        // AND it's not completed yet (unless I won it, but usually completed goes to history)
        return isWorkingOn && t.status !== 'completed';
    } else {
        return t.created_by === user?.id && t.status === 'in_progress';
    }
  });
  
    // Logic for "Available Tasks"
    // Exclude tasks I am already working on
    const availableTasks = tasks.filter(t => {
        if (userType === 'student') {
            const amWorkingOn = studentSubmissions.some(s => s.task_id === t.id);
            return t.status === 'open' && !t.assigned_to && !amWorkingOn;
        }
        return false; 
    }).slice(0, 3); // Keep limiting for dashboard view



    // For charity: Posted tasks handling
    const postedTasks = userType === 'charity' 
        ? tasks.filter(t => t.created_by === user?.id)
        : [];

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    difficulty: 'Medium',
    time: '',
    techStack: '',
    imageUrl: '',
    contactEmail: ''
  });

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      
      // Parse tech stack
      const techStackArray = newTask.techStack.split(',').map(t => t.trim()).filter(Boolean);

      const { error } = await supabase
        .from('tasks')
        .insert({
          title: newTask.title,
          description: newTask.description,
          difficulty: newTask.difficulty,
          time_estimate: newTask.time,
          tech_stack: techStackArray,
          image_url: newTask.imageUrl,
          contact_email: newTask.contactEmail,
          created_by: user?.id,
          status: 'open',
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      toast.success('Task created successfully!');
      setIsCreateModalOpen(false);
      setNewTask({ title: '', description: '', difficulty: 'Medium', time: '', techStack: '', imageUrl: '', contactEmail: '' });
      fetchTasks(); // Refresh list
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Charity View
  if (userType === 'charity') {
    return (
      <div className="p-8 max-w-7xl mx-auto relative min-h-screen">
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-semibold mb-4 text-slate-900">Post a New Task</h2>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">Task Title <span className="text-rose-500">*</span></label>
                  <input 
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                    value={newTask.title}
                    onChange={e => setNewTask({...newTask, title: e.target.value})}
                    placeholder="e.g. Build landing page"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">Description <span className="text-rose-500">*</span></label>
                  <textarea 
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none h-32"
                    value={newTask.description}
                    onChange={e => setNewTask({...newTask, description: e.target.value})}
                    placeholder="Describe the requirements..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700">Difficulty</label>
                    <select 
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                      value={newTask.difficulty}
                      onChange={e => setNewTask({...newTask, difficulty: e.target.value})}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700">Estimated Time</label>
                    <input 
                       className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                       placeholder="e.g. 5 hours"
                       value={newTask.time}
                       onChange={e => setNewTask({...newTask, time: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                   <label className="block text-sm font-medium mb-1 text-slate-700">Contact Email (Optional)</label>
                   <input 
                      type="email"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                      placeholder="e.g. contact@charity.org"
                      value={newTask.contactEmail}
                      onChange={e => setNewTask({...newTask, contactEmail: e.target.value})}
                   />
                </div>

                <div>
                   <label className="block text-sm font-medium mb-1 text-slate-700">Tech Stack (comma separated)</label>
                   <input 
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                      placeholder="e.g. React, Supabase, Tailwind"
                      value={newTask.techStack}
                      onChange={e => setNewTask({...newTask, techStack: e.target.value})}
                   />
                </div>

                <div>
                   <label className="block text-sm font-medium mb-1 text-slate-700">Image URL (Optional)</label>
                   <input 
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                      placeholder="https://..."
                      value={newTask.imageUrl || ''} // Use optional chaining just in case
                      onChange={e => setNewTask({...newTask, imageUrl: e.target.value})} // We'll add this field to state
                   />
                </div>

                <div className="flex gap-3 justify-end mt-6">
                  <button 
                    type="button" 
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                  >
                    Post Task
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">
            Welcome back! 👋
          </h1>
          <p className="text-slate-500 text-lg">
            Manage your tasks and track student progress.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-blue-600 mb-1">Active Tasks</p>
                <p className="text-4xl font-bold text-slate-900">{stats.active}</p>
              </div>
              <div className="p-3 bg-white/60 rounded-xl">
                 <Clock className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-emerald-600 mb-1">Completed</p>
                <p className="text-4xl font-bold text-slate-900">{stats.completed}</p>
              </div>
              <div className="p-3 bg-white/60 rounded-xl">
                 <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-violet-600 mb-1">Total Posted</p>
                <p className="text-4xl font-bold text-slate-900">{stats.total}</p>
              </div>
              <div className="p-3 bg-white/60 rounded-xl">
                 <TrendingUp className="w-6 h-6 text-violet-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">Your Tasks</h2>
                <button onClick={() => {}} className="text-indigo-600 text-sm font-medium hover:text-indigo-700 transition-colors">View all</button>
             </div>
             
             {postedTasks.length === 0 ? (
                <div className="text-center p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <p className="text-slate-500">No tasks posted yet.</p>
                </div>
             ) : (
                postedTasks.map(task => (
                  <div key={task.id} className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer group" onClick={() => onViewTask(task.id)}>
                    <div className="flex justify-between mb-4">
                      <h3 className="font-semibold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors">{task.title}</h3>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>{task.status.replace('_', ' ')}</span>
                    </div>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                         <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl flex flex-col items-center">
                             <div className="text-2xl font-bold text-blue-700">{task.stats?.started || 0}</div>
                             <div className="text-[10px] font-semibold text-blue-600/80 uppercase tracking-wider">Students Joined</div>
                         </div>
                         <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl flex flex-col items-center">
                             <div className="text-2xl font-bold text-amber-700">{task.stats?.submitted || 0}</div>
                             <div className="text-[10px] font-semibold text-amber-600/80 uppercase tracking-wider">In Review</div>
                         </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-xs font-medium text-slate-400">
                        Posted {new Date(task.created_at).toLocaleDateString()}
                      </span>
                      {task.status === 'completed' && task.assigned_student && (
                         <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                            <CheckCircle className="w-3 h-3" />
                            <span>Done by {task.assigned_student.full_name}</span>
                         </div>
                      )}
                    </div>
                  </div>
                ))
             )}
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-600 font-medium hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
              >
                <div className="p-1 bg-indigo-100 rounded-lg">
                    <Plus className="w-5 h-5" />
                </div>
                Post New Task
              </button>
           </div>
           
           {/* Mobile-only stats or quick actions could go here, but omitted for brevity in diff */}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold text-foreground mb-2">
          Welcome back! 👋
        </h1>
        <p className="text-slate-500 text-lg">
          Ready to make a difference?
        </p>
      </div>
      
      {/* Active Projects (Assigned to me) */}
       <div className="mb-10">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            Your Active Projects
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-normal border border-slate-200">{myActiveTasks.length}</span>
          </h2>
          {myActiveTasks.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-500 bg-slate-50/50">
              You don't have any active projects. Check out available tasks!
            </div>
          ) : (
             <div className="grid gap-4">
               {myActiveTasks.map(task => (
                 <div key={task.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group" onClick={() => onViewTask(task.id)}>
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="font-semibold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors">{task.title}</h3>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor('in_progress')}`}>In Progress</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-4 line-clamp-2 leading-relaxed">{task.description}</p>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-2 rounded-xl w-fit">
                        <div className="flex items-center gap-2">
                             {task.charity?.avatar_url ? (
                                <img src={task.charity.avatar_url} className="w-5 h-5 rounded-full object-cover ring-2 ring-white"/>
                             ) : <div className="w-5 h-5 bg-slate-200 rounded-full"/>}
                             <span className="text-slate-700">{task.charity?.full_name || 'Charity'}</span>
                        </div>
                    </div>
                 </div>
               ))}
             </div>
          )}
       </div>

      {/* Available Tasks (Mock/Fetched) */}
       <div>
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-xl font-bold text-slate-900">Available Tasks</h2>
             <button onClick={() => onNavigate?.('discover')} className="text-indigo-600 text-sm font-medium flex items-center gap-1 hover:text-indigo-700 transition-colors bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100">
               Browse All <ExternalLink className="w-3.5 h-3.5"/>
             </button>
          </div>
          
          {availableTasks.length === 0 ? (
             <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-500 bg-slate-50/50">
                No new tasks available right now. Check back later!
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableTasks.map((task) => (
                <div
                  key={task.id}
                  className="group bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col h-full"
                  onClick={() => onViewTask(task.id)}
                >
                  {/* Header: Charity info & Time */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                            {task.charity?.avatar_url ? (
                                <img src={task.charity.avatar_url} alt={task.charity.full_name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-sm">🏛️</span>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900 line-clamp-1">{task.charity?.full_name || 'Charity'}</span>
                            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Challenger</span>
                        </div>
                    </div>
                    {task.created_at && (
                        <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">
                            {new Date(task.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="mb-5 flex-1">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <h3 className="font-bold text-lg text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition-colors leading-tight" title={task.title}>{task.title}</h3>
                        <span className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${getDifficultyColor(task.difficulty)}`}>
                            {task.difficulty || 'Medium'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed mb-4">
                        {task.description}
                      </p>
                  </div>

                  {/* Footer: Tech Stack & Action */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                     <div className="flex flex-wrap gap-1.5">
                        {(task.tech_stack || ['Web']).slice(0, 3).map((tech, i) => (
                            <span key={i} className="px-2 py-1 bg-slate-50 text-slate-600 text-[11px] font-medium rounded-lg border border-slate-100">
                                {tech}
                            </span>
                        ))}
                        {(task.tech_stack?.length || 0) > 3 && (
                            <span className="px-2 py-1 text-[11px] font-medium text-slate-400 bg-slate-50 rounded-lg">+{(task.tech_stack?.length || 0) - 3}</span>
                        )}
                     </div>
                  
                  </div>
                </div>
              ))}
            </div>
          )}
       </div>
    </div>
  );
}