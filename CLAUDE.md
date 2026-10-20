# FreeCast

## Releases

Every release, every time:

- Bump `version` in `package.json` and `package-lock.json` (both places in the lock file), commit, push, open a PR and merge it.
- The GitHub Release for `v<version>` must carry **all three installers**: Apple Silicon Mac `FreeCast-<version>-arm64.dmg`, Intel Mac `FreeCast-<version>.dmg` and Windows `FreeCast-Setup-<version>.exe` (plus the `.zip` / `latest*.yml` files the auto-updater reads). `.github/workflows/release.yml` builds them and its `verify` job fails when one is missing.
- The workflow is started by hand (Actions → Release → Run workflow, branch `main`); the cloud session's token cannot dispatch it, so tell the user to run it.
- Installed copies update themselves from the release, so a release is only done when the three files are really there.
- Keep a local checkout in step with `main` (`git pull`); `npm run release` publishes the same three installers from a local machine.

## Checks

`npx tsc --noEmit -p .` and `npx vitest run` must pass before every push.
