#!/usr/bin/env bash

# Create PR with Claude-generated body from commits
set -e

branch=$(git branch --show-current)
if [ "$branch" = "main" ]; then
    echo -e "\033[31m❌ Cannot create PR from main branch\033[0m"
    exit 1
fi

# Push branch first
git push -u origin "$branch"

# Get issue context
issue_num=""
issue_title=""
issue_body=""
if [ -f ".context/current-task.md" ]; then
    issue_num=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*' | head -1)
    issue_title=$(grep "Title: " .context/current-task.md | sed 's/Title: //')
    issue_body=$(sed -n '/## Description/,/## Acceptance Criteria/p' .context/current-task.md | head -20)
fi

# If no context, try extracting from branch name
if [ -z "$issue_num" ]; then
    issue_num=$(echo "$branch" | grep -o '/[0-9]*-' | grep -o '[0-9]*' | head -1)
fi

# Get commit history and diff
commits=$(git log main..HEAD --pretty=format:"- %s")
files_changed=$(git diff main..HEAD --stat)

# Generate PR body with Claude
echo "📝 Generating PR description with Claude..."

printf "You are a senior developer writing a PR description. Be concise and professional.

Generate a GitHub PR description based on this information:

Issue: #%s%s
Issue Context:
%s

Commits made:
%s

Files changed:
%s

Generate a professional PR description with:
1. A clear summary (2-3 sentences)
2. What changed (bullet points)
3. Why these changes were made
4. Testing notes
5. Any notes for reviewers

Format in GitHub markdown. Make it concise but comprehensive." "$issue_num" "${issue_title:+ - $issue_title}" "$issue_body" "$commits" "$files_changed" > /tmp/pr-prompt.txt

pr_body=$(cat /tmp/pr-prompt.txt | claude --print)
rm /tmp/pr-prompt.txt

# Add footer
pr_body="$pr_body

---
Addresses #${issue_num}
"

# Save PR body to temp file
echo "$pr_body" > /tmp/pr-body.md

# Show preview
echo ""
echo "Preview:"
echo "========"
cat /tmp/pr-body.md
echo ""
echo "========"

# Confirm before creating
read -p "Create PR with this description? [Y/n] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    if [ ! -z "$issue_num" ]; then
        gh pr create --title "$issue_title" --body-file /tmp/pr-body.md --web
    else
        gh pr create --body-file /tmp/pr-body.md --web
    fi
else
    echo "PR creation cancelled"
fi

rm -f /tmp/pr-body.md 