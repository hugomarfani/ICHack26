import { supabase } from '@/lib/supabase';
import { ArrowRight, Building2, Code, Heart, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function LoginPage() {
  const [selectedType, setSelectedType] = useState<'student' | 'charity' | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;

    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: selectedType,
              full_name: fullName,
              avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`
            },
          },
        });
        if (error) throw error;
        toast.success('Account created! Please check your email to verify.');
        // Optionally auto-login or switch to login mode? 
        // Supabase auto-logs in if email confirmation is disabled.
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success('Welcome back!');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 p-12 flex-col justify-between">
        <div className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
            <Heart className="w-6 h-6" fill="currentColor" />
          </div>
          <span className="text-2xl font-semibold">CharityCode</span>
        </div>
        
        <div className="text-white space-y-6">
          <h1 className="text-5xl font-semibold leading-tight">
            Connecting Students<br />with Purpose-Driven<br />Projects
          </h1>
          <p className="text-xl text-white/80 max-w-lg">
            A marketplace where non-profits get technical help and students gain real-world experience.
          </p>
          
          <div className="grid grid-cols-3 gap-6 pt-6">
            <div>
              <div className="text-3xl font-semibold">2,450+</div>
              <div className="text-white/70 text-sm">Tasks Completed</div>
            </div>
            <div>
              <div className="text-3xl font-semibold">1,200+</div>
              <div className="text-white/70 text-sm">Active Students</div>
            </div>
            <div>
              <div className="text-3xl font-semibold">350+</div>
              <div className="text-white/70 text-sm">Charities Helped</div>
            </div>
          </div>
        </div>
        
        <div className="text-white/60 text-sm">
          © 2026 CharityCode. Making tech accessible for good.
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <Heart className="w-6 h-6 text-white" fill="currentColor" />
              </div>
              <span className="text-2xl font-semibold text-foreground">CharityCode</span>
            </div>
            <h2 className="text-3xl font-semibold text-foreground">
              {isSignUp ? 'Create an account' : 'Welcome back'}
            </h2>
            <p className="text-muted-foreground">
              {isSignUp ? 'Join the community making an impact' : 'Sign in to continue making an impact'}
            </p>
          </div>

          {!selectedType ? (
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">I am a...</p>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setSelectedType('student')}
                  className="group relative overflow-hidden rounded-xl border-2 border-border hover:border-primary transition-all p-6 text-left bg-card hover:shadow-lg"
                >
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Code className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Student</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Find projects to build your portfolio
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>

                <button
                  onClick={() => setSelectedType('charity')}
                  className="group relative overflow-hidden rounded-xl border-2 border-border hover:border-primary transition-all p-6 text-left bg-card hover:shadow-lg"
                >
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                      <Building2 className="w-8 h-8 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Charity</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Get technical support for your mission
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    selectedType === 'student' ? 'bg-primary/10' : 'bg-accent/10'
                  }`}>
                    {selectedType === 'student' ? (
                      <Code className={`w-4 h-4 ${selectedType === 'student' ? 'text-primary' : 'text-accent'}`} />
                    ) : (
                      <Building2 className="w-4 h-4 text-accent" />
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    Signing in as {selectedType === 'student' ? 'Student' : 'Charity'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  className="text-sm text-primary hover:underline"
                >
                  Change
                </button>
              </div>

              <div className="space-y-4">
                {isSignUp && (
                  <div>
                    <label htmlFor="fullName" className="block text-sm mb-2 text-foreground">
                      Full Name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                      placeholder="John Doe"
                      required={isSignUp}
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm mb-2 text-foreground">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm mb-2 text-foreground">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {!isSignUp && (
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    Remember me
                  </label>
                  <button type="button" className="text-primary hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center ${
                  selectedType === 'student'
                    ? 'bg-primary hover:bg-primary/90'
                    : 'bg-accent hover:bg-accent/90'
                } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  isSignUp ? 'Create Account' : 'Sign in'
                )}
              </button>

              <div className="text-center text-sm text-muted-foreground">
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <button 
                  type="button" 
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-primary hover:underline"
                >
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
