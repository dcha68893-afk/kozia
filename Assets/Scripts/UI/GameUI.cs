using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

/// Complete functional UI (IMGUI: no prefabs or scene wiring needed, scales with screen height).
/// Screens: auth, world HUD + panels (shop, rooms, friends, boards, tournaments, customize), match.
public class GameUI : MonoBehaviour
{
    public GameBootstrap boot;
    public WorldClient world;
    public TubeTable table;

    enum Panel { None, Shop, Rooms, Friends, Board, Tourney, Customize }
    Panel panel = Panel.None;

    string fLogin = "", fUser = "", fEmail = "", fPass = "", chatInput = "", joinCode = "", friendName = "", toast = "", invite = "";
    float toastUntil;
    bool registerMode, busy;
    Vector2 scroll;

    List<ShopItem> shop = new List<ShopItem>();
    List<FriendDto> friends = new List<FriendDto>();
    List<LeaderRow> board = new List<LeaderRow>();
    List<TournamentDto> tourneys = new List<TournamentDto>();
    List<RoomListEntry> rooms = new List<RoomListEntry>();
    string boardType = "global";
    Appearance edit;

    static readonly string[] Skins = { "#f1c9a5", "#e0b08c", "#c68642", "#8d5524", "#5c3a21", "#ffdbac" };
    static readonly string[] Hairs = { "#2b1d14", "#000000", "#6b4423", "#c9a14a", "#b5442f", "#9aa0a6" };

    void Start()
    {
        var ws = WsClient.I;
        ws.On("room.list", d => rooms = d["rooms"].ToObject<List<RoomListEntry>>());
        ws.On("error", d => Toast((string)d["message"]));
        ws.On("room.invited", d => { invite = (string)d["code"]; Toast((string)d["from"] + " invited you to room " + invite); });
    }

    void Toast(string s) { toast = s; toastUntil = Time.time + 3.5f; }

    async void Run(Func<Task> f)
    {
        if (busy) return;
        busy = true;
        try { await f(); }
        catch (Exception e) { Toast(e.Message); }
        finally { busy = false; }
    }

    void Open(Panel p)
    {
        panel = panel == p ? Panel.None : p;
        scroll = Vector2.zero;
        switch (panel)
        {
            case Panel.Shop: Run(async () => shop = await ApiClient.ShopItems()); break;
            case Panel.Friends: Run(async () => friends = await ApiClient.Friends()); break;
            case Panel.Board: Run(async () => board = await ApiClient.Leaderboard(boardType)); break;
            case Panel.Tourney: Run(async () => tourneys = await ApiClient.Tournaments()); break;
            case Panel.Rooms: WsClient.I.Send("room.list"); break;
            case Panel.Customize: edit = JsonUtility.FromJson<Appearance>(JsonUtility.ToJson(Session.User.appearance ?? new Appearance())); break;
        }
    }

    void OnGUI()
    {
        float s = Mathf.Max(1f, Screen.height / 720f);
        GUI.matrix = Matrix4x4.Scale(new Vector3(s, s, 1));
        float W = Screen.width / s, H = Screen.height / s;
        GUI.skin.label.richText = true; GUI.skin.label.fontSize = 16; GUI.skin.button.fontSize = 16; GUI.skin.textField.fontSize = 16; GUI.skin.box.fontSize = 16;

        if (Session.User == null) DrawAuth(W, H);
        else if (table.InRoom) DrawRoom(W, H);
        else DrawWorld(W, H);

        if (Time.time < toastUntil) GUI.Box(new Rect(W / 2 - 260, H - 56, 520, 40), toast);
    }

    // ------------------------------------------------------------------ AUTH
    void DrawAuth(float W, float H)
    {
        GUILayout.BeginArea(new Rect(W / 2 - 190, H / 2 - 190, 380, 380), GUI.skin.box);
        GUILayout.Label("<b>NECPRA WORLD</b>");
        GUILayout.BeginHorizontal();
        if (GUILayout.Toggle(!registerMode, "Login", GUI.skin.button)) registerMode = false;
        if (GUILayout.Toggle(registerMode, "Register", GUI.skin.button)) registerMode = true;
        GUILayout.EndHorizontal();
        if (registerMode)
        {
            GUILayout.Label("Username"); fUser = GUILayout.TextField(fUser, 20);
            GUILayout.Label("Email"); fEmail = GUILayout.TextField(fEmail, 100);
        }
        else { GUILayout.Label("Username or email"); fLogin = GUILayout.TextField(fLogin, 100); }
        GUILayout.Label("Password"); fPass = GUILayout.PasswordField(fPass, '*', 72);
        GUI.enabled = !busy;
        if (GUILayout.Button(registerMode ? "Create account" : "Log in", GUILayout.Height(40)))
        {
            Run(async () =>
            {
                if (registerMode) await ApiClient.Register(fUser, fEmail, fPass);
                else await ApiClient.Login(fLogin, fPass);
                fPass = "";
                boot.OnLoggedIn();
            });
        }
        GUI.enabled = true;
        GUILayout.EndArea();
    }

    // ----------------------------------------------------------------- WORLD
    void DrawTopBar(float W)
    {
        var u = Session.User;
        GUILayout.BeginArea(new Rect(10, 10, W - 20, 44));
        GUILayout.BeginHorizontal();
        GUILayout.Label(u.username + "  Lv " + u.level + " (" + u.stage + ")   Coins " + u.coins + "   Gems " + u.gems + "   Tickets " + u.tickets + "   XP " + u.xp);
        GUILayout.FlexibleSpace();
        if (!table.InRoom && GUILayout.Button("Daily", GUILayout.Width(70))) Run(async () => { await ApiClient.Daily(); Toast("+200 coins, +1 ticket"); });
        if (GUILayout.Button("Logout", GUILayout.Width(80))) boot.Logout();
        GUILayout.EndHorizontal();
        GUILayout.EndArea();
    }

    void DrawWorld(float W, float H)
    {
        DrawTopBar(W);

        GUILayout.BeginArea(new Rect(10, 52, W - 20, 44));
        GUILayout.BeginHorizontal();
        foreach (var z in new[] { "lobby", "restaurant", "gamehall" })
        {
            GUI.enabled = world.Zone != z;
            if (GUILayout.Button(z == "gamehall" ? "Game Hall" : char.ToUpper(z[0]) + z.Substring(1), GUILayout.Width(110))) world.Join(z);
            GUI.enabled = true;
        }
        GUILayout.Space(20);
        if (GUILayout.Button("Games", GUILayout.Width(80))) Open(Panel.Rooms);
        if (GUILayout.Button("Shop", GUILayout.Width(70))) Open(Panel.Shop);
        if (GUILayout.Button("Style", GUILayout.Width(70))) Open(Panel.Customize);
        if (GUILayout.Button("Friends", GUILayout.Width(80))) Open(Panel.Friends);
        if (GUILayout.Button("Ranks", GUILayout.Width(70))) Open(Panel.Board);
        if (GUILayout.Button("Events", GUILayout.Width(80))) Open(Panel.Tourney);
        GUILayout.EndHorizontal();
        GUILayout.EndArea();

        if (panel != Panel.None)
        {
            GUILayout.BeginArea(new Rect(W * 0.12f, 104, W * 0.76f, H - 310), GUI.skin.box);
            scroll = GUILayout.BeginScrollView(scroll);
            switch (panel)
            {
                case Panel.Shop: DrawShop(); break;
                case Panel.Rooms: DrawRooms(); break;
                case Panel.Friends: DrawFriends(); break;
                case Panel.Board: DrawBoard(); break;
                case Panel.Tourney: DrawTourney(); break;
                case Panel.Customize: DrawCustomize(); break;
            }
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        DrawChat(W, H);
        DrawEmotes(W, H);
    }

    void DrawChat(float W, float H)
    {
        GUILayout.BeginArea(new Rect(10, H - 200, Mathf.Min(W * 0.55f, 540), 190), GUI.skin.box);
        int from = Mathf.Max(0, world.Chat.Count - 6);
        for (int i = from; i < world.Chat.Count; i++) GUILayout.Label(world.Chat[i]);
        GUILayout.FlexibleSpace();
        bool enter = Event.current.type == EventType.KeyDown && Event.current.keyCode == KeyCode.Return && GUI.GetNameOfFocusedControl() == "chat";
        GUILayout.BeginHorizontal();
        GUI.SetNextControlName("chat");
        chatInput = GUILayout.TextField(chatInput, 200);
        if (GUILayout.Button("Send", GUILayout.Width(70)) || enter)
        {
            world.SendChat(chatInput);
            chatInput = "";
            if (enter) Event.current.Use();
        }
        GUILayout.EndHorizontal();
        GUILayout.Label("Tip: /w name message sends a private message");
        GUILayout.EndArea();
    }

    void DrawEmotes(float W, float H)
    {
        GUILayout.BeginArea(new Rect(W - 130, H - 230, 120, 220));
        foreach (var e in new[] { "wave", "cheer", "laugh", "dance" })
            if (GUILayout.Button(e, GUILayout.Height(38))) world.Emote(e);
        GUILayout.EndArea();
    }

    void DrawShop()
    {
        GUILayout.Label("Shop (items equip to your character instantly)");
        string cat = "";
        foreach (var it in shop)
        {
            if (it.category != cat) { cat = it.category; GUILayout.Label("<b>" + cat.ToUpper() + "</b>"); }
            GUILayout.BeginHorizontal();
            string price = it.owned ? "owned" : (it.priceCoins > 0 ? it.priceCoins + " coins" : it.priceGems > 0 ? it.priceGems + " gems" : "free");
            GUILayout.Label(it.name + "  [" + price + (it.minLevel > 1 ? ", Lv " + it.minLevel : "") + "]");
            GUILayout.FlexibleSpace();
            var item = it;
            if (!it.owned) { if (GUILayout.Button("Buy", GUILayout.Width(80))) Run(async () => { await ApiClient.Buy(item.id); shop = await ApiClient.ShopItems(); }); }
            else if (it.category != "emote")
            {
                if (GUILayout.Button(it.equipped ? "Unequip" : "Equip", GUILayout.Width(90))) Run(async () => { await ApiClient.Equip(item.id, !item.equipped); shop = await ApiClient.ShopItems(); });
            }
            GUILayout.EndHorizontal();
        }
    }

    void DrawRooms()
    {
        GUILayout.Label("Tube Challenge rooms");
        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Create public room")) { WsClient.I.Send("room.create", new { @private = false }); panel = Panel.None; }
        if (GUILayout.Button("Create private room")) { WsClient.I.Send("room.create", new { @private = true }); panel = Panel.None; }
        if (GUILayout.Button("Refresh", GUILayout.Width(90))) WsClient.I.Send("room.list");
        GUILayout.EndHorizontal();
        GUILayout.BeginHorizontal();
        GUILayout.Label("Code", GUILayout.Width(50));
        joinCode = GUILayout.TextField(joinCode, 5).ToUpper();
        if (GUILayout.Button("Join", GUILayout.Width(80))) { WsClient.I.Send("room.join", new { code = joinCode }); panel = Panel.None; }
        if (GUILayout.Button("Watch", GUILayout.Width(80))) { WsClient.I.Send("room.join", new { code = joinCode, spectate = true }); panel = Panel.None; }
        GUILayout.EndHorizontal();
        if (!string.IsNullOrEmpty(invite))
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Invite: " + invite);
            if (GUILayout.Button("Accept", GUILayout.Width(90))) { WsClient.I.Send("room.join", new { code = invite }); invite = ""; panel = Panel.None; }
            GUILayout.EndHorizontal();
        }
        GUILayout.Label("<b>Open rooms</b>");
        foreach (var r in rooms)
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label(r.code + "  host " + r.host + "  " + r.players + "/4  (" + r.phase + ")");
            GUILayout.FlexibleSpace();
            if (GUILayout.Button(r.phase == "lobby" ? "Join" : "Watch", GUILayout.Width(80))) { WsClient.I.Send("room.join", new { code = r.code, spectate = r.phase != "lobby" }); panel = Panel.None; }
            GUILayout.EndHorizontal();
        }
    }

    void DrawFriends()
    {
        GUILayout.BeginHorizontal();
        friendName = GUILayout.TextField(friendName, 20);
        if (GUILayout.Button("Add friend", GUILayout.Width(110))) Run(async () => { await ApiClient.FriendRequest(friendName); friendName = ""; friends = await ApiClient.Friends(); Toast("Request sent"); });
        GUILayout.EndHorizontal();
        foreach (var f in friends)
        {
            var fr = f;
            GUILayout.BeginHorizontal();
            GUILayout.Label(f.username + " Lv" + f.level + (f.status == "friend" ? (f.online ? "  online" : "  offline") : "  (" + f.status + ")"));
            GUILayout.FlexibleSpace();
            if (f.status == "incoming")
            {
                if (GUILayout.Button("Accept", GUILayout.Width(80))) Run(async () => { await ApiClient.FriendRespond(fr.username, true); friends = await ApiClient.Friends(); });
                if (GUILayout.Button("Decline", GUILayout.Width(80))) Run(async () => { await ApiClient.FriendRespond(fr.username, false); friends = await ApiClient.Friends(); });
            }
            else if (f.status == "friend")
            {
                if (GUILayout.Button("Message", GUILayout.Width(90))) { chatInput = "/w " + fr.username + " "; panel = Panel.None; }
            }
            if (GUILayout.Button("Block", GUILayout.Width(70))) Run(async () => { await ApiClient.Block(fr.username); friends = await ApiClient.Friends(); Toast("Blocked"); });
            if (GUILayout.Button("Report", GUILayout.Width(70))) Run(async () => { await ApiClient.Report(fr.username, "Reported from friends list"); Toast("Report sent to moderators"); });
            GUILayout.EndHorizontal();
        }
    }

    void DrawBoard()
    {
        GUILayout.BeginHorizontal();
        foreach (var t in new[] { "global", "wins", "weekly", "friends" })
            if (GUILayout.Toggle(boardType == t, t, GUI.skin.button) && boardType != t) { boardType = t; Run(async () => board = await ApiClient.Leaderboard(boardType)); }
        GUILayout.EndHorizontal();
        foreach (var r in board) GUILayout.Label("#" + r.rank + "  " + r.username + "   Lv " + r.level + "   XP " + r.xp + "   Wins " + r.wins);
    }

    void DrawTourney()
    {
        GUILayout.Label("Tournaments: play matches while joined to earn points; prizes are paid when the event ends.");
        foreach (var t in tourneys)
        {
            var tt = t;
            GUILayout.BeginHorizontal();
            GUILayout.Label(t.name + "  players " + t.players + "  your score " + t.myScore + "  entry " + t.entryTickets + " ticket(s)");
            GUILayout.FlexibleSpace();
            GUI.enabled = !t.joined;
            if (GUILayout.Button(t.joined ? "Joined" : "Join", GUILayout.Width(90))) Run(async () => { await ApiClient.JoinTournament(tt.id); tourneys = await ApiClient.Tournaments(); });
            GUI.enabled = true;
            GUILayout.EndHorizontal();
        }
    }

    void DrawCustomize()
    {
        if (edit == null) return;
        GUILayout.Label("Character");
        GUILayout.Label("Height " + edit.height.ToString("0.00")); edit.height = GUILayout.HorizontalSlider(edit.height, 0.85f, 1.15f);
        GUILayout.Label("Build " + edit.build.ToString("0.00")); edit.build = GUILayout.HorizontalSlider(edit.build, 0.8f, 1.25f);
        GUILayout.Label("Hair style");
        GUILayout.BeginHorizontal();
        for (int i = 0; i <= 5; i++) if (GUILayout.Toggle(edit.hairStyle == i, i.ToString(), GUI.skin.button, GUILayout.Width(44))) edit.hairStyle = i;
        GUILayout.EndHorizontal();
        GUILayout.Label("Skin");
        GUILayout.BeginHorizontal();
        foreach (var c in Skins) { var old = GUI.backgroundColor; GUI.backgroundColor = AvatarView.Hex(c); if (GUILayout.Button(edit.skin == c ? "X" : "", GUILayout.Width(44), GUILayout.Height(30))) edit.skin = c; GUI.backgroundColor = old; }
        GUILayout.EndHorizontal();
        GUILayout.Label("Hair colour");
        GUILayout.BeginHorizontal();
        foreach (var c in Hairs) { var old = GUI.backgroundColor; GUI.backgroundColor = AvatarView.Hex(c); if (GUILayout.Button(edit.hairColor == c ? "X" : "", GUILayout.Width(44), GUILayout.Height(30))) edit.hairColor = c; GUI.backgroundColor = old; }
        GUILayout.EndHorizontal();
        if (GUILayout.Button("Save", GUILayout.Height(40))) Run(async () => { await ApiClient.SaveAppearance(edit); Toast("Saved"); });
        GUILayout.Label("Clothes are changed in the Shop. Higher levels evolve your character: skeleton > basic > character > advanced > elite > legendary.");
    }

    // ----------------------------------------------------------------- MATCH
    void DrawRoom(float W, float H)
    {
        DrawTopBar(W);
        var room = table.Room;
        bool host = room.hostId == Session.User.id;
        bool spectator = room.members.Find(m => m.userId == Session.User.id)?.spectator ?? true;

        GUILayout.BeginArea(new Rect(W / 2 - 260, 56, 520, 110), GUI.skin.box);
        GUILayout.Label("<b>Room " + room.code + "</b>   " + (room.isPrivate ? "(private)" : "(public)") + "   Round " + table.Round + "/" + table.TotalRounds + "   " + table.Phase.ToUpper() + (table.SecondsLeft > 0 ? "  " + table.SecondsLeft.ToString("0.0") + "s" : ""));
        GUILayout.Label(table.Banner);
        GUILayout.BeginHorizontal();
        if (host && table.Phase == "lobby" && GUILayout.Button("Start match", GUILayout.Height(34))) WsClient.I.Send("room.start");
        if (GUILayout.Button("Leave room", GUILayout.Height(34))) WsClient.I.Send("room.leave");
        if (!string.IsNullOrEmpty(friendName) && GUILayout.Button("Invite " + friendName, GUILayout.Height(34))) WsClient.I.Send("room.invite", new { to = friendName });
        GUILayout.EndHorizontal();
        GUILayout.EndArea();

        GUILayout.BeginArea(new Rect(10, 120, 250, 260), GUI.skin.box);
        GUILayout.Label("<b>Players</b>");
        foreach (var m in room.members)
            GUILayout.Label(m.username + (m.spectator ? " (watching)" : "  score " + m.score) + (m.picked ? "  picked" : "") + (m.userId == room.hostId ? "  host" : ""));
        GUILayout.Label("Invite friend (type name):");
        friendName = GUILayout.TextField(friendName, 20);
        GUILayout.EndArea();

        if (table.Phase == "select" && !table.Picked && !spectator)
        {
            GUILayout.BeginArea(new Rect(W / 2 - 240, H - 260, 480, 60));
            GUILayout.BeginHorizontal();
            for (int i = 0; i < 3; i++) if (GUILayout.Button("Tube " + (i + 1), GUILayout.Height(54))) table.Pick(i);
            GUILayout.EndHorizontal();
            GUILayout.EndArea();
        }
        else if (table.Picked && table.Phase == "select")
        {
            GUI.Box(new Rect(W / 2 - 150, H - 250, 300, 40), "Locked in. Waiting for others...");
        }

        GUILayout.BeginArea(new Rect(W - 330, 120, 320, 200), GUI.skin.box);
        GUILayout.Label("<b>Results</b>");
        foreach (var l in table.Log) GUILayout.Label(l);
        GUILayout.EndArea();

        DrawChat(W, H);
        DrawEmotes(W, H);
    }
}
