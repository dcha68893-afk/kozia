using System;
using UnityEngine;

public static class Session
{
    const string Key = "necpra_token";
    public static string Token;
    public static UserDto User;
    public static event Action Changed;

    public static void SetAuth(string token, UserDto user)
    {
        Token = token;
        User = user;
        PlayerPrefs.SetString(Key, token);
        PlayerPrefs.Save();
        Changed?.Invoke();
    }

    public static void SetUser(UserDto user) { User = user; Changed?.Invoke(); }

    public static bool LoadToken()
    {
        Token = PlayerPrefs.GetString(Key, "");
        return !string.IsNullOrEmpty(Token);
    }

    public static void Clear()
    {
        Token = null; User = null;
        PlayerPrefs.DeleteKey(Key);
        Changed?.Invoke();
    }
}
