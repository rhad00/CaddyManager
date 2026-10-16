# Changelog
All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

- - -
## [v0.6.0](https://github.com/rhad00/CaddyManager/compare/81ce6eac4032de6d8e0e278c31b1c9d9ca390ff3..v0.6.0) - 2026-10-16
#### Features
- **(api)** add GET /api/v1/system/info with the running version (#98) - ([5f90199](https://github.com/rhad00/CaddyManager/commit/5f90199d131cf92cc945805d9da137231360b094)) - Radu

- - -

## [v0.5.0](https://github.com/rhad00/CaddyManager/compare/7f30fb361d5112dab08735005aa416d4b7837b6a..v0.5.0) - 2026-10-15
#### Features
- modernize to TypeScript, make S3/SigV4 proxying work, add e2e tests and image-based install (#91) - ([7f30fb3](https://github.com/rhad00/CaddyManager/commit/7f30fb361d5112dab08735005aa416d4b7837b6a)) - Radu

- - -
## [v0.4.2](https://github.com/rhad00/CaddyManager/compare/v0.4.1..v0.4.2) - 2026-04-23
_Baseline tag, no release was published._ It marks the point on `main` from which the next release is computed, after the release
workflow had been blocked by commit 8083420 (a squash-merge title that is not a conventional commit).
#### Bug Fixes
- remove outdated testing instructions (#50) - ([aa87374](https://github.com/rhad00/CaddyManager/commit/aa87374e66e48f3d143c1da2c2c1e6557d656f93)) - Radu
#### Other
- Create disabled proxies pending admin review and enhance security (#49) - ([8083420](https://github.com/rhad00/CaddyManager/commit/8083420bd7a9950b56240c857726eac740902d0b)) - Radu

- - -
## [v0.4.1](https://github.com/rhad00/CaddyManager/compare/39f4a2aa6c2d9d8c37c16a682fdbc0c32444be50..v0.4.1) - 2026-03-12
#### Bug Fixes
- create discovered proxies as disabled pending admin review; exclude disabled proxies from Caddy config (#48) - ([39f4a2a](https://github.com/rhad00/CaddyManager/commit/39f4a2aa6c2d9d8c37c16a682fdbc0c32444be50)) - Radu

- - -
## [v0.4.0](https://github.com/rhad00/CaddyManager/compare/88d0dbe18d4070f30876fd54029921210c2cfc81..v0.4.0) - 2026-03-12
#### Features
- swagger docs, Docker/Git integration, alerts, API keys, log viewer, CI/CD improvements (#47) - ([88d0dbe](https://github.com/rhad00/CaddyManager/commit/88d0dbe18d4070f30876fd54029921210c2cfc81)) - Radu

- - -
## [v0.3.0](https://github.com/rhad00/CaddyManager/compare/fa5a042dd5a5d3a87ba0e3fb4dc3f6936d265b3b..v0.3.0) - 2026-03-12
#### Features
- add Alert Management, API Key Management, and Log Viewer pages (#46) - ([fa5a042](https://github.com/rhad00/CaddyManager/commit/fa5a042dd5a5d3a87ba0e3fb4dc3f6936d265b3b)) - Radu

- - -
## [v0.2.0](https://github.com/rhad00/CaddyManager/compare/1bb0c580eb5751747eaa599bdbd65bc8b8ebdd7a..v0.2.0) - 2025-12-03
#### Features
- Add Docker and Git integration for service discovery and version control (#26) - ([412b0e1](https://github.com/rhad00/CaddyManager/commit/412b0e1fc447c79df12a7314f3e6042458329661)) - Radu

- - -
## [v0.1.1](https://github.com/rhad00/CaddyManager/compare/cd729500a4d4e4d7f2c3f3ccfac501f5c13f8ce0..v0.1.1) - 2025-11-27
#### Bug Fixes
- update Docker build for amd64 and enhance Cloudflare integration (#22) - ([cd72950](https://github.com/rhad00/CaddyManager/commit/cd729500a4d4e4d7f2c3f3ccfac501f5c13f8ce0)) - Radu

- - -
## [v0.1.0](https://github.com/rhad00/CaddyManager/compare/c310a34c1578351e649fef500c43fa1981030d20..v0.1.0) - 2025-11-27
#### Features
- various fixes and features implemented (#21) - ([a115c0c](https://github.com/rhad00/CaddyManager/commit/a115c0cdf1624c7bf4eb589914db8c5d63271abd)) - rhad00

- - -
## [v0.0.4](https://github.com/rhad00/CaddyManager/compare/52d4629392d463675415c49a88b931fd21d6abc4..v0.0.4) - 2025-11-26
#### Bug Fixes
- update Docker build to target amd64 architecture only (#19) - ([52d4629](https://github.com/rhad00/CaddyManager/commit/52d4629392d463675415c49a88b931fd21d6abc4)) - Radu

- - -
## [v0.0.3](https://github.com/rhad00/CaddyManager/compare/66e65fd0a6c75f8b90ed7c38415aff9091652ba3..v0.0.3) - 2025-11-26
#### Bug Fixes
- update Docker build steps for amd64 architecture only (#18) - ([66e65fd](https://github.com/rhad00/CaddyManager/commit/66e65fd0a6c75f8b90ed7c38415aff9091652ba3)) - Radu

- - -
## [v0.0.2](https://github.com/rhad00/CaddyManager/compare/d2a3ab8e4bde73240a639bc9d7a4fc6dfdfe39fa..v0.0.2) - 2025-11-25
#### Bug Fixes
- **(ci)** add workflow permissions and streamline release process (#15) - ([a64ca15](https://github.com/rhad00/CaddyManager/commit/a64ca1512c90b9696d8183b459bbb76bfa52e913)) - Radu
- restructure CI/CD workflows and enhance release process - ([b27454d](https://github.com/rhad00/CaddyManager/commit/b27454d270aa6b7ed5dcabdfd23471d72145b843)) - tox
- indentation (#14) - ([551fc30](https://github.com/rhad00/CaddyManager/commit/551fc302f5ef9660c2bff140c3b6b1c60fd52558)) - rhad00
- Add workflow permissions, release version output, and changelog … (#13) - ([bac6a07](https://github.com/rhad00/CaddyManager/commit/bac6a07277f3d17dff1cab891d4151ff19cc2e8e)) - rhad00
- remove force push from CI - ([30ff1f1](https://github.com/rhad00/CaddyManager/commit/30ff1f1e13593ca9afbbddac664ce7c956dfa520)) - tox
- ensure cocogitto action pushes generated tags by adding `push: true` and an explicit push step. - ([1d5e56a](https://github.com/rhad00/CaddyManager/commit/1d5e56a0ea1bb31f728ddcb84a8c12b714b855ca)) - tox
- add initial tag, fix cocogitto config - ([d2a3ab8](https://github.com/rhad00/CaddyManager/commit/d2a3ab8e4bde73240a639bc9d7a4fc6dfdfe39fa)) - tox

- - -

Changelog generated by [cocogitto](https://github.com/cocogitto/cocogitto).