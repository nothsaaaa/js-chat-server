import sys
import asyncio
import json
from datetime import datetime

from PyQt6.QtWidgets import (
    QApplication, QWidget, QMessageBox, QInputDialog
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6 import uic
import websockets

SERVERS_FILE = "servers.json"

class ChatClient(QWidget):
    def __init__(self):
        super().__init__()
        uic.loadUi("ui.ui", self)

        self.setWindowTitle("Chat Client")

        self.servers = self.load_servers()
        if not self.servers:
            self.servers = ["ws://147.185.221.28:61429"]

        self.server_combo.addItems(self.servers)

        self.websocket = None
        self.keep_running = False
        self.username = None

        self.msg_input.setEnabled(False)
        self.send_btn.setEnabled(False)

        self.msg_input.returnPressed.connect(self.send_message)
        self.send_btn.clicked.connect(self.send_message)
        self.add_btn.clicked.connect(self.add_server)
        self.rem_btn.clicked.connect(self.remove_server)
        self.connect_btn.clicked.connect(self.connect_to_selected_server)

        self.event_loop = asyncio.new_event_loop()
        self.timer = QTimer()
        self.timer.timeout.connect(self.process_asyncio_events)
        self.timer.start(50)

        self.show()

    def load_servers(self):
        try:
            with open(SERVERS_FILE, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except:
            pass
        return []

    def save_servers(self):
        try:
            with open(SERVERS_FILE, "w") as f:
                json.dump(self.servers, f, indent=2)
        except Exception as e:
            print("Save servers error:", e)

    def add_server(self):
        url, ok = QInputDialog.getText(self, "Add Server", "WebSocket URL (e.g. ws://host:port):")
        if ok and url and url not in self.servers:
            self.servers.append(url)
            self.server_combo.addItem(url)
            self.save_servers()

    def remove_server(self):
        idx = self.server_combo.currentIndex()
        if idx >= 0:
            self.servers.pop(idx)
            self.server_combo.removeItem(idx)
            self.save_servers()

    def connect_to_selected_server(self):
        url = self.server_combo.currentText()
        if not url:
            QMessageBox.warning(self, "Warning", "Select or add a server first.")
            return

        username, ok = QInputDialog.getText(self, "Username", "Enter your username (optional):")
        if not ok:
            return

        self.username = username

        self.disconnect()
        self.keep_running = True
        self.msg_input.setEnabled(False)
        self.send_btn.setEnabled(False)
        self.append_chat(f"Connecting to {url} as {self.username or 'anonymous'}...")
        self.update_status("Connecting...")
        asyncio.run_coroutine_threadsafe(self.ws_handler(url), self.event_loop)

    def disconnect(self):
        self.keep_running = False
        if self.websocket:
            asyncio.run_coroutine_threadsafe(self.websocket.close(), self.event_loop)
        self.websocket = None
        self.msg_input.setEnabled(False)
        self.send_btn.setEnabled(False)
        self.update_status("Disconnected")

    async def ws_handler(self, url):
        try:
            if self.username:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}username={self.username}"
            async with websockets.connect(url) as ws:
                self.websocket = ws
                self.update_status(f"Connected to {url}")
                self.msg_input.setEnabled(True)
                self.send_btn.setEnabled(True)

                await ws.send(json.dumps({"type": "message", "content": "/list"}))

                ping_task = asyncio.create_task(self.ping_loop(ws))

                async for message in ws:
                    self.handle_message(message)
                    if not self.keep_running:
                        break

                ping_task.cancel()
        except Exception as e:
            self.append_chat(f"[Error] Connection failed: {e}")
            self.update_status("Disconnected")
            self.msg_input.setEnabled(False)
            self.send_btn.setEnabled(False)
        finally:
            self.websocket = None
            self.update_status("Disconnected")
            self.msg_input.setEnabled(False)
            self.send_btn.setEnabled(False)

    async def ping_loop(self, ws):
        while self.keep_running:
            try:
                await ws.send(json.dumps({"type": "ping"}))
            except:
                break
            await asyncio.sleep(25)

    def handle_message(self, raw_msg):
        try:
            data = json.loads(raw_msg)
            mtype = data.get("type")
            if mtype == "history":
                for msg in data.get("messages", []):
                    text = msg.get("text", "")
                    if text.endswith("has joined.") or text.endswith("has left."):
                        username = text.rsplit(' ', 2)[0].strip()
                        if text.endswith("has joined."):
                            self.add_member(username)
                        else:
                            self.remove_member(username)
                        continue
                    self.display_message(msg)

            elif mtype == "chat":
                self.display_message(data)
            elif mtype == "system":
                text = data.get("text", "")
                if text.startswith("Online users:"):
                    members = [m.strip() for m in text[len("Online users:"):].split(",")]
                    self.update_members(members)
                    return

                if text.endswith("has joined."):
                    username = text[:-len("has joined.")].strip()
                    self.add_member(username)
                    return

                if text.endswith("has left."):
                    username = text[:-len("has left.")].strip()
                    self.remove_member(username)
                    return

                self.display_system_message(text)
            else:
                self.append_chat(f"[Unknown message type] {raw_msg}")
        except Exception as e:
            self.append_chat(f"[Error parsing message] {raw_msg} ({e})")

    def add_member(self, username):
        if username and username not in self.get_members():
            self.members_list.addItem(username)

    def remove_member(self, username):
        if not username:
            return
        items = self.members_list.findItems(username, Qt.MatchFlag.MatchExactly)
        for item in items:
            row = self.members_list.row(item)
            self.members_list.takeItem(row)

    def get_members(self):
        return [self.members_list.item(i).text() for i in range(self.members_list.count())]

    def display_message(self, msg):
        username = msg.get("username", "Unknown")
        text = msg.get("text", "")
        timestamp = msg.get("timestamp")
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00")) if timestamp else datetime.now()
        except:
            dt = datetime.now()
        time_str = dt.strftime("%H:%M:%S")
        self.append_chat(f"[{time_str}] <{username}> {text}")

    def display_system_message(self, text):
        time_str = datetime.now().strftime("%H:%M:%S")
        self.append_chat(f"[{time_str}] * {text}")

    def update_members(self, members):
        self.members_list.clear()
        self.members_list.addItems(members)

    def append_chat(self, text):
        self.chat_display.append(text)

    def update_status(self, text):
        self.status_label.setText(text)

    def send_message(self):
        msg = self.msg_input.text().strip()
        if not msg or not self.websocket:
            return

        to_send = json.dumps({"type": "message", "content": msg})

        async def send():
            try:
                await self.websocket.send(to_send)
                self.msg_input.clear()
            except Exception as e:
                self.append_chat(f"[Error sending message] {e}")

        asyncio.run_coroutine_threadsafe(send(), self.event_loop)

    def process_asyncio_events(self):
        self.event_loop.call_soon(self.event_loop.stop)
        self.event_loop.run_forever()

    def closeEvent(self, event):
        self.disconnect()
        self.event_loop.call_soon_threadsafe(self.event_loop.stop)
        event.accept()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    client = ChatClient()
    sys.exit(app.exec())
