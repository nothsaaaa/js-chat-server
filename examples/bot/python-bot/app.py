import asyncio
import json
import websockets

BOT_NAME = "example_bot"
WS_URI = f"ws://147.185.221.28:61429?username={BOT_NAME}"

async def main():
    print(f"Starting bot: {BOT_NAME}")
    
    async with websockets.connect(WS_URI) as ws:
        print("Connected to server.")
        
        await ws.send(json.dumps({
            "type": "chat",
            "content": "Hello World"
        }))
        
        async for message in ws:
            try:
                data = json.loads(message)
                print(f"[RECEIVED] {data}")
            except json.JSONDecodeError:
                print(f"[INVALID JSON] {message}")
                continue

            msg_type = data.get("type")
            text = data.get("text", "").lower()

            if msg_type == "chat" and BOT_NAME.lower() in text:
                await ws.send(json.dumps({
                    "type": "message",
                    "content": "Pong!"
                }))

if __name__ == "__main__":
    asyncio.run(main())
