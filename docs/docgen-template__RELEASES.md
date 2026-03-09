# Release Notes — docgen-template
**Last Updated:** 2026-03-09

## [2026-03-09] — initial local commit
**Author:** James Horvath
**Branch:** main

### Changes
- Added `.github/workflows/docgen.yml` reusable workflow for auto-generating canonical docs and DEPS.yaml on push
- Added `scripts/bootstrap-all.sh` to bootstrap DocGen workflows across an organization via GitHub CLI
- Added `scripts/bootstrap-repo.sh` to bootstrap DocGen workflows on individual repositories via Git clone

### Files Changed
- `.github/workflows/docgen.yml`
- `scripts/bootstrap-all.sh`
- `scripts/bootstrap-repo.sh`

---