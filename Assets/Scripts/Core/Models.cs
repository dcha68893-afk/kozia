using System.Collections.Generic;

[System.Serializable]
public class Appearance
{
    public float height = 1f;
    public float build = 1f;
    public string skin = "#e0b08c";
    public int hairStyle = 1;
    public string hairColor = "#2b1d14";
    public string eyes = "#3b2a1a";
}

public class EquippedItem { public string id; public string category; public string color; }

public class Look
{
    public Appearance appearance = new Appearance();
    public List<EquippedItem> equipped = new List<EquippedItem>();
}

public class UserDto
{
    public string id, username, email, role, stage, nextDailyAt;
    public long coins, gems, tickets, xp;
    public int level, reputation, wins, games, streak, bestStreak;
    public Appearance appearance;
    public List<EquippedItem> equipped;

    public Look ToLook() => new Look { appearance = appearance ?? new Appearance(), equipped = equipped ?? new List<EquippedItem>() };
}

public class ShopItem
{
    public string id, name, category, color;
    public int priceCoins, priceGems, minLevel;
    public bool owned, equipped;
}

public class FriendDto { public string username, status; public int level; public bool online; }
public class LeaderRow { public int rank, level, wins; public string username; public long xp; }
public class TournamentDto { public int id, entryTickets, myScore, players; public string name, endsAt; public bool joined; }
public class RoomListEntry { public string code, phase, host; public int players; }

public class RoomMember
{
    public string userId, username, stage;
    public bool spectator, picked;
    public int score;
    public Look look;
}

public class RoomSnapshot
{
    public string id, code, phase, hostId;
    public int round, totalRounds;
    public bool isPrivate;
    public List<RoomMember> members = new List<RoomMember>();
}

public class PlayerEntry { public string id, u, stage; public float x, y, z, ry; public Look look; }
public class PosUpdate { public string id, a; public float x, y, z, ry; }
public class WorldJoined { public string zone; public float x, y, z; public List<PlayerEntry> players; }
public class PickResult { public string userId, username; public int coins, xp; public int? pick; public bool correct, levelUp; public List<string> achievements; }
