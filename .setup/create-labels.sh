#!/bin/bash

# Priority labels
gh label create "P0: Critical" --color "B60205" --description "Drop everything" 2>/dev/null
gh label create "P1: High" --color "D93F0B" --description "Important" 2>/dev/null
gh label create "P2: Normal" --color "FBCA04" --description "Standard priority" 2>/dev/null
gh label create "P3: Low" --color "0E8A16" --description "Nice to have" 2>/dev/null

# Type labels
gh label create "bug" --color "EE0701" --description "Something broken" 2>/dev/null
gh label create "enhancement" --color "84B6EB" --description "New feature" 2>/dev/null
gh label create "docs" --color "1D76DB" --description "Documentation" 2>/dev/null
gh label create "refactor" --color "6B3E99" --description "Code improvement" 2>/dev/null
gh label create "test" --color "0E8A16" --description "Test improvement" 2>/dev/null

# Status labels
gh label create "blocked" --color "000000" --description "Waiting on something" 2>/dev/null
gh label create "ready" --color "0E8A16" --description "Ready to work" 2>/dev/null
gh label create "in-progress" --color "FBCA04" --description "Being worked on" 2>/dev/null

# Roadmap labels
gh label create "roadmap" --color "1D76DB" --description "Roadmap task" 2>/dev/null
gh label create "phase-0" --color "BFD4F2" --description "Foundation" 2>/dev/null
gh label create "phase-1" --color "D4C5F9" --description "Basic A/B" 2>/dev/null
gh label create "phase-2" --color "C5DEF5" --description "Business" 2>/dev/null
gh label create "phase-3" --color "BFE5BF" --description "Segmentation" 2>/dev/null
gh label create "phase-4" --color "F9D0C4" --description "Polish" 2>/dev/null

echo "✅ Labels created" 