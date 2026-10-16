# Contributing to CaddyManager

First off, thank you for considering contributing to CaddyManager! It's people like you that make CaddyManager such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

Found a security problem? Do not open a public issue: follow the [Security Policy](./SECURITY.md).

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report for CaddyManager. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

Before creating bug reports, please check [this list](https://github.com/rhad00/CaddyManager/issues) as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title** for the issue to identify the problem.
* **Describe the exact steps which reproduce the problem** in as much detail as possible.
* **Provide specific examples to demonstrate the steps**. Include links to files or GitHub projects, or copy/pasteable snippets, which you use in those examples.
* **Describe the behavior you observed after following the steps** and point out what exactly is the problem with that behavior.
* **Explain which behavior you expected to see instead and why.**
* **Include screenshots and animated GIFs** which show you following the described steps and clearly demonstrate the problem.

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for CaddyManager, including completely new features and minor improvements to existing functionality.

* **Use a clear and descriptive title** for the issue to identify the suggestion.
* **Provide a step-by-step description of the suggested enhancement** in as much detail as possible.
* **Provide specific examples to demonstrate the steps**. Include copy/pasteable snippets which you use in those examples.
* **Describe the current behavior** and **explain which behavior you expected to see instead** and why.
* **Explain why this enhancement would be useful** to most CaddyManager users.

### Pull Requests

* Fill in the pull request template
* Use a [conventional commit](#git-commit-messages) as the PR title (`fix(proxy): ...`): it becomes the commit message on `main` and decides the next release, and CI rejects other titles
* Do not include issue numbers in the PR title
* Include screenshots and animated GIFs in your pull request whenever possible
* Follow our [coding standards](#coding-standards)
* Document new code
* End all files with a newline

## Development Process

### Setting Up the Development Environment

1. Fork the repo
2. Clone your fork
3. Create a new branch (`git checkout -b feature/amazing-feature`)
4. Make your changes
5. Run tests
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Create a Pull Request

### Coding Standards

#### JavaScript/TypeScript

* Use ES6+ features
* Use async/await over promises
* Follow the ESLint configuration
* Use TypeScript types/interfaces where possible
* Document functions and complex logic

#### React

* Use functional components and hooks
* Follow React best practices
* Keep components small and focused
* Use proper prop-types or TypeScript interfaces

#### Testing

* Write unit tests for new features
* Ensure all tests pass before submitting PR
* Include integration tests where necessary
* Aim for good test coverage

## Git Commit Messages

Releases are generated from commit messages ([Conventional Commits](https://www.conventionalcommits.org/), checked by
[Cocogitto](https://docs.cocogitto.io/)), so every commit that lands on `main` must start with `type(scope): subject`.
A message that does not follow the format is left out of the changelog and the version bump.

* Types:
    * `feat:` for new features (triggers a MINOR release)
    * `fix:`, `perf:`, `refactor:`, `docs:`, `style:`, `test:`, `build:`, `ci:`, `revert:` (trigger a PATCH release)
    * `chore:` for changes that must not trigger a release (dependency bumps, repository housekeeping)
    * `feat!:` / `fix!:` (or a `BREAKING CHANGE:` footer in the commit body) for breaking changes (triggers a MAJOR release)
* The optional scope names the area: `fix(proxy): ...`, `docs(readme): ...`
* Use the imperative mood ("add feature", not "added feature") and lower case after the colon
* Limit the first line to 72 characters or less
* Reference issues and pull requests after the first line, in the body or footer
* Do not put an emoji or any other text before the type: `🐛 fix: ...` is not a conventional commit

Examples:
```
feat: add user authentication system
fix(proxy): resolve memory leak in proxy manager
feat!: change API endpoints to follow REST conventions
docs: update installation instructions
chore(deps): update dependencies
```

The GitHub web editor proposes messages such as "Update README.md" or "Add files via upload": replace them with a
conventional message (for example `docs(readme): update ...`) before committing.

## Additional Notes

### Issue and Pull Request Labels

This section lists the labels we use to help us track and manage issues and pull requests.

* `bug` - Issues that are bugs
* `documentation` - Issues for improving or creating new documentation
* `duplicate` - Issues that are duplicates of other issues
* `enhancement` - Issues that are feature requests
* `good first issue` - Good for newcomers
* `help wanted` - Extra attention is needed
* `invalid` - Issues that aren't valid (e.g. user errors)
* `question` - Further information is requested
* `wontfix` - Issues that won't be worked on

## Getting Help

If you need help, you can:

* Join our [Discord server](https://discord.gg/caddymanager)
* Ask in our [GitHub Discussions](https://github.com/rhad00/CaddyManager/discussions)
* Check out our [documentation](https://docs.caddymanager.org)

## Recognition

Contributors are recognized in our [README.md](./README.md) and [Contributors page](https://github.com/rhad00/CaddyManager/graphs/contributors). We appreciate all contributions, big or small!
