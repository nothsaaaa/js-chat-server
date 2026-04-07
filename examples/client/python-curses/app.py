import asyncio
import json
import websockets
from termcolor import colored
import sys
import os
import curses

session_token = None
heartbeat_task = None
heartbeat_interval = None

CONFIG_FILE = "settings.conf"

def load_config():
    default_servers = [
        {"name": "Blackspace", "url": "wss://blackspace.lol:8443"}
    ]

    if not os.path.exists(CONFIG_FILE):
        save_config(default_servers)
        return {"servers": default_servers.copy()}

    config = {"servers": []}

    with open(CONFIG_FILE, "r") as f:
        for line in f:
            line = line.strip()

            if not line or line.startswith("#"):
                continue

            if "=" not in line:
                continue

            key, value = line.split("=", 1)

            if key.startswith("server"):
                try:
                    name, url = value.split("|", 1)
                    config["servers"].append({
                        "name": name.strip(),
                        "url": url.strip()
                    })
                except:
                    pass

    return config


def save_config(servers):
    with open(CONFIG_FILE, "w") as f:
        f.write("# python-curses client settings file\n\n")
        for i, s in enumerate(servers, start=1):
            f.write(f"server{i}={s['name']}|{s['url']}\n")


def ask_username():
    return input("Enter username (optional): ").strip()


def add_server_prompt():
    print("\nAdd New Server")
    name = input("Server name: ").strip() or "Unnamed"
    url = input("Server URL: ").strip()

    if not url:
        print("Invalid URL.")
        return None

    return {"name": name, "url": url}


def confirm_delete():
    return input("Delete this server? (y/n): ").lower() == "y"


def select_server(servers):
    def menu(stdscr):
        curses.curs_set(0)
        curses.start_color()
        curses.init_pair(1, curses.COLOR_CYAN, curses.COLOR_BLACK)

        current = 0

        while True:
            stdscr.clear()

            stdscr.addstr(
                0, 0,
                "Select server (↑/↓ Enter=join, D=delete)\n"
            )

            options = servers + [{"name": "[Add New Server]", "url": ""}]

            for i, server in enumerate(options):
                label = server["name"] if server["url"] == "" else f"{server['name']} ({server['url']})"

                if i == current:
                    stdscr.addstr(i + 2, 0, f"> {label}", curses.color_pair(1))
                else:
                    stdscr.addstr(i + 2, 0, f"  {label}")

            key = stdscr.getch()

            if key == curses.KEY_UP:
                current = (current - 1) % len(options)

            elif key == curses.KEY_DOWN:
                current = (current + 1) % len(options)

            elif key in (10, 13):  # Enter
                selected = options[current]

                if selected["url"] == "":
                    curses.endwin()
                    new_server = add_server_prompt()
                    if new_server:
                        servers.append(new_server)
                        save_config(servers)
                    continue
                else:
                    return selected

            elif key in (ord('d'), ord('D')):
                if current < len(servers):
                    curses.endwin()
                    if confirm_delete():
                        servers.pop(current)
                        save_config(servers)
                        current = max(0, current - 1)
                continue

    return curses.wrapper(menu)


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


async def chat_client():
    config = load_config()

    username = ask_username()
    server = select_server(config["servers"])

    uri = f"{server['url']}?username={username}"

    try:
        async with websockets.connect(uri) as websocket:
            print(colored(f"Connected to {server['name']} as {username}.", "cyan"))

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