# NHL Regular Season Pick'em Pool

## Project Overview

Web-based app to allow the creation and maintenance of an NHL game picking pool.  There is a prototype which can be used as a guide to the project. This is a TypeScript project (hockey picks app) deployed on Netlify with a Supabase backend. Always verify builds pass locally before committing with `npm run build`.  

## Commands shortcut (if these are seen as only word in prompt)

**Development Workflow Commands:**

1. nb: creates a new branch for feature development (optionally describe feature in plain text, e.g.
   "nb add search improvements and filters")
2. commit: commits current changes with good commit message
3. ppr: publishes the PR (pushes changes) and creates good commit messages
4. cpr: creates a pull request in GitHub with proper title and description
5. mpr: merges the current PR (squash and merge by default)
6. back: switches back to main branch and pulls latest changes
7. cleanup: deletes the merged feature branch locally and remotely

## Instructions

- Always read PLANNING.md if it exists at the start of every new conversation
- check TASKS.md if it exists before starting your work
- mark completed tasks immediately in TASKS.md
- add newly discovered tasks

## Git Workflow 
After implementing a fix, always commit AND push in the same flow unless told otherwise. User expects git operations to complete end-to-end.

## Bug Fixing 
- When fixing bugs, always check for existing bad data in the database that needs cleanup — don't assume a code fix alone resolves state issues.

## General App Requirements
User Accounts - Simple email-based signup and login (no social auth required).
Weekly Picks
Each week, starting on Monday, display a list of the upcoming Saturday games taken from nhl.com.
Users select five games and assign a confidence level to each pick.
Confidence levels should be ranked (e.g., 1–5, no duplicates).

Scoring & League Management
Track each member’s:
Weekly score
Total cumulative score
Wins and losses
Historical picks across the season
Automatically compute results when a user logs in for all completed games.
Member Interface
Dashboard showing standings, weekly results, and individual pick history.
Admin Tools (optional enhancement)
Ability to upload or confirm weekly NHL matchups.
Override or adjust scores if needed.

