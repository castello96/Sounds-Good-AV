#!/bin/bash

# Define the default port and directory
PORT=8000
DIRECTORY=$(pwd)

# Check if a custom port is provided as an argument
if [ $# -eq 1 ]; then
    PORT=$1
fi

echo "Starting Python HTTP server..."
echo "Serving directory: $DIRECTORY"
echo "Access the server at: http://localhost:$PORT"

# Start the Python HTTP server
if command -v python3 &>/dev/null; then
    python3 -m http.server "$PORT"
elif command -v python &>/dev/null; then
    python -m SimpleHTTPServer "$PORT"
else
    echo "Python is not installed. Please install Python to use this script."
    exit 1
fi
