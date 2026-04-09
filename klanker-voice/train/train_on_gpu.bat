@echo off
echo ================================================
echo   Klanker Wake Word Trainer
echo   This will train a "Hey Klanker" wake word model
echo   using your NVIDIA GPU. Takes ~45-60 minutes.
echo ================================================
echo.

:: Check Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running.
    echo Please start Docker Desktop and make sure GPU support is enabled:
    echo   Docker Desktop ^> Settings ^> General ^> "Use the WSL 2 based engine"
    echo   Docker Desktop ^> Settings ^> Resources ^> WSL Integration ^> Enable
    pause
    exit /b 1
)

:: Check NVIDIA GPU is available to Docker
docker run --rm --gpus all nvidia/cuda:12.1.1-base-ubuntu22.04 nvidia-smi >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker cannot access your NVIDIA GPU.
    echo Install the NVIDIA Container Toolkit:
    echo   https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
    echo.
    echo Also make sure Docker Desktop has "Use the WSL 2 based engine" enabled.
    pause
    exit /b 1
)

echo [OK] Docker is running with GPU access
echo.

:: Create working directory
if not exist "klanker-train" mkdir klanker-train
cd klanker-train

:: Clone the trainer if not already present
if not exist "openwakeword-training" (
    echo Cloning trainer repository...
    git clone https://github.com/CoreWorxLab/openwakeword-training.git
)
cd openwakeword-training

:: Build the trainer image (GPU version - uses original Dockerfile)
echo.
echo [1/4] Building trainer Docker image (first time takes ~5 min)...
docker compose build trainer
if errorlevel 1 (
    echo ERROR: Failed to build trainer image.
    pause
    exit /b 1
)

:: Download training data
echo.
echo [2/4] Downloading training data (~17GB, first time only)...
docker compose run --rm trainer ./setup-data.sh
if errorlevel 1 (
    echo ERROR: Failed to download training data.
    pause
    exit /b 1
)

:: Train the model
echo.
echo [3/4] Training "Hey Klanker" model (this takes ~45-60 min with GPU)...
docker compose run --rm trainer python train.py --wake-word "hey klanker" --samples-per-voice 200 --training-steps 50000 --layer-size 32 --data-dir /app/data
if errorlevel 1 (
    echo ERROR: Training failed.
    pause
    exit /b 1
)

:: Copy model out
echo.
echo [4/4] Done!
echo.
echo ================================================
echo   Model saved to:
echo   klanker-train\openwakeword-training\my_custom_model\hey_klanker.onnx
echo.
echo   Send this file to your boyfriend :)
echo ================================================
echo.

:: Open the folder
explorer my_custom_model

pause
