#!/usr/bin/env node

/**
 * Roadmap Issues Migration
 * 
 * Creates GitHub issues from the structured roadmap document
 * with proper labels, milestones, and dependencies.
 * 
 * Usage:
 *   node .setup/scripts/migrate-roadmap-issues.js           # Dry run
 *   node .setup/scripts/migrate-roadmap-issues.js --create  # Create issues
 *   node .setup/scripts/migrate-roadmap-issues.js --update  # Update existing
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DRY_RUN = !process.argv.includes('--create') && !process.argv.includes('--update');
const UPDATE_MODE = process.argv.includes('--update');

// Phase titles for milestone mapping
const PHASE_MILESTONES = {
  0: "Phase 0: Foundation Alignment",
  1: "Phase 1: Statistical Layer",
  2: "Phase 2: Domain Layer & Business Analysis",
  3: "Phase 3: Segmentation & HTE",
  4: "Phase 4: Application Layer & Polish"
};

// Utility function to run commands
function run(cmd, silent = false) {
  if (DRY_RUN) {
    if (!silent) console.log(`[DRY RUN] ${cmd}`);
    return { success: true, output: 'dry-run' };
  }
  
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
    return { success: true, output: output?.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Parse the structured roadmap document
function parseRoadmap() {
  const roadmapPath = path.join(__dirname, '../../docs/issues.md');
  
  if (!fs.existsSync(roadmapPath)) {
    console.error(`❌ Roadmap file not found: ${roadmapPath}`);
    console.error('   Please ensure issues.md exists in docs/');
    process.exit(1);
  }
  
  const content = fs.readFileSync(roadmapPath, 'utf8');
  const issues = [];
  
  // Split by issue blocks
  const issueBlocks = content.split(/\s+- id: "/).slice(1); // Skip header
  
  for (const block of issueBlocks) {
    try {
      // Extract fields using regex patterns
      const id = block.match(/^([^"]+)"/)?.[1];
      const title = block.match(/title: "([^"]+)"/)?.[1];
      const phase = parseFloat(block.match(/phase: ([\d.]+)/)?.[1] || 0);
      const priority = block.match(/priority: (P\d)/)?.[1];
      const labelsMatch = block.match(/labels: \[([^\]]+)\]/);
      const labels = labelsMatch ? labelsMatch[1].split(',').map(l => l.trim().replace(/'/g, '')) : [];
      const size = block.match(/size: ([SMLX]+)/)?.[1];
      const dependsOn = block.match(/dependsOn: \[([^\]]*)\]/)?.[1]?.split(',').map(d => d.trim().replace(/['"]/g, ''));
      const blocks = block.match(/blocks: \[([^\]]*)\]/)?.[1]?.split(',').map(b => b.trim().replace(/['"]/g, ''));
      
      // Extract description
      const descMatch = block.match(/description: \|\s*([\s\S]*?)(?=\n\s+tasks:|$)/);
      const description = descMatch?.[1]?.trim() || '';
      
      // Extract tasks
      const tasksMatch = block.match(/tasks:\s*([\s\S]*?)(?=\n\s+codeSnippets:|files:|$)/);
      const taskLines = tasksMatch?.[1]?.trim().split('\n').filter(line => line.trim().startsWith('-')) || [];
      const tasks = taskLines.map(line => line.replace(/^\s*-\s*"?/, '').replace(/"$/, ''));
      
      // Extract code snippets
      const codeMatch = block.match(/codeSnippets: \|\s*([\s\S]*?)(?=\n\s+files:|$)/);
      const codeSnippets = codeMatch?.[1]?.trim() || '';
      
      // Extract file references
      const filesMatch = block.match(/files:\s*([\s\S]*?)$/);
      const filesBlock = filesMatch?.[1] || '';
      const toCreate = [];
      const mentioned = [];
      
      // Parse file lists
      const toCreateMatch = filesBlock.match(/toCreate:\s*([\s\S]*?)(?=mentioned:|$)/);
      if (toCreateMatch) {
        const lines = toCreateMatch[1].trim().split('\n').filter(l => l.trim().startsWith('-'));
        toCreate.push(...lines.map(l => l.replace(/^\s*-\s*"?/, '').replace(/"$/, '')));
      }
      
      const mentionedMatch = filesBlock.match(/mentioned:\s*([\s\S]*?)$/);
      if (mentionedMatch) {
        const lines = mentionedMatch[1].trim().split('\n').filter(l => l.trim().startsWith('-'));
        mentioned.push(...lines.map(l => l.replace(/^\s*-\s*"?/, '').replace(/"$/, '')));
      }
      
      // Build the issue object
      const issue = {
        id,
        title,
        phase: Math.floor(phase), // Handle phase 2.5 → phase 2
        priority: priority || 'P2',
        labels: [`phase-${Math.floor(phase)}`, ...labels, `size: ${size || 'M'}`],
        size,
        description,
        tasks,
        codeSnippets,
        files: { toCreate, mentioned },
        dependsOn,
        blocks
      };
      
      // Add priority label
      if (priority) {
        issue.labels.push(priority);
      }
      
      // Always add the roadmap label
      issue.labels.push('roadmap');
      
      issues.push(issue);
      
    } catch (error) {
      console.error(`⚠️ Failed to parse issue block: ${error.message}`);
      console.error(`Block content: ${block.substring(0, 100)}...`);
    }
  }
  
  return issues;
}

// Format issue body for GitHub
function formatIssueBody(issue) {
  let body = '';
  
  // Add phase and priority badges
  body += `**Phase ${issue.phase}** | **Priority: ${issue.priority}** | **Size: ${issue.size || 'M'}**\n\n`;
  
  // Add description with proper context
  if (issue.description) {
    body += `## Overview\n\n${issue.description}\n\n`;
  }
  
  // Add tasks as checklist
  if (issue.tasks && issue.tasks.length > 0) {
    body += `## Tasks\n\n`;
    issue.tasks.forEach(task => {
      body += `- [ ] ${task}\n`;
    });
    body += '\n';
  }
  
  // Add code snippets if present
  if (issue.codeSnippets) {
    body += `## Implementation Notes\n\n`;
    body += '```typescript\n';
    body += issue.codeSnippets;
    body += '\n```\n\n';
  }
  
  // Add file references
  if (issue.files) {
    if (issue.files.toCreate && issue.files.toCreate.length > 0) {
      body += `### Files to Create\n\n`;
      issue.files.toCreate.forEach(file => {
        body += `- \`${file}\`\n`;
      });
      body += '\n';
    }
    
    if (issue.files.mentioned && issue.files.mentioned.length > 0) {
      body += `### Files to Modify\n\n`;
      issue.files.mentioned.forEach(file => {
        body += `- \`${file}\`\n`;
      });
      body += '\n';
    }
  }
  
  // Add dependencies and blocks
  if (issue.dependsOn && issue.dependsOn.length > 0) {
    body += `### Dependencies\n\nThis issue depends on:\n`;
    issue.dependsOn.forEach(dep => {
      body += `- ${dep}\n`;
    });
    body += '\n';
  }
  
  if (issue.blocks && issue.blocks.length > 0) {
    body += `### Blocks\n\nThis issue blocks:\n`;
    issue.blocks.forEach(block => {
      body += `- ${block}\n`;
    });
    body += '\n';
  }
  
  // Add context footer
  body += `---\n`;
  body += `*This issue is part of the Tyche roadmap implementation.*\n`;
  body += `*Reference: [Implementation Roadmap](docs/ImplementationRoadmap.md)*\n`;
  
  return body;
}

// Fetch existing GitHub issues
function fetchExistingIssues() {
  console.log('📋 Fetching existing GitHub issues...');
  
  const cmd = `gh issue list --limit 1000 --state all --json number,title,labels`;
  const result = run(cmd, true);
  
  if (!result.success) {
    console.error(`❌ Failed to fetch issues: ${result.error}`);
    return {};
  }
  
  if (DRY_RUN) {
    return {}; // Return empty mapping for dry run
  }
  
  // Build mapping: title → GitHub issue number
  const mapping = {};
  const issues = JSON.parse(result.output || '[]');
  
  let roadmapIssueCount = 0;
  for (const issue of issues) {
    // Match roadmap issues by looking for roadmap label
    const hasRoadmapLabel = issue.labels.some(label => label.name === 'roadmap');
    if (hasRoadmapLabel) {
      mapping[issue.title] = issue.number;
      roadmapIssueCount++;
    }
  }
  
  console.log(`   Found ${roadmapIssueCount} existing roadmap issues`);
  return mapping;
}

// Create GitHub issues
function createIssues(issues) {
  console.log('\n📝 Creating GitHub Issues...\n');
  
  const created = [];
  const failed = [];
  
  // Group by phase for organized output
  const byPhase = {};
  for (const issue of issues) {
    if (!byPhase[issue.phase]) {
      byPhase[issue.phase] = [];
    }
    byPhase[issue.phase].push(issue);
  }
  
  // Create issues phase by phase
  for (const [phase, phaseIssues] of Object.entries(byPhase).sort()) {
    console.log(`\n${PHASE_MILESTONES[phase]}`);
    console.log('='.repeat(50));
    
    for (const issue of phaseIssues) {
      const labelString = issue.labels.join(',');
      const milestone = PHASE_MILESTONES[issue.phase];
      
      // Write body to temporary file to avoid shell escaping issues
      const tempFile = `/tmp/issue-body-${Date.now()}.md`;
      const body = formatIssueBody(issue);
      fs.writeFileSync(tempFile, body);
      
      // Build GitHub CLI command
      const cmd = `gh issue create ` +
        `--title "${issue.title.replace(/"/g, '\\"')}" ` +
        `--body-file "${tempFile}" ` +
        `--label "${labelString}" ` +
        `--milestone "${milestone}"`;
      
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would create: ${issue.id} - ${issue.title}`);
        console.log(`           Labels: ${labelString}`);
        console.log(`           Milestone: ${milestone}`);
      } else {
        const result = run(cmd, true);
        
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (result.success) {
          const match = result.output?.match(/\/issues\/(\d+)/) || result.output?.match(/#(\d+)/);
          const issueNumber = match ? match[1] : '?';
          console.log(`  ✅ #${issueNumber}: ${issue.id} - ${issue.title}`);
          
          created.push({
            number: issueNumber,
            id: issue.id,
            title: issue.title,
            phase: issue.phase
          });
        } else {
          console.log(`  ❌ Failed: ${issue.id} - ${issue.title}`);
          console.log(`     Error: ${result.error}`);
          failed.push(issue);
        }
      }
    }
  }
  
  return { created, failed };
}

// Update existing issues
function updateIssues(issues, existingMapping) {
  console.log('\n📝 Updating Existing GitHub Issues...\n');
  
  const updated = [];
  const notFound = [];
  
  for (const issue of issues) {
    const githubNumber = existingMapping[issue.title];
    
    if (!githubNumber) {
      notFound.push(issue);
      continue;
    }
    
    const body = formatIssueBody(issue);
    const tempFile = `/tmp/issue-body-${Date.now()}.md`;
    fs.writeFileSync(tempFile, body);
    
    const cmd = `gh issue edit ${githubNumber} --body-file "${tempFile}"`;
    
    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would update #${githubNumber}: ${issue.title}`);
    } else {
      const result = run(cmd, true);
      
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      if (result.success) {
        console.log(`  ✅ Updated #${githubNumber}: ${issue.title}`);
        updated.push({ number: githubNumber, ...issue });
      } else {
        console.log(`  ❌ Failed to update #${githubNumber}: ${issue.title}`);
      }
    }
  }
  
  if (notFound.length > 0) {
    console.log(`\n⚠️ Issues not found in GitHub (${notFound.length}):`);
    notFound.forEach(issue => {
      console.log(`   - ${issue.id}: ${issue.title}`);
    });
  }
  
  return { updated, notFound };
}

// Main execution
function main() {
  console.log('🚀 Tyche Roadmap Issues Migration');
  console.log('==================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : UPDATE_MODE ? 'UPDATE' : 'CREATE'}`);
  console.log('');
  
  // Parse the roadmap document
  const issues = parseRoadmap();
  console.log(`📊 Parsed ${issues.length} issues from roadmap`);
  
  // Show summary by phase
  const phaseCounts = {};
  for (const issue of issues) {
    phaseCounts[issue.phase] = (phaseCounts[issue.phase] || 0) + 1;
  }
  
  console.log('\nIssues by phase:');
  for (const [phase, count] of Object.entries(phaseCounts).sort()) {
    console.log(`  Phase ${phase}: ${count} issues`);
  }
  
  if (UPDATE_MODE) {
    // Update existing issues
    const existingMapping = fetchExistingIssues();
    const { updated, notFound } = updateIssues(issues, existingMapping);
    
    console.log('\n✅ Update Complete');
    console.log('==================');
    console.log(`Updated: ${updated.length} issues`);
    console.log(`Not found: ${notFound.length} issues`);
    
    if (!DRY_RUN && notFound.length > 0) {
      console.log('\nTo create missing issues, run:');
      console.log('  node .setup/scripts/migrate-roadmap-issues.js --create');
    }
    
  } else {
    // Create new issues
    const { created, failed } = createIssues(issues);
    
    console.log('\n✅ Migration Complete');
    console.log('=====================');
    console.log(`Created: ${created.length} issues`);
    console.log(`Failed: ${failed.length} issues`);
    
    if (!DRY_RUN && created.length > 0) {
      console.log('\nNext steps:');
      console.log('1. View Phase 0 issues: gh issue list --label phase-0');
      console.log('2. View critical issues: gh issue list --label P0');
      console.log('3. Start working: just work <issue-number>');
      console.log('\nExample:');
      const examples = created.slice(0, 3);
      examples.forEach(issue => {
        console.log(`  just work ${issue.number}  # ${issue.title}`);
      });
    }
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { parseRoadmap, formatIssueBody, fetchExistingIssues };