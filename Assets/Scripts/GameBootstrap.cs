using UnityEngine;

/// Entry point. Restores the saved session, opens the WebSocket and joins the lobby.
public class GameBootstrap : MonoBehaviour
{
    public LocalPlayer player;
    public WorldClient world;
    public TubeTable table;
    public GameUI ui;

    void Awake()
    {
        Application.targetFrameRate = 60;
        if (WsClient.I == null) gameObject.AddComponent<WsClient>();
    }

    async void Start()
    {
        WsClient.I.On("hello", d =>
        {
            bool inRoom = (bool)d["inRoom"];
            RefreshAvatar();
            if (!inRoom) world.Join(world.Zone);
        });
        Session.Changed += RefreshAvatar;

        if (Session.LoadToken())
        {
            try { await ApiClient.Me(); OnLoggedIn(); }
            catch { Session.Clear(); }
        }
    }

    public void OnLoggedIn()
    {
        RefreshAvatar();
        WsClient.I.Connect();
    }

    string lastLookKey;
    void RefreshAvatar()
    {
        var u = Session.User;
        if (u == null || player == null) return;
        string key = u.username + u.stage + Newtonsoft.Json.JsonConvert.SerializeObject(u.ToLook());
        if (key == lastLookKey) return;
        lastLookKey = key;
        player.avatar.Build(u.username, u.ToLook(), u.stage);
    }

    public void Logout()
    {
        WsClient.I.Disconnect();
        Session.Clear();
        lastLookKey = null;
    }
}
