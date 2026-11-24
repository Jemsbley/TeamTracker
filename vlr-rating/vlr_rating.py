"""VLR Rating 2.0 estimate: reference implementation (Python 3.8+, no dependencies).

rate_match(match)   -> {player_id: rating} for one map, from the generic match format in README.md
match_totals(match) -> per-player totals, which you can add up across maps for a series rating
rating(totals)      -> the rating for one player's totals (one map or a whole series)
from_tracker(json)  -> converts a tracker.gg Valorant match file into the generic match format

Usage: python vlr_rating.py match.json [more.json ...]   (generic or tracker.gg format)
"""
import json
import math
import sys

# Fitted on 470 Champions 2026 player-maps (leave-one-match-out error 0.017 vs vlr.gg).
C = {
    "a": 0.4504593877, "C1": 0.9461549127, "C2": 0.956890235, "C3": 0.2676775021,
    "C4": 0.0019872721, "C5": 0.1298035295, "C6": 0.4267176739,
    "b": [1.0, 0.7435459502, 0.5506887977, 0.2272827339],   # fight weight by distance from even
    "beta": 0.0212970312,   # economy: per $1000 of loadout advantage
    "tau": 0.7231253772,    # traded fight multiplier
    "kappa": 1.0,           # cost of a team kill to the killer
}
TRADE_MS = 3000


def match_totals(match):
    """Sum of fight weights (kc, dc) and the scoreboard numbers per player for one map."""
    team = {p["id"]: p["team"] for p in match["players"]}
    teams = sorted(set(team.values()))
    tot = {p["id"]: {"rounds": p["rounds"], "kills": p["kills"], "assists": p["assists"],
                     "damage": p["damage"], "kc": 0.0, "dc": 0.0, "rounds_died": 0}
           for p in match["players"]}
    for rnd in match["rounds"]:
        alive = {t: 5 for t in teams}
        events = []
        for k in sorted(rnd["kills"], key=lambda k: k["t_ms"]):
            v = k["victim"]
            if v not in team:
                continue
            vt = team[v]
            if alive[vt] == 0:
                alive[vt] = 1                      # a revived player dying again
            killer = k.get("killer")
            fight = killer in team and team[killer] != vt
            kt = team[killer] if fight else next(t for t in teams if t != vt)
            n_k, n_v = alive[kt], alive[vt]
            alive[vt] -= 1
            events.append({"t": k["t_ms"], "killer": killer if fight else None, "victim": v,
                           "kt": kt, "vt": vt, "n_k": n_k, "n_v": n_v, "after": dict(alive),
                           "spike": bool(k.get("spike")),
                           "team_kill": killer if (not fight and killer in team and killer != v) else None})
        dead = set()
        for e in events:
            dead.add(e["victim"])
            if e["spike"]:
                continue                           # spike detonation deaths don't count
            if e["team_kill"]:
                tot[e["team_kill"]]["dc"] += C["kappa"]   # killer pays a full death, victim nothing
                continue
            diff = e["n_k"] - e["n_v"]
            dist = min(abs(diff), abs(diff + 1), 3)       # distance from even, before or after
            gap = (rnd["loadout"].get(e["kt"], 0) - rnd["loadout"].get(e["vt"], 0)) / 1000
            w = C["b"][dist] * math.exp(-C["beta"] * gap)
            if e["killer"]:
                later = [x for x in events if e["t"] < x["t"] <= e["t"] + TRADE_MS]
                if any(x["victim"] == e["killer"] for x in later):
                    after = later[-1]["after"]
                    if after[e["kt"]] <= after[e["vt"]]:  # traded: killer's team not ahead 3 s later
                        w *= C["tau"]
                tot[e["killer"]]["kc"] += w
            tot[e["victim"]]["dc"] += w            # falls count as deaths
        for p in dead:
            tot[p]["rounds_died"] += 1
    return tot


def rating(t):
    """Rating from one player's totals (a single map, or several maps added together)."""
    r = t["rounds"]
    if not r:
        return None
    x = (C["a"] + C["C1"] * t["kc"] / r - C["C2"] * t["dc"] / r + C["C3"] * t["assists"] / r
         + C["C4"] * t["damage"] / r + C["C5"] * t["kills"] / r
         + C["C6"] * (r - t["rounds_died"]) / r)
    return max(x, 0.01)


def rate_match(match):
    return {pid: rating(t) for pid, t in match_totals(match).items()}


def series_ratings(matches):
    """VLR's series rating: add each player's per-map totals, then apply the formula once."""
    keys = ("rounds", "kills", "assists", "damage", "kc", "dc", "rounds_died")
    total = {}
    for m in matches:
        for pid, t in match_totals(m).items():
            acc = total.setdefault(pid, dict.fromkeys(keys, 0))
            for k in keys:
                acc[k] += t[k]
    return {pid: rating(t) for pid, t in total.items()}


# ---------------------------------------------------------------- tracker.gg adapter

def _val(seg, key):
    s = (seg.get("stats") or {}).get(key)
    return s["value"] if s and isinstance(s.get("value"), (int, float)) else 0


def from_tracker(doc):
    """tracker.gg match JSON (data.segments) -> generic match format."""
    seg = doc["data"]["segments"]
    players, rounds = [], {}
    played = {}
    for s in seg:
        if s["type"] == "player-round":
            n, pid, t = s["attributes"]["round"], s["attributes"]["platformUserIdentifier"], s["metadata"]["teamId"]
            r = rounds.setdefault(n, {"number": n, "loadout": {}, "kills": []})
            r["loadout"][t] = r["loadout"].get(t, 0) + _val(s, "loadoutValue")
            played[pid] = played.get(pid, 0) + 1
    for s in seg:
        if s["type"] == "player-round-kills":
            n = s["attributes"]["round"]
            fd = s["metadata"].get("finishingDamage") or {}
            rounds.setdefault(n, {"number": n, "loadout": {}, "kills": []})["kills"].append({
                "t_ms": s["metadata"].get("roundTime") or 0,
                "killer": s["attributes"]["platformUserIdentifier"],
                "victim": s["attributes"]["opponentPlatformUserIdentifier"],
                "spike": fd.get("damageType") == "Bomb",
            })
    for s in seg:
        if s["type"] == "player-summary":
            pid = s["attributes"]["platformUserIdentifier"]
            players.append({"id": pid, "team": s["metadata"]["teamId"],
                            "rounds": played.get(pid) or len(rounds),
                            "kills": _val(s, "kills"), "assists": _val(s, "assists"),
                            "damage": _val(s, "damage")})   # tracker.gg's total already excludes team damage
    return {"players": players, "rounds": [rounds[n] for n in sorted(rounds)]}


def load(path):
    doc = json.load(open(path, encoding="utf-8"))
    return from_tracker(doc) if "data" in doc and "segments" in doc.get("data", {}) else doc


if __name__ == "__main__":
    matches = [load(p) for p in sys.argv[1:]]
    for path, m in zip(sys.argv[1:], matches):
        print(f"== {path}")
        for pid, r in sorted(rate_match(m).items(), key=lambda x: -x[1]):
            print(f"  {r:5.2f}  {pid}")
    if len(matches) > 1:
        print("== Series")
        for pid, r in sorted(series_ratings(matches).items(), key=lambda x: -x[1]):
            print(f"  {r:5.2f}  {pid}")
