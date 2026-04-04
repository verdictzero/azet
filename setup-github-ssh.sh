#!/usr/bin/env bash
set -euo pipefail

USERNAME="verdictzero"
EMAIL="${1:-${USERNAME}@users.noreply.github.com}"
KEY_PATH="$HOME/.ssh/id_ed25519_github"

echo "=== GitHub SSH Setup for ${USERNAME} ==="

# Generate SSH key if it doesn't exist
if [ -f "$KEY_PATH" ]; then
    echo "SSH key already exists at ${KEY_PATH}, skipping generation."
else
    echo "Generating ED25519 SSH key..."
    ssh-keygen -t ed25519 -C "$EMAIL" -f "$KEY_PATH" -N ""
    echo "Key generated."
fi

# Start ssh-agent and add key
eval "$(ssh-agent -s)"
ssh-add "$KEY_PATH"

# Configure SSH for GitHub
SSH_CONFIG="$HOME/.ssh/config"
if grep -q "Host github.com" "$SSH_CONFIG" 2>/dev/null; then
    echo "GitHub SSH config already exists, skipping."
else
    echo "Adding GitHub config to ${SSH_CONFIG}..."
    mkdir -p "$HOME/.ssh"
    cat >> "$SSH_CONFIG" <<EOF

Host github.com
    HostName github.com
    User git
    IdentityFile ${KEY_PATH}
    IdentitiesOnly yes
EOF
    chmod 600 "$SSH_CONFIG"
    echo "SSH config updated."
fi

# Set git global user
git config --global user.name "$USERNAME"
echo "Git user.name set to ${USERNAME}"

if [ -n "$EMAIL" ]; then
    git config --global user.email "$EMAIL"
    echo "Git user.email set to ${EMAIL}"
fi

# Output public key
echo ""
echo "=== Add this public key to GitHub ==="
echo "Go to: https://github.com/settings/ssh/new"
echo ""
cat "${KEY_PATH}.pub"
echo ""

# Try gh CLI if available
if command -v gh &>/dev/null; then
    read -rp "Upload key to GitHub via gh CLI? [y/N] " answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
        gh ssh-key add "${KEY_PATH}.pub" --title "$(hostname)-$(date +%Y%m%d)"
        echo "Key uploaded to GitHub."
    fi
fi

# Test connection
echo ""
echo "Testing GitHub SSH connection..."
ssh -T git@github.com 2>&1 || true
echo ""
echo "Done!"
