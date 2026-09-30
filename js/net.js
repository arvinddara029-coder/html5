/* ============ SINGLE-PLAYER BUILD — offline net stub ============
   The WebRTC multiplayer stack (PeerJS transport, rooms, matchmaking,
   player/enemy sync, chat) was REMOVED: the game is a self-contained
   single-player experience. This file intentionally contains no network
   code. It exists only so the handful of defensive call sites in the
   gameplay modules read a safe, constant offline state. */
(function () {
  NR.net = {
    mode: "offline",        // always offline
    connected: false,
    room: null,
    remote: new Map(),      // remote heroes never exist
    tick() {},
    hostBroadcastWave() {},
    hostBroadcastSpawns() {},
    sendEvent() {},
    guestHitEnemy() {},
    submitLeaderboard() {},
    joinRoom() { return Promise.resolve(null); },
    myId: () => "local",
    ping: () => 0,
    teamOf: () => 0,
    onNet() {},
  };
})();
