using UnityEngine;

public sealed class NecpraMobileRuntime : MonoBehaviour
{
    public int lowMemoryMb = 2500;
    public bool preferBatterySaver = true;
    void Awake()
    {
        bool mobile = Application.platform == RuntimePlatform.Android || Application.platform == RuntimePlatform.IPhonePlayer;
        if(!mobile) return;
        QualitySettings.vSyncCount = 0;
        int ram = SystemInfo.systemMemorySize;
        bool low = ram > 0 && ram <= lowMemoryMb;
        QualitySettings.SetQualityLevel(low ? 0 : (ram <= 4000 ? 1 : 2), true);
        QualitySettings.shadowDistance = low ? 18f : 45f;
        QualitySettings.lodBias = low ? 0.65f : 1.1f;
        QualitySettings.anisotropicFiltering = low ? AnisotropicFiltering.Disable : AnisotropicFiltering.Enable;
        Application.targetFrameRate = low ? 30 : 60;
        Screen.sleepTimeout = SleepTimeout.NeverSleep;
        if(preferBatterySaver && low) QualitySettings.pixelLightCount = 1;
    }
}
