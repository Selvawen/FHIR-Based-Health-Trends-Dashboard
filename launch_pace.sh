#!/usr/bin/env bash

# Exit on error
set -e

module load anaconda3

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONDA_ENV="health-insights"

source "$(conda info --base)/etc/profile.d/conda.sh"

if ! conda env list | awk '{print $1}' | grep -qx "$CONDA_ENV"; then
    echo ""
    echo "Conda environment '$CONDA_ENV' not found. Creating it..."

    conda create -n "$CONDA_ENV" python=3.10 -y

    echo "Activating environment and installing backend dependencies..."
    conda activate "$CONDA_ENV"

    if [ -f "$ROOT/back-end/requirements.txt" ]; then
        cd "$ROOT/back-end"
        pip install -r requirements.txt
    else
        echo "[WARNING] requirements.txt not found in back-end/"
    fi
else
    echo "Conda environment '$CONDA_ENV' found."
    conda activate "$CONDA_ENV"
fi

MONGO_VER="7.0.5"
MONGO_DIR="./mongodb"

# Download only if MongoDB is not already installed
MONGO_FILE="mongodb-linux-x86_64-rhel80-$MONGO_VER.tgz"

if [ ! -d "$MONGO_DIR" ]; then
    echo "Downloading MongoDB $MONGO_VER..."

    wget -q -O "$MONGO_FILE" \
        "https://fastdl.mongodb.org/linux/$MONGO_FILE"

    if [ ! -f "$MONGO_FILE" ]; then
        echo "[ERROR] MongoDB download failed"
        exit 1
    fi

    tar -xzf "$MONGO_FILE"
    mv "${MONGO_FILE%.tgz}" "$MONGO_DIR"
    rm "$MONGO_FILE"
fi

# Make sure binaries are in PATH for this session
export PATH="$PWD/mongodb/bin:$PATH"

# Create data/log dirs
mkdir -p ./data ./logs

# Start MongoDB in background
mongod --dbpath ./data \
       --logpath ./logs/mongod.log \
       --bind_ip 127.0.0.1 \
       --port 27017 \
       --fork

echo "MongoDB started locally at ./data"

echo "Starting back-end  ->  http://localhost:8000"
gnome-terminal -- bash -c "
    module load anaconda3
    source \"\$(conda info --base)/etc/profile.d/conda.sh\"
    conda activate $CONDA_ENV
    cd \"$ROOT/back-end\"
    uvicorn main:app --reload --port 8000
    exec bash
"

echo "Starting front-end ->  http://localhost:5173"
gnome-terminal -- bash -c "
    cd \"$ROOT/front-end\"

    if [ ! -d node_modules ]; then
        echo 'Installing npm dependencies...'
        if [ -f package-lock.json ]; then
            npm ci
        else
            npm install
        fi
    fi

    npm run dev
    exec bash
"

echo ""
echo "Both services starting in separate terminals."
echo "Close those terminals to stop the services."
echo ""