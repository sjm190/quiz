import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler

KV_REST_API_URL = os.environ.get('KV_REST_API_URL', '')
KV_REST_API_TOKEN = os.environ.get('KV_REST_API_TOKEN', '')


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not KV_REST_API_URL or not KV_REST_API_TOKEN:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'KV not configured'}).encode())
            return

        try:
            # Get last 50 log entries
            url = f"{KV_REST_API_URL}/lrange/auth_logs/0/49"
            req = urllib.request.Request(url, method='GET')
            req.add_header('Authorization', f'Bearer {KV_REST_API_TOKEN}')
            response = urllib.request.urlopen(req, timeout=5)
            data = json.loads(response.read().decode())

            logs = []
            for entry in data.get('result', []):
                try:
                    logs.append(json.loads(entry))
                except (json.JSONDecodeError, TypeError):
                    logs.append({'raw': entry})

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'logs': logs, 'count': len(logs)}).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
