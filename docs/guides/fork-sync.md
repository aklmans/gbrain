# Safe Fork Sync

This fork carries local provider-compatibility changes on top of the official
GBrain repository. Use the fork sync script to pull upstream changes without
merging directly into `master`.

## Quick Start

```bash
bun run fork:sync-upstream
```

For a full validation run and a pushed sync branch:

```bash
bun run fork:sync-upstream -- --full-test --push
```

## What The Script Does

`scripts/sync-upstream-fork.sh` is intentionally conservative:

- Refuses to run unless the working tree is clean.
- Fetches `upstream/master` and `origin/master`.
- Creates `backup/before-upstream-<timestamp>` from your base branch.
- Creates `codex/sync-upstream-<timestamp>` from your base branch.
- Merges `upstream/master` into the sync branch.
- Runs `bun install --frozen-lockfile` when package metadata changed.
- Regenerates `llms.txt` and `llms-full.txt` using your fork URL when possible.
- Runs quick provider-compatibility checks by default.
- Commits the merge result on the sync branch.
- Returns to the branch you started from.

The base branch is never modified by the script. Review and merge the generated
sync branch only after the checks pass and the diff looks right.

## Conflict Handling

If upstream conflicts with the fork changes, the script aborts the merge and
returns to the branch you started from. Your base branch remains unchanged.

To keep the conflicted sync branch for manual repair:

```bash
bun run fork:sync-upstream -- --keep-conflict
```

After resolving conflicts:

```bash
git add <resolved-files>
git commit -m "merge: sync upstream master"
```

## Useful Options

```bash
# Run the full repository test suite.
bun run fork:sync-upstream -- --full-test

# Push the generated sync branch to origin.
bun run fork:sync-upstream -- --push

# Use a custom base branch.
bun run fork:sync-upstream -- --base master

# Stay on the generated sync branch after success.
bun run fork:sync-upstream -- --stay

# Override checks for a faster local pass.
bun run fork:sync-upstream -- --check-cmd "bun run typecheck"
```

## Environment Overrides

```bash
GBRAIN_SYNC_BASE_BRANCH=master
GBRAIN_SYNC_UPSTREAM_REMOTE=upstream
GBRAIN_SYNC_UPSTREAM_BRANCH=master
GBRAIN_SYNC_ORIGIN_REMOTE=origin
GBRAIN_SYNC_QUICK_CHECK_CMD="bun run typecheck"
GBRAIN_SYNC_FULL_TEST_CMD="bun run test"
LLMS_REPO_BASE=https://raw.githubusercontent.com/aklmans/gbrain/master
```

Set `LLMS_REPO_BASE` yourself if the origin remote is not a GitHub URL or if you
publish from a branch other than `master`.
