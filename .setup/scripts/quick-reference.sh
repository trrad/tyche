#!/bin/bash

# Colors for visual hierarchy
BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
RESET='\033[0m'

echo -e "${BOLD}${CYAN}Just Commands Quick Reference${RESET}"
echo -e "${CYAN}================================${RESET}"
echo ""

echo -e "${BOLD}${GREEN}Daily Work:${RESET}"
echo -e "  ${YELLOW}just work <issue>${RESET}     - Switch to existing issue or create new one"
echo -e "  ${YELLOW}just feature <name>${RESET}   - Create new feature branch and issue"
echo -e "  ${YELLOW}just fix <name>${RESET}       - Create new fix branch and issue"
echo -e "  ${YELLOW}just pr${RESET}              - Create pull request from current branch"
echo -e "  ${YELLOW}just merge${RESET}           - Merge current PR and clean up"
echo ""

echo -e "${BOLD}${GREEN}Issue Management:${RESET}"
echo -e "  ${YELLOW}just close-issue [#]${RESET}  - Close issue (auto-detect from context)"
echo -e "  ${YELLOW}just update-issue [#]${RESET} - Edit issue body (auto-detect from context)"
echo ""

echo -e "${BOLD}${GREEN}Build & Development:${RESET}"
echo -e "  ${YELLOW}just dev${RESET}             - Start development server"
echo -e "  ${YELLOW}just build${RESET}           - Build project for production"
echo -e "  ${YELLOW}just check${RESET}           - Run type-check, tests, and linting"
echo ""

echo -e "${BOLD}${GREEN}Status & Info:${RESET}"
echo -e "  ${YELLOW}just status${RESET}          - Show git status with context"
echo -e "  ${YELLOW}just report${RESET}          - Show work session summary"
echo -e "  ${YELLOW}just context${RESET}         - Show current work context"
echo ""

echo -e "${BOLD}${GREEN}Utilities:${RESET}"
echo -e "  ${YELLOW}just clean${RESET}           - Clean build artifacts"
echo -e "  ${YELLOW}just test-watch${RESET}      - Run tests in watch mode"
echo -e "  ${YELLOW}just test-related${RESET}    - Run tests related to current changes"
echo -e "  ${YELLOW}just refresh-context${RESET} - Clear context files"
echo ""

echo -e "${BOLD}${BLUE}Setup:${RESET}"
echo -e "  ${YELLOW}just help${RESET}            - Show this reference"
echo -e "  ${YELLOW}just setup${RESET}           - Initial project setup (npm install, etc)"
echo "" 