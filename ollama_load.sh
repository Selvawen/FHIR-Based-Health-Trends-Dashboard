#!/bin/bash

# Clear existing modules to avoid conflicts
module purge
module load ollama

# Set directory where models will be stored (update if needed)
export OLLAMA_MODELS="/storage/ice-shared/vip-vp4/Fall2025/ollama-models"

echo "Starting Ollama server..."
nohup ollama serve > ollama.log 2>&1 &

# Wait until Ollama API is available
while ! curl -s http://localhost:11434/api/tags > /dev/null; do
  sleep 2
  echo "Waiting for Ollama to start..."
done

echo "Ollama is running. Pulling Mistral 13B model..."

# Pull the Mistral 13B model (as requested)
ollama pull mistral:13b

echo "Mistral 13B model downloaded successfully."