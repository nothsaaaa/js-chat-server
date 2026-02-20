import asyncio
import json
import websockets
from termcolor import colored
import sys

session_token = None
heartbeat_task = None
heartbeat_interval = None


async def heartbeat_loop(ws, interval_ms):
    global session_token
    interval = interval_ms / 1000.0

    while True:
        await asyncio.sleep(interval)

        if session_token is None:
            continue

        try:
            await ws.send(json.dumps({
                "type": "ping",
                "token": session_token
            }))
        except Exception as e:
            print(colored(f"[Heartbeat] Failed to send ping: {e}", "red"))
            return


async def send_loop(ws):
    global session_token
    loop = asyncio.get_event_loop()

    while True:
        text = await loop.run_in_executor(None, sys.stdin.readline)

        if not text:
            continue

        text = text.strip()

        if not text:
            continue

        if not session_token:
            print(colored("[Client] Cannot send message yet, no session token.", "red"))
            continue

        message_obj = {
            "type": "chat",
            "token": session_token,
            "content": text
        }

        try:
            await ws.send(json.dumps(message_obj))
        except Exception as e:
            print(colored(f"Failed to send message: {e}", "red"))
            return


async def recv_loop(ws):
    global session_token, heartbeat_task, heartbeat_interval

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

        elif msg_type == "heartbeat-config":
            heartbeat_interval = data.get("interval")

            print(colored(
                f"[Client] Heartbeat configured: {heartbeat_interval} ms",
                "magenta"
            ))

            if heartbeat_task:
                heartbeat_task.cancel()

            heartbeat_task = asyncio.create_task(
                heartbeat_loop(ws, heartbeat_interval)
            )

        elif msg_type == "pong":
            # print(colored("[Heartbeat] Pong received.", "magenta"))
            pass

        elif msg_type == "history":
            print(colored("Loaded chat history:", "cyan"))

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

        #else:
        #    print(colored(f"[Client] Unknown message type: {data}", "red"))

        # you really don't gotta be notified about this.
        # it's just annoying when new features are added
        # if you only need to filter for a few message types
        # for a client as simple as this.

async def chat_client():
    uri = "ws://localhost:3000"

    try:
        async with websockets.connect(uri) as websocket:

            print(colored("Connected to chat server.", "cyan"))

            recv_task = asyncio.create_task(recv_loop(websocket))
            send_task = asyncio.create_task(send_loop(websocket))

            done, pending = await asyncio.wait(
                [recv_task, send_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

    except Exception as e:
        print(colored(f"Connection failed: {e}", "red"))


if __name__ == "__main__":

    try:
        asyncio.run(chat_client())

    except KeyboardInterrupt:
        print(colored("\nDisconnected from chat server.", "cyan"))
