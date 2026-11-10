# audiaptic
A distributed audio-visual-haptic performance solution.

## Deployment

Production runs on [davhi.se.rit.edu](https://davhi.se.rit.edu). It redeploys from `main` every night at midnight Eastern, and on demand with `audiaptic-redeploy` on the server. See [deploy/README.md](deploy/README.md) for setup and day-to-day commands.

## Configuration

The API reads these environment variables, from `api/.env` when running locally or from the environment when running in Docker. Every one has a default, so none is required for local development.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SITE_DOMAIN` | `localhost` | Host the generated API docs point at. |
| `PORT` | `3000` | Port the API listens on. |
| `NODE_ENV` | `development` | `development`, `production`, or `test`. |

## Testing the client websocket locally

These steps let a phone connect to a server running on your computer, so you can watch events arrive on the client websocket before the mobile app has a live connection. They were tested on Windows.

The client websocket is `/api/audience/{code}` on port 3000, where `{code}` is a join code. The only valid code right now is `davhi`. In the future, each performance will have its own code, and the code will connect the device to that performance.

### 1. Connect both devices to the same network

Your phone and your computer must be on the same Wi-Fi network.

> Some networks, such as guest Wi-Fi, block devices from reaching each other. If your phone can't reach your computer after these steps, try a phone hotspot or Windows Mobile Hotspot instead.

### 2. Set your network to private

Windows blocks incoming connections on public networks.

1. Open **Settings > Network & internet > Wi-Fi**.
2. Select your network's properties.
3. Under **Network profile type**, choose **Private network**.

### 3. Allow the dev ports through the firewall

Add an inbound firewall rule that allows TCP ports **80** (Caddy), **3000** (API), and **5173** (portal).

**PowerShell:** run this in PowerShell as administrator:

```powershell
New-NetFirewallRule -DisplayName "DAVHI local dev" -Direction Inbound -Protocol TCP -LocalPort 80,3000,5173 -Action Allow -Profile Private
```

**Or, in the GUI:**

1. Open **Windows Defender Firewall with Advanced Security**.
2. Select **Inbound Rules**, then **New Rule...**
3. Choose **Port**, then **TCP**, and enter `80, 3000, 5173` as specific local ports.
4. Choose **Allow the connection**.
5. Check **Private** only.
6. Name the rule, for example `DAVHI local dev`, and finish.

### 4. Find your computer's IP address

Run `ipconfig` in a terminal. Under **Wireless LAN adapter Wi-Fi**, copy the **IPv4 Address**, for example `192.168.1.25`. The steps below call this `<IP Address>`.

Your IP address can change when you switch networks or reconnect, so check it again if a step that used to work stops working.

### 5. (Optional) Add your IP address to Caddyfile.dev

With this change, the portal is also reachable at `http://<IP Address>` without a port number. In [Caddyfile.dev](Caddyfile.dev), add your IP address next to `localhost` in the site address:

```text
http://localhost, http://<IP Address> {
```

Keep `localhost` in the list. If you replace it, `ws://localhost/api/performer?token=dev`, which Max uses, stops working.

Don't commit this change, since the IP address is specific to your computer.

### 6. Run the server

Start Docker Desktop, then run [run_me.bat](run_me.bat) from the root of this repo. It opens three windows: the API (port 3000), the portal (port 5173), and Caddy (port 80). Press any key in the `run_me.bat` window to shut everything down.

### 7. Open the portal on your phone

On your phone, go to `http://<IP Address>:5173`, or `http://<IP Address>` if you did step 5. You should see the admin portal's login page. The development login is in [portal/data/userinfo.json](portal/data/userinfo.json).

### 8. Connect to the client websocket

Open the **Test Session** tab. The page connects to `ws://<IP Address>:3000/api/audience/davhi` and should show **Connected**. The API window also logs `Audience device connected. 1 connected.`

Events relayed to the audience appear on this page as they arrive, newest first, with the time each was received.

#### Invalid join codes

The client websocket path is `/api/audience/{code}`, where `{code}` is the performance's join code. Only `davhi` is valid for now, and codes are case-sensitive, so `DAVHI` is rejected.

If the code is invalid, the server accepts the connection and then immediately closes it with:

| Field | Value |
| --- | --- |
| Close code | `4404` |
| Close reason | `Invalid join code` |

No events are sent before the connection closes. Clients should handle this in the WebSocket close handler:

```ts
socket.onclose = (event) => {
  if (event.code === 4404) {
    // Show "invalid join code". Don't reconnect; the same code fails every time.
  }
}
```

The server closes the connection instead of refusing the WebSocket handshake with an HTTP `404`. Browsers and React Native can't read the HTTP status of a refused handshake: the client only sees a generic error and close code `1006`, the same as a network failure. A close code lets the client tell an invalid code apart from a dropped connection.

To try it, connect to `ws://<IP Address>:3000/api/audience/nope`. The API window logs `Rejected audience device with invalid join code: nope`.

### Sending events end to end

To see events from Max on your phone:

1. In `audiaptic-max/src/connection/.env`, set:

   ```text
   DAVHI_WEBSOCKET_URL="ws://localhost/api/performer?token=dev"
   ```

   This goes through Caddy on port 80, which checks the performer token the way production does. In dev the token is always `dev`. Without it, the connection is refused with a `401`. For production, use `wss://davhi.se.rit.edu/api/performer?token=<token>` with the real token from the server's `.env`, and keep it out of git.

   Then restart the connection patch's `node.script`; it only reads `.env` when it starts. See the [connection patch setup](https://github.com/TeamAudiaptic/audiaptic-max/tree/main/src/connection) for the rest of the Max setup.

2. Send an event, or a list of events, from Max. Every valid event except `ping` is relayed to the audience in the form Max sent it: a single event, or a list of the valid events; `ping` only checks the connection between Max and the server.

3. Check the ack Max receives. Each frame gets exactly one ack. A `202` means every event was valid and was relayed, and `deliveredTo` shows how many devices received it. A `207` or `422` lists the rejected events by `index` and `eventId`. See [Acknowledgements](https://teamaudiaptic.github.io/audiaptic-docs/docs/dev-docs/events/acknowledgements) for every status. The relayed events appear on the Test Session page.
