###############################
# Multi-stage Dockerfile for DrawIo .NET 9 MVC sample (Alpine)
#
# Build:  docker build -t drawio-mvc .
# Run:    docker run --rm -p 8080:8080 drawio-mvc
#
# Optional build args:
#   --build-arg BUILD_CONFIGURATION=Release
###############################

ARG BUILD_CONFIGURATION=Release

# ---------------- Build stage ----------------
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
ARG BUILD_CONFIGURATION
WORKDIR /src

# Copy solution and project files first for better layer caching
COPY DrawIoExample.sln ./
COPY drawiomvc/drawiomvc.csproj drawiomvc/

# Restore dependencies
RUN dotnet restore DrawIoExample.sln

# Copy only required source (avoid sending docs, etc.)
COPY drawiomvc/ drawiomvc/
# Include test diagrams (remove if slimming)
# Include repository-level docs & metadata needed by runtime (served via /docs and /README.md endpoint)
COPY docs/ docs/
COPY README.md LICENSE* ./

# Publish (uses project path) -- ensure configuration arg is applied correctly
RUN dotnet publish drawiomvc/drawiomvc.csproj \
    --configuration ${BUILD_CONFIGURATION:-Release} \
    --output /app/publish \
    /p:UseAppHost=false

# ---------------- Runtime stage ----------------
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS final
WORKDIR /app

# Non-root user (optional hardening) - use existing ASP.NET user (UID 64198 as of .NET 9 images) or create one.
# The official image already defines a non-root user 'app'. We'll switch to it after copy.

ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

EXPOSE 8080

# Copy published output
COPY --from=build /app/publish .

# Copy docs to expected parent location (/docs) so Program.cs mapping (.. /docs) resolves
COPY docs/ /docs/
# Ensure README & LICENSE available at content root fallback
COPY README.md LICENSE* ./

# Ensure diagram storage directory is writable for non-root user
USER root
RUN mkdir -p /app/wwwroot/testDiagrams \
    && chown -R app:app /app/wwwroot/testDiagrams
USER app

# Healthcheck (basic) - adjust path if you add a dedicated health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ || exit 1

ENTRYPOINT ["dotnet", "drawiomvc.dll"]
