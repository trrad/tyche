#!/bin/bash

# setup-github-project.sh - Works with bash 3.x (macOS compatible)
# Sets up GitHub Project for Tyche Development

set -e

echo "🚀 Setting up Tyche GitHub Project"
echo "=================================="

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is not installed"
  echo "Install from: https://cli.github.com/"
  exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
  echo "❌ Not authenticated with GitHub"
  echo "Run: gh auth login"
  exit 1
fi

echo ""
echo "📋 Creating Phase Milestones..."
echo "--------------------------------"

# Create milestones for each phase (using simple approach for bash 3.x compatibility)
for phase in 0 1 2 3 4; do
  case $phase in
    0) title="Phase 0: Foundation Alignment" ;;
    1) title="Phase 1: Statistical Layer" ;;
    2) title="Phase 2: Domain Layer & Business Analysis" ;;
    3) title="Phase 3: Segmentation & HTE" ;;
    4) title="Phase 4: Application Layer & Polish" ;;
  esac
  
  echo -n "Creating milestone: $title... "
  
  if gh api repos/:owner/:repo/milestones -f title="$title" -f state="open" 2>/dev/null; then
    echo "✅"
  else
    echo "⚠️ (may already exist)"
  fi
done

echo ""
echo "🏷️ Creating Labels..."
echo "---------------------"

# Function to create label
create_label() {
  local name="$1"
  local color="$2"
  local desc="$3"
  
  echo -n "  $name... "
  if gh label create "$name" --description "$desc" --color "$color" 2>/dev/null; then
    echo "✅"
  else
    echo "⚠️ (exists)"
  fi
}

echo "Phase labels:"
create_label "phase-0" "0E8A16" "Foundation alignment and cleanup"
create_label "phase-1" "27AE60" "Statistical layer implementation"
create_label "phase-2" "F39C12" "Domain layer and business analysis"
create_label "phase-3" "E67E22" "Segmentation and HTE discovery"
create_label "phase-4" "E74C3C" "Application layer and polish"

echo ""
echo "Priority labels:"
create_label "P0" "B60205" "Critical - blocks other work"
create_label "P1" "D93F0B" "High - core functionality"
create_label "P2" "FBCA04" "Medium - important features"
create_label "P3" "FEF2C0" "Low - nice to have"

echo ""
echo "Size labels:"
create_label "size: S" "C2E0C6" "Small (1-2 days)"
create_label "size: M" "FEF2C0" "Medium (3-5 days)"
create_label "size: L" "FBCA04" "Large (1-2 weeks)"
create_label "size: XL" "D93F0B" "Extra Large (2+ weeks)"

echo ""
echo "Category labels:"
create_label "foundation" "CCCCCC" "Foundation and architecture"
create_label "inference" "3498DB" "Inference engines and algorithms"
create_label "distributions" "9B59B6" "Distribution implementations"
create_label "routing" "1ABC9C" "Model routing and selection"
create_label "analyzers" "F1C40F" "Business analyzers"
create_label "results" "16A085" "Result objects and structures"
create_label "hte" "E74C3C" "Heterogeneous treatment effects"
create_label "segments" "95A5A6" "Segmentation and discovery"
create_label "errors" "C0392B" "Error handling and recovery"
create_label "data-model" "2980B9" "Data structures and validation"
create_label "workers" "7F8C8D" "Worker pool and parallelization"
create_label "api" "8E44AD" "API and fluent interface"
create_label "visualization" "F39C12" "Visualizations and exports"
create_label "investigation" "34495E" "Research and investigation"
create_label "migration" "D35400" "Code migration tasks"
create_label "roadmap" "2ECC71" "Roadmap implementation task"
create_label "data" "3498DB" "Data structures and handling"
create_label "validation" "E67E22" "Validation logic"
create_label "business" "F39C12" "Business logic and analysis"
create_label "decomposition" "16A085" "Effect decomposition"
create_label "priors" "9B59B6" "Prior elicitation"
create_label "usability" "3498DB" "User experience improvements"
create_label "presets" "27AE60" "Industry presets"
create_label "infrastructure" "7F8C8D" "Infrastructure and tooling"
create_label "research" "34495E" "Research and investigation"
create_label "manual" "95A5A6" "Manual processes"
create_label "causal-trees" "E74C3C" "Causal tree implementation"
create_label "power-analysis" "F39C12" "Power analysis"
create_label "planning" "27AE60" "Experiment planning"
create_label "nlg" "8E44AD" "Natural language generation"
create_label "insights" "3498DB" "Insights generation"
create_label "error-handling" "C0392B" "Error handling"
create_label "resilience" "16A085" "System resilience"
create_label "export" "F39C12" "Export functionality"
create_label "demo" "27AE60" "Demo application"
create_label "showcase" "E74C3C" "Showcase features"

echo ""
echo "🎯 Creating GitHub Project..."
echo "-----------------------------"

# Create the project (repository-level)
repo_owner=$(gh repo view --json owner -q '.owner.login')
repo_name=$(gh repo view --json name -q '.name')
project_title="Tyche Roadmap"

echo "Creating project: '$project_title'"

project_output=$(gh project create --title "$project_title" --owner "$repo_owner" 2>&1)
exit_code=$?

if [ $exit_code -eq 0 ]; then
  echo "✅ Project created successfully"
  
  # Find the project we just created
  project_number=$(gh project list --format json | jq -r ".projects[] | select(.title==\"$project_title\") | .number" 2>/dev/null | head -1)
  
  if [ ! -z "$project_number" ]; then
    echo "📝 Project ID: $project_number"
    
    # Add custom fields to the project
    echo ""
    echo "Adding custom fields to project..."
    
    # Phase field
    gh project field-create "$project_number" \
      --name "Phase" \
      --single-select-option "Phase 0" \
      --single-select-option "Phase 1" \
      --single-select-option "Phase 2" \
      --single-select-option "Phase 3" \
      --single-select-option "Phase 4" \
      2>&1 && echo "  ✅ Phase field added" || echo "  ⚠️ Phase field exists"
    
    # Size field  
    gh project field-create "$project_number" \
      --name "Size" \
      --single-select-option "S" \
      --single-select-option "M" \
      --single-select-option "L" \
      --single-select-option "XL" \
      2>&1 && echo "  ✅ Size field added" || echo "  ⚠️ Size field exists"
    
    # Priority field
    gh project field-create "$project_number" \
      --name "Priority" \
      --single-select-option "P0" \
      --single-select-option "P1" \
      --single-select-option "P2" \
      --single-select-option "P3" \
      2>&1 && echo "  ✅ Priority field added" || echo "  ⚠️ Priority field exists"
    
    owner=$(gh repo view --json owner -q '.owner.login')
    project_url="https://github.com/orgs/${owner}/projects/${project_number}"
    echo ""
    echo "🔗 Project URL: $project_url"
  fi
else
  echo "⚠️ Project creation failed (may already exist)"
  echo "   Use: gh project list"
fi

echo ""
echo "✅ Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "1. Create roadmap issues: node .setup/scripts/migrate-roadmap-issues.js"
echo "2. View issues by phase: gh issue list --label phase-0"
echo "3. Start work: just work <issue-number>"
echo ""
echo "Example workflow:"
echo "  gh issue list --label phase-0,P0  # View critical foundation tasks"
echo "  just work 123                      # Start working on issue #123"