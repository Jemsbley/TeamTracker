// VLR Rating 2.0 estimate: reference implementation (plain JavaScript, no dependencies).
// Works in the browser (window.VlrRating) and in Node (require("./vlr_rating.js")).
//
//   rateMatch(match)       -> { playerId: rating } for one map (generic match format, see README.md)
//   matchTotals(match)     -> per-player totals, add them up across maps for a series
//   seriesRatings(matches) -> { playerId: rating } for a series, the way vlr.gg combines maps
//   rating(totals)         -> rating for one player's totals
//   fromTracker(json)      -> converts a tracker.gg Valorant match file into the generic format
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VlrRating = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Fitted on 470 Champions 2026 player-maps (leave-one-match-out error 0.017 vs vlr.gg).
  const C = {
    a: 0.4504593877, C1: 0.9461549127, C2: 0.956890235, C3: 0.2676775021,
    C4: 0.0019872721, C5: 0.1298035295, C6: 0.4267176739,
    b: [1.0, 0.7435459502, 0.5506887977, 0.2272827339],  // fight weight by distance from even
    beta: 0.0212970312,  // economy: per $1000 of loadout advantage
    tau: 0.7231253772,   // traded fight multiplier
    kappa: 1.0,          // cost of a team kill to the killer
  };
  const TRADE_MS = 3000;

  function matchTotals(match) {
    const team = {};
    for (const p of match.players) team[p.id] = p.team;
    const teams = [...new Set(Object.values(team))].sort();
    const tot = {};
    for (const p of match.players) {
      tot[p.id] = { rounds: p.rounds, kills: p.kills, assists: p.assists, damage: p.damage,
                    kc: 0, dc: 0, roundsDied: 0 };
    }
    for (const rnd of match.rounds) {
      const alive = {};
      for (const t of teams) alive[t] = 5;
      const events = [];
      const kills = rnd.kills.slice().sort((x, y) => x.t_ms - y.t_ms);
      for (const k of kills) {
        const v = k.victim;
        if (!(v in team)) continue;
        const vt = team[v];
        if (alive[vt] === 0) alive[vt] = 1;  // a revived player dying again
        const killer = k.killer;
        const fight = killer in team && team[killer] !== vt;
        const kt = fight ? team[killer] : teams.find((t) => t !== vt);
        const nk = alive[kt], nv = alive[vt];
        alive[vt]--;
        events.push({ t: k.t_ms, killer: fight ? killer : null, victim: v, kt, vt, nk, nv,
                      after: { ...alive }, spike: !!k.spike,
                      teamKill: !fight && killer in team && killer !== v ? killer : null });
      }
      const dead = new Set();
      for (const e of events) {
        dead.add(e.victim);
        if (e.spike) continue;  // spike detonation deaths don't count
        if (e.teamKill) { tot[e.teamKill].dc += C.kappa; continue; }  // killer pays a full death
        const diff = e.nk - e.nv;
        const dist = Math.min(Math.abs(diff), Math.abs(diff + 1), 3);  // distance from even
        const gap = ((rnd.loadout[e.kt] || 0) - (rnd.loadout[e.vt] || 0)) / 1000;
        let w = C.b[dist] * Math.exp(-C.beta * gap);
        if (e.killer) {
          const later = events.filter((x) => x.t > e.t && x.t <= e.t + TRADE_MS);
          if (later.some((x) => x.victim === e.killer)) {
            const after = later[later.length - 1].after;
            if (after[e.kt] <= after[e.vt]) w *= C.tau;  // traded: killer's team not ahead 3 s later
          }
          tot[e.killer].kc += w;
        }
        tot[e.victim].dc += w;  // falls count as deaths
      }
      for (const p of dead) tot[p].roundsDied++;
    }
    return tot;
  }

  function rating(t) {
    const r = t.rounds;
    if (!r) return null;
    const x = C.a + C.C1 * t.kc / r - C.C2 * t.dc / r + C.C3 * t.assists / r
            + C.C4 * t.damage / r + C.C5 * t.kills / r + C.C6 * (r - t.roundsDied) / r;
    return Math.max(x, 0.01);
  }

  function rateMatch(match) {
    const out = {};
    for (const [id, t] of Object.entries(matchTotals(match))) out[id] = rating(t);
    return out;
  }

  function seriesRatings(matches) {
    const keys = ["rounds", "kills", "assists", "damage", "kc", "dc", "roundsDied"];
    const total = {};
    for (const m of matches) {
      for (const [id, t] of Object.entries(matchTotals(m))) {
        const acc = total[id] || (total[id] = Object.fromEntries(keys.map((k) => [k, 0])));
        for (const k of keys) acc[k] += t[k];
      }
    }
    const out = {};
    for (const [id, t] of Object.entries(total)) out[id] = rating(t);
    return out;
  }

  // ---------------------------------------------------------------- tracker.gg adapter
  const val = (seg, key) => {
    const s = (seg.stats || {})[key];
    return s && typeof s.value === "number" ? s.value : 0;
  };

  function fromTracker(doc) {
    const seg = doc.data.segments;
    const rounds = {}, played = {}, players = [];
    const round = (n) => rounds[n] || (rounds[n] = { number: n, loadout: {}, kills: [] });
    for (const s of seg) {
      if (s.type !== "player-round") continue;
      const r = round(s.attributes.round), id = s.attributes.platformUserIdentifier, t = s.metadata.teamId;
      r.loadout[t] = (r.loadout[t] || 0) + val(s, "loadoutValue");
      played[id] = (played[id] || 0) + 1;
    }
    for (const s of seg) {
      if (s.type !== "player-round-kills") continue;
      const fd = s.metadata.finishingDamage || {};
      round(s.attributes.round).kills.push({
        t_ms: s.metadata.roundTime || 0,
        killer: s.attributes.platformUserIdentifier,
        victim: s.attributes.opponentPlatformUserIdentifier,
        spike: fd.damageType === "Bomb",
      });
    }
    const nRounds = Object.keys(rounds).length;
    for (const s of seg) {
      if (s.type !== "player-summary") continue;
      const id = s.attributes.platformUserIdentifier;
      players.push({ id, team: s.metadata.teamId, rounds: played[id] || nRounds,
                     kills: val(s, "kills"), assists: val(s, "assists"),
                     damage: val(s, "damage") });  // tracker.gg's total already excludes team damage
    }
    return { players, rounds: Object.keys(rounds).map(Number).sort((x, y) => x - y).map((n) => rounds[n]) };
  }

  return { C, TRADE_MS, matchTotals, rating, rateMatch, seriesRatings, fromTracker };
});
