#!/bin/sh
graph_filename='full-transactions-flow'
script_dir="$(dirname "$(realpath "$0")")"
repo_root_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
dot_file_path="$script_dir/$graph_filename.dot"
svg_file_path="$script_dir/$graph_filename.svg"
cd "$repo_root_dir"
npx ts-node "$script_dir/generate-dot.ts" > "$dot_file_path"
echo "Generated $dot_file_path"
type dot 2>&1 >/dev/null && dot -Tsvg -o "$svg_file_path" "$dot_file_path"
[ "$?" -eq 0 ] && echo -n Generated || echo -n Failed to generate
echo " $svg_file_path"
exit 0
