import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getStatusColor } from '@/lib/utils';
import { ArrowLeft, Calendar, CheckCircle2, Clock, Edit2, ExternalLink, Loader2, Mail, MessageSquare, Save, Send, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AIReviewCard } from './ui/AIReviewCard';

interface TaskDetailPageProps {
  taskId: string;
  onBack: () => void;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  created_by: string;
  assigned_to: string | null;
  // Computed/Joined
  charity?: { full_name: string; avatar_url: string };
  assigned_student?: { full_name: string; avatar_url: string; email: string };
  difficulty?: string;
  tech_stack?: string[];
  image_url?: string;
  time_estimate?: string;

  category?: string;
  contact_email?: string;
}

interface Question {
  id: string;
  question: string;
  answer: string | null;
  created_at: string;
  user_id: string;
  user?: { full_name: string; avatar_url: string };
}

export function TaskDetailPage({ taskId, onBack }: TaskDetailPageProps) {
  const { user } = useAuth();
  
  // -- Core Task State --
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // -- Multi-Student Submission State --
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [mySubmission, setMySubmission] = useState<any>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  // -- Editing State (for Task Owner) --
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // -- Q&A State --
  const [newQuestion, setNewQuestion] = useState('');
  const [replyText, setReplyText] = useState<Record<string, string>>({}); 
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  useEffect(() => {
    fetchTaskDetails();
    fetchQuestions();
    fetchSubmissions();
  }, [taskId, user]);

  const fetchTaskDetails = async () => {
    try {
      // 1. Fetch Task
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (taskError) throw taskError;

      // 2. Fetch Profiles (Charity & Winner if exists)
      const profileIds = [taskData.created_by, taskData.assigned_to].filter(Boolean);
      let charity = undefined;
      let assigned_student = undefined;

      if (profileIds.length > 0) {
          const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_url')
              .in('id', profileIds);
          
          if (profiles) {
              charity = profiles.find((p: any) => p.id === taskData.created_by);
              assigned_student = profiles.find((p: any) => p.id === taskData.assigned_to);
          }
      }

      setTask({
          ...taskData,
          charity,
          assigned_student
      });
      setEditForm(taskData);
    } catch (error) {
      console.error('Error fetching task:', error);
      toast.error('Could not load task details');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestions = async () => {
    const { data, error } = await supabase
      .from('task_questions')
      .select('*, user:user_id(full_name, avatar_url)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    
    if (error) console.error('Error fetching questions:', error);
    else setQuestions(data || []);
  };

  const fetchSubmissions = async () => {
      if (!taskId) return;
      
      try {
          // 1. Fetch Raw Submissions (No Join) to avoid FK errors
          const { data: rawSubmissions, error } = await supabase
              .from('task_submissions')
              .select('*')
              .eq('task_id', taskId);
          
          if (error) throw error;
          
          const submissions = rawSubmissions || [];
          
          // 2. Manually Fetch Profiles
          const studentIds = submissions.map((s: any) => s.student_id).filter(Boolean);
          let profilesMap: Record<string, any> = {};

          if (studentIds.length > 0) {
              const { data: profiles } = await supabase
                  .from('profiles')
                  .select('id, full_name, avatar_url')
                  .in('id', studentIds);
              
              profiles?.forEach((p: any) => {
                  profilesMap[p.id] = p;
              });
          }

          // 3. Merge Data
          const combined = submissions.map((s: any) => ({
              ...s,
              student: profilesMap[s.student_id] || { full_name: 'Unknown Student', avatar_url: '' }
          }));

          console.log('Final Merged Submissions:', combined);
          setSubmissions(combined);

          if (user) {
              const mine = combined.find((s: any) => s.student_id === user.id);
              console.log('My Submission:', mine);
              setMySubmission(mine || null);
          }

      } catch (err) {
          console.error('Error fetching submissions:', err);
      }
  };

  // -- Actions --

  const handleStartTask = async () => {
      if (!user) return;
      
      // Optimistic update state
      const optimisticState = {
          task_id: taskId,
          student_id: user.id,
          status: 'started'
      };

      try {
          const { error } = await supabase.from('task_submissions').insert({
              task_id: taskId,
              student_id: user.id,
              status: 'started'
          });

          if (error) {
              // Handle duplicate key error (code 23505) gracefully
              if (error.code === '23505') {
                  console.log('Task already claimed, syncing state...');
                  setMySubmission(optimisticState);
                  fetchSubmissions(); 
                  return;
              }
              throw error;
          }
          
          toast.success('Project started! Good luck.');
          setMySubmission(optimisticState);
          fetchSubmissions();
      } catch (e: any) {
          console.error(e);
          toast.error(e.message || 'Failed to start task');
      }
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!mySubmission || !githubUrl.trim()) return;

      try {
          // 1. Update submission with github URL and status
          const { error } = await supabase
              .from('task_submissions')
              .update({
                  status: 'submitted',
                  submission_content: githubUrl,
                  ai_review_status: 'pending'
              })
              .eq('id', mySubmission.id);

          if (error) throw error;
          
          toast.success('Solution submitted! AI review starting...');
          setShowSubmitModal(false);
          setIsReviewing(true);
          fetchSubmissions();

          // 2. Trigger AI review asynchronously
          try {
              const { data: reviewData, error: reviewError } = await supabase.functions.invoke('review-submission', {
                  body: {
                      submission_id: mySubmission.id,
                      github_url: githubUrl
                  }
              });

              if (reviewError) throw reviewError;
              
              if (reviewData?.success) {
                  toast.success('AI review completed!');
              }
              
              // Refresh to show the review
              fetchSubmissions();
          } catch (reviewErr: any) {
              console.error('AI Review error:', reviewErr);
              toast.error('AI review failed, but your submission was saved');
              
              // Mark as failed
              await supabase
                  .from('task_submissions')
                  .update({ ai_review_status: 'failed' })
                  .eq('id', mySubmission.id);
              
              fetchSubmissions();
          } finally {
              setIsReviewing(false);
          }
      } catch (e: any) {
          console.error(e);
          toast.error('Failed to submit work');
      }
  };

  const handleRemark = async (submissionId: string) => {
      try {
          setIsReviewing(true);
          toast.info('Requesting new AI review...');

          // Update status to pending
          await supabase
              .from('task_submissions')
              .update({ ai_review_status: 'reviewing' })
              .eq('id', submissionId);

          fetchSubmissions();

          // Trigger AI review
          const { data: reviewData, error: reviewError } = await supabase.functions.invoke('review-submission', {
              body: {
                  submission_id: submissionId,
                  github_url: submissions.find(s => s.id === submissionId)?.submission_content || ''
              }
          });

          if (reviewError) throw reviewError;

          if (reviewData?.success) {
              toast.success('AI review completed!');
          }

          fetchSubmissions();
      } catch (error: any) {
          console.error('Remark error:', error);
          toast.error('Failed to re-review submission');

          await supabase
              .from('task_submissions')
              .update({ ai_review_status: 'failed' })
              .eq('id', submissionId);

          fetchSubmissions();
      } finally {
          setIsReviewing(false);
      }
  };


  const handleApproveSubmission = async (submissionId: string, studentId: string) => {
      try {
          // 1. Mark submission as approved
          const { error: subError } = await supabase
              .from('task_submissions')
              .update({ status: 'approved' })
              .eq('id', submissionId);
          if (subError) throw subError;

          // 2. Mark task as completed and assign to winner
          const { error: taskError } = await supabase
              .from('tasks')
              .update({
                  status: 'completed',
                  assigned_to: studentId
              })
              .eq('id', taskId);
          if (taskError) throw taskError;

          toast.success('Submission approved! Task is now completed.');
          fetchTaskDetails();
          fetchSubmissions();

      } catch (e: any) {
          console.error(e);
          toast.error('Failed to approve submission');
      }
  };

  const handleSaveChanges = async () => {
    if (!task) return;
    try {
        const { error } = await supabase
            .from('tasks')
            .update({
                title: editForm.title,
                description: editForm.description,
                difficulty: editForm.difficulty,
                time_estimate: editForm.time_estimate,
                tech_stack: editForm.tech_stack,
                contact_email: editForm.contact_email,
            })
            .eq('id', task.id);

        if (error) throw error;
        
        toast.success('Task updated');
        setIsEditing(false);
        fetchTaskDetails();
    } catch(e) {
        console.error(e);
        toast.error('Failed to update task');
    }
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !user) return;

    try {
      const { error } = await supabase
        .from('task_questions')
        .insert({
          task_id: taskId,
          user_id: user.id,
          question: newQuestion,
        });

      if (error) throw error;
      
      toast.success('Question posted');
      setNewQuestion('');
      fetchQuestions();
    } catch (error) {
      console.error('Error posting question:', error);
      toast.error('Failed to post question');
    }
  };

  const handleAnswerQuestion = async (questionId: string) => {
    const answer = replyText[questionId];
    if (!answer?.trim()) return;

    try {
      const { error } = await supabase
        .from('task_questions')
        .update({ answer })
        .eq('id', questionId);

      if (error) throw error;
      
      toast.success('Answer posted');
      setReplyingTo(null);
      fetchQuestions();
    } catch (error) {
      console.error('Error answering question:', error);
      toast.error('Failed to post answer');
    }
  };

  const handleDeleteTask = async () => {
    if (!task) return;
    
    try {
      console.log('Attempting to delete task:', task.id);
      
      const { data, error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', task.id)
        .select(); // Add select() to get the deleted row

      console.log('Delete response:', { data, error });

      if (error) {
        console.error('Supabase delete error:', error);
        throw error;
      }
      
      // Check if anything was actually deleted
      if (!data || data.length === 0) {
        console.warn('No rows were deleted - possible permission issue');
        toast.error('Failed to delete task. You may not have permission.');
        setShowDeleteConfirm(false);
        return;
      }
      
      toast.success('Task deleted successfully');
      setShowDeleteConfirm(false);
      onBack(); // Navigate back to dashboard
    } catch (error: any) {
      console.error('Error deleting task:', error);
      
      // Check for specific error types
      if (error.code === '23503') {
        toast.error('Cannot delete task with existing submissions. Please contact support.');
      } else if (error.message) {
        toast.error(`Failed to delete task: ${error.message}`);
      } else {
        toast.error('Failed to delete task');
      }
      
      setShowDeleteConfirm(false);
    }
  };

  // -- Render Helpers --

  const renderStudentActions = () => {
    if (task?.status === 'completed') {
        const iWon = task.assigned_to === user?.id;
        return (
            <div className={`p-5 rounded-2xl text-center ${iWon ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                {iWon ? (
                    <div>
                        <h4 className="font-bold text-lg mb-1">🎉 Congratulations!</h4>
                        <p className="text-sm">Your submission was selected for this task.</p>
                    </div>
                ) : (
                    "This task is closed."
                )}
            </div>
        );
    }

    if (!mySubmission) {
        return (
            <div>
                <h3 className="font-medium text-slate-900">{task?.charity?.full_name || 'Charity Organization'}</h3>
                {!task?.contact_email && (
                    <p className="text-sm text-slate-500">Task Creator</p>
                )}
                <p className="text-sm text-slate-500 mb-6 leading-relaxed mt-4">
                    Start this task to track your progress. You can submit your solution when you're ready.
                </p>
                <button
                    onClick={handleStartTask}
                    className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all hover:-translate-y-0.5"
                >
                    Start Project
                </button>
            </div>
        );
    }

    if (mySubmission.status === 'started') {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700 mb-2 p-3 bg-slate-50 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                    <span className="font-medium text-sm">You are working on this.</span>
                </div>
                <button 
                    onClick={() => setShowSubmitModal(true)}
                    className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all hover:-translate-y-0.5"
                >
                    Submit Solution
                </button>
            </div>
        );
    }

    if (mySubmission.status === 'submitted') {
        const hasCriticalSecurityIssues = mySubmission.ai_feedback?.security_issues?.some(
            (issue: any) => issue.severity === 'critical' || issue.severity === 'high'
        );
        
        return (
            <div className="space-y-4">
                <div className="p-5 bg-amber-50 text-amber-900 border border-amber-100 rounded-2xl">
                    <h4 className="font-bold mb-1">Submission Under Review</h4>
                    <p className="text-sm opacity-90">Great job! The charity will review your submission soon.</p>
                    <a href={mySubmission.submission_content} target="_blank" rel="noreferrer" className="text-xs font-semibold underline mt-3 block truncate hover:text-amber-700">
                        {mySubmission.submission_content}
                    </a>
                </div>
                
                {/* AI Review Status Summary */}
                {mySubmission.ai_review_status === 'completed' && (
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 mb-2">
                        <span className="text-sm font-medium text-slate-600">Review Score</span>
                        <span className={`text-lg font-bold ${
                             (mySubmission.ai_score || 0) >= 80 ? 'text-emerald-600' : 
                             (mySubmission.ai_score || 0) >= 60 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                            {mySubmission.ai_score || 0}/100
                        </span>
                    </div>
                )}
                
                {/* Allow resubmission if critical security issues */}
                {hasCriticalSecurityIssues && (
                    <button 
                        onClick={() => {
                            setGithubUrl('');
                            setShowSubmitModal(true);
                        }}
                        className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 shadow-lg shadow-red-100 transition-all"
                    >
                        Resubmit with Fixes
                    </button>
                )}
            </div>
        );
    }

    if (mySubmission.status === 'approved') {
         // Should be covered by task.status === completed check above, but good fallback
        return (
            <div className="p-5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-2xl">
                <h4 className="font-bold mb-1">🎉 Approved!</h4>
                <p className="text-sm">Your work has been accepted.</p>
            </div>
        );
    }
  };

  const renderCharityActions = () => {
      // List of students who started/submitted
      if (submissions.length === 0) {
          return <div className="text-slate-400 text-sm italic py-4 text-center border-2 border-dashed border-slate-100 rounded-xl">No students have started this task yet.</div>;
      }

      return (
          <div className="space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center justify-between">
                 Active Students 
                 <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs">{submissions.length}</span>
              </h3>
              <div className="space-y-2">
              {submissions.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center overflow-hidden border border-slate-200">
                            {sub.student?.avatar_url ? <img src={sub.student.avatar_url} className="w-full h-full object-cover"/> : '🎓'}
                      </div>
                      <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{sub.student?.full_name || 'Student'}</p>
                          <p className={`text-[10px] font-bold uppercase ${
                                getStatusColor(sub.status)
                          }`}>
                            {sub.status.replace('_', ' ')}
                          </p>
                      </div>
                      {sub.ai_score != null && (
                         <span className={`text-xs font-bold ${
                             (sub.ai_score) >= 80 ? 'text-emerald-600' : 
                             (sub.ai_score) >= 60 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                             {sub.ai_score}
                        </span>
                      )}
                  </div>
              ))}
              </div>
          </div>
      );
  };

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-indigo-600"/></div>;
  if (!task) return (
    <div className="p-8">
       <button onClick={onBack} className="mb-4 flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
       </button>
       <div className="text-center p-12 bg-slate-50 rounded-2xl">Task not found</div>
    </div>
  );

  const isMyTask = task.created_by === user?.id; // I am the charity

  return (
    <>
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-red-50 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-slate-900 mb-1">Delete Task</h2>
                <p className="text-sm text-slate-600">
                  Are you sure you want to delete <span className="font-semibold text-slate-900">"{task.title}"</span>? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteTask}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-lg shadow-red-200 transition-all font-medium"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="min-h-screen bg-slate-50/30">
      {/* Header */}
      <div className="border-b border-slate-100 bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 mb-6 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to tasks
          </button>
          
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center text-4xl flex-shrink-0 overflow-hidden shadow-lg shadow-slate-100 border border-slate-100 p-1">
               {task.image_url ? (
                   <img src={task.image_url} className="w-full h-full object-cover rounded-xl"/>
               ) : task.charity?.avatar_url ? (
                   <img src={task.charity.avatar_url} className="w-full h-full object-cover rounded-xl"/>
               ) : (
                   '🌍'
               )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-3 mb-2">
                {isEditing ? (
                    <input 
                        className="text-3xl font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 w-full focus:ring-2 focus:ring-indigo-100 outline-none"
                        value={editForm.title || ''}
                        onChange={e => setEditForm({...editForm, title: e.target.value})}
                    />
                ) : (
                    <h1 className="text-3xl font-bold text-slate-900">{task.title}</h1>
                )}
                
                <div className={`px-3 py-1 rounded-lg border text-xs font-bold uppercase tracking-wide ${getStatusColor(task.status)}`}>
                  {task.status.replace('_', ' ')}
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-lg text-slate-600 mb-4">
                  <span className="font-medium">{task.charity?.full_name}</span>
                  {task.difficulty && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="text-sm px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">{task.difficulty}</span>
                      </>
                  )}
              </div>
              
              <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-400" />
                  {isEditing ? (
                      <input 
                        className="bg-white border border-slate-200 rounded px-2 w-32 py-1"
                        value={editForm.time_estimate || ''}
                        onChange={e => setEditForm({...editForm, time_estimate: e.target.value})}
                      />
                  ) : (
                      task.time_estimate || 'Flexible'
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  Posted {new Date(task.created_at).toLocaleDateString()}
                </span>

              </div>
            </div>
            
            {isMyTask && (
                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleSaveChanges} className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-md transition-all">
                                <Save className="w-5 h-5"/>
                            </button>
                            <button onClick={() => setIsEditing(false)} className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all">
                                <X className="w-5 h-5"/>
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl text-sm font-semibold text-slate-700 transition-all shadow-sm">
                                <Edit2 className="w-4 h-4"/> Edit Task
                            </button>
                            <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 rounded-xl text-sm font-semibold text-red-600 transition-all shadow-sm">
                                <Trash2 className="w-4 h-4"/> Delete
                            </button>
                        </>
                    )}
                </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Charity View: Student Submissions List (Detailed) */}
            {isMyTask && submissions.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
                   <h2 className="text-xl font-bold text-slate-900">Student Submissions</h2>
                   
                   <div className="space-y-6">
                      {submissions.map(sub => (
                          <div key={sub.id} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                              {/* Header: Student Info & Status */}
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-50 pb-4">
                                  <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-md">
                                          {sub.student?.avatar_url ? <img src={sub.student.avatar_url} className="w-full h-full object-cover"/> : '🎓'}
                                      </div>
                                      <div>
                                          <h3 className="font-bold text-lg text-slate-900">{sub.student?.full_name || 'Student'}</h3>
                                          <div className="flex items-center gap-2">
                                              <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border ${getStatusColor(sub.status)}`}>
                                                  {sub.status.replace('_', ' ')}
                                              </span>
                                              {sub.created_at && <span className="text-xs text-slate-400">Started {new Date(sub.created_at).toLocaleDateString()}</span>}
                                          </div>
                                      </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-3">
                                      {sub.submission_content && (
                                        <a 
                                            href={sub.submission_content} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-2"
                                        >
                                            <ExternalLink className="w-4 h-4"/> 
                                            View Code
                                        </a>
                                      )}
                                      
                                      {sub.status === 'submitted' && task?.status !== 'completed' && (
                                          <button 
                                            onClick={() => handleApproveSubmission(sub.id, sub.student_id)}
                                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-md shadow-emerald-100 transition-all flex items-center gap-2"
                                          >
                                              <CheckCircle2 className="w-4 h-4"/>
                                              Approve
                                          </button>
                                      )}
                                  </div>
                              </div>
                              
                              {/* AI Analysis Section */}
                              {sub.ai_review_status && (sub.ai_score != null || sub.ai_review_status === 'reviewing' || sub.ai_review_status === 'failed') && (
                                  <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                          <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wide opacity-70">AI Analysis</h4>
                                          {sub.ai_review_status === 'completed' && (
                                              <span className="text-xs font-semibold text-slate-500">Auto-generated review</span>
                                          )}
                                      </div>
                                      <AIReviewCard 
                                          score={sub.ai_score || 0}
                                          feedback={sub.ai_feedback}
                                          status={sub.ai_review_status}
                                          onRemark={() => handleRemark(sub.id)}
                                          remarkLoading={isReviewing}
                                      />
                                  </div>
                              )}
                              
                              {!sub.ai_review_status && sub.status === 'submitted' && (
                                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                      <p className="text-slate-500 mb-3">AI Review has not been generated for this submission.</p>
                                      <button 
                                          onClick={() => handleRemark(sub.id)}
                                          disabled={isReviewing}
                                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                                      >
                                          Generate AI Review
                                      </button>
                                  </div>
                              )}
                          </div>
                      ))}
                   </div>
                </div>
            )}
            
            {/* Student AI Review Display (Moved from Sidebar) */}
            {!isMyTask && mySubmission?.ai_review_status && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                     <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-slate-900">AI Review Results</h2>
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Private to you</span>
                     </div>
                     <AIReviewCard 
                        score={mySubmission.ai_score || 0}
                        feedback={mySubmission.ai_feedback}
                        status={mySubmission.ai_review_status}
                        onRemark={() => handleRemark(mySubmission.id)}
                        remarkLoading={isReviewing}
                    />
                </div>
            )}

            {/* Project Overview */}
            <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Project Overview</h2>
              {isEditing ? (
                  <textarea 
                    className="w-full h-48 bg-slate-50 border border-slate-200 rounded-xl p-4 focus:ring-2 focus:ring-indigo-100 outline-none"
                    value={editForm.description || ''}
                    onChange={e => setEditForm({...editForm, description: e.target.value})}
                  />
              ) : (
                  <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {task.description}
                  </div>
              )}
            </div>

            {/* Tech Stack */}
            <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Tech Stack</h2>
              <div className="mb-2">
                {isEditing ? (
                   <div>
                       <label className="text-xs text-slate-500 mb-2 block font-medium">Comma separated values</label>
                       <input 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-100 outline-none"
                          defaultValue={task.tech_stack?.join(', ') || ''}
                          onChange={e => setEditForm({...editForm, tech_stack: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                       />
                   </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                    {task.tech_stack?.length ? (
                        task.tech_stack.map((tech) => (
                            <span key={tech} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium border border-slate-200">
                            {tech}
                            </span>
                        ))
                    ) : (
                        <span className="text-slate-400 italic">No specific stack listed.</span>
                    )}
                    </div>
                )}
              </div>
            </div>

            {/* Q&A Section */}
            <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
                Questions & Answers
              </h2>

              <div className="space-y-8 mb-8">
                {questions.length === 0 && <p className="text-slate-400 italic text-center py-4">No questions asked yet.</p>}
                {questions.map((q) => (
                  <div key={q.id} className="group">
                    <div className="flex items-start gap-4 mb-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg flex-shrink-0 overflow-hidden border-2 border-white shadow-sm">
                        {q.user?.avatar_url ? <img src={q.user.avatar_url} className="w-full h-full object-cover"/> : '👤'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-900 text-sm">{q.user?.full_name || 'User'}</span>
                          <span className="text-xs text-slate-400">{new Date(q.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg rounded-tl-none border border-slate-100 text-slate-700 text-sm">
                            {q.question}
                        </div>
                      </div>
                    </div>

                    {q.answer ? (
                      <div className="flex items-start gap-4 ml-12 mt-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-lg flex-shrink-0 border border-indigo-100">
                           {task.charity?.avatar_url ? <img src={task.charity.avatar_url} className="w-full h-full rounded-full object-cover"/> : '🌍'}
                        </div>
                        <div className="flex-1">
                           <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-slate-900 text-sm">{task.charity?.full_name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold uppercase">Charity</span>
                           </div>
                           <div className="bg-indigo-50/50 p-3 rounded-lg rounded-tl-none border border-indigo-100 text-slate-700 text-sm">
                               {q.answer}
                           </div>
                        </div>
                      </div>
                    ) : (
                      isMyTask && (
                        <div className="ml-14 mt-2">
                           {replyingTo === q.id ? (
                             <div className="flex gap-2">
                               <input 
                                 className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                                 placeholder="Write an answer..."
                                 value={replyText[q.id] || ''}
                                 onChange={e => setReplyText({...replyText, [q.id]: e.target.value})}
                               />
                               <button onClick={() => handleAnswerQuestion(q.id)} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Reply</button>
                               <button onClick={() => setReplyingTo(null)} className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                             </div>
                           ) : (
                             <button onClick={() => setReplyingTo(q.id)} className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline font-medium">Reply to user</button>
                           )}
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>

              {/* Ask Question Form - Only for students/non-owners */}
              {!isMyTask && (
                <form onSubmit={handleSubmitQuestion} className="border-t border-slate-100 pt-6">
                  <label className="block text-sm font-bold text-slate-900 mb-3">
                    Ask a question
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      placeholder="Type your question here..."
                      className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 text-slate-900 transition-all"
                    />
                    <button
                      type="submit"
                      className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 hover:-translate-y-0.5"
                    >
                      <Send className="w-4 h-4" />
                      Send
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 sticky top-24 shadow-sm">
               {isMyTask ? (
                   renderCharityActions()
               ) : (
                   renderStudentActions()
               )}
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-3">Contact</h3>
              {isEditing ? (
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Contact Email</label>
                    <input 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                        value={editForm.contact_email || ''}
                        onChange={e => setEditForm({...editForm, contact_email: e.target.value})}
                        placeholder="contact@charity.org"
                    />
                  </div>
              ) : (
                  task.contact_email ? (
                    <a href={`mailto:${task.contact_email}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline break-all flex items-center gap-2">
                        <Mail className="w-4 h-4" /> {task.contact_email}
                    </a>
                  ) : (
                    <p className="text-sm text-slate-400 italic">No contact email provided.</p>
                  )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Submit Solution Modal */}
      {showSubmitModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl border border-slate-100">
                  <h2 className="text-xl font-bold text-slate-900 mb-2">Submit Solution</h2>
                  <p className="text-sm text-slate-500 mb-6">Please provide a link to your GitHub repository or hosted project.</p>
                  
                  <form onSubmit={handleSubmitWork} className="space-y-5">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1.5">Project URL</label>
                          <input 
                              type="url"
                              required
                              placeholder="https://github.com/username/repo"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-100 outline-none"
                              value={githubUrl}
                              onChange={e => setGithubUrl(e.target.value)}
                          />
                      </div>
                      <div className="flex gap-3 pt-2">
                          <button type="button" onClick={() => setShowSubmitModal(false)} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                          <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all">Submit</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
    </>
  );
}
