# Supabase Edge Functions

This directory contains Supabase Edge Functions for the Charity-Student Marketplace App.

## Functions

### review-submission

Analyzes student code submissions using Claude AI and provides automated feedback.

**Environment Variables Required:**
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `SUPABASE_URL`: Automatically provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Automatically provided by Supabase

**Deployment:**

1. Install Supabase CLI if you haven't already:
   ```bash
   npm install -g supabase
   ```

2. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Set the Anthropic API key secret:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=your_api_key_here
   ```

4. Deploy the function:
   ```bash
   supabase functions deploy review-submission
   ```

**Usage:**

Call from your frontend:
```typescript
const { data, error } = await supabase.functions.invoke('review-submission', {
  body: {
    submission_id: 'uuid',
    github_url: 'https://github.com/user/repo'
  }
})
```
