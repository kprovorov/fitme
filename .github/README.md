# GitHub Actions - Version Management

This directory contains a GitHub Actions workflow for automatically managing version numbers in your project.

## Workflow

### Auto Version Bump (`auto-version-bump.yml`)

**Trigger**: Automatically on push to `main` branch

**Features**:

- **Intelligent Version Detection**: Automatically detects bump type from conventional commit messages
- **Semantic Versioning**: Follows standard patch.minor.major format based on commit types
- **Smart Filtering**: Skips version bump if only version files, docs, or workflows changed
- **Dual File Updates**: Updates both `package.json` and `app.json` versions
- **Automatic Tagging**: Creates git tags automatically
- **Loop Prevention**: Uses `[skip ci]` in commit message to prevent infinite loops

**How Auto-Detection Works**:

- **feat:** commits → **minor** bump (new features)
- **fix:** commits → **patch** bump (bug fixes)
- **BREAKING CHANGE:** or **major:** → **major** bump (breaking changes)
- Falls back to **patch** if no conventional commits detected

**When it runs**:

- ✅ Code changes pushed to main
- ❌ Only version files changed
- ❌ Documentation changes only
- ❌ GitHub workflow changes only

## Version Bumping Logic

### Automatic Semantic Versioning

The workflow automatically detects the appropriate version bump type by analyzing your conventional commit messages:

- **feat:** → **Minor** bump (0.X.0) - New features, backward compatible
- **fix:** → **Patch** bump (0.0.X) - Bug fixes, backward compatible
- **BREAKING CHANGE:** or **major:** → **Major** bump (X.0.0) - Breaking changes
- **Other conventional types** follow similar semantic patterns
- **Fallback**: Patch bump if no conventional commits detected

### Examples

Current version: `1.9.0`

- **feat: add new workout feature** → `1.9.0` → `1.10.0` (minor)
- **fix: resolve login bug** → `1.9.0` → `1.9.1` (patch)
- **feat: BREAKING CHANGE: redesign API** → `1.9.0` → `2.0.0` (major)

## Files Updated

The workflow updates these files:

- `package.json` - Node.js package version
- `app.json` - Expo app version

## Requirements

- Node.js 18+ (automatically set up by workflow)
- `jq` command-line tool (available on Ubuntu runners)
- Proper GitHub permissions for the `GITHUB_TOKEN`

## Security Notes

- Uses `GITHUB_TOKEN` for authentication
- Configured to run only on trusted branches
- Commits are signed with GitHub Action identity

## Troubleshooting

### Workflow fails to push

- Ensure the workflow has write permissions to the repository
- Check that the `GITHUB_TOKEN` has sufficient permissions

### Version not updating

- Verify both `package.json` and `app.json` exist
- Check that the version fields are in the expected format
- Ensure the workflow has access to read the files

### Infinite loops

- The workflow uses `[skip ci]` in commit messages to prevent loops
- Version bumping is fully automatic based on conventional commits
- No manual intervention required for version management

## Customization

You can modify these workflows to:

- Add additional version files
- Change the commit message format
- Modify the release notes template
- Add additional validation steps
- Integrate with other CI/CD tools
