#!/usr/bin/env bash
set -e

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hooks_dir="$repo_root/scripts/hooks"

chmod +x "$hooks_dir"/*
git -C "$repo_root" config core.hooksPath scripts/hooks

echo "Git hooks enabled (core.hooksPath=scripts/hooks)"
