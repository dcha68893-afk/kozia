using UnityEngine;

[System.Serializable]
public class AppConfigData { public string apiBase; public string wsBase; }

/// Reads Assets/Resources/appconfig.json. Edit that file for production:
///   { "apiBase": "https://api.yourgame.com", "wsBase": "wss://api.yourgame.com" }
public static class AppConfig
{
    static AppConfigData data;
    static AppConfigData D
    {
        get
        {
            if (data == null)
            {
                var t = Resources.Load<TextAsset>("appconfig");
                if (t == null) throw new System.Exception("Missing Assets/Resources/appconfig.json");
                data = JsonUtility.FromJson<AppConfigData>(t.text);
            }
            return data;
        }
    }
    public static string ApiBase => D.apiBase.TrimEnd('/');
    public static string WsBase => D.wsBase.TrimEnd('/');
}
