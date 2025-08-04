#!/usr/bin/env node

/**
 * Sprint Issues Migration
 * 
 * Parses docs/sprints/sprint_*.md files and creates/updates GitHub issues
 * with proper labels, milestones, and formatting.
 * 
 * Modes:
 * --create: Create new issues (default)
 * --update: Update existing issues with new content
 * --sync-numbers: Update sprint docs with GitHub issue numbers
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const SPRINT_COUNT = 7; // sprints 0-6

// Sprint titles for milestone mapping
const SPRINT_TITLES = {
  0: "Sprint 0: Data Foundation",
  1: "Sprint 1: Math & Basic Analysis", 
  2: "Sprint 2: Routing & Inference Engines",
  3: "Sprint 3: Business Analysis Layer",
  4: "Sprint 4: Power Analysis & Industry Presets",
  5: "Sprint 5: HTE & Segmentation", 
  6: "Sprint 6: Polish & Integration"
};

// Utility function to run commands
function run(cmd) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] ${cmd}`);
    return { success: true, output: 'dry-run' };
  }
  
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return { success: true, output: output.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Fetch existing GitHub issues
function fetchExistingIssues() {
  console.log('📋 Fetching existing GitHub issues...');
  
  const cmd = `gh issue list --limit 1000 --state all --json number,title,labels`;
  const result = run(cmd);
  
  if (!result.success) {
    throw new Error(`Failed to fetch issues: ${result.error}`);
  }
  
  if (DRY_RUN) {
    return {}; // Return empty mapping for dry run
  }
  
  // Build mapping: title → GitHub issue number
  const mapping = {};
  const issues = JSON.parse(result.output);
  
  let sprintIssueCount = 0;
  for (const issue of issues) {
    // Match sprint issues by looking for sprint-N labels
    const hasSprintLabel = issue.labels.some(label => label.name.startsWith('sprint-'));
    if (hasSprintLabel) {
      mapping[issue.title] = issue.number;
      sprintIssueCount++;
    }
  }
  
  console.log(`   Found ${sprintIssueCount} existing sprint issues`);
  return mapping;
}

// Parse a single sprint document
function parseSprintDoc(sprintNumber) {
  // Get path relative to project root, not script location
  const filePath = path.join(__dirname, '../../docs/sprints', `sprint_${sprintNumber}.md`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ Sprint file not found: ${filePath}`);
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract sprint goal for context
  const goalMatch = content.match(/## Sprint Goal\n(.+?)\n\n/s);
  const sprintGoal = goalMatch ? goalMatch[1].trim() : '';
  
  console.log(`📖 Parsing ${filePath}...`);
  if (sprintGoal) {
    console.log(`   Goal: ${sprintGoal.substring(0, 80)}...`);
  }
  
  return parseIssuesFromContent(content, sprintNumber, sprintGoal);
}

// Parse issues from sprint content
function parseIssuesFromContent(content, sprintNumber, sprintGoal) {
  const issues = [];
  
  // Split content by issue headers
  const issueBlocks = content.split(/(?=## Issue [A-Z]?\d+:)/).slice(1);
  
  for (const block of issueBlocks) {
    const issue = parseIssueBlock(block, sprintNumber);
    if (issue) {
      issues.push(issue);
    }
  }
  
  console.log(`   Found ${issues.length} issues`);
  return issues;
}

// Parse individual issue block
function parseIssueBlock(block, sprintNumber) {
  // Extract issue header
  const headerMatch = block.match(/## Issue ([A-Z]?\d+): (.+?)\n/);
  if (!headerMatch) return null;
  
  const [, issueNumber, title] = headerMatch;
  
  // Extract metadata
  const priority = extractMetadata(block, 'Priority');
  const labels = extractMetadata(block, 'Labels');
  const size = extractMetadata(block, 'Size');
  const blocks = extractMetadata(block, 'Blocks');
  const dependsOn = extractMetadata(block, 'Depends on');
  
  // Extract sections
  const description = extractSection(block, 'Description');
  const context = extractSection(block, 'Context');
  const acceptanceCriteria = extractSection(block, 'Acceptance Criteria');
  const implementationRequirements = extractSection(block, 'Implementation Requirements');
  const technicalImpl = extractSection(block, 'Technical Implementation');
  
  // Build issue body
  const body = buildIssueBody({
    description,
    context,
    acceptanceCriteria,
    implementationRequirements,
    technicalImpl,
    blocks,
    dependsOn,
    sprintNumber
  });
  
  // Parse labels
  const parsedLabels = parseLabels(labels, sprintNumber, priority, size);
  
  return {
    number: issueNumber,
    title: title.trim(),
    body,
    labels: parsedLabels,
    milestone: SPRINT_TITLES[sprintNumber],
    sprintNumber
  };
}

// Extract metadata field (Priority, Labels, etc.)
function extractMetadata(block, field) {
  const regex = new RegExp(`\\*\\*${field}\\*\\*: (.+?)\\n`, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : '';
}

// Extract section content (Description, Acceptance Criteria, etc.)
function extractSection(block, sectionName) {
  const regex = new RegExp(`### ${sectionName}\\n(.+?)(?=\\n### |\\n\\n---|\$)`, 's');
  const match = block.match(regex);
  return match ? match[1].trim() : '';
}

// Parse labels from the Labels field
function parseLabels(labelsString, sprintNumber, priority, size) {
  const labels = [];
  
  // Add sprint label
  labels.push(`sprint-${sprintNumber}`);
  
  // Parse existing labels (remove backticks and split)
  if (labelsString) {
    const parsed = labelsString
      .split(',')
      .map(l => l.trim().replace(/`/g, ''))
      .filter(l => l && !l.startsWith('sprint-')); // Remove existing sprint labels
    labels.push(...parsed);
  }
  
  // Add priority and size if they exist
  if (priority) labels.push(priority);
  if (size) labels.push(size);
  
  return labels;
}

// Build the issue body in GitHub markdown format
function buildIssueBody({ description, context, acceptanceCriteria, implementationRequirements, technicalImpl, blocks, dependsOn, sprintNumber }) {
  let body = '';
  
  // Sprint context
  body += `> **Sprint ${sprintNumber}** | See [Sprint ${sprintNumber} Document](docs/sprints/sprint_${sprintNumber}.md) for full context\n\n`;
  
  // Context (new narrative style)
  if (context) {
    body += `## Context\n\n${context}\n\n`;
  }
  
  // Description
  if (description) {
    body += `## Description\n\n${description}\n\n`;
  }
  
  // Dependencies
  if (blocks || dependsOn) {
    body += `## Dependencies\n\n`;
    if (blocks) body += `**Blocks**: ${blocks}\n`;
    if (dependsOn) body += `**Depends on**: ${dependsOn}\n`;
    body += '\n';
  }
  
  // Implementation Requirements (before Acceptance Criteria)
  if (implementationRequirements) {
    body += `## Implementation Requirements\n\n${implementationRequirements}\n\n`;
  }
  
  // Acceptance Criteria
  if (acceptanceCriteria) {
    body += `## Acceptance Criteria\n\n${acceptanceCriteria}\n\n`;
  }
  
  // Technical Implementation
  if (technicalImpl) {
    body += `## Technical Implementation\n\n${technicalImpl}\n\n`;
  }
  
  // Workflow footer
  body += `---\n\n`;
  body += `**Workflow:**\n`;
  body += `\`\`\`bash\n`;
  body += `# Start work on this issue\n`;
  body += `just work ${getWorkCommand(sprintNumber)}\n\n`;
  body += `# After implementation\n`;
  body += `just pr\n`;
  body += `just merge\n`;
  body += `just close\n`;
  body += `\`\`\``;
  
  return body;
}

// Generate just work command suggestion
function getWorkCommand(sprintNumber) {
  // Use issue number or sprint for search
  return `"sprint-${sprintNumber}"`;
}

// Create GitHub issues
function createIssues(allIssues) {
  console.log('\n📝 Creating GitHub Issues...\n');
  
  const created = [];
  let totalIssues = 0;
  
  for (let sprintNumber = 0; sprintNumber < SPRINT_COUNT; sprintNumber++) {
    const sprintIssues = allIssues.filter(issue => issue.sprintNumber === sprintNumber);
    
    if (sprintIssues.length === 0) continue;
    
    console.log(`\n${SPRINT_TITLES[sprintNumber].toUpperCase()}`);
    console.log('-'.repeat(50));
    
    for (const issue of sprintIssues) {
      const labelString = issue.labels.join(',');
      
      // Write body to temporary file to avoid shell escaping issues
      const tempFile = `/tmp/issue-body-${Date.now()}.md`;
      fs.writeFileSync(tempFile, issue.body);
      
      // Build GitHub CLI command using temp file
      const cmd = `gh issue create ` +
        `--title "${issue.title.replace(/"/g, '\\"')}" ` +
        `--body-file "${tempFile}" ` +
        `--label "${labelString}" ` +
        `--milestone "${issue.milestone}" ` +
        `--assignee @me`;
      
      const result = run(cmd);
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      if (result.success) {
        const match = result.output.match(/\/issues\/(\d+)/);
        const issueNumber = match ? match[1] : '?';
        console.log(`  ✅ #${issueNumber}: ${issue.title}`);
        
        created.push({
          number: issueNumber,
          title: issue.title,
          sprint: sprintNumber,
          originalNumber: issue.number
        });
      } else {
        console.log(`  ❌ Failed: ${issue.title}`);
        console.log(`     Error: ${result.error}`);
      }
      
      totalIssues++;
    }
  }
  
  return created;
}

// Update existing GitHub issues
function updateIssues(allIssues, existingMapping) {
  console.log('\n📝 Updating GitHub Issues...\n');
  
  const updated = [];
  const notFound = [];
  
  for (let sprintNumber = 0; sprintNumber < SPRINT_COUNT; sprintNumber++) {
    const sprintIssues = allIssues.filter(issue => issue.sprintNumber === sprintNumber);
    
    if (sprintIssues.length === 0) continue;
    
    console.log(`\n${SPRINT_TITLES[sprintNumber].toUpperCase()}`);
    console.log('-'.repeat(50));
    
    for (const issue of sprintIssues) {
      const githubNumber = existingMapping[issue.title];
      
      if (!githubNumber) {
        console.log(`  ⚠️ Not found: ${issue.title}`);
        notFound.push(issue.title);
        continue;
      }
      
      // Write body to temp file
      const tempFile = `/tmp/issue-body-${Date.now()}.md`;
      fs.writeFileSync(tempFile, issue.body);
      
      // Update the issue
      const cmd = `gh issue edit ${githubNumber} --body-file "${tempFile}"`;
      const result = run(cmd);
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      if (result.success) {
        console.log(`  ✅ #${githubNumber}: ${issue.title}`);
        updated.push({
          githubNumber,
          title: issue.title,
          originalNumber: issue.number,
          sprintNumber: issue.sprintNumber
        });
      } else {
        console.log(`  ❌ Failed #${githubNumber}: ${issue.title}`);
        console.log(`     Error: ${result.error}`);
      }
    }
  }
  
  if (notFound.length > 0) {
    console.log(`\n⚠️ Issues not found in GitHub (${notFound.length}):`);
    notFound.forEach(title => console.log(`   - ${title}`));
  }
  
  return updated;
}

// Update sprint documents with GitHub issue numbers
function updateSprintDocuments(issueMapping) {
  console.log('\n📄 Updating sprint documents with GitHub issue numbers...\n');
  
  // Group by sprint
  const bySprint = {};
  for (const issue of issueMapping) {
    if (!bySprint[issue.sprintNumber]) {
      bySprint[issue.sprintNumber] = [];
    }
    bySprint[issue.sprintNumber].push(issue);
  }
  
  let totalUpdated = 0;
  
  // Update each sprint document
  for (const [sprintNumber, issues] of Object.entries(bySprint)) {
    const filePath = path.join(__dirname, '../../docs/sprints', `sprint_${sprintNumber}.md`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️ Sprint file not found: ${filePath}`);
      continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    let changes = 0;
    
    // Replace issue numbers in headers
    for (const issue of issues) {
      // Match: ## Issue A2: Title → ## Issue 123: Title  
      const oldPattern = new RegExp(`## Issue ${escapeRegex(issue.originalNumber)}:`, 'g');
      const newPattern = `## Issue ${issue.githubNumber}:`;
      
      const newContent = content.replace(oldPattern, newPattern);
      if (newContent !== content) {
        content = newContent;
        changes++;
      }
    }
    
    if (changes > 0) {
      // Write back to file
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, content);
      }
      console.log(`  ✅ Updated ${filePath} (${changes} issue number${changes > 1 ? 's' : ''})`);
      totalUpdated += changes;
    } else {
      console.log(`  ℹ️ No changes needed in ${filePath}`);
    }
  }
  
  return totalUpdated;
}

// Escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Main execution
function main() {
  const mode = process.argv.find(arg => ['--create', '--update', '--sync-numbers'].includes(arg)) || '--create';
  
  console.log('Sprint Issues Migration');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Action: ${mode}`);
  console.log('='.repeat(50));
  
  // Parse all sprint documents
  const allIssues = [];
  for (let i = 0; i < SPRINT_COUNT; i++) {
    const sprintIssues = parseSprintDoc(i);
    allIssues.push(...sprintIssues);
  }
  
  console.log(`\n📊 Found ${allIssues.length} total issues across ${SPRINT_COUNT} sprints`);
  
  switch (mode) {
    case '--create':
      const created = createIssues(allIssues);
      console.log('\n\n🎉 Creation Complete');
      console.log('='.repeat(50));
      console.log(`Created ${created.length} GitHub issues`);
      
      if (!DRY_RUN && created.length > 0) {
        console.log('\nNext Steps:');
        console.log('1. View all issues: gh issue list --label sprint-0');
        console.log('2. View by priority: gh issue list --label "P0: Critical"');
        console.log('3. Start working: just work "sprint-0"');
        console.log('\nExamples:');
        created.slice(0, 3).forEach(issue => {
          console.log(`  just work ${issue.number}  # ${issue.title}`);
        });
      }
      break;
      
    case '--update':
      const existingMapping = fetchExistingIssues();
      console.log(`📋 Found ${Object.keys(existingMapping).length} existing GitHub issues with sprint labels`);
      
      const updated = updateIssues(allIssues, existingMapping);
      console.log('\n\n🎉 Update Complete');
      console.log('='.repeat(50));
      console.log(`Updated ${updated.length} GitHub issues`);
      break;
      
    case '--sync-numbers':
      const mapping = fetchExistingIssues();
      const allIssuesForSync = [];
      
      // Parse issues again and match with GitHub numbers
      for (let i = 0; i < SPRINT_COUNT; i++) {
        const sprintIssues = parseSprintDoc(i);
        for (const issue of sprintIssues) {
          const githubNumber = mapping[issue.title];
          if (githubNumber) {
            allIssuesForSync.push({
              originalNumber: issue.number,
              githubNumber,
              title: issue.title,
              sprintNumber: issue.sprintNumber
            });
          }
        }
      }
      
      const totalUpdated = updateSprintDocuments(allIssuesForSync);
      console.log('\n\n🎉 Sync Complete');
      console.log('='.repeat(50));
      console.log(`Updated ${totalUpdated} issue numbers in sprint documents`);
      
      if (!DRY_RUN && totalUpdated > 0) {
        console.log('\nNext Steps:');
        console.log('1. Review changes: git diff docs/sprints/');
        console.log('2. Commit changes: git add docs/sprints/ && git commit -m "Update issue numbers"');
      }
      break;
      
    default:
      console.error(`Unknown mode: ${mode}`);
      console.error('Valid modes: --create, --update, --sync-numbers');
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { parseSprintDoc, fetchExistingIssues, updateIssues, updateSprintDocuments, main }; 