# Picovoice Porcupine Wake-Word Model Setup: "Hello ForgeX"

This directory hosts the compiled WebAssembly (WASM) wake-word keyword model for the **ForgeX AI Industrial Voice Assistant**.

---

## 1. Step-by-Step Picovoice Model Generation

To generate the real industrial Web/WASM keyword model (`hello_forgex.ppn`):

1. **Access the Console**:
   - Open [Picovoice Console](https://console.picovoice.ai/).
   - Sign up or log into your enterprise account.

2. **Create New Porcupine Keyword**:
   - In the left navigation, select **Porcupine Wake Word**.
   - Click **Create Keyword Model**.

3. **Configure Wake Phrase**:
   - Phrase: `Hello ForgeX`
   - Language: `English` (Default)
   - Accent: `Standard / General American` (optimized for industrial field technicians)

4. **Select Target Platform**:
   - Choose: **Web (WASM)** / WebAssembly.
   - *Note*: Ensure you do not select Linux x86_64, iOS, or Android; Porcupine compiles platform-specific binary structures and WebAssembly requires the WASM target architecture.

5. **Set Sensitivity Parameter**:
   - Sensitivity: `0.65` (Recommended industrial standard).
   - Rationale: A sensitivity of `0.65` provides an optimal operational trade-off in noisy shop-floor environments (65–85 dBA ambient noise):
     - **False Acceptance Rate (FAR)**: < 0.01 false triggers per hour.
     - **False Rejection Rate (FRR)**: < 2.0% on valid technician utterances.

6. **Train & Download Model**:
   - Click **Train Keyword**.
   - When training completes, download the zip package.
   - Extract the `.ppn` file and rename it to `hello_forgex.ppn`.
   - Place the file at:
     ```
     apps/web/public/models/hello_forgex.ppn
     ```

---

## 2. AccessKey Configuration

Porcupine requires a valid Picovoice AccessKey to validate license tier and initialize the WebAssembly worker thread.

1. **Obtain your AccessKey**:
   - In the Picovoice Console dashboard, copy your **AccessKey**.

2. **Configure Web Frontend (`apps/web/.env`)**:
   ```env
   VITE_VOICE_WAKE_WORD_ENGINE=porcupine
   VITE_PICOVOICE_ACCESS_KEY=your_picovoice_access_key_here
   ```

3. **Configure Backend API (`apps/api/.env` & Root `.env`)**:
   ```env
   VOICE_WAKE_WORD_ENGINE=porcupine
   PICOVOICE_ACCESS_KEY=your_picovoice_access_key_here
   ```

---

## 3. Fail-Loud Behavior in Industrial Production

When `VOICE_WAKE_WORD_ENGINE=porcupine` is enabled:
- `wakeWordProvider.ts` strictly validates that `PICOVOICE_ACCESS_KEY` is set.
- If the AccessKey is missing or empty, the provider **FAILS LOUD** by throwing a descriptive `MissingPicovoiceAccessKeyError`.
- Silent degradation to uncalibrated browser speech recognition is **prohibited** under production porcupine mode to protect factory compliance and avoid unexpected speech latency.
- For air-gapped dev or browser-only testing without Picovoice credentials, explicitly set `VOICE_WAKE_WORD_ENGINE=browser` or `VOICE_WAKE_WORD_ENGINE=webaudio`.
