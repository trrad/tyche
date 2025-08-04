#!/usr/bin/env bash

# GitHub Project Setup Script
# Automates labels, milestones, and project creation

set -e

PROJECT_NAME=$(gh repo view --json name -q '.name' | tr '[:lower:]' '[:upper:]')
echo "🚀 Setting up GitHub project structure for $PROJECT_NAME"
echo "==============================================="

# Check if gh is authenticated
if ! gh auth status >/dev/null 2>&1; then
  echo "❌ GitHub CLI not authenticated. Run: gh auth login"
  exit 1
fi

echo "✅ GitHub CLI authenticated"

# Check if we have project scopes
echo "🔑 Checking project permissions..."
if ! gh project list >/dev/null 2>&1; then
  echo "❌ Missing project scopes. Refreshing authentication..."
  echo "This will open your browser to grant additional permissions."
  read -p "Press Enter to continue, or Ctrl+C to cancel..."
  
  if gh auth refresh -s project,read:project; then
    echo "✅ Project permissions granted"
  else
    echo "❌ Failed to refresh authentication"
    echo "Please run manually: gh auth refresh -s project,read:project"
    exit 1
  fi
else
  echo "✅ Project permissions verified"
fi

# Create standardized labels
echo ""
echo "📋 Creating labels..."

# Sprint labels
for i in {0..6}; do
  gh label create "sprint-$i" --description "Sprint $i" --color "0052cc" || echo "  Label sprint-$i already exists"
done

# Priority labels
gh label create "P0: Critical" --description "Critical priority - blocks other work" --color "d73a4a" || echo "  Label P0: Critical already exists"
gh label create "P1: High" --description "High priority" --color "ff6b35" || echo "  Label P1: High already exists"
gh label create "P2: Medium" --description "Medium priority" --color "ffda18" || echo "  Label P2: Medium already exists"
gh label create "P3: Low" --description "Low priority" --color "28a745" || echo "  Label P3: Low already exists"

# Size labels
gh label create "S (Small)" --description "Small task - few hours" --color "c2e0c6" || echo "  Label S (Small) already exists"
gh label create "M (Medium)" --description "Medium task - 1-2 days" --color "ffeaa7" || echo "  Label M (Medium) already exists"
gh label create "L (Large)" --description "Large task - 3-5 days" --color "fab1a0" || echo "  Label L (Large) already exists"
gh label create "XL (Extra Large)" --description "Extra large task - 1+ weeks" --color "e17055" || echo "  Label XL (Extra Large) already exists"

# Type labels
gh label create "architecture" --description "System architecture and design" --color "0e8a16" || echo "  Label architecture already exists"
gh label create "inference" --description "Statistical inference engines" --color "1d76db" || echo "  Label inference already exists"
gh label create "engine" --description "Computation engines" --color "1d76db" || echo "  Label engine already exists"
gh label create "migration" --description "Code migration and refactoring" --color "f9d0c4" || echo "  Label migration already exists"
gh label create "infrastructure" --description "Infrastructure and tooling" --color "5319e7" || echo "  Label infrastructure already exists"
gh label create "workers" --description "Web worker implementation" --color "5319e7" || echo "  Label workers already exists"
gh label create "routing" --description "Model routing and selection" --color "1d76db" || echo "  Label routing already exists"
gh label create "analyzer" --description "Business analyzers" --color "0e8a16" || echo "  Label analyzer already exists"
gh label create "refactor" --description "Code refactoring" --color "f9d0c4" || echo "  Label refactor already exists"
gh label create "model-selection" --description "Model selection and comparison" --color "1d76db" || echo "  Label model-selection already exists"
gh label create "validation" --description "Validation and testing" --color "28a745" || echo "  Label validation already exists"

# Sprint-specific domain labels
gh label create "data-layer" --description "Data structures and parsing" --color "0052cc" || echo "  Label data-layer already exists"
gh label create "foundation" --description "Core foundational components" --color "0052cc" || echo "  Label foundation already exists"
gh label create "hte-prep" --description "HTE preparation" --color "0052cc" || echo "  Label hte-prep already exists"
gh label create "errors" --description "Error handling" --color "d73a4a" || echo "  Label errors already exists"
gh label create "parsing" --description "Data parsing" --color "0052cc" || echo "  Label parsing already exists"
gh label create "math" --description "Mathematical implementations" --color "1d76db" || echo "  Label math already exists"
gh label create "investigation" --description "Research and investigation" --color "fbca04" || echo "  Label investigation already exists"
gh label create "enhancement" --description "Enhancement and improvement" --color "a2eeef" || echo "  Label enhancement already exists"
gh label create "analysis" --description "Analysis components" --color "1d76db" || echo "  Label analysis already exists"
gh label create "results" --description "Result objects and formatting" --color "1d76db" || echo "  Label results already exists"
gh label create "compound" --description "Compound models" --color "1d76db" || echo "  Label compound already exists"
gh label create "models" --description "Statistical models" --color "1d76db" || echo "  Label models already exists"
gh label create "business" --description "Business logic" --color "0e8a16" || echo "  Label business already exists"
gh label create "api" --description "API design" --color "0e8a16" || echo "  Label api already exists"
gh label create "design" --description "Design and UX" --color "0e8a16" || echo "  Label design already exists"
gh label create "power-analysis" --description "Statistical power analysis" --color "1d76db" || echo "  Label power-analysis already exists"
gh label create "simulation" --description "Simulation and modeling" --color "1d76db" || echo "  Label simulation already exists"
gh label create "presets" --description "Industry presets" --color "0e8a16" || echo "  Label presets already exists"
gh label create "usability" --description "Usability improvements" --color "0e8a16" || echo "  Label usability already exists"
gh label create "priors" --description "Prior distributions" --color "1d76db" || echo "  Label priors already exists"
gh label create "hte" --description "Heterogeneous treatment effects" --color "1d76db" || echo "  Label hte already exists"
gh label create "segments" --description "User segmentation" --color "1d76db" || echo "  Label segments already exists"
gh label create "manual" --description "Manual processes" --color "fbca04" || echo "  Label manual already exists"
gh label create "causal-tree" --description "Causal tree methods" --color "1d76db" || echo "  Label causal-tree already exists"
gh label create "discovery" --description "Discovery and exploration" --color "fbca04" || echo "  Label discovery already exists"
gh label create "bootstrap" --description "Bootstrap methods" --color "1d76db" || echo "  Label bootstrap already exists"
gh label create "integration" --description "System integration" --color "5319e7" || echo "  Label integration already exists"
gh label create "export" --description "Export functionality" --color "0e8a16" || echo "  Label export already exists"
gh label create "visualization" --description "Data visualization" --color "0e8a16" || echo "  Label visualization already exists"
gh label create "ux" --description "User experience" --color "0e8a16" || echo "  Label ux already exists"
gh label create "performance" --description "Performance optimization" --color "5319e7" || echo "  Label performance already exists"
gh label create "insights" --description "Insights and analytics" --color "1d76db" || echo "  Label insights already exists"
gh label create "nlg" --description "Natural language generation" --color "0e8a16" || echo "  Label nlg already exists"
gh label create "demo" --description "Demo and showcase" --color "0e8a16" || echo "  Label demo already exists"
gh label create "showcase" --description "Showcase features" --color "0e8a16" || echo "  Label showcase already exists"
gh label create "error-handling" --description "Error handling and recovery" --color "d73a4a" || echo "  Label error-handling already exists"

echo "✅ Labels created"

# Create milestones for each sprint
echo ""
echo "🎯 Creating milestones..."

# Helper function to create milestone
create_milestone() {
  local title="$1"
  local description="$2"
  
  gh api repos/:owner/:repo/milestones \
    --method POST \
    --field title="$title" \
    --field description="$description" \
    >/dev/null 2>&1 && echo "  ✅ Created: $title" || echo "  📋 Already exists: $title"
}

# Create sprint milestones with actual titles and descriptions
create_milestone "Sprint 0: Data Foundation" "Core infrastructure, interfaces, and mathematical foundations"
create_milestone "Sprint 1: Math & Basic Analysis" "Pure distributions and result object patterns"
create_milestone "Sprint 2: Routing & Inference Engines" "Capability-based routing and inference engines"  
create_milestone "Sprint 3: Business Analysis Layer" "Domain-specific analyzers and compound models"
create_milestone "Sprint 4: Power Analysis & Industry Presets" "Statistical power analysis and simulation"
create_milestone "Sprint 5: HTE & Segmentation" "Heterogeneous treatment effects and segmentation"
create_milestone "Sprint 6: Polish & Integration" "Final integration, polish, and demo application"

echo "✅ Milestones created"

# Create GitHub Project (NEW PROJECTS - full CLI support!)
echo ""
echo "🏗️ Creating GitHub Project..."

# Create the project (repository-level, not personal)
repo_owner=$(gh repo view --json owner -q '.owner.login')
repo_name=$(gh repo view --json name -q '.name')
project_title="$repo_name Development Sprint"

echo "🔧 Creating project: '$project_title'"

# Capture both stdout and stderr
project_output=$(gh project create --title "$project_title" --owner "$repo_owner" 2>&1)
exit_code=$?

# Debug output (can be commented out)
# echo "📤 Command output: $project_output"
# echo "📊 Exit code: $exit_code"

if [ $exit_code -eq 0 ]; then
  echo "✅ Project creation command succeeded"
  
  # Get the most recent project (likely the one we just created)
  echo "🔍 Finding created project..."
  
  recent_projects=$(gh project list --format json | jq -r ".projects[] | select(.title==\"$project_title\") | .number" 2>/dev/null | head -1)
  
  if [ ! -z "$recent_projects" ]; then
    project_number="$recent_projects"
    echo "📝 Found project ID: $project_number"
    
         # Construct project URL (for organization projects)
     owner=$(gh repo view --json owner -q '.owner.login')
     project_url="https://github.com/orgs/${owner}/projects/${project_number}"
    echo "🔗 Project URL: $project_url"
    
    # Add Sprint field
    echo "🏷️ Adding Sprint field to project..."
    
    gh project field-create "$project_number" \
      --name "Sprint" \
      --single-select-option "Sprint 0" \
      --single-select-option "Sprint 1" \
      --single-select-option "Sprint 2" \
      --single-select-option "Sprint 3" \
      --single-select-option "Sprint 4" \
      --single-select-option "Sprint 5" \
      --single-select-option "Sprint 6" \
      2>&1 && echo "✅ Sprint field added" || echo "⚠️ Sprint field creation failed (may already exist)"
    
    echo ""
    echo "✅ Project setup complete!"
    echo "🔗 View at: $project_url"
  else
    echo "⚠️ Could not find created project. Checking all projects:"
    gh project list || echo "Failed to list projects"
  fi
else
  echo "❌ Project creation failed"
  echo "Error details: $project_output"
  
  # Check if it's because project already exists
  if [[ "$project_output" == *"already exists"* ]]; then
    echo "💡 Project may already exist. Try listing: gh project list"
  fi
  
  echo "📋 You can create manually at: https://github.com/$(gh repo view --json owner,name -q '.owner.login + \"/\" + .name')/projects"
fi

# Show next steps
echo ""
echo "🚀 NEXT STEPS"
echo "============="
echo ""
echo "Project structure ready! You can now:"
echo ""
echo "1. Create issues with standardized labels:"
echo "   gh issue create --label \"sprint-0,P1: High\" --title \"Task name\""
echo ""
echo "2. Manage projects via CLI:"
echo "   gh project list                    # View projects"
echo "   gh project item-list <project-id>  # View items"
echo "   gh issue list --label sprint-0     # View sprint issues"
echo ""
echo "3. Use existing workflow:"
echo "   just work \"issue name\"            # Start work on issue"
echo ""
echo "✅ Setup complete! Ready for development." 