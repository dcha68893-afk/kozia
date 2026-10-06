using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine.Networking;

public class ApiException : Exception
{
    public long Status;
    public ApiException(string message, long status) : base(message) { Status = status; }
}

public static class ApiClient
{
    public static async Task<JObject> Request(string method, string path, object body = null)
    {
        using (var req = new UnityWebRequest(AppConfig.ApiBase + path, method))
        {
            req.downloadHandler = new DownloadHandlerBuffer();
            if (body != null)
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(body)));
                req.SetRequestHeader("Content-Type", "application/json");
            }
            if (!string.IsNullOrEmpty(Session.Token)) req.SetRequestHeader("Authorization", "Bearer " + Session.Token);
            req.timeout = 15;

            var op = req.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            string text = req.downloadHandler.text;
            JObject json = null;
            try { json = string.IsNullOrEmpty(text) ? new JObject() : JObject.Parse(text); } catch { }

            if (req.result != UnityWebRequest.Result.Success)
            {
                string msg = json?["error"]?.ToString();
                if (string.IsNullOrEmpty(msg)) msg = req.result == UnityWebRequest.Result.ConnectionError ? "Cannot reach server" : req.error;
                throw new ApiException(msg, req.responseCode);
            }
            return json ?? new JObject();
        }
    }

    static UserDto UserOf(JObject r) => r["user"].ToObject<UserDto>();

    public static async Task Register(string username, string email, string password)
    {
        var r = await Request("POST", "/api/auth/register", new { username, email, password });
        Session.SetAuth((string)r["token"], UserOf(r));
    }

    public static async Task Login(string login, string password)
    {
        var r = await Request("POST", "/api/auth/login", new { login, password });
        Session.SetAuth((string)r["token"], UserOf(r));
    }

    public static async Task Me() { Session.SetUser(UserOf(await Request("GET", "/api/auth/me"))); }
    public static async Task Daily() { Session.SetUser(UserOf(await Request("POST", "/api/economy/daily"))); }

    public static async Task<List<ShopItem>> ShopItems() =>
        (await Request("GET", "/api/shop/items"))["items"].ToObject<List<ShopItem>>();
    public static async Task Buy(string itemId) { Session.SetUser(UserOf(await Request("POST", "/api/shop/buy", new { itemId }))); }
    public static async Task Equip(string itemId, bool equipped) { Session.SetUser(UserOf(await Request("POST", "/api/shop/equip", new { itemId, equipped }))); }
    public static async Task SaveAppearance(Appearance a) { Session.SetUser(UserOf(await Request("PATCH", "/api/profile/appearance", a))); }

    public static async Task<List<LeaderRow>> Leaderboard(string type) =>
        (await Request("GET", "/api/leaderboard?type=" + type))["rows"].ToObject<List<LeaderRow>>();

    public static async Task<List<FriendDto>> Friends() =>
        (await Request("GET", "/api/social/friends"))["friends"].ToObject<List<FriendDto>>();
    public static Task FriendRequest(string username) => Request("POST", "/api/social/friends/request", new { username });
    public static Task FriendRespond(string username, bool accept) => Request("POST", "/api/social/friends/respond", new { username, accept });
    public static Task Block(string username) => Request("POST", "/api/social/block", new { username });
    public static Task Report(string username, string reason) => Request("POST", "/api/social/report", new { username, reason });

    public static async Task<List<TournamentDto>> Tournaments() =>
        (await Request("GET", "/api/tournaments"))["tournaments"].ToObject<List<TournamentDto>>();
    public static async Task JoinTournament(int id) { Session.SetUser(UserOf(await Request("POST", "/api/tournaments/" + id + "/join"))); }
}
