#!/usr/bin/env python3
"""Servidor local simples para o Intelligence Digest."""
import http.server
import webbrowser
import os

PORT = 8765
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silencia logs

print(f"Intelligence Digest rodando em http://localhost:{PORT}")
print("Pressione Ctrl+C para parar.\n")

webbrowser.open(f"http://localhost:{PORT}")
http.server.HTTPServer(("", PORT), Handler).serve_forever()
