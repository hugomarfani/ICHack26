import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

interface AIReviewRequest {
  submission_id: string
  github_url: string
}

interface RepoInfo {
  owner: string
  repo: string
  branch: string
}

interface FileInfo {
  path: string
  type: string
  url?: string
}

// Parse GitHub URL to extract owner, repo, and branch
function parseGitHubUrl(url: string): RepoInfo | null {
  try {
    const urlObj = new URL(url)
    if (!urlObj.hostname.includes('github.com')) return null

    const parts = urlObj.pathname.split('/').filter(p => p)
    if (parts.length < 2) return null

    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/, '')

    // Check if URL includes branch (e.g., /tree/main)
    let branch = 'main'
    if (parts.length > 3 && parts[2] === 'tree') {
      branch = parts[3]
    }

    return { owner, repo, branch }
  } catch {
    return null
  }
}

// Fetch repository file structure from GitHub API
async function fetchRepoFiles(repoInfo: RepoInfo): Promise<FileInfo[]> {
  const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${repoInfo.branch}?recursive=1`

  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Supabase-Edge-Function'
    }
  })

  if (!response.ok) {
    // Try 'master' branch as fallback
    if (repoInfo.branch === 'main') {
      repoInfo.branch = 'master'
      return fetchRepoFiles(repoInfo)
    }
    throw new Error(`Failed to fetch repository: ${response.statusText}`)
  }

  const data = await response.json()
  return data.tree || []
}

// Select relevant files based on extensions and exclude patterns
function selectRelevantFiles(files: FileInfo[], techStack: string[]): FileInfo[] {
  const codeExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rb', '.php',
    '.html', '.css', '.scss', '.vue', '.svelte', '.rs', '.cpp', '.c', '.swift'
  ]

  const excludePatterns = [
    'node_modules/', 'dist/', 'build/', '.git/', 'vendor/', '__pycache__/',
    '.next/', 'out/', 'coverage/', '.cache/', 'public/assets/', 'package-lock.json',
    'yarn.lock', 'pnpm-lock.yaml', '.env', '.DS_Store'
  ]

  const relevantFiles = files.filter(file => {
    if (file.type !== 'blob') return false

    // Exclude based on patterns
    if (excludePatterns.some(pattern => file.path.includes(pattern))) return false

    // Include if matches code extensions
    if (codeExtensions.some(ext => file.path.endsWith(ext))) return true

    // Include README and config files
    if (file.path.match(/readme|package\.json|tsconfig|vite\.config|next\.config/i)) return true

    return false
  })

  // Prioritize main files, components, and source files
  return relevantFiles.sort((a, b) => {
    const priority = (path: string) => {
      if (path.match(/^(src\/|app\/|pages\/|components\/)/)) return 0
      if (path.match(/\.(jsx|tsx|vue|svelte)$/)) return 1
      if (path.match(/\.(ts|js)$/)) return 2
      if (path.match(/readme/i)) return 3
      return 4
    }
    return priority(a.path) - priority(b.path)
  })
}

// Fetch content for specific files
async function fetchFileContents(repoInfo: RepoInfo, files: FileInfo[]): Promise<Array<{ path: string, content: string }>> {
  const contents = []

  for (const file of files) {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${file.path}`
      const response = await fetch(rawUrl)

      if (response.ok) {
        const content = await response.text()
        // Limit file size to avoid token overflow (max ~50KB per file)
        if (content.length < 50000) {
          contents.push({ path: file.path, content })
        }
      }
    } catch (e) {
      console.error(`Failed to fetch ${file.path}:`, e)
    }
  }

  return contents
}

// Determine language from file path
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rb': 'ruby',
    'php': 'php',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'vue': 'vue',
    'svelte': 'svelte',
    'rs': 'rust',
    'swift': 'swift',
    'cpp': 'cpp',
    'c': 'c'
  }
  return langMap[ext || ''] || ''
}

interface AIFeedback {
  summary: string
  score: number
  security_issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low'
    description: string
    location?: string
  }>
  strengths: string[]
  improvements: string[]
}

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key
    // Note: Supabase Edge already validates the user's JWT before this function runs
    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    )

    const { submission_id, github_url }: AIReviewRequest = await req.json()

    if (!submission_id || !github_url) {
      throw new Error('Missing submission_id or github_url')
    }

    // Update status to 'reviewing'
    await supabase
      .from('task_submissions')
      .update({ ai_review_status: 'reviewing' })
      .eq('id', submission_id)

    // Fetch task details and submission
    const { data: submission, error: subError } = await supabase
      .from('task_submissions')
      .select('task_id')
      .eq('id', submission_id)
      .single()

    if (subError) throw subError

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('title, description, tech_stack, difficulty')
      .eq('id', submission.task_id)
      .single()

    if (taskError) throw taskError

    // Parse GitHub URL and fetch repository contents
    const repoInfo = parseGitHubUrl(github_url)
    if (!repoInfo) {
      throw new Error('Invalid GitHub URL format')
    }

    let files: FileInfo[] = []
    let relevantFiles: FileInfo[] = []
    let fileContents: Array<{ path: string, content: string }> = []
    let codeContext = ''

    // Try to fetch repository contents, but handle failures gracefully
    try {
      // Fetch repository file structure
      files = await fetchRepoFiles(repoInfo)

      // Filter and prioritize files based on tech stack
      relevantFiles = selectRelevantFiles(files, task.tech_stack || [])

      // Fetch content for selected files (limit to avoid token overflow)
      fileContents = await fetchFileContents(repoInfo, relevantFiles.slice(0, 10))

      // Build code context for Claude
      codeContext = fileContents.map(f =>
        `### File: ${f.path}\n\`\`\`${getLanguageFromPath(f.path)}\n${f.content}\n\`\`\``
      ).join('\n\n')
    } catch (fetchError) {
      console.warn('Failed to fetch repository files:', fetchError)
      // Fallback: proceed with review based on repository URL only
      codeContext = ''
    }

    // Build the review prompt
    const reviewPrompt = codeContext
      ? `You are a code reviewer evaluating a student's submission for a charity project.

Task Details:
- Title: ${task.title}
- Description: ${task.description}
- Required Tech Stack: ${task.tech_stack?.join(', ') || 'Not specified'}
- Difficulty: ${task.difficulty || 'Not specified'}

Repository: ${github_url}

Here is the code from the student's repository:

${codeContext}

Please provide a thorough code review that:
1. Scores the submission (0-100) based on code quality, best practices, and task requirements
2. Identifies any security concerns (check for hardcoded credentials, SQL injection, XSS vulnerabilities, etc.)
3. Lists strengths in the implementation
4. Suggests specific improvements

Return your response as a JSON object with this exact structure:
{
  "summary": "Brief overall assessment (2-3 sentences)",
  "score": 75,
  "security_issues": [
    {
      "severity": "high",
      "description": "Description of security issue",
      "location": "filename.js:line 42"
    }
  ],
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Improvement 1", "Improvement 2"]
}

If there are no security issues, return an empty array for security_issues.
Severity levels: critical, high, medium, low`
      : `You are a code reviewer evaluating a student's submission for a charity project.

Task Details:
- Title: ${task.title}
- Description: ${task.description}
- Required Tech Stack: ${task.tech_stack?.join(', ') || 'Not specified'}
- Difficulty: ${task.difficulty || 'Not specified'}

Repository: ${github_url}

Note: Unable to fetch repository contents automatically. Please review based on the repository URL and task requirements. The student should have submitted a working repository with code that meets the project requirements.

Please provide a thorough code review that:
1. Scores the submission (0-100) based on whether a valid repository was provided and general expectations
2. Note any concerns about repository accessibility
3. Suggest what should be included in the repository

Return your response as a JSON object with this exact structure:
{
  "summary": "Brief overall assessment (2-3 sentences)",
  "score": 75,
  "security_issues": [
    {
      "severity": "medium",
      "description": "Description of security concern",
      "location": "Repository structure"
    }
  ],
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Improvement 1", "Improvement 2"]
}

If there are no security issues, return an empty array for security_issues.
Severity levels: critical, high, medium, low`

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: reviewPrompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`)
    }

    const claudeResponse = await response.json()
    const reviewText = claudeResponse.content[0].text

    // Parse the JSON response from Claude
    // Claude sometimes wraps JSON in markdown code blocks, so strip them
    let feedback: AIFeedback
    try {
      // Remove markdown code fences if present
      let cleanedReviewText = reviewText.trim()
      if (cleanedReviewText.startsWith('```')) {
        // Remove ```json or ``` at the start
        cleanedReviewText = cleanedReviewText.replace(/^```(?:json)?\s*\n?/, '')
        // Remove ``` at the end
        cleanedReviewText = cleanedReviewText.replace(/\n?```\s*$/, '')
      }

      feedback = JSON.parse(cleanedReviewText)
    } catch (e) {
      console.error('Failed to parse Claude response:', e, 'Response:', reviewText)
      // Fallback if Claude doesn't return valid JSON
      feedback = {
        summary: reviewText,
        score: 70,
        security_issues: [],
        strengths: ['Code submitted'],
        improvements: ['Review feedback format'],
      }
    }

    // Update submission with review results
    const { error: updateError } = await supabase
      .from('task_submissions')
      .update({
        ai_review_status: 'completed',
        ai_score: feedback.score,
        ai_feedback: feedback,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', submission_id)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({
        success: true,
        feedback,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
