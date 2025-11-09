#!/usr/bin/env bash

# Set dummy mode specs for the nested session
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1500x900

# Check if metadata.json exists
if [ ! -f metadata.json ]; then
    echo "Error: metadata.json not found"
    echo "Please run this script from your GNOME Shell extension's directory."
    exit 1
fi

# Extract the project name from metadata.json
PROJECT_NAME=$(cat metadata.json | jq -r '.name')

# Check if project name is empty
if [ -z "$PROJECT_NAME" ]; then
    echo "Error: metadata.json does not contain a name field"
    exit 1
fi

echo "Starting nested GNOME Shell session..."
echo "Filtering logs for: $PROJECT_NAME"
echo "Press Ctrl+C to stop the session."
echo

version_output=$(gnome-shell --version 2>/dev/null)
major_version=$(echo "$version_output" | awk '{print $3}' | cut -d. -f1)

filter_logs() {
    awk '
    /\['"$PROJECT_NAME"'\]/ {
        print
    }
    /^Extension/ {
        print
    }
    /^Stack trace:/ {
        print
        while (getline > 0) {
            if ($0 ~ /^[[:space:]]*$/) break
            print
        }
        print ""
    }
    /^JS ERROR:/ {
        print
        while (getline > 0) {
            if ($0 ~ /^[[:space:]]*$/) break
            print
        }
        print ""
    }'
}

if ((major_version >= 49)); then
    dbus-run-session -- gnome-shell --devkit --wayland 2>&1 | filter_logs
else
    dbus-run-session -- gnome-shell --nested --wayland 2>&1 | filter_logs
fi
