#!/usr/bin/env bash

# Generate commit message with Claude
set -e

# Check for staged changes
if git diff --staged --quiet; then
    echo "❌ No staged changes to commit"
    exit 1
fi

# Gather information
diff=$(git diff --staged --stat)
diff_full=$(git diff --staged | head -500)  # Limit size for context
issue_context=$(head -50 .context/current-task.md 2>/dev/null || echo "No issue context")

# Get current branch for scope
branch=$(git branch --show-current)
scope=$(echo "$branch" | cut -d'/' -f1)

# Build prompt using printf to avoid quote issues
printf "You are a commit message generator. Generate ONLY the commit message, no explanation.

Generate a conventional commit message for these changes.

Issue context:
%s

Files changed:
%s

Diff preview:
%s

Format: <type>(<scope>): <description>
Types: feat, fix, refactor, test, docs, style, perf, chore
Scope: Use '%s' if appropriate, or be more specific
Keep it under 72 characters, be specific about what changed." "$issue_context" "$diff" "$diff_full" "$scope" > /tmp/commit-prompt.txt

echo "📝 Generating commit message..."

# Call Claude and capture output
message=$(cat /tmp/commit-prompt.txt | claude --print)
rm /tmp/commit-prompt.txt

# Display the message
echo ""
echo "Suggested commit message:"
echo -e "\033[36m$message\033[0m"
echo ""

# Ask for confirmation
read -p "Use this message? [Y/n/e] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Ee]$ ]]; then
    # Edit the message
    echo "$message" > /tmp/commit-message.txt
    ${EDITOR:-nano} /tmp/commit-message.txt
    git commit -F /tmp/commit-message.txt
    rm /tmp/commit-message.txt
elif [[ ! $REPLY =~ ^[Nn]$ ]]; then
    # Use the message as-is
    git commit -m "$message"
else
    echo "Commit cancelled"
fi 