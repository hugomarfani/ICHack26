import { AccountPage } from '@/app/components/AccountPage';
import { Dashboard } from '@/app/components/Dashboard';
import { DiscoverPage } from '@/app/components/DiscoverPage';
import { LoginPage } from '@/app/components/LoginPage';
import { Sidebar } from '@/app/components/Sidebar';
import { TaskDetailPage } from '@/app/components/TaskDetailPage';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

function AppContent() {
  const { user, profile, loading, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Reset to dashboard on login
  useEffect(() => {
    if (user) {
      setCurrentPage('dashboard');
    }
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    setCurrentPage('dashboard');
    setSelectedTaskId(null);
  };

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    if (page !== 'task-detail') {
      setSelectedTaskId(null);
    }
  };

  const handleViewTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    setCurrentPage('task-detail');
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Default to student if role not yet loaded, or handle as error/loading
  const userType = profile?.role || 'student';

  return (
    <div className="flex h-screen w-full bg-background font-['Inter',sans-serif]">
      <Sidebar 
        currentPage={currentPage} 
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        userType={userType}
      />
      
      <main className="flex-1 overflow-auto">
        {currentPage === 'dashboard' && (
          <Dashboard userType={userType} onViewTask={handleViewTask} onNavigate={handleNavigate} />
        )}
        {currentPage === 'discover' && (
          <DiscoverPage onViewTask={handleViewTask} />
        )}
        {currentPage === 'account' && (
          <AccountPage userType={userType} onViewTask={handleViewTask} />
        )}
        {currentPage === 'task-detail' && selectedTaskId && (
          <TaskDetailPage taskId={selectedTaskId} onBack={() => handleNavigate('discover')} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster />
      <AppContent />
    </AuthProvider>
  );
}