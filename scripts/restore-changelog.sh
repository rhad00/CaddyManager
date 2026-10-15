#!/usr/bin/env bash
# Put the accumulated CHANGELOG.md back in the working tree before `cog bump` prepends a new section.
#
# `main` is a protected branch, so the release job cannot commit to it: the bump commit (changelog and
# package versions) is only tagged, and each release's CHANGELOG.md lives on its tag. Without this step
# every release would start a brand new file with a single section.
#
# The file with the newest top section wins: the one in the checkout (backfilled through a pull request)
# or the one on the highest release tag.
set -euo pipefail

top_version() { # newest "## [vX.Y.Z]" heading of a changelog read on stdin, without the v
  grep -m1 -oE '^## \[v?[0-9]+\.[0-9]+\.[0-9]+' | sed -E 's/^## \[v?//' || true
}

best_version=""
best_source=""
if [[ -f CHANGELOG.md ]]; then
  best_version="$(top_version < CHANGELOG.md)"
  best_source="the checkout"
fi

for tag in $(git tag --list 'v[0-9]*' --sort=-v:refname); do
  git cat-file -e "${tag}:CHANGELOG.md" 2>/dev/null || continue
  version="$(git show "${tag}:CHANGELOG.md" | top_version)"
  [[ -n "$version" ]] || continue
  if [[ -z "$best_version" || "$(printf '%s\n%s\n' "$best_version" "$version" | sort -V | tail -1)" != "$best_version" ]]; then
    git show "${tag}:CHANGELOG.md" > CHANGELOG.md
    best_version="$version"
    best_source="tag ${tag}"
  fi
  break # tags are sorted newest first: the first one with a changelog is the newest
done

if [[ -n "$best_source" ]]; then
  echo "CHANGELOG.md: using ${best_source} (newest section ${best_version})"
else
  echo "CHANGELOG.md: none found, cog will create it"
fi
