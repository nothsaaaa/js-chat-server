import asyncio
import json
import websockets
from termcolor import colored
import sys

session_token = None


async def send_loop(ws):
    global session_token
    loop = asyncio.get_event_loop()
    while True:
        text = await loop.run_in_executor(None, sys.stdin.readline)
        text = text.strip()
        if text:
            message_obj = {
                "type": "chat",
                "content": text
            }
            if session_token:
                message_obj["token"] = session_token
            try:
                await ws.send(json.dumps(message_obj))
            except Exception as e:
                print(colored(f"Failed to send message: {e}", "red"))


async def recv_loop(ws):
    global session_token
    async for message in ws:
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            print("Received non-JSON message:", message)
            continue

        msg_type = data.get("type")

        if msg_type == "session-token":
            session_token = data.get("token")
            print(colored("[Client] Session token received.", "magenta"))

        elif msg_type == "history":
            print(colored("loaded chat", "cyan"))
            for msg in data.get("messages", []):
                if msg["type"] == "chat":
                    user = colored(msg['username'], "green")
                    print(f"{user}: {msg['text']}")
                elif msg["type"] == "system":
                    print(colored(f"[SYSTEM] {msg['text']}", "yellow"))

        elif msg_type == "chat":
            user = colored(data['username'], "green")
            print(f"{user}: {data['text']}")
        elif msg_type == "system":
            print(colored(f"[SYSTEM] {data['text']}", "yellow"))
        else:
            print("Unknown message type:", data)


async def chat_client():
    uri = "ws://localhost:3000"
    try:
        async with websockets.connect(uri) as websocket:
            print(colored("Connected to chat server", "cyan"))
            await asyncio.gather(send_loop(websocket), recv_loop(websocket))
    except Exception as e:
        print(colored(f"Connection failed: {e}", "red"))


if __name__ == "__main__":
    try:
        asyncio.run(chat_client())
    except KeyboardInterrupt:
        print("\nDisconnected from chat server.")
