using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

/// Zone presence, other players' avatars, emotes and chat log. Mirrors backend ZONES.
public class WorldClient : MonoBehaviour
{
    public static readonly Dictionary<string, Vector3> Centers = new Dictionary<string, Vector3>
    {
        { "lobby", new Vector3(0, 0, 0) },
        { "restaurant", new Vector3(60, 0, 0) },
        { "gamehall", new Vector3(120, 0, 0) },
    };
    public const float ZoneRadius = 24f;

    public LocalPlayer player;
    public string Zone = "lobby";
    public readonly List<string> Chat = new List<string>();
    readonly Dictionary<string, AvatarView> others = new Dictionary<string, AvatarView>();

    void Start()
    {
        var ws = WsClient.I;
        ws.On("world.joined", d =>
        {
            var j = d.ToObject<WorldJoined>();
            Zone = j.zone; player.zone = j.zone;
            player.Teleport(new Vector3(j.x, j.y, j.z));
            player.avatar.Snap(new Vector3(j.x, j.y, j.z), 0);
            ClearOthers();
            foreach (var p in j.players) Add(p);
        });
        ws.On("world.enter", d => Add(d.ToObject<PlayerEntry>()));
        ws.On("world.leave", d => Remove((string)d["id"]));
        ws.On("world.state", d =>
        {
            foreach (var p in d["p"].ToObject<List<PosUpdate>>())
                if (others.TryGetValue(p.id, out var av)) av.SetTarget(new Vector3(p.x, p.y, p.z), p.ry);
        });
        ws.On("world.correct", d => player.Teleport(new Vector3((float)d["x"], (float)d["y"], (float)d["z"])));
        ws.On("world.emote", d =>
        {
            string id = (string)d["id"], e = (string)d["e"];
            if (Session.User != null && id == Session.User.id) player.avatar.PlayEmote(e);
            else if (others.TryGetValue(id, out var av)) av.PlayEmote(e);
        });
        ws.On("chat.zone", d => AddChat("[" + (string)d["from"] + "] " + (string)d["text"]));
        ws.On("chat.room", d => AddChat("[room " + (string)d["from"] + "] " + (string)d["text"]));
        ws.On("chat.private", d => AddChat("[DM " + (string)d["from"] + " > " + (string)d["to"] + "] " + (string)d["text"]));
    }

    public void Join(string zone) { WsClient.I.Send("world.join", new { zone }); }
    public void SendChat(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        if (text.StartsWith("/w "))
        {
            var parts = text.Substring(3).Split(new[] { ' ' }, 2);
            if (parts.Length == 2) WsClient.I.Send("chat.private", new { to = parts[0], text = parts[1] });
            return;
        }
        WsClient.I.Send(FindFirstObjectByType<TubeTable>().InRoom ? "chat.room" : "chat.zone", new { text });
    }
    public void Emote(string e) { WsClient.I.Send("world.emote", new { e }); }

    void AddChat(string line) { Chat.Add(line); if (Chat.Count > 60) Chat.RemoveAt(0); }

    void Add(PlayerEntry p)
    {
        if (Session.User != null && p.id == Session.User.id) return;
        Remove(p.id);
        var go = new GameObject("Player_" + p.u);
        var av = go.AddComponent<AvatarView>();
        av.Build(p.u, p.look, p.stage);
        av.Snap(new Vector3(p.x, p.y, p.z), p.ry);
        others[p.id] = av;
    }
    void Remove(string id) { if (others.TryGetValue(id, out var av)) { if (av) Destroy(av.gameObject); others.Remove(id); } }
    void ClearOthers() { foreach (var kv in others) if (kv.Value) Destroy(kv.Value.gameObject); others.Clear(); }
}
