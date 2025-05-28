# Contributing to CaddyManager

First off, thank you for considering contributing to CaddyManager! It's people like you that make CaddyManager such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

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

* Fill in the required template
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

* Use semantic versioning wording:
    * `feat:` for new features (triggers MINOR version bump)
    * `fix:` for bug fixes (triggers PATCH version bump)
    * `BREAKING CHANGE:` in the commit body for breaking changes (triggers MAJOR version bump)
    * `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:` for other changes
* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line

Examples:
```
feat: add user authentication system
fix: resolve memory leak in proxy manager
BREAKING CHANGE: refactor API endpoints to follow REST conventions
docs: update installation instructions
chore: update dependencies
```
* Consider starting the commit message with an applicable emoji:
    * 🎨 `:art:` when improving the format/structure of the code
    * 🐎 `:racehorse:` when improving performance
    * 🚱 `:non-potable_water:` when plugging memory leaks
    * 📝 `:memo:` when writing docs
    * 🐛 `:bug:` when fixing a bug
    * 🔥 `:fire:` when removing code or files
    * 💚 `:green_heart:` when fixing the CI build
    * ✅ `:white_check_mark:` when adding tests
    * 🔒 `:lock:` when dealing with security
    * ⬆️ `:arrow_up:` when upgrading dependencies
    * ⬇️ `:arrow_down:` when downgrading dependencies

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
