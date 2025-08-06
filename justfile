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
  
  # Initialize variables
  issue_json=""
  issue_number=""
  title=""
  
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
    
    # Fetch the created issue for consistency
    issue_json=$(gh issue view $issue_number --json number,title,body,labels)
    
  else
    # Search for existing issue by title
    echo "Searching for issues matching: {{issue-identifier}}"
    matches=$(gh issue list --search "{{issue-identifier}}" --json number,title --limit 5)
    
    if [ "$(echo "$matches" | jq length)" -eq 0 ]; then
      echo -e "\033[31m❌ No issues found matching '{{issue-identifier}}'\033[0m"
      echo ""
      echo "To create a new issue, use:"
      echo "  just feature '{{issue-identifier}}'"
      echo "  just fix '{{issue-identifier}}'"
      exit 1
    elif [ "$(echo "$matches" | jq length)" -eq 1 ]; then
      # Exactly one match - use it
      issue_number=$(echo "$matches" | jq -r '.[0].number')
      title=$(echo "$matches" | jq -r '.[0].title')
      echo -e "\033[32m✓ Found issue #$issue_number: $title\033[0m"
      
      # Fetch full details
      issue_json=$(gh issue view $issue_number --json number,title,body,labels)
    else
      # Multiple matches - let user choose
      echo "Multiple matches found:"
      echo "$matches" | jq -r '.[] | "  #\(.number): \(.title)"'
      echo ""
      read -p "Enter issue number: " issue_number
      
      # Fetch full details
      issue_json=$(gh issue view $issue_number --json number,title,body,labels)
      title=$(echo "$issue_json" | jq -r .title)
    fi
  fi
  
  # Now create the context file consistently for all paths
  echo "# Current Task: $title" > .context/current-task.md
  echo "" >> .context/current-task.md
  echo "Issue: #$issue_number" >> .context/current-task.md
  echo "Title: $title" >> .context/current-task.md
  echo "" >> .context/current-task.md
  echo "## Description" >> .context/current-task.md
  echo "$issue_json" | jq -r '.body' >> .context/current-task.md
  echo "" >> .context/current-task.md
  echo "## Labels" >> .context/current-task.md
  echo "$issue_json" | jq -r '.labels[].name' | while read label; do
    echo "- $label" >> .context/current-task.md
  done
  
  # Add acceptance criteria template if not present
  if ! grep -q "## Acceptance Criteria" .context/current-task.md; then
    echo -e "\n## Acceptance Criteria" >> .context/current-task.md
    echo "- [ ] Implementation complete" >> .context/current-task.md
    echo "- [ ] Tests passing" >> .context/current-task.md
    echo "- [ ] Documentation updated" >> .context/current-task.md
  fi
  
  # Detect if this is a roadmap issue (has phase label) and handle accordingly
  phase_label=$(echo "$issue_json" | jq -r '.labels[]?.name | select(. | startswith("phase-")) // empty' | head -1)
  
  if [ ! -z "$phase_label" ]; then
    # ROADMAP ISSUE - use phase-based branch naming and context
    phase_num=${phase_label#phase-}
    
    # Create branch name: phase0/123-core-error-handling
    safe_title=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
    branch_name="phase${phase_num}/${issue_number}-${safe_title}"
    branch_name=$(echo "$branch_name" | cut -c1-60)
    
    # Load phase-specific context from docs
    echo "# Phase ${phase_num} Context" > .context/active-phase.md
    echo "" >> .context/active-phase.md
    
    if [ -f "docs/phase-${phase_num}-context.md" ]; then
      # Append the actual phase context document
      cat "docs/phase-${phase_num}-context.md" >> .context/active-phase.md
      echo -e "\033[32m✓ Loaded Phase ${phase_num} context\033[0m"
    else
      # Provide guidance on what should be in phase context
      echo "## ⚠️ No detailed phase context found" >> .context/active-phase.md
      echo "" >> .context/active-phase.md
      echo "Create \`docs/phase-${phase_num}-context.md\` with:" >> .context/active-phase.md
      echo "- Architectural goals and principles for this phase" >> .context/active-phase.md
      echo "- Key patterns and conventions to follow" >> .context/active-phase.md
      echo "- Common pitfalls and anti-patterns to avoid" >> .context/active-phase.md
      echo "- Testing strategies specific to this phase" >> .context/active-phase.md
      echo "- Dependencies and integration points" >> .context/active-phase.md
    fi
  else
    # NON-ROADMAP ISSUE - use existing fix/feat branch naming
    # No phase context needed - issue context is sufficient
    safe_title=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
    
    # Try to detect fix/feat from title, default to feat
    if [[ "$title" == fix:* ]] || [[ "$title" == Fix:* ]] || [[ "$title" == FIX:* ]]; then
      branch_name="fix/${issue_number}-${safe_title#*:}"
    elif [[ "$title" == feat:* ]] || [[ "$title" == Feat:* ]] || [[ "$title" == FEAT:* ]]; then
      branch_name="feat/${issue_number}-${safe_title#*:}"
    else
      # Default to feat for regular issues
      branch_name="feat/${issue_number}-${safe_title}"
    fi
    branch_name=$(echo "$branch_name" | sed 's/--*/-/g' | cut -c1-60)
  fi
  
  git checkout -b "$branch_name"
  
  # Display work context based on issue type
  echo -e "\033[32m✅ Ready to work on:\033[0m $title"
  echo -e "\033[33mIssue:\033[0m #${issue_number}"
  echo -e "\033[33mBranch:\033[0m $branch_name"
  echo -e "\033[33mContext:\033[0m .context/current-task.md"
  
  if [ ! -z "$phase_label" ]; then
    echo -e "\033[33mPhase:\033[0m Phase ${phase_num} (see .context/active-phase.md)"
  fi
  
  echo ""
  echo -e "\033[36mIn your editor:\033[0m"
  echo "   Cursor: @.context/current-task.md"
  if [ ! -z "$phase_label" ]; then
    echo "           @.context/active-phase.md"
  fi
  echo "   VS Code: Open .context/current-task.md"
  echo "   Claude: Include context file(s) in prompt"

# Quick shortcuts for common tasks  
fix name:
  @just work "fix/{{name}}"

feature name:
  @just work "feat/{{name}}"

# Show current work context
context:
  #!/usr/bin/env bash
  echo -e "\033[1m\033[36mCurrent Task:\033[0m"
  echo "==============="
  cat .context/current-task.md 2>/dev/null || echo -e "\033[33mNo active task. Use 'just work <issue>' to start.\033[0m"
  
  # Check if phase context exists (only for roadmap issues)
  if [ -f ".context/active-phase.md" ]; then
    echo ""
    echo -e "\033[1m\033[36mPhase Context:\033[0m"
    echo "================"
    head -20 .context/active-phase.md 2>/dev/null
    echo -e "\033[90m... (see .context/active-phase.md for full context)\033[0m"
  fi

# Update context (if issue changed)
refresh-context:
  #!/usr/bin/env bash
  if [ -f ".context/current-task.md" ]; then
    issue_number=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*')
    if [ ! -z "$issue_number" ]; then
      just work $issue_number
      echo -e "\033[32m✅ Context refreshed from issue #$issue_number\033[0m"
    else
      echo -e "\033[31m❌ No issue number found in current context\033[0m"
    fi
  else
    echo -e "\033[31m❌ No current task. Use 'just work <issue>' to start.\033[0m"
  fi

# View roadmap issues by phase
phase num:
  @echo "📋 Phase {{num}} issues:"
  @gh issue list --label "phase-{{num}}" --state open

# View critical path (P0 issues)  
critical:
  @echo "🚨 Critical issues blocking other work:"
  @gh issue list --label "P0" --state open

# Quick roadmap status
roadmap-status:
  @echo "📊 Roadmap Status"
  @echo "================"
  @for phase in 0 1 2 3 4; do \
    open=$$(gh issue list --label "phase-$$phase" --state open --json number -q '. | length'); \
    closed=$$(gh issue list --label "phase-$$phase" --state closed --json number -q '. | length'); \
    total=$$((open + closed)); \
    if [ $$total -gt 0 ]; then \
      percent=$$((closed * 100 / total)); \
      echo "Phase $$phase: $$closed/$$total ($$percent%)"; \
    fi \
  done

# Generate commit message with Claude
commit:
  bash ./.setup/scripts/generate-commit.sh

# Create PR with Claude-generated body from commits
pr:
  bash ./.setup/scripts/generate-pr.sh



# Close an issue (auto-detect from context or specify number)
close *issue_number="":
  #!/usr/bin/env bash
  issue_num="{{issue_number}}"
  
  # Auto-detect issue number if not provided
  if [ -z "$issue_num" ] && [ -f ".context/current-task.md" ]; then
    issue_num=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*' | head -1)
  fi
  
  if [ -z "$issue_num" ]; then
    echo -e "\033[31m❌ No issue number provided and none found in context\033[0m"
    echo -e "\033[33mUsage: just close [number]\033[0m"
    exit 1
  fi
  
  echo -e "\033[36mClosing issue #$issue_num...\033[0m"
  
  # Show issue details first
  gh issue view $issue_num
  echo ""
  
  # Ask for confirmation
  read -p "Close this issue? [y/N] " -n 1 -r
  echo ""
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\033[31m❌ Issue closure cancelled\033[0m"
    exit 1
  fi
  
  # Close the issue
  if gh issue close $issue_num --comment "✅ Requirement fully satisfied and implemented"; then
    echo -e "\033[32m✅ Issue #$issue_num closed successfully\033[0m"
    
    # Clean up context files since we're done
    if [ -f ".context/current-task.md" ]; then
      context_issue=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*' | head -1)
      if [ "$context_issue" = "$issue_num" ]; then
        rm -f .context/current-task.md .context/active-phase.md
        echo -e "\033[33mContext files cleaned up\033[0m"
      fi
    fi
    
    echo -e "\033[32mIssue complete! Ready for next task.\033[0m"
  else
    echo -e "\033[31m❌ Failed to close issue\033[0m"
    exit 1
  fi

# Update an issue body (auto-detect from context or specify number)  
update *issue_number="":
  #!/usr/bin/env bash
  issue_num="{{issue_number}}"
  
  # Auto-detect issue number if not provided
  if [ -z "$issue_num" ] && [ -f ".context/current-task.md" ]; then
    issue_num=$(grep "Issue: #" .context/current-task.md | grep -o '[0-9]*' | head -1)
  fi
  
  if [ -z "$issue_num" ]; then
    echo -e "\033[31m❌ No issue number provided and none found in context\033[0m"
    echo -e "\033[33mUsage: just update [number]\033[0m"
    exit 1
  fi
  
  echo -e "\033[36mUpdating issue #$issue_num...\033[0m"
  
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
    echo -e "\033[32m✅ Issue #$issue_num updated successfully\033[0m"
    echo -e "\033[33mContext preserved - continue working with: just work $issue_num\033[0m"
  else
    echo -e "\033[31m❌ Failed to update issue\033[0m"
    exit 1
  fi

# Merge current branch's PR and clean up
merge:
  #!/usr/bin/env bash
  branch=$(git branch --show-current)
  if [ "$branch" = "main" ]; then
    echo "❌ Already on main branch"
    exit 1
  fi
  
  echo -e "\033[36mChecking for open PR...\033[0m"
  pr_number=$(gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null)
  
  if [ -z "$pr_number" ] || [ "$pr_number" = "null" ]; then
    echo -e "\033[31m❌ No open PR found for branch: $branch\033[0m"
    echo -e "\033[33mRun 'just pr' first to create a PR\033[0m"
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
  
  # Merge the PR (squash by default)
  if gh pr merge $pr_number --squash --delete-branch; then
    echo -e "\033[32m✅ PR merged and remote branch deleted\033[0m"
    
    # Switch to main and pull changes
    echo -e "\033[36m🔄 Switching to main and pulling changes...\033[0m"
    git checkout main
    git pull origin main
    
    # Delete local branch
    if git show-ref --verify --quiet refs/heads/"$branch"; then
      echo -e "\033[33mCleaning up local branch...\033[0m"
      git branch -d "$branch" || git branch -D "$branch"
    fi
    
    # Clean up remote references
    git remote prune origin
    
    echo -e "\033[32mPR merged successfully!\033[0m"
  else
    echo "❌ Failed to merge PR"
    exit 1
  fi

# Show current status
status:
  #!/usr/bin/env bash
  echo -e "\033[33mBranch:\033[0m $(git branch --show-current)"
  echo -e "\033[1m\033[36mStatus:\033[0m"
  git status -s
  echo -e "\n\033[1m\033[36mRecent commits:\033[0m"
  git log --oneline -5

# Weekly report
report:
  @echo "# Weekly Report - $(date +%Y-%m-%d)"
  @echo "\n## Completed"
  @git log --since="1 week ago" --pretty=format:"- %s" --author="$(git config user.email)"
  @echo "\n\n## Files changed"
  @git diff --stat "@{1 week ago}"

# Run all checks
check:
  npm run check

# Setup commands
setup:
  npm install
  npx husky init

# Setup GitHub project structure (labels, milestones, project)
setup-github:
  bash ./.setup/scripts/setup-github-project.sh

# Bootstrap the entire roadmap setup
bootstrap-roadmap:
  @echo "🚀 Setting up Tyche roadmap..."
  bash ./.setup/scripts/setup-github-project.sh
  @echo ""
  @echo "📝 Creating roadmap issues..."
  node ./.setup/scripts/migrate-sprint-issues.cjs

# Help - show available commands
help:
  @just --list