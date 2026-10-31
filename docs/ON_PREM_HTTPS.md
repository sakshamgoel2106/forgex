# ForgeX AI — On-Premise HTTPS & TLS Deployment Guide

In Enterprise Air-Gapped and on-premise plant deployments, **HTTPS is mandatory** for mission-critical technician field workflows.

---

## 1. Why HTTPS Is Mandatory for Mobile & Field Operation

Modern web browsers enforce the **W3C Secure Context Specification** for all hardware capabilities and offline storage APIs. Running over unencrypted HTTP (e.g., `http://192.168.1.100:4000` or `http://plant-server.local`) will cause browsers to intentionally block:

1. **Service Workers & PWA Installation**:
   - `navigator.serviceWorker.register()` is disabled on insecure origins.
   - Without HTTPS, mobile tablets and phones cannot install ForgeX as a standalone PWA or cache offline technical manuals.
2. **Camera Hardware (`getUserMedia({ video: true })`)**:
   - Machine QR tag scanning and camera capture for **Vision-Guided Lockout/Tagout (LOTO)** will fail with `SecurityError: Only secure origins are allowed`.
3. **Microphone Hardware (`getUserMedia({ audio: true })`)**:
   - The Voice Copilot, offline voice wake-word engine, and audio recordings require secure context permissions.
4. **Haptic Feedback & Sensor APIs**:
   - Device vibration feedback (`navigator.vibrate`) on safety verification requires HTTPS.

---

## 2. Setting Up On-Premise TLS Certificates

You can choose one of three supported methods depending on your plant infrastructure:

### Method A: Fast Local Testing with `mkcert` (Recommended for Labs)

`mkcert` creates a locally trusted Certificate Authority (CA) on your plant workstation and generates valid certificates for your local IP and hostname without requiring internet access.

```bash
# 1. Install mkcert (Windows: choco install mkcert / Linux: apt install libnss3-tools; brew install mkcert)
mkcert -install

# 2. Create the certificate directory
mkdir -p deploy/certs

# 3. Generate certificate for your plant server IP and hostnames
mkcert -cert-file deploy/certs/forgex.crt -key-file deploy/certs/forgex.key \
  forgex.plant.internal plant-server.local 192.168.1.100 localhost 127.0.0.1

# 4. Install root CA on technician mobile tablets (Android/iOS):
# Find your root CA path:
mkcert -CAROOT
# Transfer "rootCA.pem" to your Android / iPad devices:
# - Android: Settings -> Security -> Install from storage -> CA certificate
# - iOS: AirDrop / Email rootCA.pem -> Settings -> General -> VPN & Device Management -> Certificate Trust Settings
```

---

### Method B: Corporate Enterprise PKI / Active Directory CA

For production enterprise plants with existing Active Directory Certificate Services (AD CS) or HashiCorp Vault:

1. Submit a Certificate Signing Request (CSR) with Subject Alternative Names (SANs) for all plant gateway IPs and DNS names:
   ```bash
   openssl req -new -newkey rsa:4096 -nodes \
     -keyout deploy/certs/forgex.key \
     -out deploy/certs/forgex.csr \
     -subj "/C=US/ST=Texas/O=Industrial/CN=forgex.plant.internal" \
     -addext "subjectAltName=DNS:forgex.plant.internal,DNS:plant-server.local,IP:192.168.1.100"
   ```
2. Have your IT security team sign the CSR with the internal corporate CA.
3. Save the resulting certificate chain to `deploy/certs/forgex.crt`. Because corporate devices already trust the corporate root CA, zero manual device certificate installation is needed.

---

### Method C: Automatic Internal CA with Caddy

If using Caddy as the reverse proxy, Caddy can automatically manage an internal CA without any manual OpenSSL commands:

1. Start Caddy with the provided configuration:
   ```bash
   caddy run --config deploy/caddy/Caddyfile
   ```
2. Caddy automatically issues certificates using its embedded local CA (`tls internal`).
3. Download the root CA certificate from Caddy's data directory and install it on field devices.

---

## 3. Running with Nginx TLS Reverse Proxy

A production-ready Nginx configuration is provided at `deploy/nginx/nginx-tls.conf`.

1. Mount your certificates into the Nginx container:
   ```yaml
   # docker-compose.enterprise.yml snippet:
   reverse-proxy:
     image: nginx:alpine
     ports:
       - "80:80"
       - "443:443"
     volumes:
       - ./deploy/nginx/nginx-tls.conf:/etc/nginx/nginx.conf:ro
       - ./deploy/certs:/etc/nginx/certs:ro
     depends_on:
       - api
   ```
2. Start the stack:
   ```bash
   docker compose -f docker-compose.enterprise.yml up -d
   ```
3. Open `https://forgex.plant.internal` (or `https://192.168.1.100`) on technician mobile tablets. All camera, microphone, and service worker capabilities will now function seamlessly.

---

## 4. Single-Origin Mode (`SERVE_WEB=true`)

In on-premise environments, running the frontend and backend under a single port eliminates CORS configuration and simplifies TLS termination:

1. Set `SERVE_WEB=true` in `apps/api/.env` or in `docker-compose.enterprise.yml`.
2. Ensure the production web bundle is built:
   ```bash
   npm --prefix apps/web run build
   ```
3. Start the API server:
   ```bash
   npm --prefix apps/api run start
   ```
4. Access `https://192.168.1.100:4000/`. The API serves both the SPA frontend and all `/api/*` endpoints from the same origin, enabling immediate offline PWA installation with zero external egress.
