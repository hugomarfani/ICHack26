import { AlertCircle, CheckCircle2, Shield, ThumbsUp, TrendingUp } from 'lucide-react';

interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: string;
}

interface AIFeedback {
  summary: string;
  score: number;
  security_issues: SecurityIssue[];
  strengths: string[];
  improvements: string[];
}

interface AIReviewCardProps {
  score: number;
  feedback: AIFeedback;
  status: 'pending' | 'reviewing' | 'completed' | 'failed';
  onRemark?: () => void;
  remarkLoading?: boolean;
}

export function AIReviewCard({ score, feedback, status, onRemark, remarkLoading }: AIReviewCardProps) {
  if (status === 'reviewing' || remarkLoading) {
    return (
      <div className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <h4 className="font-bold text-indigo-900">AI Review in Progress</h4>
            <p className="text-sm text-indigo-600">Claude is analyzing your code...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="p-6 bg-red-50 border border-red-100 rounded-2xl">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-600" />
          <div className="flex-1">
            <h4 className="font-bold text-red-900">Review Failed</h4>
            <p className="text-sm text-red-600">Unable to complete the automated review. Please try again.</p>
          </div>
          {onRemark && (
            <button
              onClick={onRemark}
              className="px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors text-sm"
            >
              Retry Review
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status !== 'completed' || !feedback) {
    return null;
  }

  // DEBUG: Log what we receive
  console.log('AIReviewCard received:', { score, feedback, feedbackType: typeof feedback });

  // Parse the feedback data - Supabase JSONB returns as object directly
  let parsedFeedback: AIFeedback;
  let displayScore = score;
  
  // If feedback is already a proper object with the expected structure
  if (feedback && typeof feedback === 'object' && !Array.isArray(feedback)) {
    // Supabase JSONB columns are automatically parsed as objects
    parsedFeedback = {
      summary: feedback.summary || '',
      score: feedback.score !== undefined ? feedback.score : score,
      security_issues: Array.isArray(feedback.security_issues) ? feedback.security_issues : [],
      strengths: Array.isArray(feedback.strengths) ? feedback.strengths : [],
      improvements: Array.isArray(feedback.improvements) ? feedback.improvements : []
    };
    displayScore = parsedFeedback.score;
  } 
  // If feedback is a string, try to parse it
  else if (typeof feedback === 'string') {
    try {
      const parsed = JSON.parse(feedback);
      parsedFeedback = {
        summary: parsed.summary || '',
        score: parsed.score !== undefined ? parsed.score : score,
        security_issues: Array.isArray(parsed.security_issues) ? parsed.security_issues : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : []
      };
      displayScore = parsedFeedback.score;
    } catch (e) {
      // If parsing fails, use feedback as summary
      console.error('Failed to parse feedback string:', e);
      parsedFeedback = {
        summary: feedback,
        score: score,
        security_issues: [],
        strengths: [],
        improvements: []
      };
    }
  } 
  // Fallback for unexpected types
  else {
    console.warn('Unexpected feedback type:', typeof feedback, feedback);
    parsedFeedback = {
      summary: 'Unable to parse feedback',
      score: score,
      security_issues: [],
      strengths: [],
      improvements: []
    };
  }

  console.log('Parsed feedback:', parsedFeedback);

  const hasCriticalIssues = (parsedFeedback.security_issues || []).some(
    (issue) => issue.severity === 'critical' || issue.severity === 'high'
  );

  const scoreColor = displayScore >= 80 ? 'emerald' : displayScore >= 60 ? 'amber' : 'red';

  return (
    <div className="space-y-4">
      {/* Score Card */}
      <div className={`p-6 bg-gradient-to-br from-${scoreColor}-50 to-${scoreColor}-100/50 border border-${scoreColor}-200 rounded-2xl`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className={`w-5 h-5 text-${scoreColor}-600`} />
            AI Code Review Score
          </h3>
          <div className="flex items-center gap-3">
            <div className={`text-3xl font-black text-${scoreColor}-700`}>
              {displayScore}<span className="text-lg">/100</span>
            </div>
            {onRemark && (
              <button
                onClick={onRemark}
                className="px-3 py-1.5 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors text-sm"
              >
                Remark
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{parsedFeedback.summary}</p>
      </div>

      {/* Security Issues */}
      {(parsedFeedback.security_issues || []).length > 0 && (
        <div className={`p-5 ${hasCriticalIssues ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} border rounded-2xl`}>
          <div className="flex items-start gap-3 mb-3">
            <Shield className={`w-5 h-5 mt-0.5 ${hasCriticalIssues ? 'text-red-600' : 'text-amber-600'}`} />
            <div className="flex-1">
              <h4 className={`font-bold mb-2 ${hasCriticalIssues ? 'text-red-900' : 'text-amber-900'}`}>
                Security Concerns Detected
              </h4>
              <div className="space-y-2">
                {(parsedFeedback.security_issues || []).map((issue, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                        issue.severity === 'critical' ? 'bg-red-200 text-red-800' :
                        issue.severity === 'high' ? 'bg-orange-200 text-orange-800' :
                        issue.severity === 'medium' ? 'bg-amber-200 text-amber-800' :
                        'bg-yellow-200 text-yellow-800'
                      }`}>
                        {issue.severity}
                      </span>
                      {issue.location && <span className="text-xs text-slate-500">{issue.location}</span>}
                    </div>
                    <p className={hasCriticalIssues ? 'text-red-700' : 'text-amber-700'}>{issue.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {hasCriticalIssues && (
            <div className="mt-3 pt-3 border-t border-red-200">
              <p className="text-xs font-bold text-red-800">
                ⚠️ Critical security issues must be resolved before approval
              </p>
            </div>
          )}
        </div>
      )}

      {/* Strengths */}
      {(parsedFeedback.strengths || []).length > 0 && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="flex items-start gap-3">
            <ThumbsUp className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-emerald-900 mb-2">Strengths</h4>
              <ul className="space-y-1.5">
                {(parsedFeedback.strengths || []).map((strength, idx) => (
                  <li key={idx} className="text-sm text-emerald-700 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Improvements */}
      {(parsedFeedback.improvements || []).length > 0 && (
        <div className="p-5 bg-blue-50 border border-blue-200 rounded-2xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-blue-900 mb-2">Areas for Improvement</h4>
              <ul className="space-y-1.5">
                {(parsedFeedback.improvements || []).map((improvement, idx) => (
                  <li key={idx} className="text-sm text-blue-700 flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{improvement}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
