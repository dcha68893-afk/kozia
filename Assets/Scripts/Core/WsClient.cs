using System;
using System.Collections.Generic;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NativeWebSocket;
using UnityEngine;

/// Single WebSocket connection to the backend. Auto-reconnects while wanted.
public class WsClient : MonoBehaviour
{
    public static WsClient I;
    WebSocket ws;
    readonly Dictionary<string, List<Action<JToken>>> handlers = new Dictionary<string, List<Action<JToken>>>();
    bool wantOpen, connecting;
    float retryAt;
    float pingAt;

    public bool IsOpen => ws != null && ws.State == WebSocketState.Open;

    void Awake() { I = this; }

    public void On(string type, Action<JToken> handler)
    {
        if (!handlers.TryGetValue(type, out var list)) handlers[type] = list = new List<Action<JToken>>();
        list.Add(handler);
    }

    public void Connect() { wantOpen = true; retryAt = 0; }

    public void Disconnect()
    {
        wantOpen = false;
        if (ws != null) { var w = ws; ws = null; _ = w.Close(); }
    }

    async void Open()
    {
        connecting = true;
        ws = new WebSocket(AppConfig.WsBase + "/ws?token=" + Uri.EscapeDataString(Session.Token ?? ""));
        var mine = ws;
        mine.OnMessage += bytes =>
        {
            try
            {
                var m = JObject.Parse(Encoding.UTF8.GetString(bytes));
                string t = (string)m["t"];
                if (t != null && handlers.TryGetValue(t, out var list))
                    foreach (var h in list.ToArray()) h(m["d"]);
            }
            catch (Exception e) { Debug.LogWarning("WS message error: " + e.Message); }
        };
        mine.OnError += err => Debug.LogWarning("WS error: " + err);
        mine.OnClose += code =>
        {
            connecting = false;
            retryAt = Time.time + 2f;
            if (code == WebSocketCloseCode.Normal && !wantOpen) return;
            // 4001 unauthorized / 4003 banned: do not hammer the server
            if ((int)code == 4001 || (int)code == 4003) wantOpen = false;
        };
        try { await mine.Connect(); } catch (Exception e) { Debug.LogWarning("WS connect failed: " + e.Message); }
        connecting = false;
    }

    public void Send(string type, object data = null)
    {
        if (!IsOpen) return;
        _ = ws.SendText(JsonConvert.SerializeObject(new { t = type, d = data }));
    }

    void Update()
    {
#if !UNITY_WEBGL || UNITY_EDITOR
        ws?.DispatchMessageQueue();
#endif
        if (wantOpen && !connecting && !IsOpen && Time.time >= retryAt && !string.IsNullOrEmpty(Session.Token)) Open();
        if (IsOpen && Time.time > pingAt) { pingAt = Time.time + 25f; Send("ping"); }
    }

    void OnApplicationQuit() { wantOpen = false; if (ws != null) _ = ws.Close(); }
}
