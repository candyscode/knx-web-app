#!/bin/bash
# KNX Web App - Global Installation Script

set -e

# Configuration
REPO_URL="https://github.com/candyscode/AI.git"
INSTALL_DIR="$HOME/.knx-web-app"
SERVICE_NAME="knx-web-app.service"
USER_NAME=$(whoami)

echo "==========================================================="
echo " KNX Web App - Automated Installer"
echo "==========================================================="
echo ""
echo "This script will perform the following actions:"
echo "  1. Check and install necessary system tools (git, curl, build-essential)"
echo "  2. Detect Node.js, and if missing, install the Node.js v20 LTS release."
echo "  3. Clone the KNX Web App repository into $INSTALL_DIR."
echo "     (If an existing installation is found, it will be updated safely while preserving your config.json)."
echo "  4. Build and install the Frontend and Backend dependencies."
echo "  5. Set up the application to run as a systemd background service."
echo "  6. Install global command-line utilities (knx-start, knx-stop, knx-log, etc.)."
echo ""

read -p "Press Enter to continue, or Ctrl+C to abort..." prompt

echo ""
echo "=> Checking system prerequisites..."

# Request sudo upfront
sudo -v
# Keep-alive: update existing `sudo` time stamp until script has finished
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

sudo apt-get update -y
sudo apt-get install -y git curl build-essential

# Node.js Check
echo "=> Checking Node.js..."
NODE_OK=0

if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    NODE_VERS=$(node -v | { grep -o -E '[0-9]+\.[0-9]+\.[0-9]+' || echo "0"; })
    NODE_MAJOR=$(echo "$NODE_VERS" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
        echo "Found Node.js v$NODE_VERS (compatible)"
        NODE_OK=1
    else
        echo "Found Node.js v$NODE_VERS, but version 20+ is required."
    fi
else
    echo "Node.js not found."
fi

if [ $NODE_OK -eq 0 ]; then
    echo "Installing/Upgrading to Node.js v20 LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Clone or Update Repo
echo "=> Setting up KNX Web App in $INSTALL_DIR..."
if [ -d "$INSTALL_DIR" ]; then
    echo "Existing installation found. Updating via git pull..."
    cd "$INSTALL_DIR"
    git fetch --all
    git reset --hard origin/main
else
    echo "Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

# Define the actual app path within the cloned repository
APP_DIR="$INSTALL_DIR/knx-web-app"

# Install Dependencies and Build
echo "=> Installing Frontend dependencies and building..."
cd "$APP_DIR/frontend"
npm ci || npm install
npm run build

echo "=> Installing Backend dependencies..."
cd "$APP_DIR/backend"
npm ci || npm install

# Set up Systemd Service
echo "=> Configuring Background Service (systemd)..."
NODE_BIN=$(which node)

sudo bash -c "cat > /etc/systemd/system/$SERVICE_NAME <<EOF
[Unit]
Description=KNX Web App Backend
After=network.target

[Service]
ExecStart=$NODE_BIN $APP_DIR/backend/server.js
WorkingDirectory=$APP_DIR/backend
Restart=always
User=$USER_NAME
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME

# Install CLI Commands
echo "=> Installing Global Commands..."

create_cli_command() {
    local cmd_name=$1
    local cmd_content=$2
    sudo bash -c "cat > /usr/local/bin/$cmd_name <<'EOF'
#!/bin/bash
$cmd_content
EOF"
    sudo chmod +x /usr/local/bin/$cmd_name
}

create_cli_command "knx-start"   "sudo systemctl start $SERVICE_NAME"
create_cli_command "knx-stop"    "sudo systemctl stop $SERVICE_NAME"
create_cli_command "knx-restart" "sudo systemctl restart $SERVICE_NAME"
create_cli_command "knx-log"     "sudo journalctl -u $SERVICE_NAME -f"
create_cli_command "knx-update"  "bash <(curl -fsSL https://raw.githubusercontent.com/candyscode/AI/main/knx-web-app/install.sh)"

# Uninstall command
sudo bash -c "cat > /usr/local/bin/knx-uninstall <<EOF
#!/bin/bash
echo \"Uninstalling KNX Web App...\"
read -p \"Are you sure you want to delete the app and all configurations? [y/N] \" prompt
if [[ \\\$prompt =~ ^[Yy]$ ]]; then
    sudo systemctl stop $SERVICE_NAME
    sudo systemctl disable $SERVICE_NAME
    sudo rm /etc/systemd/system/$SERVICE_NAME
    sudo systemctl daemon-reload
    rm -rf $INSTALL_DIR
    sudo rm /usr/local/bin/knx-start
    sudo rm /usr/local/bin/knx-stop
    sudo rm /usr/local/bin/knx-restart
    sudo rm /usr/local/bin/knx-log
    sudo rm /usr/local/bin/knx-update
    sudo rm /usr/local/bin/knx-uninstall
    echo \"Uninstallation complete.\"
else
    echo \"Uninstallation aborted.\"
fi
EOF"
sudo chmod +x /usr/local/bin/knx-uninstall

LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$LOCAL_IP" ] && LOCAL_IP="localhost"

echo "==========================================================="
echo " Installation Complete! "
echo "==========================================================="
echo "The KNX Web App is now running in the background."
echo ""
echo "Available CLI Commands:"
echo "  knx-start    - Start the app"
echo "  knx-stop     - Stop the app"
echo "  knx-restart  - Restart the app"
echo "  knx-log      - View live logs"
echo "  knx-update   - Update to the latest version from GitHub"
echo "  knx-uninstall - Remove the app completely"
echo ""
echo "You can access your dashboard safely at:"
echo "http://${LOCAL_IP}:3001"
echo "==========================================================="
