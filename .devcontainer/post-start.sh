#!/usr/bin/env bash
set -euo pipefail

workspace_dir="${1:?workspace dir is required}"
bashrc="${HOME}/.bashrc"

touch "${bashrc}"

if ! grep -q "project.justfile" "${bashrc}"; then
  cat >> "${bashrc}" <<EOF

just() {
  command just --justfile ${workspace_dir}/.devcontainer/justfile --working-directory ${workspace_dir} "\$@"
}
EOF
fi

command just --justfile ${workspace_dir}/.devcontainer/justfile --working-directory "${workspace_dir}" start
