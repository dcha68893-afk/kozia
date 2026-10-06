#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

/// Menu: Necpra > Build Main Scene. Generates Assets/Scenes/Main.unity with the three world zones
/// (lobby, restaurant, game hall with the tube table), wires every component and adds it to Build Settings.
public static class NecpraSceneBuilder
{
    static readonly Dictionary<string, Material> mats = new Dictionary<string, Material>();

    static Material Mat(string name, Color c)
    {
        if (mats.TryGetValue(name, out var m)) return m;
        if (!AssetDatabase.IsValidFolder("Assets/Materials")) AssetDatabase.CreateFolder("Assets", "Materials");
        string path = "Assets/Materials/" + name + ".mat";
        m = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (m == null)
        {
            var sh = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            m = new Material(sh);
            AssetDatabase.CreateAsset(m, path);
        }
        m.color = c;
        mats[name] = m;
        return m;
    }

    static GameObject Prim(PrimitiveType t, string name, Vector3 pos, Vector3 scale, Material mat, Transform parent = null)
    {
        var g = GameObject.CreatePrimitive(t);
        g.name = name; g.transform.position = pos; g.transform.localScale = scale;
        g.GetComponent<Renderer>().sharedMaterial = mat;
        if (parent) g.transform.SetParent(parent, true);
        return g;
    }

    static Transform Point(string name, Vector3 pos, Transform parent)
    {
        var g = new GameObject(name); g.transform.position = pos; g.transform.SetParent(parent, true);
        return g.transform;
    }

    static void Label(string text, Vector3 pos)
    {
        var g = new GameObject("Sign_" + text); g.transform.position = pos;
        var tm = g.AddComponent<TextMesh>();
        var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        tm.font = font; g.GetComponent<MeshRenderer>().sharedMaterial = font.material;
        tm.text = text; tm.fontSize = 64; tm.characterSize = 0.25f; tm.anchor = TextAnchor.MiddleCenter;
        g.transform.rotation = Quaternion.Euler(0, 0, 0);
    }

    [MenuItem("Necpra/Build Main Scene")]
    public static void Build()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        var light = new GameObject("Sun").AddComponent<Light>();
        light.type = LightType.Directional; light.intensity = 1.1f;
        light.transform.rotation = Quaternion.Euler(50, -30, 0);

        var camGo = new GameObject("Main Camera"); camGo.tag = "MainCamera";
        var cam = camGo.AddComponent<Camera>();
        camGo.AddComponent<AudioListener>();
        cam.transform.position = new Vector3(0, 6.5f, -8f);
        cam.transform.LookAt(Vector3.up * 1.5f);
        cam.backgroundColor = new Color(0.08f, 0.09f, 0.13f); cam.clearFlags = CameraClearFlags.SolidColor;

        // zones
        var floors = new[] { ("Lobby", 0f, "#b9a98a"), ("Restaurant", 60f, "#a65e4a"), ("Game Hall", 120f, "#34506b") };
        foreach (var (name, x, hex) in floors)
        {
            ColorUtility.TryParseHtmlString(hex, out var col);
            Prim(PrimitiveType.Cube, name + " Floor", new Vector3(x, -0.1f, 0), new Vector3(50, 0.2f, 50), Mat(name.Replace(" ", "") + "Floor", col));
            Label(name.ToUpper(), new Vector3(x, 4f, 20f));
        }
        // lobby props: reception desk
        Prim(PrimitiveType.Cube, "Reception Desk", new Vector3(0, 0.6f, 12), new Vector3(8, 1.2f, 1.6f), Mat("Wood", new Color(0.35f, 0.22f, 0.12f)));
        // restaurant props: tables
        for (int i = -2; i <= 2; i++) Prim(PrimitiveType.Cylinder, "Dining Table " + i, new Vector3(60 + i * 7, 0.4f, 0), new Vector3(2.4f, 0.4f, 2.4f), Mat("Wood", Color.white));

        // game hall: tube table
        var table = Prim(PrimitiveType.Cylinder, "Tube Table", new Vector3(120, 0.45f, 0), new Vector3(4.2f, 0.45f, 4.2f), Mat("Felt", new Color(0.1f, 0.35f, 0.2f)));
        var rig = new GameObject("TubeRig").transform;
        var slots = new Transform[3];
        var tubes = new Tube[3];
        var tubeMat = Mat("Tube", new Color(0.85f, 0.2f, 0.25f));
        for (int i = 0; i < 3; i++)
        {
            Vector3 p = new Vector3(118.8f + i * 1.2f, 1.2f, 0);
            slots[i] = Point("Slot" + i, p, rig);
            var t = Prim(PrimitiveType.Cylinder, "Tube" + i, p, new Vector3(0.7f, 0.3f, 0.7f), tubeMat, rig);
            tubes[i] = t.AddComponent<Tube>();
            tubes[i].Slot = i;
        }
        var ball = Prim(PrimitiveType.Sphere, "Ball", new Vector3(120, 1.0f, 0), Vector3.one * 0.3f, Mat("Ball", Color.yellow), rig);
        Object.DestroyImmediate(ball.GetComponent<Collider>());
        ball.SetActive(false);

        var seats = new[] { new Vector3(116.6f, 0, 1.4f), new Vector3(123.4f, 0, 1.4f), new Vector3(118.2f, 0, 3.8f), new Vector3(121.8f, 0, 3.8f) };
        var seatT = new Transform[4];
        for (int i = 0; i < 4; i++) seatT[i] = Point("Seat" + i, seats[i], rig);

        var tableCam = Point("TableCam", new Vector3(120, 4.2f, -6.2f), rig); tableCam.LookAt(new Vector3(120, 1.1f, 0.6f));
        var closeCam = Point("CloseCam", new Vector3(120, 2.5f, -2.7f), rig); closeCam.LookAt(new Vector3(120, 1.2f, 0));

        // player
        var player = new GameObject("LocalPlayer");
        player.SetActive(true);
        var lp = player.AddComponent<LocalPlayer>();
        lp.cam = cam;

        // systems
        var sys = new GameObject("Systems");
        var world = sys.AddComponent<WorldClient>();
        var tt = sys.AddComponent<TubeTable>();
        var ui = sys.AddComponent<GameUI>();
        var boot = sys.AddComponent<GameBootstrap>();

        world.player = lp;
        lp.table = tt;
        tt.tubes = tubes; tt.slotPoints = slots; tt.ball = ball.transform; tt.seats = seatT;
        tt.tableCam = tableCam; tt.closeCam = closeCam; tt.cam = cam; tt.world = world;
        ui.boot = boot; ui.world = world; ui.table = tt;
        boot.player = lp; boot.world = world; boot.table = tt; boot.ui = ui;

        if (!AssetDatabase.IsValidFolder("Assets/Scenes")) AssetDatabase.CreateFolder("Assets", "Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/Main.unity", true) };
        AssetDatabase.SaveAssets();
        Debug.Log("Necpra: Main scene built. Press Play (backend must be running).");
    }
}
#endif
