#!/bin/sh -e
base_name=transactions
collapse_name=collapsed
script_dir="$(dirname "$(realpath "$0")")"
repo_root_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
generator_script="$script_dir/generate-dot.ts"

make_dot() {
    [ "$1" = collapsed ] && collapsed='collapsed' && shift
    dot_path="$1.dot"
    npx ts-node "$script_dir/generate-dot.ts" $collapsed > "$dot_path"
    [ $? -ne 0 ] && echo "Failed to generate $dot_path" && exit 1
    echo "Generated $dot_path"
}

make_svg() {
    dot_path="$1.dot"
    svg_path="$1.svg"
    dot -Tsvg -o "$svg_path" "$dot_path"
    [ $? -ne 0 ] && echo "Failed to generate $svg_path from $dot_path" && exit 1
    echo "Generated $svg_path from $dot_path"
}

base_path="$script_dir/$base_name"
base_collapsed_path="$script_dir/$base_name.$collapse_name"

cd "$repo_root_dir"
make_dot "$base_path"
make_dot collapsed "$base_collapsed_path"
if ! type dot >/dev/null; then
  echo "Can not find dot executable - will not generate svg files"
  exit 0
fi
make_svg "$base_path"
make_svg "$base_collapsed_path"
exit 0
