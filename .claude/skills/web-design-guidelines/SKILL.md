---
name: "web-design-guidelines"
description: "Review UI code for Web Interface Guidelines compliance. Use when asked to review my UI, check accessibility, audit design, review UX, or check a site against best practices."
---

# Web Interface Guidelines

Source: vercel-labs/agent-skills (author: Vercel, v1.0.0, MIT).

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use the web fetch tool to retrieve the latest rules. The fetched content contains all the rules and output format instructions. If the fetch fails, say so plainly and tell the user the review is not based on the official rule set.

## Usage

When a user provides a file, pasted code, or a pattern:
1. Fetch guidelines from the source URL above
2. Read the specified files (or the pasted code)
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files or code are provided, ask the user which files to review.