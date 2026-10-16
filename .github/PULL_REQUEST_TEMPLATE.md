<!--
The PR title becomes the commit message on main and decides the next release, so it must be a conventional commit:
  type(scope): subject      e.g.  fix(proxy): keep header rules on path-routed proxies
Types: feat (minor release), fix / perf / refactor / docs / style / test / build / ci (patch), chore (no release).
Breaking change: add "!" after the type (feat!: ...) and describe it below.
-->

## Summary

<!-- What does this change and why? A few sentences or bullets. This section is quoted in the release notes. -->

## Related issues

<!-- Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / performance
- [ ] Documentation
- [ ] CI / build / dependencies
- [ ] Breaking change (changes behaviour, an API or a configuration that existing installations rely on)

## How was it tested?

<!-- Commands you ran and what you checked by hand. Screenshots for UI changes. -->

- [ ] Backend tests pass (`cd backend && npm test`)
- [ ] Frontend lint and tests pass (`cd frontend && npm run lint && npm test`)
- [ ] For changes to the generated Caddy configuration: `npm run test:contract` / `npm run test:e2e`

## Checklist

- [ ] The PR title is a conventional commit (see the comment at the top)
- [ ] I added or updated tests for the change
- [ ] I updated the README or the docs where behaviour or configuration changed
- [ ] No secrets, keys, tokens or private hostnames are included
- [ ] New environment variables are documented in the README and `.env.template`
- [ ] Database changes come with a migration

## Notes for the reviewer

<!-- Upgrade steps, risks, follow-ups. Delete this section if there is nothing to add. -->
