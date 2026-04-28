#!/usr/bin/env bash
# Safely sync this fork with the official upstream repository.
#
# The script never merges upstream directly into the base branch. It creates a
# backup branch and a fresh sync branch, performs the merge there, runs checks,
# and optionally pushes the sync branch to origin.

set -euo pipefail

BASE_BRANCH="${GBRAIN_SYNC_BASE_BRANCH:-master}"
UPSTREAM_REMOTE="${GBRAIN_SYNC_UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${GBRAIN_SYNC_UPSTREAM_BRANCH:-master}"
ORIGIN_REMOTE="${GBRAIN_SYNC_ORIGIN_REMOTE:-origin}"
SYNC_BRANCH=""
BACKUP_BRANCH=""
PUSH=0
FULL_TEST=0
RUN_CHECKS=1
SKIP_INSTALL=0
SKIP_LLMS=0
KEEP_CONFLICT=0
RETURN_TO_START=1
CUSTOM_CHECK_CMD="${GBRAIN_SYNC_CHECK_CMD:-}"

QUICK_CHECK_CMD="${GBRAIN_SYNC_QUICK_CHECK_CMD:-bun run typecheck && bun test test/provider-config.test.ts test/embedding-provider-config.test.ts test/query-expansion-provider-config.test.ts test/subagent-provider-config.test.ts test/transcription-provider-config.test.ts test/provider-gate-regression.test.ts --timeout=60000}"
FULL_TEST_CMD="${GBRAIN_SYNC_FULL_TEST_CMD:-bun run test}"

usage() {
  cat <<'USAGE'
Usage: scripts/sync-upstream-fork.sh [options]

Safely sync a personal fork with the official upstream repository.

Default behavior:
  - require a clean working tree
  - fetch upstream and origin
  - create backup/before-upstream-<timestamp> from the base branch
  - create codex/sync-upstream-<timestamp> from the base branch
  - merge upstream/master into the sync branch
  - run bun install when package metadata changed
  - regenerate llms.txt / llms-full.txt when build:llms exists
  - run quick provider-compatibility checks
  - commit the merge result
  - return to the branch you started from

Options:
  --base <branch>              Local branch with your adaptations (default: master)
  --upstream <remote>          Upstream remote name (default: upstream)
  --upstream-branch <branch>   Upstream branch name (default: master)
  --origin <remote>            Fork remote name for optional push (default: origin)
  --branch <branch>            Sync branch name to create
  --backup <branch>            Backup branch name to create
  --push                       Push the sync branch to origin
  --full-test                  Run bun run test instead of the quick checks
  --check-cmd <command>        Override the check command
  --skip-checks                Do not run tests/checks
  --skip-install               Do not run bun install after package changes
  --skip-llms                  Do not regenerate llms.txt / llms-full.txt
  --keep-conflict              Leave conflicts in the sync branch for manual repair
  --stay                       Stay on the sync branch when finished
  -h, --help                   Show this help

Environment overrides:
  GBRAIN_SYNC_BASE_BRANCH
  GBRAIN_SYNC_UPSTREAM_REMOTE
  GBRAIN_SYNC_UPSTREAM_BRANCH
  GBRAIN_SYNC_ORIGIN_REMOTE
  GBRAIN_SYNC_QUICK_CHECK_CMD
  GBRAIN_SYNC_FULL_TEST_CMD
  GBRAIN_SYNC_CHECK_CMD
  LLMS_REPO_BASE
USAGE
}

log() {
  printf '[sync-upstream] %s\n' "$*"
}

die() {
  printf '[sync-upstream] ERROR: %s\n' "$*" >&2
  exit 1
}

run() {
  log "+ $*"
  "$@"
}

run_shell() {
  log "+ $1"
  bash -lc "$1"
}

branch_exists() {
  git rev-parse --verify --quiet "refs/heads/$1" >/dev/null
}

restore_start_branch() {
  if [ "$RETURN_TO_START" -ne 1 ]; then
    return 0
  fi

  if [ -n "$START_BRANCH" ]; then
    run git switch "$START_BRANCH"
  else
    run git switch --detach "$START_SHA"
  fi
}

infer_llms_repo_base() {
  local remote_url slug
  remote_url="$(git remote get-url "$ORIGIN_REMOTE" 2>/dev/null || true)"
  [ -n "$remote_url" ] || return 1

  case "$remote_url" in
    git@github.com:*)
      slug="${remote_url#git@github.com:}"
      ;;
    ssh://git@github.com/*)
      slug="${remote_url#ssh://git@github.com/}"
      ;;
    https://github.com/*)
      slug="${remote_url#https://github.com/}"
      ;;
    http://github.com/*)
      slug="${remote_url#http://github.com/}"
      ;;
    *)
      return 1
      ;;
  esac

  slug="${slug%.git}"
  [ -n "$slug" ] || return 1
  printf 'https://raw.githubusercontent.com/%s/%s\n' "$slug" "$BASE_BRANCH"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      BASE_BRANCH="${2:-}"
      [ -n "$BASE_BRANCH" ] || die "--base requires a branch name"
      shift 2
      ;;
    --upstream)
      UPSTREAM_REMOTE="${2:-}"
      [ -n "$UPSTREAM_REMOTE" ] || die "--upstream requires a remote name"
      shift 2
      ;;
    --upstream-branch)
      UPSTREAM_BRANCH="${2:-}"
      [ -n "$UPSTREAM_BRANCH" ] || die "--upstream-branch requires a branch name"
      shift 2
      ;;
    --origin)
      ORIGIN_REMOTE="${2:-}"
      [ -n "$ORIGIN_REMOTE" ] || die "--origin requires a remote name"
      shift 2
      ;;
    --branch)
      SYNC_BRANCH="${2:-}"
      [ -n "$SYNC_BRANCH" ] || die "--branch requires a branch name"
      shift 2
      ;;
    --backup)
      BACKUP_BRANCH="${2:-}"
      [ -n "$BACKUP_BRANCH" ] || die "--backup requires a branch name"
      shift 2
      ;;
    --push)
      PUSH=1
      shift
      ;;
    --full-test)
      FULL_TEST=1
      shift
      ;;
    --check-cmd)
      CUSTOM_CHECK_CMD="${2:-}"
      [ -n "$CUSTOM_CHECK_CMD" ] || die "--check-cmd requires a command"
      shift 2
      ;;
    --skip-checks)
      RUN_CHECKS=0
      shift
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --skip-llms)
      SKIP_LLMS=1
      shift
      ;;
    --keep-conflict)
      KEEP_CONFLICT=1
      shift
      ;;
    --stay)
      RETURN_TO_START=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$REPO_ROOT" ] || die "not inside a git repository"
cd "$REPO_ROOT"

START_BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
START_SHA="$(git rev-parse HEAD)"

if [ -n "$(git status --porcelain=v1)" ]; then
  die "working tree is not clean; commit, stash, or discard local changes before syncing"
fi

git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1 || die "missing remote '$UPSTREAM_REMOTE'"
git rev-parse --verify --quiet "refs/heads/$BASE_BRANCH" >/dev/null || die "missing local base branch '$BASE_BRANCH'"

TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
SYNC_BRANCH="${SYNC_BRANCH:-codex/sync-upstream-$TIMESTAMP}"
BACKUP_BRANCH="${BACKUP_BRANCH:-backup/before-upstream-$TIMESTAMP}"
UPSTREAM_REF="$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

branch_exists "$SYNC_BRANCH" && die "sync branch already exists: $SYNC_BRANCH"
branch_exists "$BACKUP_BRANCH" && die "backup branch already exists: $BACKUP_BRANCH"

log "repo: $REPO_ROOT"
log "base: $BASE_BRANCH"
log "upstream: $UPSTREAM_REF"
log "sync branch: $SYNC_BRANCH"
log "backup branch: $BACKUP_BRANCH"

run git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH:refs/remotes/$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
if git remote get-url "$ORIGIN_REMOTE" >/dev/null 2>&1; then
  log "+ git fetch $ORIGIN_REMOTE $BASE_BRANCH:refs/remotes/$ORIGIN_REMOTE/$BASE_BRANCH"
  if ! git fetch "$ORIGIN_REMOTE" "$BASE_BRANCH:refs/remotes/$ORIGIN_REMOTE/$BASE_BRANCH"; then
    log "warning: could not fetch $ORIGIN_REMOTE/$BASE_BRANCH; continuing with local $BASE_BRANCH"
  fi
fi

run git branch "$BACKUP_BRANCH" "$BASE_BRANCH"
run git switch -c "$SYNC_BRANCH" "$BASE_BRANCH"

if git merge-base --is-ancestor "$UPSTREAM_REF" HEAD; then
  log "$BASE_BRANCH already contains $UPSTREAM_REF; no merge needed"
  restore_start_branch
  exit 0
fi

set +e
git merge --no-ff --no-commit "$UPSTREAM_REF"
MERGE_STATUS=$?
set -e

if [ "$MERGE_STATUS" -ne 0 ]; then
  log "merge produced conflicts on $SYNC_BRANCH"
  if [ "$KEEP_CONFLICT" -eq 1 ]; then
    log "conflicts left in place because --keep-conflict was set"
    log "resolve them, then run: git commit -m 'merge: sync upstream $UPSTREAM_BRANCH'"
    exit "$MERGE_STATUS"
  fi

  run git merge --abort
  restore_start_branch
  log "merge aborted; $BASE_BRANCH was not changed"
  log "rerun with --keep-conflict when you want to resolve conflicts manually"
  exit "$MERGE_STATUS"
fi

if [ "$SKIP_INSTALL" -eq 0 ] && git diff --cached --name-only | grep -Eq '^(package.json|bun.lock)$'; then
  run bun install --frozen-lockfile
fi

if [ "$SKIP_LLMS" -eq 0 ] && grep -q '"build:llms"' package.json 2>/dev/null; then
  if [ -z "${LLMS_REPO_BASE:-}" ]; then
    INFERRED_LLMS_REPO_BASE="$(infer_llms_repo_base || true)"
    if [ -n "$INFERRED_LLMS_REPO_BASE" ]; then
      export LLMS_REPO_BASE="$INFERRED_LLMS_REPO_BASE"
      log "LLMS_REPO_BASE inferred as $LLMS_REPO_BASE"
    fi
  fi
  run bun run build:llms
  git add llms.txt llms-full.txt 2>/dev/null || true
fi

if [ "$RUN_CHECKS" -eq 1 ]; then
  CHECK_CMD="$QUICK_CHECK_CMD"
  if [ "$FULL_TEST" -eq 1 ]; then
    CHECK_CMD="$FULL_TEST_CMD"
  fi
  if [ -n "$CUSTOM_CHECK_CMD" ]; then
    CHECK_CMD="$CUSTOM_CHECK_CMD"
  fi
  run_shell "$CHECK_CMD"
fi

if git diff --cached --quiet; then
  log "nothing staged after merge; no commit created"
else
  run git commit -m "merge: sync upstream $UPSTREAM_BRANCH"
fi

if [ "$PUSH" -eq 1 ]; then
  run git push -u "$ORIGIN_REMOTE" "$SYNC_BRANCH"
fi

log "sync branch ready: $SYNC_BRANCH"
log "backup branch: $BACKUP_BRANCH"
restore_start_branch
