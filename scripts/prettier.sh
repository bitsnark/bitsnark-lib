#!/bin/sh
prettier_flag="$([ "$1" = "--fix" ] && echo "--write" || echo "--check")"
script_dir="$(dirname "$(realpath "$0")")"
repo_root_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
dirs="src tests analysis"
(for dir in $dirs; do
    find "$repo_root_dir/$dir" -type f -name '*.ts'
done) | xargs npx prettier $prettier_flag
