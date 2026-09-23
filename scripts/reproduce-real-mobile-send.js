const io = require("socket.io-client");
const fs = require("fs");
const path = require("path");

async function main() {
  const settingsPath = path.join(
    process.env.HOME,
    "Library/Application Support/ocs/settings.json"
  );
  let pairingCode = "537407";
  if (fs.existsSync(settingsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (s.activePairingCode) pairingCode = s.activePairingCode;
    } catch (_) {}
  }

  console.log(`Connecting to desktop at http://localhost:4000 with pairing code: ${pairingCode}`);

  const socket = io("http://localhost:4000", {
    transports: ["websocket", "polling"],
    reconnection: false,
    timeout: 5000,
  });

  const corrId = Math.random().toString(36).substring(2, 8);

  socket.on("connect", () => {
    console.log(`[AGENDA-SEND ${corrId}] socket connected: id=${socket.id}`);
    console.log(`[AGENDA-SEND ${corrId}] emitting pair with code=${pairingCode}`);
    socket.emit(
      "pair",
      {
        code: pairingCode,
        token: pairingCode,
        deviceName: "Test Mobile Runtime Diagnostic",
      }
    );
  });

  socket.on("pair-result", (res) => {
    console.log(`[AGENDA-SEND ${corrId}] pair-result received:`, res);
    if (!res.ok) {
      console.error("Pairing failed! Exiting.");
      process.exit(1);
    }

    // Now test sending an agenda offer
    const sampleAgenda = {
      id: `agenda_${Date.now()}`,
      name: "Sunday Worship Service",
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      defaultDestination: "all",
      defaultMediaEndBehavior: "hold",
      sessions: [
        {
          id: `sess_1_${Date.now()}`,
          name: "Praise & Worship",
          durationSec: 1200,
          notes: "Opening worship medley",
          transitionMode: "auto",
          intervalSec: 5,
          targetDestination: "all",
          mediaEndBehavior: "hold",
          timelineItems: [],
        },
      ],
      assets: [],
    };

    console.log(`[AGENDA-SEND ${corrId}] emitting mobile-agenda-offer...`);
    const t0 = Date.now();

    socket.emit(
      "mobile-agenda-offer",
      {
        agenda: sampleAgenda,
        deviceName: "Test Mobile Runtime Diagnostic",
        corrId,
      },
      (ackRes) => {
        const elapsed = Date.now() - t0;
        console.log(`[AGENDA-SEND ${corrId}] desktop ack received in ${elapsed}ms:`, ackRes);
        if (ackRes?.ok) {
          console.log(`[AGENDA-SEND ${corrId}] SUCCESS: Offer accepted into pending state! transferId=${ackRes.transferId}`);
        } else {
          console.error(`[AGENDA-SEND ${corrId}] ERROR: Desktop rejected offer:`, ackRes?.error);
        }
        socket.disconnect();
        process.exit(ackRes?.ok ? 0 : 1);
      }
    );
  });

  socket.on("connect_error", (err) => {
    console.error(`[AGENDA-SEND ${corrId}] connect_error:`, err.message);
    process.exit(1);
  });

  setTimeout(() => {
    console.error(`[AGENDA-SEND ${corrId}] SCRIPT TIMEOUT (15s) - No ack received!`);
    socket.disconnect();
    process.exit(1);
  }, 15000);
}

main();
