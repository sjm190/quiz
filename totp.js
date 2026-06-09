// TOTP Implementation (RFC 6238) - Pure JavaScript
// Compatible with Google Authenticator, Authy, Microsoft Authenticator

const TOTP = (() => {
    // Base32 decode
    function base32Decode(encoded) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        for (let i = 0; i < encoded.length; i++) {
            const val = alphabet.indexOf(encoded.charAt(i).toUpperCase());
            if (val === -1) continue;
            bits += val.toString(2).padStart(5, '0');
        }
        const bytes = new Uint8Array(Math.floor(bits.length / 8));
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
        }
        return bytes;
    }

    // HMAC-SHA1
    async function hmacSha1(key, message) {
        const cryptoKey = await crypto.subtle.importKey(
            'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', cryptoKey, message);
        return new Uint8Array(sig);
    }

    // Generate TOTP
    async function generate(secret, timeStep = 30, digits = 6) {
        const key = base32Decode(secret);
        const epoch = Math.floor(Date.now() / 1000);
        const counter = Math.floor(epoch / timeStep);

        // Counter to 8-byte big-endian
        const counterBytes = new Uint8Array(8);
        let temp = counter;
        for (let i = 7; i >= 0; i--) {
            counterBytes[i] = temp & 0xff;
            temp = Math.floor(temp / 256);
        }

        const hmac = await hmacSha1(key, counterBytes);
        const offset = hmac[hmac.length - 1] & 0x0f;
        const code = (
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff)
        ) % Math.pow(10, digits);

        return code.toString().padStart(digits, '0');
    }

    // Verify TOTP with time window tolerance (±1 step)
    async function verify(secret, token, window = 1) {
        for (let i = -window; i <= window; i++) {
            const key = base32Decode(secret);
            const epoch = Math.floor(Date.now() / 1000);
            const counter = Math.floor(epoch / 30) + i;

            const counterBytes = new Uint8Array(8);
            let temp = counter;
            for (let j = 7; j >= 0; j--) {
                counterBytes[j] = temp & 0xff;
                temp = Math.floor(temp / 256);
            }

            const hmac = await hmacSha1(key, counterBytes);
            const offset = hmac[hmac.length - 1] & 0x0f;
            const code = (
                ((hmac[offset] & 0x7f) << 24) |
                ((hmac[offset + 1] & 0xff) << 16) |
                ((hmac[offset + 2] & 0xff) << 8) |
                (hmac[offset + 3] & 0xff)
            ) % 1000000;

            if (code.toString().padStart(6, '0') === token) {
                return true;
            }
        }
        return false;
    }

    return { generate, verify };
})();
