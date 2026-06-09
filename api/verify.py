import hmac
import hashlib
import struct
import time
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

TOTP_SECRET = os.environ.get('TOTP_SECRET', '6WITODDILRU5DOS6LNRDFHN6FEXF4X4O')


def base32_decode(encoded):
    """Decode base32 string to bytes."""
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    encoded = encoded.upper().rstrip('=')
    bits = ''
    for char in encoded:
        val = alphabet.index(char)
        bits += format(val, '05b')
    result = []
    for i in range(0, len(bits) - 7, 8):
        result.append(int(bits[i:i+8], 2))
    return bytes(result)


def generate_totp(secret, time_step=30, digits=6, counter_offset=0):
    """Generate TOTP code for given time."""
    key = base32_decode(secret)
    counter = int(time.time()) // time_step + counter_offset
    counter_bytes = struct.pack('>Q', counter)
    hmac_hash = hmac.new(key, counter_bytes, hashlib.sha1).digest()
    offset = hmac_hash[-1] & 0x0F
    code = struct.unpack('>I', hmac_hash[offset:offset+4])[0]
    code = (code & 0x7FFFFFFF) % (10 ** digits)
    return str(code).zfill(digits)


def verify_totp(secret, token, window=1):
    """Verify TOTP with time window tolerance."""
    for offset in range(-window, window + 1):
        if generate_totp(secret, counter_offset=offset) == token:
            return True
    return False


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Invalid JSON'}).encode())
            return

        username = data.get('username', '').strip()
        code = data.get('code', '').strip()

        if not username or not code:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing fields'}).encode())
            return

        # Get client IP
        ip = self.headers.get('x-forwarded-for', self.headers.get('x-real-ip', 'unknown'))
        if ',' in ip:
            ip = ip.split(',')[0].strip()

        valid = verify_totp(TOTP_SECRET, code)

        # Log the attempt
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
        status = 'SUCCESS' if valid else 'FAILED'
        print(f"[AUTH {status}] {timestamp} | User: {username} | IP: {ip}", file=sys.stderr)

        if valid:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'user': username}).encode())
        else:
            self.send_response(401)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': 'Invalid MFA code'}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
