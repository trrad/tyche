# Default - list all commands
default:
  @just --list

# Start development server
dev:
  npm run dev

# Build project for production
build:
  npm run build

# Start work on an issue (by number, name search, or creating new)
# Usage:
#   just work 42               # Work on issue #42
#   just work "mixture"        # Search for issues with "mixture" in title
#   just work fix/parser       # Create new fix issue for parser
work issue-identifier:
  #!/usr/bin/env bash
  mkdir -p .context
  
  # Check if input is a number (existing issue)
  if [[ "{{issue-identifier}}" =~ ^[0-9]+$ ]]; then
    # Working with existing issue by number
    issue_number={{issue-identifier}}
    
    # Fetch issue details
    issue_json=$(gh issue view $issue_number --json number,title,body,labels)
    title=$(echo "$issue_json" | jq -r .title)
  elif [[ "{{issue-identifier}}" == */* ]]; then
    # Creating new issue (has slash like fix/name or feat/name)
    issue_name="{{issue-identifier}}"
    
    # Determine issue type based on prefix
    if [[ "$issue_name" == fix/* ]]; then
      label="bug"
      issue_type="fix"
      clean_name="${issue_name#fix/}"
    else
      label="enhancement"
      issue_type="feat"
      clean_name="${issue_name#feat/}"
      clean_name="${clean_name#feature/}"
    fi
    
    # Create the issue
    echo "Creating new issue: $clean_name"
    issue_url=$(gh issue create \
      --title "$issue_type: $clean_name" \
      --label "$label" \
      --body "Implementation task for: $clean_name" \
      --assignee @me)
    
    # Extract issue number from URL
    issue_number=$(echo "$issue_url" | grep -o '[0-9]*$')
    title="$issue_type: $clean_name"
    
    # Create context file for new issue
    echo "# Current Task: $title" > .context/current-task.md
    echo "" >> .context/current-task.md
    echo "Issue: #$issue_number" >> .context/current-task.md
    echo "Title: $title" >> .context/current-task.md
    echo -e "\n## Description" >> .context/current-task.md
    echo "Implementation task for: $clean_name" >> .context/current-task.md
  else
    # Search for existing issue by title
    echo "Searching for issues matching: {{issue-identifier}}"
    matches=$(gh issue list --search "{{issue-identifier}}" --json number,title --limit 5)
    
    if [ "$(echo "$matches" | jq length)" -eq 0 ]; then
      echo "❌ No issues found matching '{{issue-identifier}}'"
      echo ""
      echo "To create a new issue, use:"
      echo "  just feature '{{issue-identifier}}'"
      echo "  just fix '{{issue-identifier}}'"
      exit 1
    elif [ "$(echo "$matches" | jq length)" -eq 1 ]; then
      # Exactly one match - use it
      issue_number=$(echo "$matches" | jq -r '.[0].number')
      title=$(echo "$matches" | jq -r '.[0].title')
      echo "✓ Found issue #$issue_number: $title"
      
      # Fetch full details
      issue_json=$(gh issue view $issue_number --json number,title,body,labels)
    else
      # Multiple matches - let user choose
      echo "Multiple issues found:"
      echo "$matches" | jq -r '.[] | "  #\(.number): \(.title)"'
      echo ""
      read -p "Enter issue number: " issue_number
      
      # Fetch full details
      issue_json=$(gh issue view $issue_number --json number,title,body,labels)
      title=$(echo "$issue_json" | jq -r .title)
    fi
    
    # Create context file from existing issue
    echo "# Current Task: $title" > .context/current-task.md
    echo "" >> .context/current-task.md
    echo "$issue_json" | jq -r '"Issue: #\(.number)\nTitle: \(.title)\n\n## Description\n\(.body)\n\nLabels: \(.labels[].name)"' \
      >> .context/current-task.md
  fi
  
  # Add acceptance criteria template if not present
  if ! grep -q "## Acceptance Criteria" .context/current-task.md; then
    echo -e "\n## Acceptance Criteria" >> .context/current-task.md
    echo "- [ ] Implementation complete" >> .context/current-task.md
    echo "- [ ] Tests passing" >> .context/current-task.md
    echo "- [ ] Documentation updated" >> .context/current-task.md
  fi
  
  # Extract current phase from MIGRATION_STATUS.md
  echo "# Active Development Phase" > .context/active-phase.md
  echo "" >> .context/active-phase.md
  if [ -f "MIGRATION_STATUS.md" ]; then
    grep -A 20 "Phase.*⚠️\|Phase.*🚧" MIGRATION_STATUS.md >> .context/active-phase.md 2>/dev/null || \
      echo "No active phase found in MIGRATION_STATUS.md" >> .context/active-phase.md
  else
    echo "No MIGRATION_STATUS.md file found" >> .context/active-phase.md
  fi
  
  # Create descriptive branch name
  # Format: feat/42-add-mixture-weights or fix/43-handle-null-data
  safe_title=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
  branch_name="${safe_title%:*}/${issue_number}-${safe_title#*:}"
  branch_name=$(echo "$branch_name" | sed 's/--*/-/g' | cut -c1-60)
  
  git checkout -b "$branch_name"
  
  echo "✅ Ready to work on: $title"
  echo "📋 Issue: #${issue_number}"
  echo "🌿 Branch: $branch_name"
  echo "📄 Context: .context/current-task.md"
  echo ""
  echo "💡 In your editor:"
  echo "   Cursor: @.context/current-task.md"
  echo "   VS Code: Open .context/current-task.md"
  echo "   Claude: Include context file in prompt"

# Quick shortcuts for common tasks  
fix name:
  @just work "fix/{{name}}"

feature name:
  @just work "feat/{{name}}"

# Show current work context
context:
  @echo "📋 Current Task:"
  @echo "==============="
  @cat .context/current-task.md 2>/dev/null || echo "No active task. Use 'just work <issue>' to start."
  @echo ""
  @echo "📍 Current Phase:"
  @echo "================"
  @cat .context/active-phase.md 2>/dev/null || echo "No phase information available."

# Update context (if issue changed)
refresh-context:
  #!/usr/bin/env bash
  if [ -f ".context/current-task.md" ]; then
    issue_number=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*')
    if [ ! -z "$issue_number" ]; then
      just work $issue_number
      echo "✅ Context refreshed from issue #$issue_number"
    else
      echo "❌ No issue number found in current context"
    fi
  else
    echo "❌ No current task. Use 'just work <issue>' to start."
  fi

# Close an issue (auto-detect from context or specify number)
close-issue *issue_number="":
  #!/usr/bin/env bash
  issue_num="{{issue_number}}"
  
  # Auto-detect issue number if not provided
  if [ -z "$issue_num" ] && [ -f ".context/current-task.md" ]; then
    issue_num=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*' | head -1)
  fi
  
  if [ -z "$issue_num" ]; then
    echo "❌ No issue number provided and none found in context"
    echo "💡 Usage: just issue close [number]"
    exit 1
  fi
  
  echo "🎯 Closing issue #$issue_num..."
  
  # Show issue details first
  gh issue view $issue_num
  echo ""
  
  # Ask for confirmation
  read -p "🤔 Close this issue? [y/N] " -n 1 -r
  echo ""
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Issue closure cancelled"
    exit 1
  fi
  
  # Close the issue
  if gh issue close $issue_num --comment "✅ Requirement fully satisfied and implemented"; then
    echo "✅ Issue #$issue_num closed successfully"
    
    # Clean up context files since we're done
    if [ -f ".context/current-task.md" ]; then
      context_issue=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*' | head -1)
      if [ "$context_issue" = "$issue_num" ]; then
        rm -f .context/current-task.md .context/active-phase.md
        echo "🧹 Context files cleaned up"
      fi
    fi
    
    echo "🎉 Issue complete! Ready for next task."
  else
    echo "❌ Failed to close issue"
    exit 1
  fi

# Update an issue body (auto-detect from context or specify number)  
update-issue *issue_number="":
  #!/usr/bin/env bash
  issue_num="{{issue_number}}"
  
  # Auto-detect issue number if not provided
  if [ -z "$issue_num" ] && [ -f ".context/current-task.md" ]; then
    issue_num=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*' | head -1)
  fi
  
  if [ -z "$issue_num" ]; then
    echo "❌ No issue number provided and none found in context"
    echo "💡 Usage: just issue update [number]"
    exit 1
  fi
  
  echo "📝 Updating issue #$issue_num..."
  
  # Determine preferred editor (cursor -> nano -> EDITOR -> vi)
  editor=""
  if command -v cursor >/dev/null 2>&1; then
    editor="cursor --wait"
  elif command -v nano >/dev/null 2>&1; then
    editor="nano"
  elif [ ! -z "$EDITOR" ]; then
    editor="$EDITOR"
  else
    editor="vi"
  fi
  
  # Edit the issue using GitHub CLI with preferred editor
  if EDITOR="$editor" gh issue edit $issue_num; then
    echo "✅ Issue #$issue_num updated successfully"
    echo "💡 Context preserved - continue working with: just work $issue_num"
  else
    echo "❌ Failed to update issue"
    exit 1
  fi

# Run all checks
check:
  npm run check

# Create PR for current branch
pr:
  #!/usr/bin/env bash
  branch=$(git branch --show-current)
  if [ "$branch" = "main" ]; then
    echo "❌ Cannot create PR from main branch"
    exit 1
  fi
  git push -u origin "$branch"
  gh pr create --web || echo "Open PR manually on GitHub"

# Merge current branch's PR and clean up
merge:
  #!/usr/bin/env bash
  branch=$(git branch --show-current)
  if [ "$branch" = "main" ]; then
    echo "❌ Already on main branch"
    exit 1
  fi
  
  echo "🔍 Checking for open PR..."
  pr_number=$(gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null)
  
  if [ -z "$pr_number" ] || [ "$pr_number" = "null" ]; then
    echo "❌ No open PR found for branch: $branch"
    echo "💡 Run 'just pr' first to create a PR"
    exit 1
  fi
  
  echo "✅ Found PR #$pr_number for branch: $branch"
  echo ""
  
  # Show PR details
  gh pr view $pr_number
  echo ""
  
  # Ask for confirmation
  read -p "🤔 Merge this PR? [y/N] " -n 1 -r
  echo ""
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Merge cancelled"
    exit 1
  fi
  
  echo "🚀 Merging PR #$pr_number..."
  
  # Merge the PR (squash by default, but allow override)
  if gh pr merge $pr_number --squash --delete-branch; then
    echo "✅ PR merged and remote branch deleted"
    
    # Switch to main and pull changes
    echo "🔄 Switching to main and pulling changes..."
    git checkout main
    git pull origin main
    
    # Delete local branch (if it still exists - gh might have already done this)
    if git show-ref --verify --quiet refs/heads/"$branch"; then
      echo "🧹 Cleaning up local branch..."
      git branch -d "$branch" || git branch -D "$branch"
    else
      echo "✅ Local branch already cleaned up by GitHub CLI"
    fi
    
    # Clean up remote references
    git remote prune origin
    
    # Link to associated issue but don't close it
    if [ -f ".context/current-task.md" ]; then
      issue_number=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*' | head -1)
      if [ ! -z "$issue_number" ]; then
        echo ""
        echo "🔗 Linking to issue #$issue_number..."
        gh issue comment $issue_number --body "✅ Completed PR #$pr_number - implementation merged to main"
        echo "💡 Issue #$issue_number remains open for future iterations/discussion"
        echo "   Close manually when the full requirement is satisfied: gh issue close $issue_number"
      fi
      
      # Clean up context files
      rm -f .context/current-task.md .context/active-phase.md
      echo "🧹 Context files cleaned up"
    fi
    
    echo ""
    echo "🎉 Complete! You're back on main with all changes merged."
    echo "📝 Ready for your next task: just work <issue> or just feature <name>"
    
  else
    echo "❌ Failed to merge PR"
    exit 1
  fi

# Show current status
status:
  @echo "📍 Branch: $(git branch --show-current)"
  @echo "📝 Status:"
  @git status -s
  @echo "\n📊 Recent commits:"
  @git log --oneline -5

# Weekly report
report:
  @echo "# Weekly Report - $(date +%Y-%m-%d)"
  @echo "\n## Completed"
  @git log --since="1 week ago" --pretty=format:"- %s" --author="$(git config user.email)"
  @echo "\n\n## Files changed"
  @git diff --stat "@{1 week ago}"

# Setup commands
setup:
  npm install
  npx husky init

# Show available commands
help:
  @bash .setup/scripts/quick-reference.sh

# Clean everything
clean:
  rm -rf node_modules dist coverage
  npm install

# Advanced: Run tests in watch mode
test-watch:
  npm test -- --watch

# Advanced: Run only tests related to current changes
test-related:
  npm test -- --related --passWithNoTests 