import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getStatusColor } from '@/lib/utils';
import { Award, Calendar, Camera, CheckCircle, ExternalLink, Loader2, Mail, MapPin, Settings, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface AccountPageProps {
  userType: 'student' | 'charity';
  onViewTask: (taskId: string) => void;
}

export function AccountPage({ userType, onViewTask }: AccountPageProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [stats, setStats] = useState({
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0
  });
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [completedProjects, setCompletedProjects] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchUserStats();
    }
  }, [user, userType]);

  const fetchUserStats = async () => {
    try {
      console.log(`Fetching stats for ${userType} (${user?.id})`);
      
      let tasks = [];

      if (userType === 'student') {
          // MANUAL FETCH: 1. Get Submissions
          const { data: rawSubmissions, error: subError } = await supabase
            .from('task_submissions')
            .select('*')
            .eq('student_id', user?.id);

          if (subError) {
              console.error("Error fetching submissions:", subError);
              throw subError;
          }

          const submissions = rawSubmissions || [];
          
          if (submissions.length > 0) {
              const taskIds = submissions.map(s => s.task_id);
              
              // MANUAL FETCH: 2. Get Tasks
              const { data: rawTasks, error: tasksError } = await supabase
                  .from('tasks')
                  .select('*')
                  .in('id', taskIds);
              
              if (tasksError) {
                   console.error("[Dashboard] Error fetching tasks:", tasksError);
              }

              const tasksMap = (rawTasks || []).reduce((acc: any, t: any) => {
                  acc[t.id] = t;
                  return acc;
              }, {});
              
              tasks = submissions.map((s: any) => {
                  const task = tasksMap[s.task_id];
                  if (!task) return null;
                  return {
                      ...task,
                      status: s.status === 'approved' ? 'completed' : 'in_progress', // UI mapping
                      submission_status: s.status
                  };
              }).filter(Boolean);
          }

      } else {
          // For charities, simple fetch is fine
          const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('created_by', user?.id);
            
          if (error) throw error;
          tasks = data || [];
      }

      const active = tasks.filter((t: any) => t.status === 'in_progress' || t.status === 'open' || t.status === 'started' || t.status === 'submitted');
      const completed = tasks.filter((t: any) => t.status === 'completed');

      setStats({
        totalTasks: tasks.length || 0,
        activeTasks: active.length,
        completedTasks: completed.length
      });

      setActiveProjects(active);
      setCompletedProjects(completed);

    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  };

  /* Notifications State */
  const [notifications, setNotifications] = useState({
    email: true,
    push: true
  });

  /* Profile Edit State */
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    bio: '',
    location: '',
    skills: '',
    avatar_url: '' 
  });
  const [uploading, setUploading] = useState(false);

  /* Password Modal State */
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (profile) {
      setEditForm({
        bio: profile.bio || '',
        location: profile.location || '',
        skills: profile.skills?.join(', ') || '',
        avatar_url: profile.avatar_url || ''
      });
      setNotifications({
        email: profile.email_notifications ?? true,
        push: profile.push_notifications ?? true
      });
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    try {
      if (!user) return;

      const skillsArray = editForm.skills.split(',').map(s => s.trim()).filter(Boolean);

      const { error } = await supabase
        .from('profiles')
        .update({
          bio: editForm.bio,
          location: editForm.location,
          skills: skillsArray,
          avatar_url: editForm.avatar_url
        })
        .eq('id', user.id);

      if (error) throw error;
      
      toast.success('Profile updated successfully');
      setIsEditing(false); 
      refreshProfile(); 
      
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
        if (!event.target.files || event.target.files.length === 0) {
            return;
        }
        
        const file = event.target.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${user?.id || 'unknown'}-${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        setUploading(true);

        // Upload to 'avatars' bucket
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        setEditForm(prev => ({ ...prev, avatar_url: publicUrl }));
        toast.success("Image uploaded successfully!");
        
    } catch (error: any) {
        console.error('Error uploading avatar:', error);
        toast.error(error.message || 'Error uploading image');
    } finally {
        setUploading(false);
    }
  };


  const handleToggleNotification = async (type: 'email' | 'push') => {
    if (!user) return;
    const key = type === 'email' ? 'email_notifications' : 'push_notifications';
    const newValue = !notifications[type];

    // Optimistic update
    setNotifications(prev => ({ ...prev, [type]: newValue }));

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ [key]: newValue })
            .eq('id', user.id);
        
        if (error) throw error;
        toast.success(`${type === 'email' ? 'Email' : 'Push'} notifications ${newValue ? 'enabled' : 'disabled'}`);
    } catch (error) {
        console.error('Error updating notifications:', error);
        toast.error('Failed to update settings');
        // Revert
        setNotifications(prev => ({ ...prev, [type]: !newValue }));
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        toast.error("Passwords don't match");
        return;
    }
    if (passwordForm.newPassword.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
    }

    try {
        const { error } = await supabase.auth.updateUser({
            password: passwordForm.newPassword
        });

        if (error) throw error;

        toast.success("Password updated successfully");
        setShowPasswordModal(false);
        setPasswordForm({ newPassword: '', confirmPassword: '' });
    } catch (error) {
        console.error('Error updating password:', error);
        toast.error("Failed to update password");
    }
  };

  // Safe defaults if profile is loading or missing
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || '';
  const displayRole = profile?.role === 'student' ? 'Student Developer' : 'Non-Profit Organization';
  
  const bio = profile?.bio || "No bio here yet. Click to add one!"; 
  const skills = profile?.skills || [];
  const location = profile?.location || "Remote";
  const joinDate = user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Just now';

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Account Settings</h1>
        <p className="text-slate-500 text-lg">
          Manage your profile and view your activity
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Information */}
        <div className="lg:col-span-1 space-y-6">
          {/* Profile Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm text-center">
            <div className="w-24 h-24 mx-auto bg-slate-100 rounded-full flex items-center justify-center text-4xl mb-4 overflow-hidden ring-4 ring-white shadow-md relative group">
              { editForm.avatar_url && isEditing ? (
                  <img src={editForm.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="opacity-50">{userType === 'student' ? '👨‍💻' : '🏛️'}</span>
              )}
              
              {isEditing && (
                <label className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploading ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
                    <input 
                        type="file" 
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={uploading}
                    />
                </label>
              )}
            </div>
            
            {isEditing && (
                <div className="mb-4 text-xs text-slate-400">
                    Click avatar to upload new image
                </div>
            )}
            <h2 className="text-xl font-bold text-slate-900 mb-1">{displayName}</h2>
            <p className="text-sm font-medium text-slate-500 mb-6">{displayRole}</p>

            <div className="space-y-4 text-left">
              <div className="flex items-center gap-3 text-sm p-3 bg-slate-50 rounded-xl">
                <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-700 font-medium break-all">{displayEmail}</span>
              </div>
              <div className="flex items-center gap-3 text-sm p-3 bg-slate-50 rounded-xl">
                <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {isEditing ? (
                  <input 
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-100 outline-none"
                    value={editForm.location}
                    onChange={e => setEditForm({...editForm, location: e.target.value})}
                    placeholder="City, Country"
                  />
                ) : (
                  <span className="text-slate-700 font-medium">{location}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm p-3 bg-slate-50 rounded-xl">
                <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-700 font-medium">Joined {joinDate}</span>
              </div>
            </div>
            
            <div className="mt-8">
                {isEditing ? (
                    <div className="flex gap-2">
                        <button onClick={handleSaveProfile} className="flex-1 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all">Save</button>
                        <button onClick={() => setIsEditing(false)} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                    </div>
                ) : (
                    <button onClick={() => setIsEditing(true)} className="w-full py-2.5 bg-white border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                        Edit Profile
                    </button>
                )}
            </div>
          </div>

          {/* Bio */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
               <User className="w-5 h-5 text-indigo-500" />
              {userType === 'student' ? 'Bio' : 'About'}
            </h3>
            {isEditing ? (
                <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 h-32 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                    value={editForm.bio}
                    onChange={e => setEditForm({...editForm, bio: e.target.value})}
                    placeholder="Tell us about yourself..."
                />
            ) : (
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {bio}
                </p>
            )}
          </div>

          {/* Skills/Causes */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
               <Award className="w-5 h-5 text-emerald-500" />
              {userType === 'student' ? 'Skills' : 'Focus Areas'}
            </h3>
            {isEditing ? (
                <div>
                    <label className="text-xs text-slate-500 mb-2 block font-medium">Comma separated (e.g. React, Node, Design)</label>
                    <input 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-100 outline-none"
                        value={editForm.skills}
                        onChange={e => setEditForm({...editForm, skills: e.target.value})}
                        placeholder="Type skills here..."
                    />
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                  {skills.length > 0 ? skills.map((item: string) => (
                    <span
                      key={item}
                      className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-semibold"
                    >
                      {item}
                    </span>
                  )) : (
                      <span className="text-sm text-slate-400 italic">None listed</span>
                  )}
                </div>
            )}
          </div>

          {/* Stats */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
            <h3 className="font-bold text-lg mb-6">Your Impact</h3>
            <div className="space-y-6">
               <div className="flex items-center justify-between border-b border-indigo-400/30 pb-4">
                 <span className="text-indigo-100 font-medium">
                   {userType === 'student' ? 'Tasks Completed' : 'Tasks Posted'}
                 </span>
                 <span className="text-2xl font-bold">
                   {userType === 'student' ? stats.completedTasks : stats.totalTasks}
                 </span>
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-indigo-100 font-medium">Active Now</span>
                 <span className="text-2xl font-bold">{stats.activeTasks}</span>
               </div>
            </div>
          </div>
        </div>

        {/* Activity Section */}
        <div className="lg:col-span-2 space-y-8">
          {/* Current Tasks */}
          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">
                {userType === 'student' ? 'Current Tasks' : 'Active Projects'}
              </h2>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full border border-slate-200">
                {activeProjects.length} Active
              </span>
            </div>

            {activeProjects.length === 0 ? (
               <div className="text-center p-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                 <p className="text-slate-500 font-medium">No active projects currently.</p>
               </div>
            ) : (
                <div className="space-y-4">
                  {activeProjects.map((project) => (
                    <div
                      key={project.id}
                      onClick={() => onViewTask(project.id)}
                      className="group bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex justify-between items-start mb-2">
                         <h3 className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors">{project.title}</h3>
                         <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${getStatusColor(project.status || 'in_progress')}`}>{project.status?.replace('_', ' ') || 'Active'}</span>
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{project.description}</p>
                    </div>
                  ))}
                </div>
            )}
          </div>

          {/* Recent Activity / Completed Tasks */}
          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Recently Completed</h2>
              {completedProjects.length > 0 && (
                <button className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                    View all <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {completedProjects.length === 0 ? (
               <div className="text-center p-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                 <p className="text-slate-500 font-medium">No completed projects yet.</p>
               </div>
            ) : (
                <div className="space-y-3">
                  {completedProjects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                    >
                      <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold text-slate-900 mb-0.5">
                          {project.title}
                        </h4>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                          Completed {new Date(project.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>

          {/* Account Settings */}
          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-400"/> Settings
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Email Notifications</h4>
                  <p className="text-xs text-slate-500 mt-1">Receive updates via email about your tasks</p>
                </div>
                <button 
                    onClick={() => handleToggleNotification('email')}
                    className={`w-12 h-7 rounded-full transition-all flex items-center px-1 ${notifications.email ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${notifications.email ? 'translate-x-5' : 'translate-x-0'}`}/>
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Push Notifications</h4>
                  <p className="text-xs text-slate-500 mt-1">Get instant notifications on your device</p>
                </div>
                <button 
                    onClick={() => handleToggleNotification('push')}
                    className={`w-12 h-7 rounded-full transition-all flex items-center px-1 ${notifications.push ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                     <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${notifications.push ? 'translate-x-5' : 'translate-x-0'}`}/>
                </button>
              </div>

              <button 
                onClick={() => setShowPasswordModal(true)}
                className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left group"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">Change Password</h4>
                  <p className="text-xs text-slate-500 mt-1">Update your security credentials</p>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl border border-slate-100">
                  <h2 className="text-xl font-bold text-slate-900 mb-6">Change Password</h2>
                  <form onSubmit={handleChangePassword} className="space-y-5">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">New Password</label>
                          <input 
                            type="password"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                            value={passwordForm.newPassword}
                            onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">Confirm Password</label>
                          <input 
                            type="password"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                            value={passwordForm.confirmPassword}
                            onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                          />
                      </div>
                      <div className="flex gap-3 pt-4">
                          <button type="button" onClick={() => setShowPasswordModal(false)} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                          <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all">Update Password</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}