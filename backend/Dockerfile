FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose ports
EXPOSE 8000
EXPOSE 5678

# Run the application with debugpy
# debugpy でリモートデバッグを有効化（デバッガーが接続されなくても通常通り起動）
# --timeout-keep-alive 300: 長時間実行されるリクエスト（データインポートなど）に対応
CMD ["python", "-m", "debugpy", "--listen", "0.0.0.0:5678", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--timeout-keep-alive", "300"]
