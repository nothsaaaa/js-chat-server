import asyncio
import json
import websockets

BOT_NAME = "example_bot"
WS_URI = f"ws://147.185.221.28:61429?username={BOT_NAME}"

session_token = None

async def send_chat(ws, content):
    global session_token
    if session_token is None:
        return
    await ws.send(json.dumps({
        "type": "chat",
        "token": session_token,
        "content": content
    }))

async def main():
    global session_token

    print(f"Starting bot: {BOT_NAME}")
    async with websockets.connect(WS_URI) as ws:
        print("Connected to server.")

        async for message in ws:
            try:
                data = json.loads(message)
                if data.get("type") == "session-token":
                    session_token = data.get("token")
                    print(f"Received session token: {session_token}")

                    await send_chat(ws, "Hello World")
                    continue

                print(f"[RECEIVED] {data}")
            except json.JSONDecodeError:
                print(f"[INVALID JSON] {message}")
                continue

            msg_type = data.get("type")
            text = data.get("text", "").lower()

            if msg_type == "chat" and BOT_NAME.lower() in text and session_token:
                await send_chat(ws, "Pong!")

if __name__ == "__main__":
    asyncio.run(main())
